# -*- coding: utf-8 -*-
"""O ARMAZÉM — o que está lá, onde está, e quanto vale.

PRIMEIRO, UMA COISA QUE O DONO TEM DE SABER: a app `wms` é uma CONCHA VAZIA.
`wms/models.py` tem duas linhas de imports e nenhum modelo; views, urls e
serializers estão vazios. A "Gestão de Armazéns" que se vende como módulo (e que
o licenciamento ativa) está toda implementada dentro de `inventory`:
armazéns e localizações (`inventory.models`), transferências e inventários
físicos (`inventory/wh.py`), e o motor que mexe no saldo e no custo
(`inventory/stock.py`).

Por isso é isso que estes testes testam — o comportamento que o módulo WMS
PROMETE, onde ele realmente vive. Testar `wms` por si só seria testar um
ficheiro vazio e dar uma falsa sensação de cobertura.

Os testes marcados com `expectedFailure` descrevem o que a casa devia fazer e
AINDA NÃO FAZ. Ficam a falhar de propósito, visíveis em cada execução, porque a
correção é em `inventory/` — fora da área desta auditoria (ver relatório).
"""
import unittest
from decimal import Decimal

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase

from identity.models import Company, EnterpriseGroup, Hotel
from inventory import stock as motor
from inventory.models import (Item, ItemCategory, InventoryCount, StockLevel,
                              StockLocation, StockMovement, StockTransfer,
                              UnitOfMeasure, Warehouse)


class ArmazemMontado(APITestCase):
    """Dois armazéns, dois artigos, e nada em stock — tudo o que entrar é visível."""

    def setUp(self):
        self.user = User.objects.create_superuser('fiel_armazem', '', 'x')
        self.client.force_authenticate(self.user)

        grupo = EnterpriseGroup.objects.create(name='Grupo Principal')
        empresa = Company.objects.create(group=grupo, name='Mwana Lodge, Lda.', tax_id='5000000000')
        self.hotel = Hotel.objects.create(company=empresa, name='Mwana Lodge', is_master=True)

        self.central = Warehouse.objects.create(hotel=self.hotel, code='ARM', name='Armazém Central',
                                                is_main=True)
        self.cozinha = Warehouse.objects.create(hotel=self.hotel, code='ECO', name='Economato Cozinha')

        self.un = UnitOfMeasure.objects.create(code='UN', name='Unidade')
        cat = ItemCategory.objects.create(name='Bebidas')
        self.cerveja = Item.objects.create(code='B001', name='Cerveja Cuca 33cl', item_type='Retail',
                                           category=cat, base_uom=self.un)
        self.vinho = Item.objects.create(code='B002', name='Vinho Tinto', item_type='Retail',
                                         category=cat, base_uom=self.un)
        self.hoje = timezone.localdate()

    def _entrada(self, artigo=None, armazem=None, quantidade='100', custo='800.00'):
        return motor.move_in(armazem or self.central, artigo or self.cerveja,
                             Decimal(quantidade), Decimal(custo), reference='ENTRADA-TESTE')

    def _saldo(self, artigo=None, armazem=None):
        lvl = StockLevel.objects.filter(warehouse=armazem or self.central,
                                        item=artigo or self.cerveja).first()
        return lvl.quantity_on_hand if lvl else Decimal('0')


