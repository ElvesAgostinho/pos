"""
Repositório e Pesquisa Global — tudo o que aconteceu no sistema, num só sítio.
"""
from datetime import timedelta

from django.db.models import Q, Count, Sum
from django.utils import timezone
from rest_framework import viewsets, serializers
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .audit_trail import AuditEvent


class AuditEventSerializer(serializers.ModelSerializer):
    action_display = serializers.CharField(source='get_action_display', read_only=True)

    class Meta:
        model = AuditEvent
        fields = ('id', 'at', 'action', 'action_display', 'module', 'area', 'entity',
                  'entity_id', 'label', 'user', 'ip_address', 'changes', 'reason', 'amount')


class AuditEventViewSet(viewsets.ReadOnlyModelViewSet):
    """Só leitura — um trilho de auditoria que se pode editar não vale nada."""
    permission_classes = [IsAuthenticated]
    serializer_class = AuditEventSerializer

    def get_queryset(self):
        qs = AuditEvent.objects.all()
        p = self.request.query_params
        for f in ('action', 'module', 'area', 'entity', 'user'):
            if p.get(f):
                qs = qs.filter(**{f: p[f]})
        if p.get('entity_id'):
            qs = qs.filter(entity_id=p['entity_id'])
        if p.get('q'):
            qs = qs.filter(search_text__contains=p['q'].lower())
        if p.get('since'):
            qs = qs.filter(at__gte=p['since'])
        if p.get('until'):
            qs = qs.filter(at__lte=p['until'])
        # Só anulações/eliminações — a pergunta mais frequente de um auditor.
        if p.get('destructive') in ('1', 'true'):
            qs = qs.filter(action__in=['VOID', 'DELETE'])
        return qs[:1000]


class GlobalSearchView(APIView):
    """
    PESQUISA GLOBAL — uma caixa, tudo o que o sistema já viu.

    Procura em TODO o trilho: documentos, reservas, contas, comandas da cozinha,
    anulações (com o motivo), eliminações, consultas, exportações, entradas no sistema.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        q = (request.query_params.get('q') or '').strip().lower()
        if len(q) < 2:
            return Response({'results': [], 'detail': 'Escreva pelo menos 2 caracteres.'})

        qs = AuditEvent.objects.filter(search_text__contains=q)
        total = qs.count()

        # Agrupado por área — para o utilizador perceber ONDE está o que procura.
        by_area = list(qs.values('module', 'area').annotate(n=Count('id')).order_by('-n')[:12])
        by_action = list(qs.values('action').annotate(n=Count('id')).order_by('-n'))

        return Response({
            'query': q,
            'total': total,
            'by_area': by_area,
            'by_action': by_action,
            'results': AuditEventSerializer(qs[:200], many=True).data,
        })


class AuditOverviewView(APIView):
    """Painel do repositório: o pulso do sistema nas últimas 24h / 7 dias."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        now = timezone.now()
        d1, d7 = now - timedelta(days=1), now - timedelta(days=7)
        qs = AuditEvent.objects

        def counts(since):
            return dict(qs.filter(at__gte=since).values_list('action')
                        .annotate(n=Count('id')).values_list('action', 'n'))

        voids = qs.filter(action__in=['VOID', 'DELETE'], at__gte=d7).order_by('-at')[:20]
        return Response({
            'last_24h': counts(d1),
            'last_7d': counts(d7),
            'by_module': list(qs.filter(at__gte=d7).values('module', 'area')
                              .annotate(n=Count('id')).order_by('-n')[:15]),
            'by_user': list(qs.filter(at__gte=d7).exclude(user=None).values('user')
                            .annotate(n=Count('id')).order_by('-n')[:10]),
            # O que foi ANULADO ou ELIMINADO — e porquê. É a primeira coisa que um
            # auditor (e um dono de hotel desconfiado) quer ver.
            'destructive': AuditEventSerializer(voids, many=True).data,
            'destructive_value': qs.filter(action__in=['VOID', 'DELETE'], at__gte=d7)
                                   .aggregate(v=Sum('amount'))['v'] or 0,
            'total_events': qs.count(),
        })
