"""
API do Centro de Transmissão AGT — o que a receção/contabilidade vê e comanda.
"""
from django.utils import timezone
from rest_framework import viewsets, serializers
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import SubmissionQueue, AGTConnection, FiscalConfig, FiscalDocument
from . import agt_client


class SubmissionSerializer(serializers.ModelSerializer):
    invoice_no = serializers.CharField(source='document.invoice_no', read_only=True)
    doc_type = serializers.CharField(source='document.doc_type.code', read_only=True, default=None)
    gross_total = serializers.DecimalField(source='document.gross_total', max_digits=16,
                                           decimal_places=2, read_only=True)
    customer_name = serializers.CharField(source='document.customer_name', read_only=True, default=None)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    simulated = serializers.SerializerMethodField()

    class Meta:
        model = SubmissionQueue
        fields = ('id', 'invoice_no', 'doc_type', 'customer_name', 'gross_total',
                  'status', 'status_display', 'attempts', 'http_status', 'agt_reference',
                  'error_message', 'created_at', 'sent_at', 'acked_at', 'next_attempt_at',
                  'idempotency_key', 'response', 'simulated')

    def get_simulated(self, obj):
        return bool(obj.agt_reference and obj.agt_reference.startswith('SIM-'))


class SubmissionViewSet(viewsets.ReadOnlyModelViewSet):
    """Fila de submissão à AGT: o que já foi aceite, o que está por enviar, o que foi rejeitado."""
    permission_classes = [IsAuthenticated]
    serializer_class = SubmissionSerializer

    def get_queryset(self):
        qs = SubmissionQueue.objects.select_related('document', 'document__doc_type')
        st = self.request.query_params.get('status')
        return qs.filter(status=st) if st else qs

    @action(detail=True, methods=['post'])
    def retry(self, request, pk=None):
        """Reenviar agora (a chave de idempotência garante que a AGT não duplica)."""
        sub = self.get_object()
        if sub.status == 'ACK':
            return Response({'detail': 'Este documento já foi aceite pela AGT.'}, status=400)
        sub.status = 'RETRY'
        sub.next_attempt_at = timezone.now()
        sub.save(update_fields=['status', 'next_attempt_at'])
        agt_client.send(sub)
        return Response(SubmissionSerializer(sub).data)


class AGTTransmitView(APIView):
    """Painel do transmissor: estado + processar a fila agora."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        conn = agt_client.active_connection()
        cfg = FiscalConfig.get()
        q = SubmissionQueue.objects
        pending = q.filter(status__in=['QUEUED', 'RETRY']).count()
        oldest = q.filter(status__in=['QUEUED', 'RETRY']).order_by('created_at').first()
        # Documentos assináveis que nem sequer chegaram à fila (não deveria acontecer).
        emitted = FiscalDocument.objects.filter(doc_type__signable=True).count()
        queued_docs = q.values('document_id').distinct().count()

        return Response({
            'connection': {
                'configured': bool(conn and conn.url_submit),
                'environment': conn.environment if conn else None,
                'name': conn.name if conn else None,
                'url_submit': conn.url_submit if conn else None,
                'has_credentials': bool(conn and (conn.client_id or conn.username or conn.api_key_enc)),
                'health': conn.last_health_status if conn else 'NO_CONNECTION',
                'health_at': conn.last_health_at if conn else None,
                'max_retries': conn.max_retries if conn else None,
                'timeout_seconds': conn.timeout_seconds if conn else None,
                # Enquanto a AGT não fornecer URL/credenciais, o circuito corre em simulação
                # — e é dito com todas as letras.
                'simulation': not bool(conn and conn.url_submit),
            },
            'fiscal': {
                'certificate_number': cfg.certificate_number,
                'environment': cfg.environment,
                'certified': bool(cfg.certificate_number and cfg.certificate_number != '0000'),
            },
            'queue': {
                'pending': pending,
                'sending': q.filter(status='SENDING').count(),
                'acked': q.filter(status='ACK').count(),
                'rejected': q.filter(status='REJECTED').count(),
                'failed': q.filter(status='FAILED').count(),
                'total': q.count(),
                'oldest_pending_at': oldest.created_at if oldest else None,
                'documents_not_queued': max(0, emitted - queued_docs),
            },
        })

    def post(self, request):
        """Processa a fila agora (o mesmo que o trabalhador de fundo faz sozinho)."""
        if request.data.get('health'):
            return Response(agt_client.health())
        result = agt_client.process_queue(limit=int(request.data.get('limit') or 100))
        return Response(result)
