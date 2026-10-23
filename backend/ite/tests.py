# -*- coding: utf-8 -*-
"""LOTES, VALIDADES (FEFO) E PRODUÇÃO — o que estraga e o que se transforma.

PRIMEIRO, O QUE O DONO TEM DE SABER: a app `ite` ("Motor de Transações de
Inventário") é uma CONCHA VAZIA — `ite/models.py` tem duas linhas de imports e
nenhum modelo; views, services, urls e serializers estão todos vazios. O que o
módulo promete está espalhado por `inventory`:

  · LOTES e VALIDADES → `inventory.models.StockLot` + os ecrãs em `inventory/wh.py`
  · FICHA TÉCNICA     → `inventory.models.Recipe` + o ecrã em `inventory/pos_config.py`
  · PRODUÇÃO          → não existe em sítio nenhum (ver os testes do fim)

É isso que estes testes testam: o comportamento prometido, onde ele vive.

Os testes marcados `expectedFailure` falham DE PROPÓSITO. Descrevem o que a casa
precisa e ainda não tem, e ficam visíveis em cada execução. A correção é em
`inventory/` e em `pos/` — fora da área desta auditoria (ver relatório).
"""
import unittest
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase

from identity.models import Company, EnterpriseGroup, Hotel
from inventory import stock as motor
from inventory.models import (Item, ItemCategory, Recipe, RecipeIngredient,
                              StockLocation, StockLot, UnitOfMeasure, Warehouse)


class CozinhaMontada(APITestCase):
    """Um armazém, uma câmara fria, e os ingredientes de um bitoque."""

    def setUp(self):
        self.user = User.objects.create_superuser('chefe_cozinha', '', 'x')
        self.client.force_authenticate(self.user)

        grupo = EnterpriseGroup.objects.create(name='Grupo Principal')
        empresa = Company.objects.create(group=grupo, name='Mwana Lodge, Lda.', tax_id='5000000000')
        self.hotel = Hotel.objects.create(company=empresa, name='Mwana Lodge', is_master=True)
        self.armazem = Warehouse.objects.create(hotel=self.hotel, code='ECO', name='Economato',
                                                is_main=True)
        self.outro = Warehouse.objects.create(hotel=self.hotel, code='BAR', name='Bar da Piscina')
        self.frio = StockLocation.objects.create(warehouse=self.armazem, code='FRIO-1',
                                                 location_type='COLD')

        self.kg = UnitOfMeasure.objects.create(code='KG', name='Quilograma')
        self.un = UnitOfMeasure.objects.create(code='UN', name='Unidade')
        cat = ItemCategory.objects.create(name='Mercearia')
        self.carne = Item.objects.create(code='C001', name='Bife de Vaca', item_type='RawMaterial',
                                         category=cat, base_uom=self.kg)
        self.batata = Item.objects.create(code='C002', name='Batata', item_type='RawMaterial',
                                          category=cat, base_uom=self.kg)
        self.bitoque = Item.objects.create(code='P001', name='Bitoque à Casa',
                                           item_type='Manufactured', category=cat,
                                           base_uom=self.un, sale_price=Decimal('8500.00'))
        self.hoje = timezone.localdate()

    def _lote(self, numero, dias_para_validade, quantidade='10', artigo=None, armazem=None):
        return StockLot.objects.create(
            warehouse=armazem or self.armazem, item=artigo or self.carne, lot_number=numero,
            quantity=Decimal(quantidade), received_at=self.hoje,
            expiry_date=self.hoje + timedelta(days=dias_para_validade), location=self.frio)


