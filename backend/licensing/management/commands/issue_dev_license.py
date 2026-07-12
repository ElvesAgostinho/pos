"""
Emite uma license.key de DESENVOLVIMENTO, assinada com a chave privada RSA local,
ativando todos os módulos. Substitui o antigo comportamento "carrega tudo sempre".

Uso:
    python manage.py issue_dev_license            # todos os módulos
    python manage.py issue_dev_license --modules pos inventory esm
"""
import base64
import json
from datetime import date, timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from core.modules import all_modules, OPTIONAL_APP_LABELS
from licensing.engine.crypto import sign_license, private_key_available


class Command(BaseCommand):
    help = "Emite uma license.key de desenvolvimento assinada (RSA) com os módulos indicados."

    def add_arguments(self, parser):
        parser.add_argument(
            '--modules', nargs='*', default=None,
            help="Códigos de módulos opcionais a ativar (default: todos).",
        )

    def handle(self, *args, **options):
        if not private_key_available():
            raise CommandError(
                "private.pem não encontrado. A emissão de licenças só é possível onde existe a chave privada (PCC)."
            )

        core_codes = [m['code'] for m in all_modules() if m['is_core']]
        if options['modules']:
            invalid = [m for m in options['modules'] if m not in OPTIONAL_APP_LABELS]
            if invalid:
                raise CommandError(f"Módulos desconhecidos: {invalid}. Válidos: {OPTIONAL_APP_LABELS}")
            optional_codes = options['modules']
        else:
            optional_codes = list(OPTIONAL_APP_LABELS)

        payload = {
            "license_number": "DEV-LOCAL",
            "client_code": "DEV",
            "modules": core_codes + optional_codes,
            "feature_flags": {},
            "valid_until": (date.today() + timedelta(days=3650)).isoformat(),
            "limits": {"hotels": 99, "pos": 999, "users": 999},
        }
        payload["signature"] = sign_license({k: v for k, v in payload.items()})
        key = base64.b64encode(json.dumps(payload).encode('utf-8')).decode('utf-8')

        path = settings.BASE_DIR / 'license.key'
        path.write_text(key)
        self.stdout.write(self.style.SUCCESS(
            f"license.key escrita em {path}\nMódulos ativos: {', '.join(optional_codes)}"
        ))
