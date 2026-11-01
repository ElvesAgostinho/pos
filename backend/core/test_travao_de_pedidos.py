# -*- coding: utf-8 -*-
"""O TERMINAL NÃO PODE LEVAR COM O TRAVÃO DAS PESSOAS.

Todos os terminais da casa autenticam-se com a MESMA conta de serviço
(`pos_terminal`, ver auth_engine/views.py: a identidade do operador viaja no
payload, o token só autentica o terminal). O travão do DRF conta por
UTILIZADOR — portanto os 1200 pedidos por minuto não eram de um posto: eram
de todos somados, mais os ecrãs de cozinha, mais o mapa de mesas a refrescar,
mais as vendas do serviço.

Num sábado à noite isso chega ao limite. E o que acontece a seguir é o pior
possível: o empregado carrega em "enviar para a cozinha" e recebe um 429.

Apareceu porque a varredura dos ecrãs começou a estourar o travão — e começou
porque o arranque dos ecrãs tinha acabado de ser acelerado nesse mesmo dia. O
teste ficou rápido o suficiente para encontrar um limite que a casa cheia
também encontraria.

─── PORQUE É QUE ISTO NÃO PASSA PELA API ──────────────────────────────────
A primeira versão destes testes chamava `/api/pms/rooms/` com
`@override_settings(REST_FRAMEWORK=...)` e NÃO TRAVAVA NUNCA — nem o
terminal, nem as pessoas. Não era o travão que estava mal: o DRF liga as
classes de travão à vista no momento em que ela é IMPORTADA
(`throttle_classes = api_settings.DEFAULT_THROTTLE_CLASSES`, em
rest_framework/views.py), e nessa altura os testes ainda nem arrancaram.
Mudar a definição depois não muda nada, e o teste passava a dizer "não travou"
sobre um travão que nem sequer estava montado.

Testa-se a REGRA, directamente na classe. É ela que decide, e é a única coisa
que precisa de estar certa.
"""
from django.contrib.auth.models import AnonymousUser, User
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from core.throttling import CONTA_DO_TERMINAL, TravaoPorUtilizador


class OTravaoDistingueUmaPessoaDeUmTerminal(TestCase):

    def setUp(self):
        cache.clear()                  # o travão guarda o histórico na cache
        self.fabrica = APIRequestFactory()

    def _bater(self, utilizador, quantas, ritmos):
        """Quantos dos N pedidos passaram, com estes ritmos configurados."""
        passaram = 0
        with self.settings(REST_FRAMEWORK={'DEFAULT_THROTTLE_RATES': ritmos}):
            for _ in range(quantas):
                pedido = self.fabrica.get('/api/qualquer/')
                pedido.user = utilizador
                if TravaoPorUtilizador().allow_request(pedido, view=None):
                    passaram += 1
        return passaram

    # ------------------------------------------------------------------
    def test_uma_pessoa_continua_travada(self):
        """O travão existe para alguma coisa. Tirá-lo a toda a gente seria
        trocar um problema de serviço por um buraco de segurança."""
        pessoa = User.objects.create_user('recepcao', '', 'x')

        passaram = self._bater(pessoa, 9, {'user': '5/min', 'terminal': '500/min'})

        self.assertEqual(passaram, 5,
                         'uma pessoa passou por onde não devia — o travão deixou '
                         'de proteger')

    def test_o_terminal_passa_por_onde_a_pessoa_ja_teria_batido(self):
        """É o teste que interessa: o terminal é o restaurante inteiro numa
        conta só."""
        terminal = User.objects.create_user(CONTA_DO_TERMINAL, '', 'x')

        passaram = self._bater(terminal, 9, {'user': '5/min', 'terminal': '500/min'})

        self.assertEqual(passaram, 9,
                         'o terminal foi travado pelo tecto das pessoas — num '
                         'serviço cheio isto é o POS a falhar a meio do jantar')

    def test_o_terminal_tambem_tem_tecto(self):
        """Mais largo, mas existe. Um terminal avariado em ciclo não pode
        derrubar o servidor da casa toda."""
        terminal = User.objects.create_user(CONTA_DO_TERMINAL, '', 'x')

        passaram = self._bater(terminal, 6, {'user': '5/min', 'terminal': '3/min'})

        self.assertEqual(passaram, 3,
                         'o terminal não tem tecto nenhum — um posto avariado em '
                         'ciclo derruba o servidor')

    def test_o_terminal_e_a_pessoa_nao_partilham_o_contador(self):
        """Sem contadores separados, o histórico de um apertava o tecto do
        outro. Não é teórico: as duas chaves de cache do DRF são construídas a
        partir do id do utilizador, e sem distinção ficariam iguais."""
        pessoa = User.objects.create_user('recepcao', '', 'x')
        terminal = User.objects.create_user(CONTA_DO_TERMINAL, '', 'x')
        ritmos = {'user': '5/min', 'terminal': '500/min'}

        self._bater(pessoa, 6, ritmos)          # a pessoa já está travada
        passaram = self._bater(terminal, 4, ritmos)

        self.assertEqual(passaram, 4, 'o terminal apanhou com o contador da recepção')

    def test_quem_nao_esta_autenticado_nao_e_confundido_com_o_terminal(self):
        """Um pedido anónimo não tem `username`. Se a verificação fosse
        descuidada, rebentava — ou, pior, deixava passar."""
        passaram = self._bater(AnonymousUser(), 3, {'user': '5/min', 'terminal': '500/min'})

        # Sem utilizador, este travão não se aplica (é o AnonRateThrottle que
        # trata disso) — o que se exige aqui é que não rebente nem se faça
        # passar por terminal.
        self.assertEqual(passaram, 3)