# ==========================================================================
# ARMAZÉNS E LOCALIZAÇÕES (bins)
# ==========================================================================
class ArmazensELocalizacoes(ArmazemMontado):

    def test_localizacao_pertence_a_um_armazem_e_o_codigo_nao_se_repete_la_dentro(self):
        """A localização é o endereço da prateleira (A-01-03). Dois sítios com o
        mesmo código no mesmo armazém e o fiel manda o empregado ao lugar errado."""
        r = self.client.post('/api/inventory/wh/locations/', {
            'warehouse': self.central.id, 'code': 'A-01-03', 'name': 'Corredor A',
            'location_type': 'BIN'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        r2 = self.client.post('/api/inventory/wh/locations/', {
            'warehouse': self.central.id, 'code': 'A-01-03', 'location_type': 'BIN'}, format='json')
        self.assertEqual(r2.status_code, 400, 'Aceitou duas prateleiras com o mesmo código.')

    def test_o_mesmo_codigo_de_prateleira_pode_existir_noutro_armazem(self):
        """"A-01" existe no armazém central E na cozinha — são sítios diferentes."""
        self.client.post('/api/inventory/wh/locations/',
                         {'warehouse': self.central.id, 'code': 'A-01'}, format='json')
        r = self.client.post('/api/inventory/wh/locations/',
                             {'warehouse': self.cozinha.id, 'code': 'A-01'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)

    def test_lista_de_localizacoes_filtra_por_armazem(self):
        """Quem está a arrumar a cozinha não quer ver as prateleiras do central."""
        self.client.post('/api/inventory/wh/locations/',
                         {'warehouse': self.central.id, 'code': 'A-01'}, format='json')
        self.client.post('/api/inventory/wh/locations/',
                         {'warehouse': self.cozinha.id, 'code': 'C-01'}, format='json')
        r = self.client.get(f'/api/inventory/wh/locations/?warehouse={self.cozinha.id}')
        self.assertEqual(len(r.data), 1)
        self.assertEqual(r.data[0]['code'], 'C-01')

    def test_camara_frigorifica_e_um_tipo_de_localizacao_proprio(self):
        """Num hotel importa saber o que está em câmara fria — é onde a validade
        e a cadeia de frio mandam (HACCP)."""
        r = self.client.post('/api/inventory/wh/locations/', {
            'warehouse': self.cozinha.id, 'code': 'FRIO-1', 'location_type': 'COLD'}, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data['location_type_display'], 'Câmara Fria')


# ==========================================================================
# NÍVEIS DE STOCK E LEDGER DE MOVIMENTOS
# ==========================================================================
class NiveisEMovimentos(ArmazemMontado):

    def test_entrada_cria_o_nivel_de_stock_do_artigo_no_armazem(self):
        """Não é preciso "abrir ficha" ao artigo no armazém: a primeira entrada cria-a."""
        self._entrada(quantidade='100')
        self.assertEqual(self._saldo(), Decimal('100.0000'))
        self.assertEqual(StockLevel.objects.filter(warehouse=self.central).count(), 1)

    def test_saldo_disponivel_desconta_o_que_esta_reservado(self):
        """Reservado é mercadoria que está no armazém mas já tem dono (um banquete
        de sábado). Contá-la como disponível é prometer o que não se tem."""
        self._entrada(quantidade='100')
        lvl = StockLevel.objects.get(warehouse=self.central, item=self.cerveja)
        lvl.quantity_reserved = Decimal('30')
        lvl.save()
        self.assertEqual(lvl.available_quantity, Decimal('70.0000'),
                         'O disponível não descontou a quantidade reservada.')

    def test_cada_movimento_diz_o_que_quanto_onde_e_com_que_documento(self):
        """É o ledger que permite explicar uma diferença ao dono. Um movimento sem
        referência de documento é uma quantidade que ninguém consegue justificar."""
        mov = self._entrada(quantidade='100', custo='800.00')
        self.assertEqual(mov.movement_type, 'IN')
        self.assertEqual(mov.quantity, Decimal('100.0000'))
        self.assertEqual(mov.unit_cost, Decimal('800.0000'))
        self.assertEqual(mov.reference, 'ENTRADA-TESTE')
        self.assertEqual(mov.warehouse_id, self.central.id)

    def test_saida_guarda_no_movimento_o_custo_a_que_a_mercadoria_saiu(self):
        """Sem o custo gravado no movimento, não há como calcular o custo das
        vendas de ontem depois de o custo médio ter mudado hoje."""
        self._entrada(quantidade='100', custo='800.00')
        mov = motor.move_out(self.central, self.cerveja, Decimal('10'), reference='VENDA-1')
        self.assertEqual(mov.unit_cost, Decimal('800.0000'),
                         'A saída não guardou o custo a que a mercadoria saiu.')

    def test_historico_de_movimentos_de_um_artigo_pode_ser_consultado(self):
        self._entrada(quantidade='100')
        motor.move_out(self.central, self.cerveja, Decimal('10'), reference='VENDA-1')
        r = self.client.get(f'/api/inventory/stock-movements/?item={self.cerveja.id}')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 2, 'O histórico do artigo não mostra os dois movimentos.')

    def test_entrada_e_saida_manuais_pela_api_mexem_no_saldo(self):
        """São os botões de "Entrada"/"Saída" do ecrã de stock."""
        r = self.client.post('/api/inventory/stock-movements/receive/', {
            'warehouse': self.central.id, 'item': self.cerveja.id,
            'quantity': '50', 'unit_cost': '1000.00', 'reference': 'ENT-MAN'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(self._saldo(), Decimal('50.0000'))

        r2 = self.client.post('/api/inventory/stock-movements/issue/', {
            'warehouse': self.central.id, 'item': self.cerveja.id,
            'quantity': '20', 'reference': 'SAI-MAN'}, format='json')
        self.assertEqual(r2.status_code, 201, r2.data)
        self.assertEqual(self._saldo(), Decimal('30.0000'))

    @unittest.expectedFailure
    def test_stock_negativo_devia_ser_impedido_ou_assinalado(self):
        """FALHA DE PROPÓSITO — defeito conhecido, a corrigir em `inventory/stock.py`.

        `move_out` subtrai o que lhe mandarem e deixa o saldo ir a negativo sem
        dizer nada. 100 garrafas no armazém, uma saída de 150, e fica −50.

        Porque é que isto é grave e não só feio: o custo médio é recalculado com
        a quantidade TOTAL do artigo. Com saldo negativo, a compra seguinte
        pondera contra uma quantidade que não existe e o custo do artigo sai
        completamente errado — e já não há como saber qual era o certo.

        Nos sítios onde a auditoria PODIA mexer, isto ficou tapado: a devolução a
        fornecedor e a anulação de receção já recusam (ver procurement). Em falta:
        as saídas manuais, as transferências e o consumo do POS.
        """
        r = self.client.post('/api/inventory/stock-movements/issue/', {
            'warehouse': self.central.id, 'item': self.cerveja.id, 'quantity': '150'},
            format='json')
        self.assertEqual(r.status_code, 409,
                         'Deixou tirar 150 unidades de um armazém que não tem nenhuma.')


# ==========================================================================
# TRANSFERÊNCIAS ENTRE ARMAZÉNS
# ==========================================================================
class Transferencias(ArmazemMontado):

    def _transferencia(self, quantidade='30', origem=None, destino=None):
        r = self.client.post('/api/inventory/wh/transfers/', {
            'source': (origem or self.central).id, 'destination': (destino or self.cozinha).id,
            'note': 'Reposição da cozinha',
            'lines': [{'item': self.cerveja.id, 'quantity': quantidade}],
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        return StockTransfer.objects.get(pk=r.data['id'])

    def test_transferencia_nasce_em_rascunho_e_nao_mexe_em_stock(self):
        """Fazer a guia não é mover a mercadoria. Só ao confirmar é que sai."""
        self._entrada(quantidade='100')
        self._transferencia('30')
        self.assertEqual(self._saldo(), Decimal('100.0000'),
                         'Uma transferência em rascunho já tirou mercadoria do armazém.')

    def test_transferencia_confirmada_tira_de_um_lado_e_poe_do_outro(self):
        """A conta que não pode falhar: o que sai de um armazém aparece no outro.
        Se falhasse a meio, a mercadoria desaparecia entre os dois."""
        self._entrada(quantidade='100')
        t = self._transferencia('30')
        r = self.client.post(f'/api/inventory/wh/transfers/{t.id}/confirm/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(self._saldo(armazem=self.central), Decimal('70.0000'))
        self.assertEqual(self._saldo(armazem=self.cozinha), Decimal('30.0000'))

    def test_transferencia_nao_cria_nem_destroi_mercadoria(self):
        """O total da casa é o mesmo antes e depois: uma transferência não é
        compra nem consumo."""
        self._entrada(quantidade='100')
        t = self._transferencia('30')
        self.client.post(f'/api/inventory/wh/transfers/{t.id}/confirm/', {}, format='json')
        total = sum(l.quantity_on_hand for l in StockLevel.objects.filter(item=self.cerveja))
        self.assertEqual(total, Decimal('100.0000'),
                         'A transferência fez aparecer ou desaparecer mercadoria.')

    def test_transferencia_nao_altera_o_custo_medio_do_artigo(self):
        """Mudar de prateleira não torna a cerveja mais cara.

        Tem subtileza: a transferência é feita com uma SAÍDA e uma ENTRADA, e as
        entradas recalculam o custo. Só não mexe porque a entrada é feita ao
        próprio custo médio. Este teste prende isso — se alguém mudar a
        transferência para entrar a outro custo, o custo do artigo passa a mudar
        de cada vez que a mercadoria muda de armazém.
        """
        self._entrada(quantidade='100', custo='800.00')
        t = self._transferencia('30')
        self.client.post(f'/api/inventory/wh/transfers/{t.id}/confirm/', {}, format='json')
        self.cerveja.refresh_from_db()
        self.assertEqual(self.cerveja.current_average_cost, Decimal('800.0000'),
                         'Uma transferência entre armazéns alterou o custo médio do artigo.')

    def test_transferencia_deixa_os_dois_movimentos_no_ledger(self):
        self._entrada(quantidade='100')
        t = self._transferencia('30')
        self.client.post(f'/api/inventory/wh/transfers/{t.id}/confirm/', {}, format='json')
        movs = StockMovement.objects.filter(reference=t.number)
        self.assertTrue(movs.filter(movement_type='TRANSFER_OUT').exists())
        self.assertTrue(movs.filter(movement_type='TRANSFER_IN').exists())

    def test_transferencia_nao_se_confirma_duas_vezes(self):
        """Dois cliques e a cozinha recebia o dobro do que o central deu."""
        self._entrada(quantidade='100')
        t = self._transferencia('30')
        self.client.post(f'/api/inventory/wh/transfers/{t.id}/confirm/', {}, format='json')
        r = self.client.post(f'/api/inventory/wh/transfers/{t.id}/confirm/', {}, format='json')
        self.assertEqual(r.status_code, 400, 'A mesma transferência foi confirmada duas vezes.')
        self.assertEqual(self._saldo(armazem=self.cozinha), Decimal('30.0000'))

    def test_transferencia_sem_linhas_nao_se_confirma(self):
        r = self.client.post('/api/inventory/wh/transfers/', {
            'source': self.central.id, 'destination': self.cozinha.id}, format='json')
        r2 = self.client.post(f"/api/inventory/wh/transfers/{r.data['id']}/confirm/", {},
                              format='json')
        self.assertEqual(r2.status_code, 400)

    @unittest.expectedFailure
    def test_transferir_mais_do_que_existe_devia_ser_recusado(self):
        """FALHA DE PROPÓSITO — defeito conhecido, a corrigir em `inventory/wh.py`.

        Transferir 300 de um armazém com 100 deixa a origem a −200 e o destino com
        300 que ninguém comprou. É o engano mais fácil de fazer no ecrã (escrever
        a quantidade da encomenda em vez da que se está a mandar) e nada o impede.
        """
        self._entrada(quantidade='100')
        t = self._transferencia('300')
        r = self.client.post(f'/api/inventory/wh/transfers/{t.id}/confirm/', {}, format='json')
        self.assertEqual(r.status_code, 409,
                         'Transferiu 300 unidades de um armazém que só tem 100.')


# ==========================================================================
# INVENTÁRIOS FÍSICOS (contagens)
# ==========================================================================
class InventariosFisicos(ArmazemMontado):

    def _contagem(self, contado='95'):
        r = self.client.post('/api/inventory/wh/counts/', {
            'warehouse': self.central.id, 'note': 'Contagem de fim de mês',
            'lines': [{'item': self.cerveja.id, 'counted_qty': contado}],
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        return InventoryCount.objects.get(pk=r.data['id'])

    def test_contagem_guarda_o_saldo_do_sistema_no_momento(self):
        """A diferença só tem significado contra o que o sistema dizia NA HORA da
        contagem. Se o saldo do sistema fosse lido no fim, qualquer venda feita
        durante a contagem aparecia como falta de mercadoria."""
        self._entrada(quantidade='100')
        cnt = self._contagem('95')
        linha = cnt.lines.first()
        self.assertEqual(linha.system_qty, Decimal('100.0000'),
                         'A contagem não guardou o saldo que o sistema tinha.')
        self.assertEqual(linha.variance, Decimal('-5.0000'),
                         'A diferença da contagem está errada (faltam 5 garrafas).')

    def test_contagem_em_rascunho_nao_mexe_no_stock(self):
        """Contar não é corrigir: a correção acontece quando o responsável aceita."""
        self._entrada(quantidade='100')
        self._contagem('95')
        self.assertEqual(self._saldo(), Decimal('100.0000'),
                         'Uma contagem ainda em curso já alterou o stock.')

    def test_confirmar_a_contagem_poe_o_sistema_igual_ao_que_se_contou(self):
        """Faltavam 5 garrafas: o sistema passa a dizer 95 e fica o movimento de
        ajuste a explicar a quebra."""
        self._entrada(quantidade='100')
        cnt = self._contagem('95')
        r = self.client.post(f'/api/inventory/wh/counts/{cnt.id}/confirm/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(self._saldo(), Decimal('95.0000'),
                         'Confirmou-se a contagem e o stock não foi corrigido.')
        self.assertEqual(r.data['adjusted_lines'], 1)

    def test_ajuste_deixa_movimento_com_a_diferenca_explicada(self):
        """Uma quebra de 5 garrafas sem movimento no ledger é mercadoria que
        desaparece sem rasto — e é assim que se encobre um furto."""
        self._entrada(quantidade='100')
        cnt = self._contagem('95')
        self.client.post(f'/api/inventory/wh/counts/{cnt.id}/confirm/', {}, format='json')
        mov = StockMovement.objects.filter(reference=cnt.number, movement_type='ADJUST').first()
        self.assertIsNotNone(mov, 'O ajuste de inventário não deixou movimento.')
        self.assertEqual(mov.quantity, Decimal('5.0000'))
        self.assertIn('-5', mov.note, f'O movimento não diz para que lado foi a diferença: {mov.note}')

    def test_contagem_com_mais_do_que_o_sistema_tambem_corrige(self):
        """Sobrou mercadoria (entrada não lançada): o sistema sobe para o contado."""
        self._entrada(quantidade='100')
        cnt = self._contagem('110')
        self.client.post(f'/api/inventory/wh/counts/{cnt.id}/confirm/', {}, format='json')
        self.assertEqual(self._saldo(), Decimal('110.0000'))

    def test_contagem_sem_diferenca_nao_inventa_movimentos(self):
        """Contou-se e estava certo: não há nada a corrigir nem a explicar."""
        self._entrada(quantidade='100')
        cnt = self._contagem('100')
        r = self.client.post(f'/api/inventory/wh/counts/{cnt.id}/confirm/', {}, format='json')
        self.assertEqual(r.data['adjusted_lines'], 0)
        self.assertFalse(StockMovement.objects.filter(reference=cnt.number).exists(),
                         'Uma contagem sem diferenças criou movimento de ajuste.')

    def test_contagem_nao_se_confirma_duas_vezes(self):
        """A segunda confirmação voltaria a ajustar para o mesmo número contado —
        apagando as vendas feitas entretanto."""
        self._entrada(quantidade='100')
        cnt = self._contagem('95')
        self.client.post(f'/api/inventory/wh/counts/{cnt.id}/confirm/', {}, format='json')
        r = self.client.post(f'/api/inventory/wh/counts/{cnt.id}/confirm/', {}, format='json')
        self.assertEqual(r.status_code, 400, 'A mesma contagem foi confirmada duas vezes.')

    def test_ajuste_nao_altera_o_custo_medio(self):
        """Uma quebra não torna o que ficou mais caro. (O prejuízo da quebra é
        reconhecido pelo valor que saiu, não por inflacionar o custo do resto.)"""
        self._entrada(quantidade='100', custo='800.00')
        cnt = self._contagem('95')
        self.client.post(f'/api/inventory/wh/counts/{cnt.id}/confirm/', {}, format='json')
        self.cerveja.refresh_from_db()
        self.assertEqual(self.cerveja.current_average_cost, Decimal('800.0000'))


# ==========================================================================
# VALORIZAÇÃO — quanto vale o que está no armazém
# ==========================================================================
class ValorizacaoDoStock(ArmazemMontado):

    def test_valor_do_armazem_e_quantidade_vezes_custo_medio(self):
        """É o número que vai ao balanço. 100 × 800 + 50 × 2.500 = 205.000."""
        self._entrada(artigo=self.cerveja, quantidade='100', custo='800.00')
        self._entrada(artigo=self.vinho, quantidade='50', custo='2500.00')
        r = self.client.get('/api/inventory/wh/costing/')
        self.assertEqual(r.status_code, 200)
        por_armazem = {linha['warehouse']: linha for linha in r.data['by_warehouse']}
        self.assertEqual(Decimal(str(por_armazem['Armazém Central']['stock_value'])),
                         Decimal('205000.00'),
                         'A valorização do armazém não é a soma de quantidade × custo médio.')
        self.assertEqual(por_armazem['Armazém Central']['skus'], 2)

    def test_valorizacao_separa_os_armazens_e_soma_o_total(self):
        self._entrada(armazem=self.central, quantidade='100', custo='800.00')
        self._entrada(armazem=self.cozinha, quantidade='50', custo='800.00')
        r = self.client.get('/api/inventory/wh/costing/')
        por_armazem = {linha['warehouse']: linha for linha in r.data['by_warehouse']}
        self.assertEqual(Decimal(str(por_armazem['Economato Cozinha']['stock_value'])),
                         Decimal('40000.00'))
        self.assertEqual(Decimal(str(r.data['total_value'])), Decimal('120000.00'),
                         'O total valorizado não é a soma dos armazéns.')

    def test_valorizacao_ordena_os_artigos_por_dinheiro_imobilizado(self):
        """É a lista que mostra ao dono onde está o dinheiro parado."""
        self._entrada(artigo=self.cerveja, quantidade='100', custo='800.00')     # 80.000
        self._entrada(artigo=self.vinho, quantidade='100', custo='2500.00')      # 250.000
        r = self.client.get('/api/inventory/wh/costing/')
        self.assertEqual(r.data['top_items'][0]['item'], 'Vinho Tinto',
                         'O artigo com mais dinheiro parado não aparece em primeiro.')

    def test_artigo_sem_stock_nao_entra_na_valorizacao(self):
        """Linhas a zero só escondem as que importam."""
        self._entrada(quantidade='100', custo='800.00')
        motor.move_out(self.central, self.cerveja, Decimal('100'), reference='SAIU-TUDO')
        r = self.client.get('/api/inventory/wh/costing/')
        por_armazem = {linha['warehouse']: linha for linha in r.data['by_warehouse']}
        self.assertEqual(por_armazem['Armazém Central']['skus'], 0)
        self.assertEqual(Decimal(str(r.data['total_value'])), Decimal('0'))

    def test_painel_do_armazem_mostra_valor_alertas_e_movimentos_do_dia(self):
        """O ecrã de abertura do fiel de armazém."""
        self._entrada(quantidade='10', custo='800.00')
        lvl = StockLevel.objects.get(warehouse=self.central, item=self.cerveja)
        lvl.min_stock_alert = Decimal('50')
        lvl.save()

        r = self.client.get('/api/inventory/wh/dashboard/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['warehouses'], 2)
        self.assertEqual(Decimal(str(r.data['stock_value'])), Decimal('8000.00'))
        self.assertEqual(r.data['skus_in_stock'], 1)
        self.assertEqual(r.data['low_stock_alerts'], 1,
                         'O artigo abaixo do mínimo não gerou alerta no painel.')
        self.assertEqual(r.data['movements_today'], 1)

    def test_lista_de_artigos_abaixo_do_minimo_pode_ser_pedida_a_api(self):
        """É com esta lista que se faz a encomenda da semana."""
        self._entrada(quantidade='10', custo='800.00')
        lvl = StockLevel.objects.get(warehouse=self.central, item=self.cerveja)
        lvl.min_stock_alert = Decimal('50')
        lvl.save()
        r = self.client.get('/api/inventory/stock-levels/?low=1')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1, 'A lista de artigos em falta veio errada.')
