"""
Digital Signature Engine — assinatura RSA (SHA-1) dos documentos fiscais, conforme AGT.

Mensagem a assinar (concatenada com ';', sem aspas nem quebras de linha):
    InvoiceDate;SystemEntryDate;InvoiceNo;GrossTotal;PreviousHash

Reutiliza o par de chaves em licensing/engine/{private,public}.pem.
A assinatura (Hash) é guardada em base64, tal como a versão da chave.
"""
import base64
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.exceptions import InvalidSignature

ENGINE_DIR = Path(__file__).resolve().parent.parent / 'licensing' / 'engine'
PRIVATE_KEY_PATH = ENGINE_DIR / 'private.pem'
PUBLIC_KEY_PATH = ENGINE_DIR / 'public.pem'


def build_message(invoice_date, system_entry_date, invoice_no, gross_total, previous_hash):
    """Formata a mensagem exatamente como exigido pela AGT."""
    return f"{invoice_date};{system_entry_date};{invoice_no};{gross_total};{previous_hash or ''}"


def sign_message(message: str) -> str:
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
