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
        # TROCA NO PRIMEIRO LOGIN. Usa-se quando a senha NÃO foi escolhida pelo
        # dono — o caso da ativação automática, em que ela vem do PCC e passa
        # por uma máquina e um ficheiro antes de chegar a ele. Uma senha que
        # viajou não deve sobreviver ao primeiro dia.
        parser.add_argument('--trocar-no-primeiro-login', action='store_true',
                            dest='trocar', default=False)

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
        if opts.get('trocar'):
            # A marca vive na ficha de operador POS (pos.PosUser), que é quem o
            # login lê — ver auth_engine/views.py. Sem ficha, não há onde a pôr:
            # não se inventa uma, só se regista que não foi possível.
            try:
                from pos.models import PosUser
                pu = PosUser.objects.filter(auth_user=user).first()
                if pu:
                    pu.must_change_password = True
                    pu.save(update_fields=['must_change_password'])
                    self.stdout.write('O dono terá de trocar a senha no primeiro login.')
                else:
                    self.stdout.write('AVISO: sem ficha de operador — não foi possível '
                                      'marcar a troca de senha obrigatória.')
            except Exception as e:
                self.stdout.write(f'AVISO: não foi possível marcar a troca de senha ({e}).')

        self.stdout.write(self.style.SUCCESS(
            f'Conta "{username}" {"criada" if criado else "atualizada"}.'))
