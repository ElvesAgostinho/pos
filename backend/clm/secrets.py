"""
Armazenamento seguro de segredos do PCC (senha de instalação, senha do dono).

Encriptação simétrica (Fernet) com chave derivada do SECRET_KEY do PCC — o mesmo
padrão de `fiscal.secrets` (lado cliente), só que este corre no lado FORNECEDOR:
o texto em claro só existe no momento em que o vendedor o gera e o copia; depois
disso, fica cifrado na base do PCC e nunca mais volta em claro pela API.
"""
import base64
import hashlib
import secrets as _secrets
import string

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


def gerar_senha(tamanho=14):
    """Senha aleatória fácil de LER e DITAR ao telefone — sem 0/O/1/l/I ambíguos."""
    alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    return ''.join(_secrets.choice(alfabeto) for _ in range(tamanho))