# ==========================================================================
# LOTES E VALIDADES — FEFO (First Expired, First Out)
# ==========================================================================
class LotesEValidades(CozinhaMontada):

    def test_lotes_saem_ordenados_pela_validade_mais_curta(self):
        """FEFO: o que estraga primeiro gasta-se primeiro.

        Num hotel isto é dinheiro directo: um lote esquecido atrás de outro mais
        novo vai ao lixo inteiro. A ordem da lista é o que o empregado segue.
        """
        self._lote('L-NOVO', 90)
        self._lote('L-URGENTE', 3)
        self._lote('L-MEDIO', 30)
        r = self.client.get(f'/api/inventory/wh/lots/?warehouse={self.armazem.id}')
        self.assertEqual(r.status_code, 200)
        ordem = [linha['lot_number'] for linha in r.data]
        self.assertEqual(ordem, ['L-URGENTE', 'L-MEDIO', 'L-NOVO'],
                         f'A lista de lotes não está por validade (FEFO): {ordem}')

    def test_lista_de_lotes_diz_quantos_dias_faltam(self):
        """O número que decide se se usa hoje ou se se manda fora."""
        self._lote('L-1', 5)
        r = self.client.get(f'/api/inventory/wh/lots/?warehouse={self.armazem.id}')
        self.assertEqual(r.data[0]['days_to_expiry'], 5)

    def test_lote_ja_expirado_aparece_com_dias_negativos(self):
        """Mercadoria fora de prazo não pode ser servida — e tem de salta à vista."""
        self._lote('L-FORA', -2)
        r = self.client.get(f'/api/inventory/wh/lots/?warehouse={self.armazem.id}')
        self.assertEqual(r.data[0]['days_to_expiry'], -2)

    def test_filtro_de_validade_mostra_so_os_proximos_30_dias(self):
        """É a lista de trabalho do economato: o que há para gastar este mês."""
        self._lote('L-URGENTE', 10)
        self._lote('L-LONGE', 200)
        r = self.client.get(f'/api/inventory/wh/lots/?warehouse={self.armazem.id}&expiring=1')
        numeros = [linha['lot_number'] for linha in r.data]
        self.assertIn('L-URGENTE', numeros)
        self.assertNotIn('L-LONGE', numeros,
                         'Um lote que só expira dentro de 200 dias apareceu como urgente.')

    def test_lotes_de_outro_armazem_nao_se_misturam(self):
        """O chefe da cozinha não pode contar com um lote que está no bar."""
        self._lote('L-ECO', 10, armazem=self.armazem)
        self._lote('L-BAR', 10, armazem=self.outro)
        r = self.client.get(f'/api/inventory/wh/lots/?warehouse={self.armazem.id}')
        self.assertEqual([linha['lot_number'] for linha in r.data], ['L-ECO'])

    def test_painel_conta_os_lotes_a_expirar_e_os_ja_expirados(self):
        """Os dois números que o dono olha: o que há para gastar e o que já se perdeu."""
        self._lote('L-URGENTE', 10)
        self._lote('L-FORA', -5)
        self._lote('L-LONGE', 200)
        r = self.client.get('/api/inventory/wh/dashboard/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['lots_expiring_30d'], 2,
                         'A contagem de lotes a expirar em 30 dias está errada '
                         '(um expirado também está "dentro de 30 dias").')
        self.assertEqual(r.data['lots_expired'], 1)

    def test_lote_guarda_a_localizacao_fisica(self):
        """Saber que está na câmara fria FRIO-1 é o que permite ir buscá-lo — e é
        também o que a HACCP exige para a cadeia de frio."""
        lote = self._lote('L-1', 10)
        self.assertEqual(lote.location_id, self.frio.id)
        self.assertEqual(lote.location.location_type, 'COLD')

    @unittest.expectedFailure
    def test_lote_sem_validade_nao_devia_furar_a_fila_do_fefo(self):
        """FALHA DE PROPÓSITO — defeito conhecido em `inventory.models.StockLot`.

        A ordenação é `['expiry_date', 'received_at']`. Em SQL, os valores vazios
        vêm PRIMEIRO numa ordenação ascendente: um lote SEM data de validade
        aparece à frente de um lote que expira amanhã. O empregado segue a lista
        e gasta o lote sem data — o que expira amanhã fica para trás e vai ao lixo.

        Correção: ordenar com os vazios no fim (`F('expiry_date').asc(nulls_last=True)`).
        """
        self._lote('L-AMANHA', 1)
        StockLot.objects.create(warehouse=self.armazem, item=self.carne, lot_number='L-SEM-DATA',
                                quantity=Decimal('10'), received_at=self.hoje)
        r = self.client.get(f'/api/inventory/wh/lots/?warehouse={self.armazem.id}')
        self.assertEqual(r.data[0]['lot_number'], 'L-AMANHA',
                         'Um lote sem validade está a passar à frente de um que expira amanhã.')

    @unittest.expectedFailure
    def test_compra_devia_criar_o_lote_automaticamente(self):
        """FALHA DE PROPÓSITO — em falta no motor (`inventory/stock.py`).

        A entrada de mercadoria sobe o saldo e recalcula o custo, mas não cria
        lote nenhum. Resultado: os lotes só existem se alguém os escrever à mão
        num ecrã à parte, DEPOIS de receber. Numa cozinha, ninguém faz isso todos
        os dias — e a validade da mercadoria passa a não estar em sítio nenhum.
        """
        motor.move_in(self.armazem, self.carne, Decimal('20'), Decimal('4500'),
                      reference='GRN-TESTE')
        self.assertTrue(StockLot.objects.filter(item=self.carne).exists(),
                        'A entrada de mercadoria não criou lote com validade.')

    @unittest.expectedFailure
    def test_saida_de_stock_devia_abater_o_lote_mais_antigo(self):
        """FALHA DE PROPÓSITO — o FEFO é só INFORMATIVO (ver relatório).

        Este é o mais importante dos três. O saldo do artigo (`StockLevel`) e as
        quantidades dos lotes (`StockLot`) são dois números SEM LIGAÇÃO NENHUMA: o
        motor de stock nunca toca nos lotes. Uma venda baixa o saldo do artigo e
        deixa o lote intacto.

        Consequência prática: a soma dos lotes deixa de bater com o stock do
        artigo logo ao primeiro consumo. Os ecrãs de validade passam a mostrar
        mercadoria que já foi consumida, e a rastreabilidade do lote — a que serve
        para responder a uma intoxicação alimentar ou a uma recolha do fornecedor
        — não existe de facto.
        """
        self._lote('L-ANTIGO', 5, quantidade='10')
        motor.move_in(self.armazem, self.carne, Decimal('10'), Decimal('4500'), reference='ENT')
        motor.move_out(self.armazem, self.carne, Decimal('4'), reference='CONSUMO')
        lote = StockLot.objects.get(lot_number='L-ANTIGO')
        self.assertEqual(lote.quantity, Decimal('6.0000'),
                         'O consumo não abateu o lote mais perto da validade (FEFO não executa).')


