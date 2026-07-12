"""
Motor criptográfico do licenciamento — assinatura ASSIMÉTRICA (RSA-2048, SHA-256).

Modelo estilo Oracle/SAP:
  - O PCC (fornecedor) assina a licença com a CHAVE PRIVADA (private.pem) — nunca sai da cloud.
  - O ERP do cliente verifica com a CHAVE PÚBLICA (public.pem) — distribuída com o produto.

Assim, mesmo tendo o código-fonte e a chave pública, um cliente NÃO consegue forjar
uma licença (ao contrário do HMAC simétrico anterior, que usava o SECRET_KEY partilhado).
"""
import base64
import json
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.exceptions import InvalidSignature

ENGINE_DIR = Path(__file__).resolve().parent
PRIVATE_KEY_PATH = ENGINE_DIR / "private.pem"
PUBLIC_KEY_PATH = ENGINE_DIR / "public.pem"


def _canonical(data: dict) -> bytes:
    """Serialização determinística do payload (ordem e separadores fixos)."""
    return json.dumps(data, sort_keys=True, separators=(",", ":")).encode("utf-8")


def private_key_available() -> bool:
    """True apenas nas máquinas do fornecedor (PCC) que possuem a chave privada."""
    return PRIVATE_KEY_PATH.exists()


def sign_license(payload: dict) -> str:
    """Assina o payload da licença (sem o campo 'signature') e devolve a assinatura em base64."""
    private_pem = PRIVATE_KEY_PATH.read_bytes()
    private_key = serialization.load_pem_private_key(private_pem, password=None)
    signature = private_key.sign(
        _canonical(payload),
        padding.PKCS1v15(),
        hashes.SHA256(),
    )
    return base64.b64encode(signature).decode("utf-8")


def verify_license(payload: dict, signature_b64: str) -> bool:
    """Verifica a assinatura do payload com a chave pública. Devolve True/False, nunca levanta."""
    try:
        public_key = serialization.load_pem_public_key(PUBLIC_KEY_PATH.read_bytes())
        public_key.verify(
            base64.b64decode(signature_b64),
            _canonical(payload),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return True
    except (InvalidSignature, ValueError, TypeError, FileNotFoundError):
        return False
