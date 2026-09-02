"""Semeia os Grupos/Perfis de acesso do PMS — os mesmos nomes do PMS de
referência (10i host), para o popup "Permissões" de cada ecrã ter uma lista
real para marcar, não uma lista vazia. Idempotente (get_or_create por código).

Ficam com full_access=False e sem módulos/ecrãs autorizados por defeito — o
dono é que abre, ecrã a ecrã, o que cada grupo pode ver (popup "Permissões").
"""
from django.core.management.base import BaseCommand
from eae.models import Profile

GRUPOS = [
    ('ADMIN_DIRECCAO', 'Administração | Direcção'),
    ('COMERCIAL', 'Comercial'),
    ('CONSULTA', 'Consulta'),
    ('FINANCE', 'Finance'),
    ('FO_BACKOFFICE', 'Front Office | Back Office'),
    ('FO_MANAGER', 'Front Office Manager'),
    ('FO_SUPERVISOR', 'Front Office Supervisor'),
    ('GOVERNANTA', 'Governanta | Manutenção'),
    ('INTERFACE', 'Interface'),
    ('KITCHEN', 'KITCHEN'),
    ('MANAGER_POS', 'Manager POS'),
    ('SPA', 'SPA'),
    ('STORE_AGENT', 'STORE AGENT'),
    ('STORE_MANAGER', 'STORE MANAGER'),
    ('STORE_SUPERVISOR', 'STORE SUPERVISOR'),
    ('USER_POS', 'User POS'),
    ('VIEW_ONLY', 'View only'),
]


class Command(BaseCommand):
    help = 'Semeia os grupos/perfis de acesso do PMS (Permissões por ecrã).'

    def handle(self, *args, **options):
        criados, existentes = 0, 0
        for code, name in GRUPOS:
            _, created = Profile.objects.get_or_create(
                code=code,
                defaults={'name': name, 'category': 'PMS', 'full_access': False,
                          'allowed_modules': [], 'allowed_screens': []},
            )
            criados += created
            existentes += not created
        self.stdout.write(self.style.SUCCESS(
            f'Perfis PMS: {criados} criados, {existentes} já existiam.'))
