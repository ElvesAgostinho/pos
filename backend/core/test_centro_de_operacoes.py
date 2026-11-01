# -*- coding: utf-8 -*-
"""O CENTRO DE OPERAÇÕES — a torre de controlo, e agora a fonte dos painéis.

Este endpoint existia há muito e não tinha um único teste. Era aceitável
enquanto servia um ecrã que só o dono abria de vez em quando. Deixa de ser:
os painéis de informação rápida do PMS e do POS passam a ler daqui, e
números errados espalhados por dois módulos são piores do que não ter
números nenhuns — porque alguém decide com eles.

O que se exige aqui é aquilo que só se percebe ao ver a casa ao vivo:

 · A OCUPAÇÃO MEDE-SE SOBRE O QUE SE PODE VENDER. Um quarto em obras não
   está disponível; metê-lo no denominador faz uma casa esgotada parecer
   com lugares de sobra.

 · UM QUARTO DESACTIVADO não conta para nada. Fica na base por causa do
   histórico, mas para a operação já não existe.

 · LIVRE E POR LIMPAR não são a mesma coisa. "Livre" é o que a recepção
   pode vender agora; "por limpar" é o que a governanta ainda tem de
   tratar. Somá-los é mentir à recepção.
"""
from datetime import timedelta

from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from core.ops import ha_quanto_tempo
from identity.models import Company, EnterpriseGroup, Hotel
from pms.models import Room, RoomType


class OCentroDeOperacoesContaAOcupacao(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user('operador', password='x')
        self.client.force_authenticate(self.user)
        grupo = EnterpriseGroup.objects.create(name='Grupo')
        empresa = Company.objects.create(group=grupo, name='Top Hotels')
        self.hotel = Hotel.objects.create(company=empresa, name='Hotel Luanda')
        self.tipo = RoomType.objects.create(hotel=self.hotel, code='STD', name='Standard',
                                            base_rate=30000)

    def _quarto(self, numero, estado, activo=True):
        return Room.objects.create(hotel=self.hotel, room_type=self.tipo, number=numero,
                                   status=estado, is_active=activo)

    def _painel(self):
        r = self.client.get('/api/ops/center/')
        self.assertEqual(r.status_code, 200, r.content)
        return r.data['hotel']

    # ------------------------------------------------------------------
    def test_separa_livre_de_por_limpar(self):
        """A recepção vende os limpos; os sujos são trabalho da governanta."""
        self._quarto('101', 'OCCUPIED')
        self._quarto('102', 'VACANT_CLEAN')
        self._quarto('103', 'VACANT_DIRTY')
        self._quarto('104', 'VACANT_DIRTY')

        h = self._painel()

        self.assertEqual(h['occupied'], 1)
        self.assertEqual(h['free'], 1, 'só há um quarto que a recepção pode vender agora')
        self.assertEqual(h['dirty'], 2)
        self.assertEqual(h['rooms_total'], 4)

    def test_um_quarto_em_obras_nao_entra_na_ocupacao(self):
        """20 quartos, 4 em obras, 16 cheios: a casa está ESGOTADA, não a 80%.

        Era o que dizia — e o dono olhava para 80% e pensava que ainda tinha
        onde pôr gente.
        """
        for i in range(16):
            self._quarto(f'1{i:02d}', 'OCCUPIED')
        for i in range(4):
            self._quarto(f'2{i:02d}', 'OOO')

        h = self._painel()

        self.assertEqual(h['rooms_total'], 20)
        self.assertEqual(h['out_of_order'], 4)
        self.assertEqual(h['sellable'], 16, 'os quartos em obras não se vendem')
        self.assertEqual(h['occupancy_pct'], 100,
                         'com todos os quartos vendáveis ocupados, a ocupação é 100%%')

    def test_um_quarto_desactivado_nao_existe_para_a_operacao(self):
        self._quarto('101', 'OCCUPIED')
        self._quarto('102', 'VACANT_CLEAN')
        self._quarto('199', 'VACANT_CLEAN', activo=False)

        h = self._painel()

        self.assertEqual(h['rooms_total'], 2, 'o quarto desactivado fazia a casa parecer maior')
        self.assertEqual(h['free'], 1)
        self.assertEqual(h['occupancy_pct'], 50)

    def test_um_hotel_sem_quartos_nao_rebenta_a_dividir(self):
        """Uma instalação acabada de ligar tem zero quartos — e o painel é a
        primeira coisa que alguém abre. Dividir por zero aqui era deixar o
        sistema novo a dar erro logo no primeiro ecrã."""
        h = self._painel()

        self.assertEqual(h['rooms_total'], 0)
        self.assertEqual(h['sellable'], 0)
        self.assertEqual(h['occupancy_pct'], 0)

    def test_o_painel_responde_mesmo_sem_nada_configurado(self):
        """Cada secção degrada sozinha: quem comprou só o PMS não tem mesas, e
        o painel continua a ter de abrir."""
        r = self.client.get('/api/ops/center/')

        self.assertEqual(r.status_code, 200)
        for chave in ('tables', 'sales', 'cash', 'kitchen', 'hotel', 'stock', 'alerts'):
            self.assertIn(chave, r.data, f'o painel não trouxe "{chave}"')

    def test_sem_sessao_nao_se_ve_o_estado_da_casa(self):
        """Quantos quartos estão ocupados e quanto se vendeu hoje é informação
        da casa, não informação pública."""
        self.client.force_authenticate(None)

        r = self.client.get('/api/ops/center/')

        self.assertIn(r.status_code, (401, 403))


class OsAvisosTemDeSerLegiveis(APITestCase):
    """"há 136301min sem pedido" é um aviso que ninguém lê.

    E quem não lê um aviso deixa de olhar para a lista toda — um aviso ilegível
    é pior do que nenhum, porque ocupa o lugar dos que se leriam. Bastava uma
    conta aberta de um dia para o outro para isto acontecer.
    """

    def test_abaixo_de_uma_hora_diz_minutos(self):
        self.assertEqual(ha_quanto_tempo(timedelta(minutes=35)), 'há 35min')
        self.assertEqual(ha_quanto_tempo(timedelta(minutes=59)), 'há 59min')

    def test_acima_de_uma_hora_diz_horas_e_minutos(self):
        self.assertEqual(ha_quanto_tempo(timedelta(minutes=80)), 'há 1h20')
        self.assertEqual(ha_quanto_tempo(timedelta(hours=3, minutes=5)), 'há 3h05')

    def test_acima_de_um_dia_diz_dias(self):
        """Uma conta esquecida no sistema diz "há 94 dias", não 136301 minutos."""
        self.assertEqual(ha_quanto_tempo(timedelta(days=1, hours=2)), 'há 1 dia')
        self.assertEqual(ha_quanto_tempo(timedelta(days=4)), 'há 4 dias')
        self.assertEqual(ha_quanto_tempo(timedelta(minutes=136301)), 'há 94 dias')
