# -*- coding: utf-8 -*-
"""LOTES, VALIDADES (FEFO) E PRODUÇÃO — o que estraga e o que se transforma.

PRIMEIRO, O QUE O DONO TEM DE SABER: a app `ite` ("Motor de Transações de
Inventário") é uma CONCHA VAZIA — `ite/models.py` tem duas linhas de imports e
nenhum modelo; views, services, urls e serializers estão todos vazios. O que o
módulo promete está espalhado por `inventory`:

  · LOTES e VALIDADES → `inventory.models.StockLot`, abatidos pelo motor
                        `inventory/stock.py` (FEFO a executar, não a informar)
  · FICHA TÉCNICA     → `inventory.models.Recipe` + o ecrã em `inventory/pos_config.py`
  · PRODUÇÃO          → `inventory/production.py` (ordem de fabrico + consumo por ficha)

É isso que estes testes testam: o comportamento prometido, onde ele vive.

O QUE AINDA FALTA, E É UM SÓ SÍTIO: a venda do POS continua a dar saída do artigo
produzido em vez dos ingredientes, porque `pos.consumption._active_recipe` devolve
`None` sempre. O motor que resolve isso já está feito e testado aqui
(`inventory.production.consumir_por_ficha`); falta ligá-lo, e `pos/` está fora da
área desta correção. É o último `expectedFailure` deste ficheiro.
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
                              StockLevel, StockLocation, StockLot, UnitOfMeasure,
                              Warehouse)


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

    def _saldo(self, artigo, armazem=None):
        """O saldo do artigo no armazém — o número que o ecrã de existências mostra."""
        nivel = StockLevel.objects.filter(warehouse=armazem or self.armazem, item=artigo).first()
        return nivel.quantity_on_hand if nivel else Decimal('0')

    def _lotes(self, artigo, armazem=None):
        """A soma dos lotes do artigo. Tem de bater com o saldo — é a conta que,
        antes disto, deixava de bater à primeira saída."""
        total = Decimal('0')
        for lote in StockLot.objects.filter(warehouse=armazem or self.armazem, item=artigo):
            total += lote.quantity or Decimal('0')
        return total

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

    def test_lote_sem_validade_nao_devia_furar_a_fila_do_fefo(self):
        """Um lote sem data não passa à frente de um que expira amanhã.

        Em SQL, um valor vazio ordena ANTES de qualquer data: com a ordenação
        `['expiry_date', ...]` o lote SEM validade aparecia no topo da lista de
        trabalho do economato. O empregado segue a lista, gasta o lote sem data, e
        o que expirava amanhã fica para trás e vai ao lixo inteiro.

        Corrigido em `inventory.models.StockLot.Meta.ordering` com
        `F('expiry_date').asc(nulls_last=True)` — o que não tem data sai no fim.
        """
        self._lote('L-AMANHA', 1)
        StockLot.objects.create(warehouse=self.armazem, item=self.carne, lot_number='L-SEM-DATA',
                                quantity=Decimal('10'), received_at=self.hoje)
        r = self.client.get(f'/api/inventory/wh/lots/?warehouse={self.armazem.id}')
        self.assertEqual(r.data[0]['lot_number'], 'L-AMANHA',
                         'Um lote sem validade está a passar à frente de um que expira amanhã.')

    def test_compra_devia_criar_o_lote_automaticamente(self):
        """Receber mercadoria cria o lote — ninguém o escreve à mão.

        A entrada subia o saldo e recalculava o custo, mas não criava lote nenhum:
        os lotes só existiam se alguém os escrevesse num ecrã à parte DEPOIS de
        receber. Numa cozinha isso não acontece todos os dias — e a validade da
        mercadoria não estava em sítio nenhum.

        O lote fica com o número do documento de entrada, que é o que permite
        voltar atrás e descobrir de quem veio a mercadoria.
        """
        motor.move_in(self.armazem, self.carne, Decimal('20'), Decimal('4500'),
                      reference='GRN-TESTE')
        self.assertTrue(StockLot.objects.filter(item=self.carne).exists(),
                        'A entrada de mercadoria não criou lote com validade.')

    def test_saida_de_stock_devia_abater_o_lote_mais_antigo(self):
        """O FEFO deixou de ser uma lista informativa: a saída abate o lote.

        O saldo do artigo (`StockLevel`) e as quantidades dos lotes (`StockLot`)
        eram dois números sem ligação nenhuma — o motor de stock nunca tocava nos
        lotes. Uma venda baixava o saldo e deixava o lote intacto, e a soma dos
        lotes deixava de bater com o stock do artigo ao primeiro consumo: os ecrãs
        de validade mostravam mercadoria já consumida e a rastreabilidade do lote
        — a que serve para responder a uma intoxicação alimentar ou a uma recolha
        do fornecedor — não existia de facto.

        Agora quem mexe no saldo mexe no lote, na mesma transação: saem 4 kg e é o
        lote que expira primeiro que fica com 6.
        """
        self._lote('L-ANTIGO', 5, quantidade='10')
        motor.move_in(self.armazem, self.carne, Decimal('10'), Decimal('4500'), reference='ENT')
        motor.move_out(self.armazem, self.carne, Decimal('4'), reference='CONSUMO')
        lote = StockLot.objects.get(lot_number='L-ANTIGO')
        self.assertEqual(lote.quantity, Decimal('6.0000'),
                         'O consumo não abateu o lote mais perto da validade (FEFO não executa).')

    def test_a_entrada_data_o_lote_pela_validade_do_artigo(self):
        """O artigo diz quantos dias dura; a receção faz a conta.

        É isto que faz a validade existir sem ninguém a escrever: recebeu-se
        iogurte com 20 dias de validade, o lote fica datado para dentro de 20
        dias e aparece na lista do economato no sítio certo.
        """
        self.carne.shelf_life_days = 20
        self.carne.save(update_fields=['shelf_life_days'])
        motor.move_in(self.armazem, self.carne, Decimal('5'), Decimal('4500'), reference='GRN-1')
        lote = StockLot.objects.get(item=self.carne, lot_number='GRN-1')
        self.assertEqual(lote.expiry_date, self.hoje + timedelta(days=20))

    def test_receber_duas_vezes_o_mesmo_lote_nao_faz_dois_lotes(self):
        """Soma ao que lá está — senão a lista de validades enchia-se de linhas
        repetidas da mesma prateleira."""
        motor.move_in(self.armazem, self.carne, Decimal('5'), Decimal('4500'), reference='GRN-2')
        motor.move_in(self.armazem, self.carne, Decimal('3'), Decimal('4500'), reference='GRN-2')
        lotes = StockLot.objects.filter(item=self.carne, lot_number='GRN-2')
        self.assertEqual(lotes.count(), 1)
        self.assertEqual(lotes.first().quantity, Decimal('8.0000'))

    def test_a_soma_dos_lotes_bate_sempre_com_o_saldo_do_armazem(self):
        """A conta que antes deixava de bater à primeira saída. Se estes dois
        números divergirem, nada do que o módulo promete é verdade."""
        motor.move_in(self.armazem, self.carne, Decimal('20'), Decimal('4500'), reference='GRN-3')
        motor.move_out(self.armazem, self.carne, Decimal('7'), reference='CONSUMO')
        motor.adjust(self.armazem, self.carne, Decimal('11'), reference='INV-1')
        self.assertEqual(self._saldo(self.carne), Decimal('11.0000'))
        self.assertEqual(self._lotes(self.carne), Decimal('11.0000'))

    def test_o_lote_viaja_com_a_mercadoria_na_transferencia(self):
        """A mesma caixa não muda de validade por ter mudado de armazém.

        Sem isto, o destino recebia um lote novo sem data e a cadeia de frio da
        HACCP deixava de se poder seguir de ponta a ponta.
        """
        self.carne.shelf_life_days = 7
        self.carne.save(update_fields=['shelf_life_days'])
        motor.move_in(self.armazem, self.carne, Decimal('10'), Decimal('4500'), reference='L-FORNEC')
        motor.transfer(self.armazem, self.outro, self.carne, Decimal('4'), reference='TRF-1')
        no_bar = StockLot.objects.get(warehouse=self.outro, item=self.carne)
        self.assertEqual(no_bar.lot_number, 'L-FORNEC')
        self.assertEqual(no_bar.expiry_date, self.hoje + timedelta(days=7))
        self.assertEqual(no_bar.quantity, Decimal('4.0000'))

    def test_lote_esgotado_sai_da_lista_de_trabalho_e_das_contagens(self):
        """Mandar o empregado procurar mercadoria que já se gastou é pior do que
        não ter lista — e o painel do dono deixava de dizer a verdade."""
        self.carne.shelf_life_days = 2
        self.carne.save(update_fields=['shelf_life_days'])
        motor.move_in(self.armazem, self.carne, Decimal('5'), Decimal('4500'), reference='L-GASTO')
        motor.move_out(self.armazem, self.carne, Decimal('5'), reference='CONSUMO')
        r = self.client.get(f'/api/inventory/wh/lots/?warehouse={self.armazem.id}')
        self.assertEqual([linha['lot_number'] for linha in r.data], [])
        painel = self.client.get('/api/inventory/wh/dashboard/')
        self.assertEqual(painel.data['lots_expiring_30d'], 0)
        historico = self.client.get(f'/api/inventory/wh/lots/?warehouse={self.armazem.id}&all=1')
        self.assertEqual([linha['lot_number'] for linha in historico.data], ['L-GASTO'])

    def test_consumo_sem_lotes_nao_trava_a_venda_ao_balcao(self):
        """REGRA DO BALCÃO: numa casa que ainda não registava lotes, metade do
        stock não tem lote nenhum. Travar aqui era travar o serviço por causa de
        registos que ninguém chegou a fazer — o movimento passa e diz na nota o
        que ficou sem lote, para alguém corrigir."""
        motor.move_in(self.armazem, self.carne, Decimal('2'), Decimal('4500'), reference='L-POUCO')
        mov = motor.move_out(self.armazem, self.carne, Decimal('5'), reference='VENDA',
                             permitir_negativo=True)
        self.assertEqual(self._saldo(self.carne), Decimal('-3.0000'))
        self.assertIn('sem lote identificado: 3', mov.note)


# ==========================================================================
# FICHA TÉCNICA — o custo do prato
# ==========================================================================
class CozinhaComIngredientes(CozinhaMontada):
    """Base das duas coisas que se fazem com uma ficha técnica: calcular o custo
    (abaixo) e produzir de facto (mais abaixo). Sem testes próprios — só o cenário:
    ingredientes em stock ao custo real, e a ficha do bitoque por gravar."""

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


class FichaTecnicaEProducao(CozinhaComIngredientes):

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

    def test_vender_um_produzido_devia_consumir_os_ingredientes(self):
        """FALHA DE PROPÓSITO — falta LIGAR o motor à venda do POS (`pos/`).

        Quem decide, na venda, se se consomem os ingredientes é
        `pos.consumption._active_recipe`, e essa função devolve `None` sempre: tem
        um `return None` antes de todo o código, e o código a seguir procura uma
        app `production` que não existe e campos que não são os de
        `inventory.Recipe` (`recipe.lines`, `component_item`, `yield_quantity`, em
        vez de `ingredients`, `ingredient_item`, `doses`).

        O que isto faz na prática: vender um bitoque dá saída de UM BITOQUE do
        armazém — um artigo que nunca foi comprado e nunca lá entrou. O bife e as
        batatas nunca saem do stock. O economato fica com carne fantasma e, no
        artigo produzido, um saldo negativo que cresce todos os dias.

        O MOTOR QUE RESOLVE ISTO JÁ EXISTE E ESTÁ TESTADO neste ficheiro:
        `inventory.production.consumir_por_ficha(armazem, artigo, quantidade,
        permitir_negativo=True)` — dá saída dos ingredientes e devolve `None`
        quando o artigo não tem ficha (revenda), que é exactamente o ramo que
        `pos/consumption.py` já tem. Falta a ligação, e `pos/` é área de outra
        pessoa. Este teste fica a falhar de propósito até ela ser feita.
        """
        self._gravar_ficha()
        from pos.consumption import _active_recipe
        ficha = _active_recipe(self.bitoque)
        self.assertIsNotNone(ficha,
                             'A venda de um artigo produzido não encontra a ficha técnica: '
                             'os ingredientes nunca saem do stock.')

    def test_motor_de_consumo_por_ficha_tira_os_ingredientes_e_nao_o_prato(self):
        """O que a venda do POS tem de chamar — já pronto e a funcionar.

        Vender 5 bitoques gasta 1 kg de bife (5 x 200 g) e 750 g de batata; o
        bitoque não sai do armazém, porque nunca lá entrou nenhum.
        """
        from inventory.production import consumir_por_ficha
        self._gravar_ficha()
        movimentos = consumir_por_ficha(self.armazem, self.bitoque, Decimal('5'),
                                        reference='TICKET-1', permitir_negativo=True)
        self.assertEqual(len(movimentos), 2)
        self.assertEqual(self._saldo(self.carne), Decimal('99.0000'))
        self.assertEqual(self._saldo(self.batata), Decimal('99.2500'))
        self.assertEqual(self._saldo(self.bitoque), Decimal('0'))

    def test_consumo_por_ficha_de_um_artigo_de_revenda_devolve_nada(self):
        """Uma cerveja não tem ficha: o motor diz "não é comigo" e quem chama dá
        saída do próprio artigo. É o que mantém o POS a vender sem fichas."""
        from inventory.production import consumir_por_ficha
        self.assertIsNone(consumir_por_ficha(self.armazem, self.carne, Decimal('1')))

    def test_consumo_na_venda_nao_trava_quando_falta_ingrediente(self):
        """REGRA DO BALCÃO: a venda passa sempre.

        Há 100 kg de bife; vender 1.000 bitoques precisa de 200 kg. Ao balcão não
        se trava a venda com o cliente à frente — o saldo vai a negativo de
        propósito e o ecrã de existências assinala-o a vermelho para alguém
        corrigir. Travar é para as operações manuais, onde há uma pessoa ao ecrã.
        """
        from inventory.production import consumir_por_ficha
        self._gravar_ficha()
        consumir_por_ficha(self.armazem, self.bitoque, Decimal('1000'),
                           reference='TICKET-2', permitir_negativo=True)
        self.assertEqual(self._saldo(self.carne), Decimal('-100.0000'),
                         'A venda ao balcão foi travada por falta de stock.')


# ==========================================================================
# ORDENS DE PRODUÇÃO — 20 litros de molho de manhã, de uma vez
# ==========================================================================
class OrdensDeProducao(CozinhaComIngredientes):

    def _ordem(self, quantidade='10', artigo=None, lote='MOLHO-DIA', dias_validade=3):
        r = self.client.post('/api/inventory/production/orders/', {
            'warehouse': self.armazem.id, 'item': (artigo or self.bitoque).id,
            'quantity': quantidade, 'lot_number': lote,
            'expiry_date': str(self.hoje + timedelta(days=dias_validade)),
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        return r.data

    def _produzir(self, ordem):
        return self.client.post('/api/inventory/production/orders/%s/produce/' % ordem['id'],
                                {}, format='json')

    def test_devia_haver_uma_ordem_de_producao(self):
        """O ecrã existe: há um endpoint de ordens de produção.

        Era este o buraco: nem modelo, nem endpoint, nem serviço — uma cozinha não
        tinha como produzir em lote, e o custo do produzido nunca se formava a
        partir dos ingredientes.
        """
        from django.urls import reverse
        self.assertTrue(reverse('production-orders-list'))

    def test_a_ordem_em_rascunho_ainda_nao_mexeu_em_stock(self):
        """Criar a ordem é planear. Enquanto não se produz, o armazém está intacto
        — senão ninguém podia preparar o trabalho do dia seguinte."""
        self._ordem('10')
        self.assertEqual(self._saldo(self.carne), Decimal('100.0000'))

    def test_produzir_consome_os_ingredientes_da_ficha(self):
        """Produzir 10 bitoques tira 2 kg de bife (10 x 200 g) e 1,5 kg de batata."""
        self._gravar_ficha()
        r = self._produzir(self._ordem('10'))
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(self._saldo(self.carne), Decimal('98.0000'))
        self.assertEqual(self._saldo(self.batata), Decimal('98.5000'))

    def test_o_produzido_entra_no_armazem_com_o_custo_do_que_se_gastou(self):
        """O NÚMERO QUE FALTAVA À CASA.

        10 bitoques: 2 kg de bife a 5.000 = 10.000, mais 1,5 kg de batata a 400 =
        600. Custo total 10.600, custo de cada bitoque 1.060 — formado a partir do
        que saiu do armazém, não estimado. Sem isto, o produzido entrava a custo
        zero e a margem do prato era uma invenção.
        """
        self._gravar_ficha()
        r = self._produzir(self._ordem('10'))
        self.assertEqual(Decimal(r.data['total_cost']), Decimal('10600.0000'))
        self.assertEqual(Decimal(r.data['unit_cost']), Decimal('1060.0000'))
        self.assertEqual(self._saldo(self.bitoque), Decimal('10.0000'))
        self.bitoque.refresh_from_db()
        self.assertEqual(self.bitoque.current_average_cost, Decimal('1060.0000'),
                         'O custo médio do produzido não se formou a partir dos ingredientes.')

    def test_o_produzido_fica_com_lote_e_validade_para_o_rotulo(self):
        """O molho feito hoje dura três dias: é a data que vai no rótulo do
        tabuleiro e a que a HACCP pede. Sem lote, o produzido ficava no armazém
        sem validade nenhuma."""
        self._gravar_ficha()
        self._produzir(self._ordem('10', dias_validade=3))
        lote = StockLot.objects.get(item=self.bitoque)
        self.assertEqual(lote.lot_number, 'MOLHO-DIA')
        self.assertEqual(lote.expiry_date, self.hoje + timedelta(days=3))
        self.assertEqual(lote.quantity, Decimal('10.0000'))

    def test_a_ordem_guarda_o_que_consumiu_de_facto(self):
        """A ficha técnica muda e o custo médio também: sem esta fotografia não
        havia como explicar, em Novembro, o custo do molho de Maio."""
        self._gravar_ficha()
        r = self._produzir(self._ordem('10'))
        consumos = {c['item_code']: c for c in r.data['consumptions']}
        self.assertEqual(Decimal(consumos['C001']['quantity']), Decimal('2.0000'))
        self.assertEqual(Decimal(consumos['C001']['total_cost']), Decimal('10000.0000'))

    def test_o_desperdicio_da_ficha_sai_do_armazem(self):
        """Para pôr 200 g no prato gastam-se 240 g: é esse quilo e meio a mais, ao
        fim do mês, que explica porque é que o stock nunca bate."""
        self._gravar_ficha(desperdicio_carne='20')
        self._produzir(self._ordem('10'))
        self.assertEqual(self._saldo(self.carne), Decimal('97.6000'))

    def test_a_ficha_de_4_doses_rende_4_doses(self):
        """A ficha dá para 4 doses: produzir 4 gasta a ficha UMA vez (200 g de
        bife), não quatro. Trocar isto multiplica o consumo por quatro."""
        self._gravar_ficha(doses=4)
        self._produzir(self._ordem('4'))
        self.assertEqual(self._saldo(self.carne), Decimal('99.8000'))

    def test_produzir_sem_stock_e_recusado_e_nada_se_consome(self):
        """AQUI TRAVA-SE, e é o contrário do balcão: há um chefe ao ecrã, que pode
        receber a mercadoria ou corrigir a contagem. Produzir com saldo negativo
        estragava o custo médio do ingrediente e, com ele, o custo de todos os
        pratos que o levem."""
        self._gravar_ficha()
        r = self._produzir(self._ordem('1000'))   # precisava de 200 kg de bife; há 100
        self.assertEqual(r.status_code, 409, r.data)
        self.assertEqual(self._saldo(self.carne), Decimal('100.0000'),
                         'A produção recusada deixou ingredientes consumidos pelo caminho.')
        self.assertEqual(self._saldo(self.batata), Decimal('100.0000'))

    def test_produzir_um_artigo_sem_ficha_tecnica_e_recusado(self):
        """Sem ficha não há o que consumir nem como formar o custo: produzir às
        cegas metia no armazém mercadoria a custo zero."""
        r = self._produzir(self._ordem('5'))      # a ficha do bitoque não foi gravada
        self.assertEqual(r.status_code, 400)
        self.assertIn('ficha técnica', r.data['detail'])

    def test_nao_se_produz_a_mesma_ordem_duas_vezes(self):
        """Dois cliques no botão não fazem 20 bitoques com 10 de ingredientes."""
        self._gravar_ficha()
        ordem = self._ordem('10')
        self.assertEqual(self._produzir(ordem).status_code, 200)
        self.assertEqual(self._produzir(ordem).status_code, 400)
        self.assertEqual(self._saldo(self.bitoque), Decimal('10.0000'))

    def test_a_conferencia_antes_de_produzir_diz_o_que_falta(self):
        """O chefe vê o que a ordem vai gastar ANTES de começar — e não a meio."""
        self._gravar_ficha()
        ordem = self._ordem('1000')
        r = self.client.get('/api/inventory/production/orders/%s/requirements/' % ordem['id'])
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.data['can_produce'])
        carne = next(l for l in r.data['lines'] if l['item_code'] == 'C001')
        self.assertEqual(Decimal(carne['needed']), Decimal('200.0000'))
        self.assertTrue(carne['missing'])

    def test_uma_ordem_ja_produzida_nao_se_apaga(self):
        """Mexeu no stock: apagá-la deixava movimentos sem documento por trás."""
        self._gravar_ficha()
        ordem = self._ordem('10')
        self._produzir(ordem)
        r = self.client.delete('/api/inventory/production/orders/%s/' % ordem['id'])
        self.assertEqual(r.status_code, 400)
