"""
Provisiona a certificação AGT na instalação do cliente.

Corre no INSTALADOR (ou é chamado pelo PCC). É a única forma de o nº de certificado e a
chave de assinatura entrarem no sistema — a interface do cliente não o permite.

    python manage.py provision_certification --cert 147/AGT/2026 \
        --private private.pem --public public.pem

A chave privada é a chave DO PROGRAMA (do fabricante), igual em todos os clientes.
Nunca deve ser entregue ao cliente em ficheiro nem ficar acessível na interface dele.
"""
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from fiscal.certification import apply_certification


class Command(BaseCommand):
    help = 'Instala o nº de certificado AGT e a chave de assinatura do software (só fornecedor).'

    def add_arguments(self, parser):
        parser.add_argument('--cert', help='Nº de certificado AGT (ex.: 147/AGT/2026)')
        parser.add_argument('--private', help='Ficheiro da chave privada (PEM)')
        parser.add_argument('--public', help='Ficheiro da chave pública (PEM)')

    def handle(self, *args, **o):
        priv = pub = None
        if o.get('private') or o.get('public'):
            if not (o.get('private') and o.get('public')):
                raise CommandError('Indique as DUAS chaves (--private e --public).')
            priv = Path(o['private']).read_text(encoding='ascii')
            pub = Path(o['public']).read_text(encoding='ascii')
        if not (o.get('cert') or priv):
            raise CommandError('Nada para provisionar: use --cert e/ou --private/--public.')

        cfg = apply_certification(cert=o.get('cert'), private_key=priv, public_key=pub)
        self.stdout.write(self.style.SUCCESS(
            f"Certificação instalada: nº {cfg.certificate_number} · chave v{cfg.key_version} · ambiente {cfg.environment}"))
        self.stdout.write('A menção passa a sair automaticamente em todas as faturas, no QR e no SAF-T.')
