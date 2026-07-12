"""
Certificação AGT (lado cliente) — aplica as credenciais entregues pelo fornecedor.

Assim que o nº de certificado é aplicado (deixa de ser '0000'), ele aparece
AUTOMATICAMENTE em todas as faturas (menção + QR), no SAF-T e nas áreas fiscais.
As chaves são geradas no PCC (fornecedor); aqui apenas se instalam/validam.
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import FiscalConfig
from . import signing


def _is_certified(cfg):
    return bool(cfg.certificate_number and cfg.certificate_number not in ('0000', '', '0'))


class CertificationView(APIView):
    """
    GET  /api/fiscal/certification/ — estado da certificação + pré-visualização da menção.
    POST /api/fiscal/certification/ — aplica {certificate_number, private_key?, public_key?}.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cfg = FiscalConfig.get()
        has_keys = signing.PRIVATE_KEY_PATH.exists() and signing.PUBLIC_KEY_PATH.exists()
        certified = _is_certified(cfg)
        # Pré-visualização da menção que sai na fatura (hash de exemplo).
        sample_hash = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
        mention = signing.print_mention(sample_hash, cfg.certificate_number or '0000', True)
        return Response({
            'certified': certified,
            'certificate_number': cfg.certificate_number,
            'environment': cfg.environment,
            'has_keys': has_keys,
            'company_name': cfg.company_name,
            'company_nif': cfg.company_nif,
            'mention_preview': mention,
            'status_label': 'Certificado AGT ativo' if certified else 'Não certificado (ambiente de testes)',
        })

    def post(self, request):
        cfg = FiscalConfig.get()
        cert = (request.data.get('certificate_number') or '').strip()
        private_key = request.data.get('private_key')
        public_key = request.data.get('public_key')

        # Instala e VALIDA o par de chaves, se fornecido.
        if private_key and public_key:
            try:
                signing.ENGINE_DIR.mkdir(parents=True, exist_ok=True)
                signing.PRIVATE_KEY_PATH.write_text(private_key.strip() + '\n', encoding='ascii')
                signing.PUBLIC_KEY_PATH.write_text(public_key.strip() + '\n', encoding='ascii')
                msg = signing.build_message('2026-01-01', '2026-01-01T00:00:00', 'FT T/1', '100.00', '')
                if not signing.verify_message(msg, signing.sign_message(msg)):
                    return Response({'detail': 'As chaves não validam (assinatura inválida).'}, status=400)
                cfg.key_version = (cfg.key_version or 1) + 1
            except Exception as e:  # noqa
                return Response({'detail': f'Falha ao instalar as chaves: {str(e)[:150]}'}, status=400)

        if cert:
            cfg.certificate_number = cert
            # Certificado real → ambiente de produção.
            if _is_certified(cfg):
                cfg.environment = 'PROD'
            cfg.save(update_fields=['certificate_number', 'environment', 'key_version'])

        certified = _is_certified(cfg)
        return Response({
            'detail': 'Certificação aplicada. A menção passa a aparecer automaticamente nas faturas.' if certified
                      else 'Configuração guardada (ainda em ambiente de testes).',
            'certified': certified,
            'certificate_number': cfg.certificate_number,
            'mention_preview': signing.print_mention('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', cfg.certificate_number or '0000', True),
        })
