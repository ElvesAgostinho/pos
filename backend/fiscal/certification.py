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


def _instalar_chaves(private_key, public_key, versao_em_vigor=1):
    """Troca o par de assinatura — só se o novo par REALMENTE assinar.

    A prova é feita numa pasta à parte: escreve-se lá, assina-se uma mensagem de
    exemplo e verifica-se. As chaves a trabalhar não são tocadas enquanto isso
    não passar.
    """
    import shutil
    import tempfile
    from pathlib import Path

    novo_priv = private_key.strip() + '\n'
    novo_pub = public_key.strip() + '\n'

    original = signing.ENGINE_DIR
    erro = None
    with tempfile.TemporaryDirectory(prefix='prova-chaves-') as tmp:
        prova = Path(tmp)
        (prova / 'private.pem').write_text(novo_priv, encoding='ascii')
        (prova / 'public.pem').write_text(novo_pub, encoding='ascii')
        signing.ENGINE_DIR = prova
        signing.PRIVATE_KEY_PATH = prova / 'private.pem'
        signing.PUBLIC_KEY_PATH = prova / 'public.pem'
        try:
            msg = signing.build_message('2026-01-01', '2026-01-01T00:00:00',
                                        'FT T/1', '100.00', '')
            valida = signing.verify_message(msg, signing.sign_message(msg))
        except Exception as e:
            valida, erro = False, e
        finally:
            signing.ENGINE_DIR = original
            signing.PRIVATE_KEY_PATH = original / 'private.pem'
            signing.PUBLIC_KEY_PATH = original / 'public.pem'

    if not valida:
        detalhe = ' (%s)' % erro if erro else ''
        raise ValueError('As chaves de assinatura recebidas não validam%s — nada '
                         'foi alterado. O par que estava instalado continua a '
                         'trabalhar.' % detalhe)

    # Passou. Guarda-se o par antigo ao lado antes de o substituir.
    signing.ENGINE_DIR.mkdir(parents=True, exist_ok=True)
    # E arquiva-se a PÚBLICA em vigor com o número da sua versão: as facturas já
    # emitidas foram assinadas com ela e têm de continuar a verificar-se (ver
    # signing.verify_message).
    signing.arquivar_publica(versao_em_vigor)
    for caminho in (signing.PRIVATE_KEY_PATH, signing.PUBLIC_KEY_PATH):
        if caminho.exists():
            shutil.copyfile(str(caminho), str(caminho) + '.bak')
    signing.PRIVATE_KEY_PATH.write_text(novo_priv, encoding='ascii')
    signing.PUBLIC_KEY_PATH.write_text(novo_pub, encoding='ascii')


def apply_certification(cert=None, private_key=None, public_key=None):
    """Instala as credenciais do fabricante. Usado pelo PCC e pelo instalador.

    PRIMEIRO EXPERIMENTA, DEPOIS GRAVA — e nunca o contrário.

    Isto gravava as chaves novas em disco e só DEPOIS testava se assinavam. Se
    não assinassem (um par trocado, uma transferência truncada, um copiar-colar
    que perdeu uma linha), a função levantava o erro — mas as chaves boas já
    tinham sido escritas por cima, e não existiam em lado nenhum para repor. A
    partir daí o hotel não emitia uma única factura: toda a assinatura falhava.

    Pior ainda pelo sítio onde acontecia: o erro saía como um aviso de passagem
    ("a certificação AGT falhou") no fim de uma sincronização com o PCC — que é
    precisamente quando ninguém está a olhar para o sistema fiscal. O estrago
    descobria-se na primeira venda.
    """
    cfg = FiscalConfig.get()
    if private_key and public_key:
        _instalar_chaves(private_key, public_key, versao_em_vigor=(cfg.key_version or 1))
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
