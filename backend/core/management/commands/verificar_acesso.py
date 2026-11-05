# -*- coding: utf-8 -*-
"""ALGUÉM CONSEGUE ENTRAR NESTE SISTEMA? — a última pergunta da instalação.

─── PORQUE É QUE ISTO EXISTE ──────────────────────────────────────────────
A instalação terminava a dizer "Base de dados pronta. Os serviços podem
arrancar." mesmo quando NENHUMA conta de acesso tinha sido criada. O caso
está escrito no próprio `configurar.py`, no último ramo:

    AVISO: sem secção [dono] (ou password vazia) — nenhuma conta de acesso
    foi criada.

É um `print`. Vai para um ficheiro de registo que ninguém abre. A barra de
progresso chega ao fim, o técnico vai-se embora, e o dono descobre no ecrã de
login — que recusa as credenciais dele porque não há credenciais nenhumas.
Nada no ecrã diz isso: diz "credenciais inválidas", que é a frase errada para
o problema certo.

É o mesmo formato das falhas que esta casa já apanhou duas vezes: uma coisa
correu mal, escreveu-o num sítio que ninguém lê, e continuou como se nada
fosse. Um instalador que acaba com sucesso tem de deixar o sistema USÁVEL —
e "usável" começa em alguém conseguir entrar.

─── O QUE SE VERIFICA ─────────────────────────────────────────────────────
Que existe pelo menos uma conta ACTIVA com acesso ao backoffice. Não se
verifica a password (não se consegue, está cifrada) nem se tenta adivinhar
qual é: verifica-se que a porta existe e tem dono.

Devolve código 1 se não houver. É o que faz o `configurar.py` parar e o
instalador mostrar o erro — em vez de o esconder num ficheiro.
"""
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Confirma que existe uma conta com que alguém possa entrar. Código 1 se não.'

    def handle(self, *args, **opts):
        contas = User.objects.filter(is_active=True).filter(
            is_superuser=True) | User.objects.filter(is_active=True, is_staff=True)
        contas = contas.distinct()

        if contas.exists():
            nomes = ', '.join(contas.values_list('username', flat=True)[:5])
            self.stdout.write(f'Acesso confirmado: {contas.count()} conta(s) — {nomes}')
            return

        # NÃO SE CRIA UMA CONTA AQUI, e é deliberado. Uma conta de fábrica
        # inventada pelo instalador é uma porta aberta que ninguém sabe que
        # existe e que ninguém vai fechar — e numa instalação que vai emitir
        # facturas certificadas isso é inaceitável. O que se faz é PARAR e
        # dizer, para quem está a instalar resolver na hora.
        raise SystemExit(
            'NINGUÉM CONSEGUE ENTRAR NESTE SISTEMA.\n'
            '\n'
            'A instalação chegou ao fim sem criar nenhuma conta de acesso. O\n'
            'ecrã de login vai recusar todas as credenciais, porque não há\n'
            'nenhuma — e a mensagem que ele dá ("credenciais inválidas") não\n'
            'diz isso.\n'
            '\n'
            'Causa habitual: a página "Conta do Dono" do instalador ficou por\n'
            'preencher, ou a activação da licença no PCC não trouxe a conta\n'
            '(sem código do cliente, ou sem ligação ao PCC).\n'
            '\n'
            'Como resolver: volte a correr o instalador e preencha a página\n'
            '"Conta do Dono"; ou, na pasta da aplicação, corra\n'
            '  manage.py criar_dono --username dono --password "<a senha>"\n')