# ==========================================================================
# FICHA TÉCNICA — o custo do prato
# ==========================================================================
class FichaTecnicaEProducao(CozinhaMontada):

    def setUp(self):
        super().setUp()
        # Custo médio real dos ingredientes, vindo de compras.
        motor.move_in(self.armazem, self.carne, Decimal('100'), Decimal('5000.00'), reference='C1')
        motor.move_in(self.armazem, self.batata, Decimal('100'), Decimal('400.00'), reference='C2')

    def _gravar_ficha(self, desperdicio_carne='0', doses=1):
        return self.client.put(f'/api/inventory/pos/articles/{self.bitoque.id}/recipe/', {
            'instructions': 'Grelhar o bife; fritar as batatas.', 'pax': 1, 'doses': doses,
            'ingredients': [
                {'ingredient_item': self.carne.id, 'uom': self.kg.id, 'quantity': '0.200',
                 'waste_percentage': desperdicio_carne},
                {'ingredient_item': self.batata.id, 'uom': self.kg.id, 'quantity': '0.150',
                 'waste_percentage': '0'},
            ]}, format='json')

    def test_custo_do_prato_sai_do_custo_medio_real_dos_ingredientes(self):
        """A conta que decide o preço da ementa.

        200 g de bife a 5.000/kg = 1.000; 150 g de batata a 400/kg = 60. Custo do
        prato: 1.060 Kz. Se o custo médio estiver errado, esta conta está errada —
        e a casa fixa o preço da ementa com base nela.
        """
        r = self._gravar_ficha()
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(Decimal(r.data['total_cost']), Decimal('1060.00'),
                         'O custo da ficha técnica não corresponde ao custo médio dos ingredientes.')

    def test_desperdicio_entra_no_custo_do_prato(self):
        """Das aparas do bife perde-se 20%: para pôr 200 g no prato gastam-se 240 g.

        240 g a 5.000 = 1.200 (+60 da batata) = 1.260. Ignorar o desperdício é
        subestimar o custo de TODOS os pratos da casa — é o erro clássico de
        quem calcula o custo pela receita em vez de pelo que sai do armazém.
        """
        r = self._gravar_ficha(desperdicio_carne='20')
        self.assertEqual(Decimal(r.data['total_cost']), Decimal('1260.00'),
                         'O desperdício não está a entrar no custo do prato.')

    def test_quantidade_efetiva_e_a_que_sai_do_armazem(self):
        r = self._gravar_ficha(desperdicio_carne='20')
        carne = next(i for i in r.data['ingredients'] if i['item_code'] == 'C001')
        self.assertEqual(Decimal(carne['effective_quantity']), Decimal('0.2400'),
                         'A quantidade efetiva (com desperdício) está errada.')

    def test_custo_por_dose_divide_pelo_numero_de_doses(self):
        """A ficha dá para 4 doses: o custo de CADA dose é um quarto.
        É o custo por dose que vai à margem do prato na ementa."""
        r = self._gravar_ficha(doses=4)
        carne = next(i for i in r.data['ingredients'] if i['item_code'] == 'C001')
        self.assertEqual(Decimal(carne['dose_qty']), Decimal('0.0500'))
        self.assertEqual(Decimal(carne['dose_cost']), Decimal('250.00'),
                         'O custo por dose não é o custo da linha dividido pelas doses.')

    def test_gravar_a_ficha_substitui_os_ingredientes_antigos(self):
        """"Gravar" é a fotografia completa do ecrã — não acumula linhas antigas,
        senão a ficha ia duplicando ingredientes a cada gravação."""
        self._gravar_ficha()
        self._gravar_ficha()
        rec = Recipe.objects.get(final_item=self.bitoque)
        self.assertEqual(rec.ingredients.count(), 2,
                         'Gravar a ficha outra vez duplicou os ingredientes.')

    def test_custo_guardado_na_ficha_e_uma_fotografia_do_dia_em_que_se_gravou(self):
        """CUIDADO, E É DE PROPÓSITO: há DOIS custos na ficha técnica.

        · `total_cost` é recalculado a cada leitura — está sempre actual;
        · `theoretical_cost` fica GRAVADO como estava no dia em que se premiu
          "Gravar".

        Quando o bife sobe de 5.000 para 7.000, o custo teórico guardado continua
        a dizer 1.060 até alguém reabrir e gravar a ficha outra vez. Quem ler o
        custo teórico (relatórios de margem) está a ver o custo do mês passado.
        Este teste prende a diferença para que ninguém a descubra por acidente.
        """
        self._gravar_ficha()
        rec = Recipe.objects.get(final_item=self.bitoque)
        self.assertEqual(rec.theoretical_cost, Decimal('1060.0000'))

        motor.move_in(self.armazem, self.carne, Decimal('100'), Decimal('7000.00'), reference='C3')
        r = self.client.get(f'/api/inventory/pos/articles/{self.bitoque.id}/recipe/')
        self.assertEqual(Decimal(r.data['total_cost']), Decimal('1260.00'),
                         'O custo recalculado da ficha não acompanhou a subida do preço da carne.')
        rec.refresh_from_db()
        self.assertEqual(rec.theoretical_cost, Decimal('1060.0000'),
                         'O custo teórico GRAVADO mudou sozinho — deixa de ser uma referência.')

    def test_ficha_em_branco_e_devolvida_sem_obrigar_a_criar_nada(self):
        """O ecrã abre numa ficha vazia em vez de dar erro para um artigo sem ficha."""
        r = self.client.get(f'/api/inventory/pos/articles/{self.carne.id}/recipe/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['ingredients'], [])
        self.assertEqual(Decimal(r.data['total_cost']), Decimal('0'))

    @unittest.expectedFailure
    def test_vender_um_produzido_devia_consumir_os_ingredientes(self):
        """FALHA DE PROPÓSITO — a PRODUÇÃO POR FICHA TÉCNICA NÃO EXISTE.

        A ficha técnica serve hoje só para CALCULAR o custo. Quem decide, na
        venda, se se consomem os ingredientes é `pos.consumption._active_recipe`,
        e essa função devolve `None` sempre — tem um `return None` antes de todo o
        código, e o código a seguir procura uma app `production` que não existe no
        sistema (e procura campos — `recipe.lines`, `component_item`,
        `yield_quantity` — que não são os de `inventory.Recipe`: aqui chamam-se
        `ingredients`, `ingredient_item`, `doses`).

        O que isto faz na prática: vender um bitoque dá saída de UM BITOQUE do
        armazém — um artigo que nunca foi comprado e nunca lá entrou. O bife e as
        batatas nunca saem do stock. O economato fica com stock fantasma de carne
        e, no artigo produzido, um saldo negativo que cresce todos os dias.

        É a maior lacuna encontrada nesta auditoria (ver relatório). Está fora da
        área que esta auditoria podia corrigir (`pos/`, `inventory/`).
        """
        self._gravar_ficha()
        from pos.consumption import _active_recipe
        ficha = _active_recipe(self.bitoque)
        self.assertIsNotNone(ficha,
                             'A venda de um artigo produzido não encontra a ficha técnica: '
                             'os ingredientes nunca saem do stock.')

    @unittest.expectedFailure
    def test_devia_haver_uma_ordem_de_producao(self):
        """FALHA DE PROPÓSITO — não há produção nenhuma no sistema.

        Uma cozinha produz em lote: faz-se 20 litros de molho de manhã, consomem-se
        os ingredientes de uma vez e fica stock de molho para o serviço. Isso é uma
        ORDEM DE PRODUÇÃO: consome ingredientes, cria o produzido, e dá-lhe um
        custo (a soma do que entrou). Não existe nenhum modelo, endpoint ou serviço
        disto — nem em `ite` (vazia) nem em `inventory`.

        Sem produção, o custo do produzido nunca se forma a partir dos
        ingredientes: fica a zero, e tudo o que o use (margens, valorização do
        stock de produzidos) está errado por omissão.
        """
        from django.urls import NoReverseMatch, reverse
        try:
            reverse('production-orders-list')
        except NoReverseMatch:
            self.fail('Não existe nenhum ecrã/endpoint de ordens de produção no sistema.')
