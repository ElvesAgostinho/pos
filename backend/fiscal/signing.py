"""
Digital Signature Engine — assinatura RSA (SHA-1) dos documentos fiscais, conforme AGT.

Mensagem a assinar (concatenada com ';', sem aspas nem quebras de linha):
    InvoiceDate;SystemEntryDate;InvoiceNo;GrossTotal;PreviousHash

Par de chaves PRÓPRIO em fiscal/keys/{private,public}.pem — NUNCA a pasta
licensing/engine/. Essa pasta guarda a chave que valida o `license.key` do
cliente (ver licensing/engine/crypto.py); antes deste ficheiro apontava para lá
("reutiliza o par de chaves de licensing/engine"), e `apply_certification()`
(que grava aqui as credenciais AGT vindas do PCC) SOBRESCREVIA o public.pem do
licenciamento com a chave de assinatura AGT — a próxima verificação de licença
falhava ("Assinatura de licença inválida") e o `pms` (e todos os módulos
opcionais) saía do INSTALLED_APPS. Apanhado a sério nesta auditoria: gerar um
par de teste no caminho antigo partiu a licença desta instalação na hora.
A assinatura (Hash) é guardada em base64, tal como a versão da chave.
"""
import base64
import os
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.exceptions import InvalidSignature


class ChaveFiscalEmFalta(Exception):
    """Não há par de chaves para assinar — e não se pode inventar um em PRODUÇÃO."""

# FISCAL_KEYS_DIR (opcional): mesmo motivo do LICENSING_KEYS_DIR do licenciamento —
# num deploy em contentor a pasta de código é reconstruída a cada redeploy; a chave
# PRIVADA tem de viver num volume persistente separado quando essa variável existir.
ENGINE_DIR = Path(os.environ.get('FISCAL_KEYS_DIR') or (Path(__file__).resolve().parent / 'keys'))
PRIVATE_KEY_PATH = ENGINE_DIR / 'private.pem'
PUBLIC_KEY_PATH = ENGINE_DIR / 'public.pem'


def build_message(invoice_date, system_entry_date, invoice_no, gross_total, previous_hash):
    """Formata a mensagem exatamente como exigido pela AGT."""
    return f"{invoice_date};{system_entry_date};{invoice_no};{gross_total};{previous_hash or ''}"


def ensure_keys():
    """Garante que existe par de chaves ANTES de assinar seja o que for.

    Numa instalação acabada de montar não há chaves nenhumas — elas só chegam
    na certificação AGT (`apply_certification`, vindo do PCC ou do instalador).
    Até aqui, a PRIMEIRA factura que alguém tentasse emitir rebentava com um
    `FileNotFoundError` em bruto e um 500 no ecrã, sem dizer a ninguém o que
    fazer. Duas situações, duas respostas diferentes:

    - AMBIENTE DE TESTES: gera-se um par próprio na hora. É o que permite
      montar o hotel, lançar contas e conferir facturas ANTES de a AGT
      certificar o programa — sem isto não há como sequer testar o sistema.
    - PRODUÇÃO: NUNCA se inventa uma chave. Uma factura real tem de sair
      assinada com a chave certificada; auto-assinar em produção era declarar
      à AGT uma conformidade que não existe. Falha com um erro explícito que
      diz exactamente o que falta fazer.
    """
    if PRIVATE_KEY_PATH.exists() and PUBLIC_KEY_PATH.exists():
        return
    from .models import FiscalConfig
    cfg = FiscalConfig.get()
    if (cfg.environment or 'TEST').upper() == 'PROD':
        raise ChaveFiscalEmFalta(
            'Este sistema está em PRODUÇÃO e ainda não tem a chave de assinatura '
            'fiscal instalada. Conclua a certificação AGT (Fiscal → Certificação) '
            'antes de emitir documentos.')
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    ENGINE_DIR.mkdir(parents=True, exist_ok=True)
    PRIVATE_KEY_PATH.write_bytes(key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption()))
    PUBLIC_KEY_PATH.write_bytes(key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo))
    try:
        from .models import FiscalAuditLog
        FiscalAuditLog.objects.create(
            event='CERT_PROVISION',
            detail='Par de chaves de TESTE gerado automaticamente (ambiente TEST, '
                   'ainda sem certificação AGT). Será substituído pela chave '
                   'certificada quando a certificação for aplicada.')
    except Exception:
        pass   # o registo de auditoria nunca pode impedir a emissão


def sign_message(message: str) -> str:
    ensure_keys()
    key = serialization.load_pem_private_key(PRIVATE_KEY_PATH.read_bytes(), password=None)
    signature = key.sign(message.encode('utf-8'), padding.PKCS1v15(), hashes.SHA1())
    return base64.b64encode(signature).decode('ascii')


def verify_message(message: str, signature_b64: str) -> bool:
    pub = serialization.load_pem_public_key(PUBLIC_KEY_PATH.read_bytes())
    try:
        pub.verify(base64.b64decode(signature_b64), message.encode('utf-8'),
                   padding.PKCS1v15(), hashes.SHA1())
        return True
    except (InvalidSignature, ValueError):
        return False


def print_mention(doc_hash: str, certificate_number: str, signable: bool = True) -> str:
    """
    Menção obrigatória no rodapé do documento.
    - Documentos assináveis: 4 caracteres do Hash nas posições 1, 11, 21 e 31,
      separados por '-', seguidos de 'Processado por programa validado n.º XXXX/AGT'.
    - Documentos não assináveis (ex.: recibos): 'Emitido por programa validado n.º XXXX/AGT'.
    """
    # Se o nº já vem no formato "147/AGT/2026", não duplica o sufixo "/AGT".
    cert = certificate_number or '0000'
    cert_str = cert if 'AGT' in cert.upper() else f"{cert}/AGT"
    if not signable:
        return f"Emitido por programa validado n.º {cert_str}"
    positions = [0, 10, 20, 30]
    chars = '-'.join(doc_hash[p] for p in positions if p < len(doc_hash))
    return f"{chars} · Processado por programa validado n.º {cert_str}"


def build_qr_data(cfg, doc) -> str:
    """
    Conteúdo do QR Code (campos-chave para leitura/validação AGT).
    Formato parametrizável campo*valor separado por '|'.
    """
    hash4 = ''.join(doc.doc_hash[p] for p in (0, 10, 20, 30) if p < len(doc.doc_hash))
    parts = [
        f"A:{cfg.company_nif or ''}",              # NIF emitente
        f"B:{doc.customer_tax_id or '999999999'}", # NIF adquirente
        f"C:AO",                                   # país
        f"D:{doc.doc_type.code}",                  # tipo de documento
        f"E:{doc.status}",                         # estado (N/A)
        f"F:{doc.doc_date}",                       # data
        f"G:{doc.invoice_no}",                     # nº do documento
        f"H:{doc.net_total}",                      # base tributável
        f"I:{doc.tax_total}",                      # imposto
        f"N:{doc.gross_total}",                    # total
        f"O:{hash4}",                              # 4 chars do hash
        f"P:{cfg.certificate_number}",             # nº certificado AGT
        f"R:v{doc.key_version}",                   # versão da chave
    ]
    return '|'.join(parts)
