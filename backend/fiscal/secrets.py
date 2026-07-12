"""
Armazenamento seguro de segredos fiscais (credenciais AGT, chaves privadas).

Encriptação simétrica (Fernet) com chave derivada do SECRET_KEY do Django.
Nota: para produção certificada, mover a chave-mestra para um cofre (HSM/KMS/vault).
"""
import base64
import hashlib

from django.conf import settings
from cryptography.fernet import Fernet, InvalidToken


def _fernet():
    digest = hashlib.sha256(settings.SECRET_KEY.encode('utf-8')).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(value: str) -> str:
    if value in (None, ''):
        return ''
    return _fernet().encrypt(value.encode('utf-8')).decode('ascii')


def decrypt(token: str) -> str:
    if token in (None, ''):
        return ''
    try:
        return _fernet().decrypt(token.encode('ascii')).decode('utf-8')
    except (InvalidToken, ValueError):
        return ''


def mask(value: str) -> str:
    """Devolve uma máscara para exibição (nunca o segredo em claro)."""
    if not value:
        return ''
    return '••••••••'
