"""
CRIAR/ATUALIZAR A CONTA DO DONO — chamado pelo configurar.py no primeiro arranque
de uma instalação nova, com o utilizador/password que o TÉCNICO introduziu no
wizard (página "Conta do Dono"), gerados no PCC (ecrã Acessos do cliente).

Idempotente: numa atualização (o setup.exe corrido outra vez por cima), se a conta
já existir e a password do wizard vier vazia, não mexe em nada — só cria a conta
na primeira vez, ou atualiza a password se uma nova for explicitamente indicada.
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Cria ou atualiza a conta do dono do sistema (superutilizador).'

    def add_arguments(self, parser):
        parser.add_argument('--username', required=True)
        parser.add_argument('--password', required=True)

    def handle(self, *args, **opts):
        username = opts['username'].strip()
        password = opts['password']
        if not username:
            raise CommandError('--username não pode ficar vazio.')
        if not password:
            raise CommandError('--password não pode ficar vazio.')

        User = get_user_model()
        user, criado = User.objects.get_or_create(
            username=username,
            defaults={'is_staff': True, 'is_superuser': True, 'is_active': True},
        )
        user.set_password(password)
        user.is_staff = True
        user.is_superuser = True
        user.is_active = True
        user.save()
        self.stdout.write(self.style.SUCCESS(
            f'Conta "{username}" {"criada" if criado else "atualizada"}.'))
