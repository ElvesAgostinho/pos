"""
Certificação AGT — QUEM PODE O QUÊ.

O certificado da AGT é atribuído ao SOFTWARE (ao fabricante), não ao contribuinte.
Um só número serve todos os clientes: "Processado por programa validado nº 147/AGT/2026".
A chave privada que assina os documentos é a chave DO PROGRAMA.

Consequência, e é uma regra de segurança, não uma opção de desenho:

    O CLIENTE NUNCA PODE DEFINIR NEM VER O NÚMERO DE CERTIFICADO OU A CHAVE PRIVADA.

Se pudesse, poderia assinar faturas fora do sistema, ou pôr o número de outro
fabricante num documento forjado — e a certificação deixaria de valer nada.

Portanto:
  - PROVISIONAMENTO (escrita): só a partir do PCC/instalador, autenticado com a chave
    de fornecedor (VENDOR_PROVISION_KEY). Nunca pela interface do cliente.
  - CONSULTA (leitura): o cliente vê o ESTADO — "certificado nº X, chave válida" — e a
    menção que sai nas faturas. Nada mais.
"""
import hmac

from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import FiscalConfig, FiscalAuditLog
from . import signing


def _is_certified(cfg):
    return bool(cfg.certificate_number and cfg.certificate_number not in ('0000', '', '0'))


def vendor_authorized(request):
    """O pedido vem mesmo do fornecedor (PCC/instalador)?"""
    expected = getattr(settings, 'VENDOR_PROVISION_KEY', '') or ''
    given = request.headers.get('X-Vendor-Key') or ''
    return bool(expected) and hmac.compare_digest(expected, given)


def apply_certification(cert=None, private_key=None, public_key=None):
    """Instala as credenciais do fabricante. Usado pelo PCC e pelo instalador."""
    cfg = FiscalConfig.get()
    if private_key and public_key:
        signing.ENGINE_DIR.mkdir(parents=True, exist_ok=True)
        signing.PRIVATE_KEY_PATH.write_text(private_key.strip() + '\n', encoding='ascii')
        signing.PUBLIC_KEY_PATH.write_text(public_key.strip() + '\n', encoding='ascii')
        msg = signing.build_message('2026-01-01', '2026-01-01T00:00:00', 'FT T/1', '100.00', '')
        if not signing.verify_message(msg, signing.sign_message(msg)):
            raise ValueError('As chaves não validam (assinatura inválida).')
        cfg.key_version = (cfg.key_version or 1) + 1
    if cert:
        cfg.certificate_number = cert.strip()
        if _is_certified(cfg):
            cfg.environment = 'PROD'
    cfg.save(update_fields=['certificate_number', 'environment', 'key_version'])
    FiscalAuditLog.objects.create(
        event='CERT_PROVISION',
        detail=f'Certificação aplicada pelo fornecedor: nº {cfg.certificate_number} · chave v{cfg.key_version}')
    return cfg


class CertificationView(APIView):
    """
    GET  — estado da certificação (o cliente pode ver).
    POST — provisionar (SÓ o fornecedor, com X-Vendor-Key).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cfg = FiscalConfig.get()
        has_keys = signing.PRIVATE_KEY_PATH.exists() and signing.PUBLIC_KEY_PATH.exists()
        certified = _is_certified(cfg)
        sample_hash = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
        return Response({
            'certified': certified,
            'certificate_number': cfg.certificate_number,
            'environment': cfg.environment,
            'has_keys': has_keys,
            'key_version': cfg.key_version,
            'company_name': cfg.company_name,
            'company_nif': cfg.company_nif,
            'mention_preview': signing.print_mention(sample_hash, cfg.certificate_number or '0000', True),
            'status_label': 'Certificado AGT ativo' if certified else 'Não certificado (ambiente de testes)',
            # A interface do cliente é SÓ DE LEITURA — isto diz-lho explicitamente.
            'read_only': True,
            'managed_by': 'fornecedor',
        })

    def post(self, request):
        if not vendor_authorized(request):
            FiscalAuditLog.objects.create(
                event='CERT_DENIED',
                detail=f'Tentativa de alterar a certificação por {getattr(request.user, "username", "?")} — RECUSADA.')
            return Response({
                'detail': 'A certificação AGT pertence ao software, não ao contribuinte. '
                          'O número de certificado e a chave de assinatura são instalados pelo fornecedor '
                          'e não podem ser alterados a partir do sistema do cliente.',
            }, status=403)
        try:
            cfg = apply_certification(
                cert=(request.data.get('certificate_number') or '').strip() or None,
                private_key=request.data.get('private_key'),
                public_key=request.data.get('public_key'),
            )
        except ValueError as e:
            return Response({'detail': str(e)}, status=400)
        except Exception as e:  # noqa
            return Response({'detail': f'Falha ao instalar as chaves: {str(e)[:150]}'}, status=400)

        return Response({
            'detail': 'Certificação provisionada. A menção passa a sair automaticamente nas faturas.',
            'certified': _is_certified(cfg),
            'certificate_number': cfg.certificate_number,
            'key_version': cfg.key_version,
        })
