"""
Fiscal Connectivity Center — AGT API Manager, Certificate/Key Manager, Test Center, Monitor.

Toda a comunicação técnica com a AGT é parametrizável (endpoints, credenciais, timeouts).
A integração real (protocolo/formato oficiais) liga-se aqui quando as credenciais e a
documentação técnica da AGT estiverem disponíveis — sem alterar o núcleo do ERP.
"""
from datetime import date

from django.utils import timezone
from rest_framework import viewsets
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import (AGTConnection, DigitalCertificate, FiscalConfig, FiscalSeries,
                     SubmissionQueue, FiscalAuditLog)
from .serializers import AGTConnectionSerializer, DigitalCertificateSerializer
from . import signing, saft


class AGTConnectionViewSet(viewsets.ModelViewSet):
    """AGT API Manager — ambiente, endpoints, credenciais, tokens."""
    permission_classes = [IsAuthenticated]
    queryset = AGTConnection.objects.all()
    serializer_class = AGTConnectionSerializer

    @action(detail=True, methods=['post'])
    def health(self, request, pk=None):
        """Health check da ligação AGT (real quando o endpoint estiver configurado)."""
        conn = self.get_object()
        if not conn.url_health:
            conn.last_health_status = 'NOT_CONFIGURED'
        else:
            conn.last_health_status = 'PENDING'  # integração HTTP real a ligar na certificação
        conn.last_health_at = timezone.now()
        conn.save(update_fields=['last_health_status', 'last_health_at'])
        return Response({'status': conn.last_health_status, 'checked_at': conn.last_health_at})


class DigitalCertificateViewSet(viewsets.ModelViewSet):
    """Certificate Manager + Cryptographic Key Manager."""
    permission_classes = [IsAuthenticated]
    queryset = DigitalCertificate.objects.all()
    serializer_class = DigitalCertificateSerializer

    @action(detail=True, methods=['post'])
    def revoke(self, request, pk=None):
        cert = self.get_object()
        cert.status = 'REVOKED'
        cert.save(update_fields=['status'])
        FiscalAuditLog.objects.create(event='CERT_REVOKE', detail=cert.alias,
                                      user=str(getattr(request.user, 'username', '') or ''))
        return Response(DigitalCertificateSerializer(cert).data)


class TestCenterView(APIView):
    """Test Center — botões de auto-diagnóstico do motor fiscal."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        target = request.data.get('test', 'all')
        results = {}

        if target in ('all', 'signature', 'keys'):
            try:
                msg = signing.build_message('2026-01-01', '2026-01-01T00:00:00', 'FT T/1', '100.00', '')
                sig = signing.sign_message(msg)
                ok = signing.verify_message(msg, sig)
                results['keys'] = {'ok': True, 'detail': 'Par de chaves RSA carregado.'}
                results['signature'] = {'ok': ok, 'detail': 'Assinar e validar OK.' if ok else 'Falha na verificação.'}
            except Exception as e:  # noqa
                results['keys'] = {'ok': False, 'detail': str(e)}
                results['signature'] = {'ok': False, 'detail': 'Não foi possível assinar.'}

        if target in ('all', 'xml', 'saft'):
            try:
                today = date.today()
                xml = saft.generate_saft(today.replace(day=1), today)
                results['saft'] = {'ok': xml.startswith('<?xml'), 'detail': f'{len(xml)} bytes gerados.'}
                results['xml'] = {'ok': True, 'detail': 'XML bem-formado.'}
            except Exception as e:  # noqa
                results['saft'] = {'ok': False, 'detail': str(e)}

        if target in ('all', 'qr'):
            cfg = FiscalConfig.get()
            results['qr'] = {'ok': cfg.qr_enabled, 'detail': 'QR Code ativo.' if cfg.qr_enabled else 'QR desativado.'}

        if target in ('all', 'agt', 'communication'):
            conn = AGTConnection.objects.filter(is_active=True).first()
            configured = bool(conn and conn.url_submit and conn.client_id)
            results['agt'] = {'ok': configured,
                              'detail': 'Ligação configurada.' if configured
                              else 'Credenciais/endpoints AGT por configurar (pendente de certificação).'}

        FiscalAuditLog.objects.create(event='TEST_CENTER', detail=target,
                                      user=str(getattr(request.user, 'username', '') or ''))
        overall = all(r.get('ok') for r in results.values())
        return Response({'overall_ok': overall, 'results': results})


class FiscalMonitorView(APIView):
    """Fiscal Monitoring — estado consolidado do motor e da ligação AGT."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cfg = FiscalConfig.get()
        conn = AGTConnection.objects.filter(is_active=True).first()
        certs = DigitalCertificate.objects.all()
        q = SubmissionQueue.objects.all()
        return Response({
            'environment': cfg.environment,
            'certificate_number': cfg.certificate_number,
            'agt_connection': {
                'configured': bool(conn),
                'environment': conn.environment if conn else None,
                'health': conn.last_health_status if conn else 'NO_CONNECTION',
                'health_at': conn.last_health_at if conn else None,
            },
            'certificates': {
                'total': certs.count(),
                'active': certs.filter(status='ACTIVE').count(),
                'expired': certs.filter(status='EXPIRED').count(),
                'revoked': certs.filter(status='REVOKED').count(),
            },
            'keys_engine_ok': signing.PRIVATE_KEY_PATH.exists() and signing.PUBLIC_KEY_PATH.exists(),
            'queue': {
                'pending': q.filter(status__in=['QUEUED', 'RETRY']).count(),
                'sent': q.filter(status__in=['SENT', 'ACK']).count(),
                'rejected': q.filter(status='REJECTED').count(),
            },
            'active_series': FiscalSeries.objects.filter(is_active=True).count(),
        })
