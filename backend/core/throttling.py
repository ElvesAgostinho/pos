# -*- coding: utf-8 -*-
"""O TRAVÃO DE PEDIDOS — e porque é que o terminal não pode levar com ele.

─── O QUE SE DESCOBRIU ────────────────────────────────────────────────────
O travão do DRF conta por UTILIZADOR: 1200 pedidos por minuto cada um. Para
uma pessoa é imenso — ninguém carrega vinte vezes por segundo.

Só que o POS FrontOffice não se autentica como pessoa. Todos os terminais da
casa partilham UMA conta de serviço (`pos_terminal`, ver auth_engine/views.py:
a identidade do operador viaja no payload, o token só autentica o terminal).

Então os 1200/min não são de um terminal: são de TODOS, somados. Quatro
terminais, dois ecrãs de cozinha, o mapa de mesas a refrescar, o painel do
ambiente de trabalho, e as vendas do serviço — tudo no mesmo orçamento. Num
sábado à noite isso chega ao limite, e o que acontece a seguir é o pior
possível: o terminal começa a receber 429 A MEIO DO SERVIÇO. O empregado
carrega em "enviar para a cozinha" e nada acontece.

Isto apareceu porque a varredura dos ecrãs passou a estourar o travão — e
passou porque EU a tinha acelerado nesse mesmo dia (os ecrãs deixaram de
carregar o sistema inteiro). O teste ficou rápido o suficiente para encontrar
um limite que a casa cheia também encontraria.

─── O QUE SE FAZ ──────────────────────────────────────────────────────────
A conta de serviço do terminal passa a ter o seu próprio ritmo, muito mais
largo. NÃO se tira o travão: ele continua a proteger contra o abuso, que é
para o que existe — e um terminal avariado em ciclo também tem de bater num
tecto, senão derruba o servidor da casa toda.

O que muda é o tamanho do tecto para quem é, de facto, dezenas de postos.
Continua a contar: se um dia for excedido, é porque há mesmo alguma coisa
errada, e não porque o restaurante está cheio.

As pessoas (recepção, backoffice, contabilidade) ficam como estavam.
"""
import os

from rest_framework.throttling import UserRateThrottle

# O nome da conta de serviço do terminal. Está escrito em auth_engine/views.py
# ao criá-la; aqui lê-se o mesmo nome para os dois lados não poderem divergir
# em silêncio — se alguém lá mudar o nome, este ficheiro deixa de reconhecer o
# terminal e o travão volta a apertar sem ninguém perceber porquê.
CONTA_DO_TERMINAL = 'pos_terminal'


class TravaoPorUtilizador(UserRateThrottle):
    """O travão normal, com uma excepção para a conta de serviço do terminal."""

    # `scope` fica 'user' para herdar a configuração existente; o ritmo do
    # terminal é escolhido em `get_rate`, abaixo.
    scope = 'user'

    def get_rate(self):
        # LÊ AS DEFINIÇÕES NO MOMENTO, e não a cópia que o DRF guardou.
        #
        # `SimpleRateThrottle.THROTTLE_RATES` é um atributo de CLASSE, fixado
        # quando o módulo do DRF é importado. Quem mudar os ritmos depois disso
        # — uma recarga de definições, um teste — não mexe em nada, e o travão
        # continua a usar os valores do arranque sem o dizer a ninguém.
        #
        # Foi assim que estes testes "passaram" a dizer que nada travava: o
        # travão lia 1200/min enquanto a definição já dizia 5/min.
        from rest_framework.settings import api_settings
        ritmos = api_settings.DEFAULT_THROTTLE_RATES or {}
        if getattr(self, '_e_terminal', False):
            return ritmos.get('terminal') or os.environ.get('THROTTLE_TERMINAL', '20000/min')
        return ritmos.get(self.scope) or super().get_rate()

    def allow_request(self, request, view):
        # Decide-se ANTES de o DRF calcular o ritmo: `get_rate()` é chamado no
        # __init__ da classe-mãe, e nessa altura ainda não há pedido nenhum.
        utilizador = getattr(request, 'user', None)
        self._e_terminal = bool(
            utilizador and utilizador.is_authenticated
            and getattr(utilizador, 'username', '') == CONTA_DO_TERMINAL)
        if self._e_terminal:
            # Recalcula com o ritmo do terminal — o __init__ já correu com o
            # das pessoas.
            self.rate = self.get_rate()
            self.num_requests, self.duration = self.parse_rate(self.rate)
        return super().allow_request(request, view)

    def get_cache_key(self, request, view):
        chave = super().get_cache_key(request, view)
        # CONTADOR PRÓPRIO. Sem isto, o terminal e as pessoas partilhariam a
        # mesma chave de cache quando o utilizador fosse o mesmo — e o histórico
        # de um contaminava o tecto do outro.
        if chave and getattr(self, '_e_terminal', False):
            return chave + ':terminal'
        return chave
