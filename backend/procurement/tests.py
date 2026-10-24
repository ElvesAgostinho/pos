# -*- coding: utf-8 -*-
"""O CUSTO — comprar, receber, e o que isso faz ao valor do stock.

De todas as contas do sistema, o CUSTO MÉDIO é a que ninguém vê errada. O stock
nota-se (falta uma caixa de cerveja na prateleira); o custo médio não: fica um
número na ficha do artigo que depois decide a margem de cada prato, o valor do
inventário no balanço e o preço a que vale a pena vender. Um erro aqui não dá
erro nenhum no ecrã — dá um restaurante a perder dinheiro em cada bife com a
contabilidade a dizer que está a ganhar.

Estes testes percorrem a compra como ela acontece: encomenda → receção (às vezes
parcial) → stock → custo médio → fatura do fornecedor. E, sobretudo, tentam as
coisas que correm mal: receber duas vezes, receber mais do que se encomendou,
reabrir uma receção já lançada, devolver mais do que existe, anular uma compra.

Regra: cada teste CONTA o resultado (quantidade e custo), não se contenta com
o pedido ter devolvido 200.
"""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase

from esm.models import Supplier, SupplierProductCatalog
from identity.models import Company, EnterpriseGroup, Hotel
from inventory.models import (Item, ItemCategory, StockLevel, StockMovement,
                              UnitOfMeasure, Warehouse, StockLot)
from finance.models import SupplierInvoice

from .models import (GoodsReceipt, GoodsReceiptLine, PurchaseOrder,
                     PurchaseOrderLine, PurchaseRequisition, PurchaseReturn,
                     PurchaseReturnLine, RequisitionLine)


class ComprasMontadas(APITestCase):
    """O mínimo para comprar: um hotel, dois armazéns, artigos e um fornecedor."""

    def setUp(self):
        self.user = User.objects.create_superuser('comprador', '', 'x')
        self.client.force_authenticate(self.user)

        grupo = EnterpriseGroup.objects.create(name='Grupo Principal')
        empresa = Company.objects.create(group=grupo, name='Mwana Lodge, Lda.', tax_id='5000000000')
        self.hotel = Hotel.objects.create(company=empresa, name='Mwana Lodge', is_master=True)

        self.armazem = Warehouse.objects.create(hotel=self.hotel, code='ARM', name='Armazém Central',
                                                is_main=True)
        self.economato = Warehouse.objects.create(hotel=self.hotel, code='ECO', name='Economato Cozinha')

        self.un = UnitOfMeasure.objects.create(code='UN', name='Unidade')
        self.cat = ItemCategory.objects.create(name='Bebidas')
        self.cerveja = Item.objects.create(code='B001', name='Cerveja Cuca 33cl', item_type='Retail',
                                           category=self.cat, base_uom=self.un,
                                           sale_price=Decimal('1200.00'))
        self.arroz = Item.objects.create(code='M001', name='Arroz 1kg', item_type='RawMaterial',
                                         category=self.cat, base_uom=self.un)

        self.fornecedor = Supplier.objects.create(code='F001', commercial_name='Refriango, Lda.',
                                                  nif='5417000000', status='ACTIVE')
        self.hoje = timezone.localdate()

    # ---------------------------------------------------------------- utilidades
    def _encomenda(self, artigo=None, quantidade='100', preco='800.00', entrega=None):
        """Uma encomenda aprovada com uma linha, criada pela API (como o ecrã faz)."""
        r = self.client.post('/api/procurement/purchase-orders/', {
            'supplier': self.fornecedor.id, 'delivery_warehouse': (entrega or self.armazem).id,
            'expected_delivery_date': str(self.hoje), 'status': 'Approved',
        }, format='json')
        self.assertEqual(r.status_code, 201, f'não consegui criar a encomenda: {r.data}')
        po = PurchaseOrder.objects.get(pk=r.data['id'])
        rl = self.client.post('/api/procurement/po-lines/', {
            'purchase_order': po.id, 'item': (artigo or self.cerveja).id,
            'quantity_requested': quantidade, 'uom': self.un.id, 'unit_price': preco,
        }, format='json')
        self.assertEqual(rl.status_code, 201, f'não consegui criar a linha: {rl.data}')
        po.refresh_from_db()
        return po

    def _recepcao(self, po=None, artigo=None, quantidade='100', custo='800.00', validar=True,
                  armazem=None, lote=None, validade=None):
        """Uma receção de mercadoria, opcionalmente ligada a uma encomenda."""
        corpo = {'supplier': self.fornecedor.id,
                 'delivery_warehouse': (armazem or self.armazem).id,
                 'receipt_number': f'GRN-T{GoodsReceipt.objects.count() + 1:04d}'}
        if po:
            corpo['purchase_order'] = po.id
        r = self.client.post('/api/procurement/goods-receipts/', corpo, format='json')
        self.assertEqual(r.status_code, 201, f'não consegui criar a receção: {r.data}')
        grn = GoodsReceipt.objects.get(pk=r.data['id'])
        po_line = po.lines.first() if po else None
        rl = self.client.post('/api/procurement/grn-lines/', {
            'goods_receipt': grn.id, 'po_line': po_line.id if po_line else None,
            'item': (artigo or self.cerveja).id, 'quantity_received': quantidade,
            'uom': self.un.id, 'unit_cost': custo,
            'lot_number': lote, 'expiry_date': str(validade) if validade else None,
        }, format='json')
        self.assertEqual(rl.status_code, 201, f'não consegui criar a linha da receção: {rl.data}')
        if validar:
            v = self.client.post(f'/api/procurement/goods-receipts/{grn.id}/validate_receipt/',
                                 {}, format='json')
            self.assertEqual(v.status_code, 200, f'a validação da receção falhou: {v.data}')
        grn.refresh_from_db()
        return grn

    def _saldo(self, artigo=None, armazem=None):
        lvl = StockLevel.objects.filter(warehouse=armazem or self.armazem,
                                        item=artigo or self.cerveja).first()
        return lvl.quantity_on_hand if lvl else Decimal('0')

    def _custo(self, artigo=None):
        (artigo or self.cerveja).refresh_from_db()
        return (artigo or self.cerveja).current_average_cost


# ==========================================================================
# ENCOMENDAS (PO)
# ==========================================================================
class Encomendas(ComprasMontadas):

    def test_total_da_encomenda_e_a_soma_das_linhas(self):
        """O total da encomenda é o compromisso assumido com o fornecedor.
        Se não corresponder às linhas, aprova-se um valor e paga-se outro."""
        po = self._encomenda(quantidade='100', preco='800.00')
        self.assertEqual(po.total_amount, Decimal('80000.00'),
                         'O total da encomenda não é 100 × 800.')

    def test_total_da_linha_e_calculado_no_servidor(self):
        """Se o total da linha viesse do cliente, o preço da compra passava a ser
        o que o ecrã (ou um script) dissesse."""
        po = self._encomenda(quantidade='7', preco='1500.00')
        self.assertEqual(po.lines.first().line_total, Decimal('10500.00'))

    def test_apagar_uma_linha_recalcula_o_total(self):
        po = self._encomenda(quantidade='100', preco='800.00')
        linha = po.lines.first()
        self.client.delete(f'/api/procurement/po-lines/{linha.id}/')
        po.refresh_from_db()
        self.assertEqual(po.total_amount, Decimal('0'),
                         'Apagou-se a linha mas a encomenda continua com o valor antigo.')

    def test_alterar_a_quantidade_recalcula_o_total(self):
        po = self._encomenda(quantidade='100', preco='800.00')
        linha = po.lines.first()
        self.client.patch(f'/api/procurement/po-lines/{linha.id}/',
                          {'quantity_requested': '50'}, format='json')
        po.refresh_from_db()
        self.assertEqual(po.total_amount, Decimal('40000.00'),
                         'Mudou-se a quantidade e o total ficou desactualizado.')

    def test_encomenda_sem_hotel_herda_o_hotel_do_armazem(self):
        """O ecrã não pergunta o hotel: deduz-se do armazém de entrega."""
        po = self._encomenda()
        self.assertEqual(po.hotel_id, self.hotel.id, 'A encomenda ficou sem hotel.')

    def test_estado_invalido_e_recusado(self):
        """Um estado fora da lista deixava a encomenda num limbo que nenhum ecrã lê."""
        po = self._encomenda()
        r = self.client.post(f'/api/procurement/purchase-orders/{po.id}/set_status/',
                             {'status': 'Inventado'}, format='json')
        self.assertEqual(r.status_code, 400)


# ==========================================================================
# RECEÇÕES (GRN) — a entrada em stock e o CUSTO MÉDIO
# ==========================================================================
class RecepcaoEStock(ComprasMontadas):

    def test_recepcao_validada_entra_em_stock_no_armazem_de_entrega(self):
        """A pergunta mais simples de todas: a mercadoria recebida está no armazém?"""
        self._recepcao(quantidade='100', custo='800.00')
        self.assertEqual(self._saldo(), Decimal('100.0000'),
                         'A receção foi validada mas o stock não subiu.')
        self.assertEqual(self._saldo(armazem=self.economato), Decimal('0'),
                         'A mercadoria entrou num armazém que não era o da entrega.')

    def test_recepcao_deixa_movimento_no_ledger_com_a_referencia_do_documento(self):
        """Sem movimento no ledger, no fim do mês ninguém consegue explicar a
        diferença entre o que o sistema diz e o que está na prateleira."""
        grn = self._recepcao(quantidade='100', custo='800.00')
        mov = StockMovement.objects.filter(reference=grn.receipt_number).first()
        self.assertIsNotNone(mov, 'A receção não deixou movimento de stock.')
        self.assertEqual(mov.movement_type, 'GRN')
        self.assertEqual(mov.quantity, Decimal('100.0000'))
        self.assertEqual(mov.unit_cost, Decimal('800.0000'),
                         'O movimento não guardou o custo a que a mercadoria entrou.')

    def test_primeira_compra_define_o_custo_medio(self):
        """Artigo novo, sem histórico: o custo médio é o custo da compra."""
        self._recepcao(quantidade='100', custo='800.00')
        self.assertEqual(self._custo(), Decimal('800.0000'),
                         'A primeira compra não definiu o custo médio do artigo.')

    def test_segunda_compra_mais_cara_puxa_o_custo_medio_para_cima(self):
        """A CONTA QUE NINGUÉM VÊ ERRADA.

        100 unidades a 800 e depois 100 a 1.000 não dá 1.000 (o último preço) nem
        900 por acaso: dá (80.000 + 100.000) ÷ 200 = 900, ponderado pelas
        quantidades. Se o sistema guardasse o último preço, a casa passava a
        calcular a margem de 200 cervejas ao preço das últimas 100.
        """
        self._recepcao(quantidade='100', custo='800.00')
        self._recepcao(quantidade='100', custo='1000.00')
        self.assertEqual(self._saldo(), Decimal('200.0000'))
        self.assertEqual(self._custo(), Decimal('900.0000'),
                         'O custo médio ponderado depois de duas compras está errado.')

    def test_custo_medio_e_ponderado_pelas_quantidades_nao_uma_media_simples(self):
        """300 a 1.000 e 100 a 2.000 → (300.000 + 200.000) ÷ 400 = 1.250.
        Uma média simples daria 1.500: 20% de erro no valor do inventário."""
        self._recepcao(quantidade='300', custo='1000.00')
        self._recepcao(quantidade='100', custo='2000.00')
        self.assertEqual(self._custo(), Decimal('1250.0000'),
                         'O custo médio está a fazer média simples em vez de ponderada.')

    def test_uma_saida_de_stock_nao_mexe_no_custo_medio(self):
        """Vender não torna o que ficou mais caro nem mais barato.

        É a regra do custo médio móvel: só as ENTRADAS recalculam o custo. Se uma
        venda mexesse no custo, a margem de cada prato mudava ao longo do serviço.
        """
        self._recepcao(quantidade='200', custo='900.00')
        from inventory import stock as motor
        motor.move_out(self.armazem, self.cerveja, Decimal('150'), reference='VENDA-TESTE')
        self.assertEqual(self._saldo(), Decimal('50.0000'), 'A saída não baixou o stock.')
        self.assertEqual(self._custo(), Decimal('900.0000'),
                         'Uma saída de stock alterou o custo médio do artigo.')

    def test_compra_depois_de_vender_pondera_so_o_que_ainda_ha(self):
        """O caso do dia-a-dia: comprou, vendeu quase tudo, comprou outra vez.

        Ficaram 50 a 900 (45.000) e entram 50 a 1.300 (65.000) → 110.000 ÷ 100 =
        1.100. Se o motor ponderasse pela quantidade COMPRADA em vez da que ainda
        há em casa, o custo saía completamente diferente.
        """
        self._recepcao(quantidade='200', custo='900.00')
        from inventory import stock as motor
        motor.move_out(self.armazem, self.cerveja, Decimal('150'), reference='VENDA-TESTE')
        self._recepcao(quantidade='50', custo='1300.00')
        self.assertEqual(self._custo(), Decimal('1100.0000'),
                         'O custo médio não ponderou com o stock que restava.')

    def test_custo_medio_e_do_artigo_e_nao_de_cada_armazem(self):
        """Desenho assumido: o custo é do ARTIGO, igual em todos os armazéns.

        Uma compra para o economato muda o custo da cerveja que está no armazém
        central — é o que se espera de um custo médio por artigo, e é por isso que
        a valorização por armazém usa o mesmo custo em todos. Este teste prende
        essa decisão: se um dia alguém a mudar, tem de ser de propósito.
        """
        self._recepcao(quantidade='100', custo='800.00')
        self._recepcao(quantidade='100', custo='1000.00', armazem=self.economato)
        self.assertEqual(self._custo(), Decimal('900.0000'))
        self.assertEqual(self._saldo(armazem=self.armazem), Decimal('100.0000'))
        self.assertEqual(self._saldo(armazem=self.economato), Decimal('100.0000'))

    def test_recepcao_nao_se_valida_duas_vezes(self):
        """Dois cliques em "Validar" seriam mercadoria a dobrar no armazém."""
        grn = self._recepcao(quantidade='100', custo='800.00')
        r = self.client.post(f'/api/procurement/goods-receipts/{grn.id}/validate_receipt/',
                             {}, format='json')
        self.assertEqual(r.status_code, 400, 'A mesma receção foi validada duas vezes.')
        self.assertEqual(self._saldo(), Decimal('100.0000'),
                         'STOCK FANTASMA: a segunda validação duplicou a mercadoria.')

    def test_reabrir_uma_recepcao_validada_nao_pode_duplicar_o_stock(self):
        """O caminho por onde o stock se duplica sem ninguém notar.

        A receção já está validada e a mercadoria em stock. Se o estado puder
        voltar a "Em Conferência" com um PATCH (o ecrã de edição faz PATCH), a
        validação deixa de estar bloqueada e a mesma mercadoria entra outra vez:
        200 cervejas no sistema, 100 na prateleira, e o custo médio calculado
        sobre o dobro da quantidade.
        """
        grn = self._recepcao(quantidade='100', custo='800.00')
        r = self.client.patch(f'/api/procurement/goods-receipts/{grn.id}/',
                              {'status': 'Draft'}, format='json')
        self.assertEqual(r.status_code, 400,
                         'Deixou reabrir uma receção já validada (abre a porta ao stock a dobrar).')
        grn.refresh_from_db()
        self.assertEqual(grn.status, 'Validated')
        self.assertEqual(self._saldo(), Decimal('100.0000'))

    def test_nao_se_acrescentam_linhas_a_uma_recepcao_ja_validada(self):
        """Uma linha acrescentada depois da validação nunca entra em stock.

        O documento diz que se receberam 150 garrafas, o armazém tem 100, e a
        fatura do fornecedor foi criada com o valor antigo. O documento tem de
        ficar fechado.
        """
        grn = self._recepcao(quantidade='100', custo='800.00')
        r = self.client.post('/api/procurement/grn-lines/', {
            'goods_receipt': grn.id, 'item': self.cerveja.id, 'quantity_received': '50',
            'uom': self.un.id, 'unit_cost': '800.00'}, format='json')
        self.assertEqual(r.status_code, 400,
                         'Acrescentou uma linha a uma receção já validada — mercadoria que nunca entra em stock.')
        self.assertEqual(self._saldo(), Decimal('100.0000'))

    def test_recepcao_sem_encomenda_exige_fornecedor_e_armazem(self):
        """Receção directa (compra de emergência no mercado): sem encomenda de onde
        herdar, o fornecedor e o armazém passam a ser obrigatórios."""
        r = self.client.post('/api/procurement/goods-receipts/',
                             {'receipt_number': 'GRN-SEM'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('supplier', r.data)
        self.assertIn('delivery_warehouse', r.data)

    def test_recepcao_contra_encomenda_herda_fornecedor_e_armazem(self):
        po = self._encomenda()
        r = self.client.post('/api/procurement/goods-receipts/',
                             {'purchase_order': po.id, 'receipt_number': 'GRN-HER'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        grn = GoodsReceipt.objects.get(pk=r.data['id'])
        self.assertEqual(grn.supplier_id, self.fornecedor.id)
        self.assertEqual(grn.delivery_warehouse_id, self.armazem.id)


# ==========================================================================
# RECEÇÃO PARCIAL — o que o fornecedor ainda deve entregar
# ==========================================================================
class RecepcaoParcial(ComprasMontadas):

    def test_recepcao_parcial_entra_so_o_que_chegou(self):
        """Encomendaram-se 100, chegaram 40: entram 40 em stock, não 100."""
        po = self._encomenda(quantidade='100', preco='800.00')
        self._recepcao(po=po, quantidade='40', custo='800.00')
        self.assertEqual(self._saldo(), Decimal('40.0000'),
                         'A receção parcial não entrou pela quantidade certa.')

    def test_recepcao_parcial_deixa_a_encomenda_em_recepcao_parcial(self):
        """O estado da encomenda é o que diz ao comprador o que ainda falta chegar.

        Se a encomenda ficasse "Aprovada" para sempre, ninguém saberia que o
        fornecedor ainda deve 60 caixas — e os estados "Receção Parcial" e
        "Fechada" nunca chegariam a ser usados por nada.
        """
        po = self._encomenda(quantidade='100', preco='800.00')
        self._recepcao(po=po, quantidade='40', custo='800.00')
        po.refresh_from_db()
        self.assertEqual(po.status, 'Partial_Received',
                         'A encomenda recebida em parte não ficou em "Receção Parcial".')

    def test_quando_chega_o_resto_a_encomenda_fecha(self):
        """40 + 60 = 100: a encomenda está satisfeita e fecha-se."""
        po = self._encomenda(quantidade='100', preco='800.00')
        self._recepcao(po=po, quantidade='40', custo='800.00')
        self._recepcao(po=po, quantidade='60', custo='850.00')
        po.refresh_from_db()
        self.assertEqual(po.status, 'Closed',
                         'A encomenda recebida por inteiro não fechou.')
        self.assertEqual(self._saldo(), Decimal('100.0000'))

    def test_duas_recepcoes_a_precos_diferentes_dao_o_custo_medio_ponderado(self):
        """40 a 800 (32.000) + 60 a 850 (51.000) = 83.000 ÷ 100 = 830."""
        po = self._encomenda(quantidade='100', preco='800.00')
        self._recepcao(po=po, quantidade='40', custo='800.00')
        self._recepcao(po=po, quantidade='60', custo='850.00')
        self.assertEqual(self._custo(), Decimal('830.0000'),
                         'O custo médio das duas receções parciais está errado.')

    def test_receber_mais_do_que_o_encomendado_fica_assinalado(self):
        """A mercadoria chegou — entra. Mas tem de ficar DITO que chegou a mais.

        Não se recusa (as caixas estão no cais e o stock tem de refletir a
        realidade), mas uma entrega 50% acima da encomenda é dinheiro que ninguém
        aprovou. Se o sistema não avisar, só se descobre na fatura do fornecedor.
        """
        po = self._encomenda(quantidade='100', preco='800.00')
        grn = self._recepcao(po=po, quantidade='150', custo='800.00', validar=False)
        r = self.client.post(f'/api/procurement/goods-receipts/{grn.id}/validate_receipt/',
                             {}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(r.data.get('warnings'),
                        'Recebeu 150 de uma encomenda de 100 sem avisar ninguém.')
        self.assertIn('150', str(r.data['warnings']))
        self.assertEqual(self._saldo(), Decimal('150.0000'))
        po.refresh_from_db()
        self.assertEqual(po.status, 'Closed')

    def test_recepcao_dentro_do_encomendado_nao_inventa_avisos(self):
        """O caso normal não pode encher o ecrã de avisos — senão ninguém os lê."""
        po = self._encomenda(quantidade='100', preco='800.00')
        grn = self._recepcao(po=po, quantidade='100', custo='800.00', validar=False)
        r = self.client.post(f'/api/procurement/goods-receipts/{grn.id}/validate_receipt/',
                             {}, format='json')
        self.assertFalse(r.data.get('warnings'), f"Avisos inventados: {r.data.get('warnings')}")


# ==========================================================================
# ANULAR UMA COMPRA — repor o stock e o custo
# ==========================================================================
class AnularRecepcao(ComprasMontadas):

    def test_anular_a_recepcao_tira_o_stock_que_tinha_entrado(self):
        """Recebeu-se por erro (documento trocado, mercadoria de outro hotel).
        Anular tem de desfazer a entrada — senão fica stock que não existe."""
        grn = self._recepcao(quantidade='100', custo='800.00')
        r = self.client.post(f'/api/procurement/goods-receipts/{grn.id}/cancel/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(self._saldo(), Decimal('0.0000'),
                         'Anulou-se a receção mas a mercadoria ficou em stock.')
        grn.refresh_from_db()
        self.assertEqual(grn.status, 'Canceled')

    def test_anular_a_segunda_compra_repoe_o_custo_medio_anterior(self):
        """A PERGUNTA DO DONO: anular uma compra repõe o custo?

        Comprou-se a 800 (custo 800) e depois a 1.000 (custo médio 900). A segunda
        compra era de outro hotel. Ao anular, o custo tem de voltar a 800 — senão
        a casa passa a calcular margens com um custo que nunca pagou.
        """
        self._recepcao(quantidade='100', custo='800.00')
        self.assertEqual(self._custo(), Decimal('800.0000'))
        grn2 = self._recepcao(quantidade='100', custo='1000.00')
        self.assertEqual(self._custo(), Decimal('900.0000'))

        r = self.client.post(f'/api/procurement/goods-receipts/{grn2.id}/cancel/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(self._saldo(), Decimal('100.0000'))
        self.assertEqual(self._custo(), Decimal('800.0000'),
                         'Anulou-se a compra mas o custo médio ficou contaminado pelo preço anulado.')

    def test_anular_deixa_movimento_de_estorno_no_ledger(self):
        """A anulação não apaga história: deixa um movimento de saída que a explica."""
        grn = self._recepcao(quantidade='100', custo='800.00')
        self.client.post(f'/api/procurement/goods-receipts/{grn.id}/cancel/', {}, format='json')
        movs = StockMovement.objects.filter(reference=grn.receipt_number)
        self.assertEqual(movs.count(), 2,
                         'A anulação devia deixar o movimento de entrada E o de estorno.')
        self.assertTrue(movs.filter(movement_type='OUT').exists())

    def test_nao_se_anula_uma_recepcao_cuja_mercadoria_ja_foi_vendida(self):
        """Se a mercadoria já saiu, anular punha o stock negativo.

        E stock negativo contamina o custo médio de todas as compras seguintes
        (a ponderação passa a ser feita sobre uma quantidade que não existe).
        """
        grn = self._recepcao(quantidade='100', custo='800.00')
        from inventory import stock as motor
        motor.move_out(self.armazem, self.cerveja, Decimal('90'), reference='VENDA-TESTE')
        r = self.client.post(f'/api/procurement/goods-receipts/{grn.id}/cancel/', {}, format='json')
        self.assertEqual(r.status_code, 409,
                         'Anulou uma receção cuja mercadoria já tinha sido vendida.')
        self.assertEqual(self._saldo(), Decimal('10.0000'),
                         'O stock ficou negativo por causa de uma anulação.')

    def test_anular_duas_vezes_nao_tira_stock_a_dobrar(self):
        grn = self._recepcao(quantidade='100', custo='800.00')
        self.client.post(f'/api/procurement/goods-receipts/{grn.id}/cancel/', {}, format='json')
        r = self.client.post(f'/api/procurement/goods-receipts/{grn.id}/cancel/', {}, format='json')
        self.assertEqual(r.status_code, 400, 'Anulou a mesma receção duas vezes.')
        self.assertEqual(self._saldo(), Decimal('0.0000'))

    def test_anular_a_recepcao_anula_a_divida_ao_fornecedor(self):
        """Se a compra não existiu, a dívida ao fornecedor também não."""
        grn = self._recepcao(quantidade='100', custo='800.00')
        self.client.post(f'/api/procurement/goods-receipts/{grn.id}/cancel/', {}, format='json')
        ff = SupplierInvoice.objects.get(grn_ref=grn.receipt_number)
        self.assertEqual(ff.status, 'CANCELLED',
                         'Anulou-se a receção e a casa continua a dever o dinheiro ao fornecedor.')

    def test_nao_se_anula_uma_recepcao_ja_paga_ao_fornecedor(self):
        """Dinheiro já saiu da casa: anular a compra deixava um pagamento órfão."""
        grn = self._recepcao(quantidade='100', custo='800.00')
        ff = SupplierInvoice.objects.get(grn_ref=grn.receipt_number)
        from finance.models import FinanceAccount, PaymentVoucher
        conta = FinanceAccount.objects.create(hotel=self.hotel, code='CX01', name='Caixa',
                                              opening_balance=Decimal('1000000.00'))
        PaymentVoucher.objects.create(number='PAG-X1', account=conta, party_name='Refriango',
                                      amount=Decimal('80000.00'), date=self.hoje,
                                      status='CONFIRMED', supplier_invoice=ff)
        r = self.client.post(f'/api/procurement/goods-receipts/{grn.id}/cancel/', {}, format='json')
        self.assertEqual(r.status_code, 409,
                         'Anulou uma compra que já tinha sido paga ao fornecedor.')


# ==========================================================================
# CONTA CORRENTE DO FORNECEDOR nascida da receção
# ==========================================================================
class DividaAoFornecedor(ComprasMontadas):

    def test_recepcao_validada_cria_a_fatura_de_fornecedor(self):
        """Receber mercadoria é assumir uma dívida. Se a dívida não nascer aqui,
        só aparece quando o fornecedor telefona a reclamar."""
        grn = self._recepcao(quantidade='100', custo='800.00')
        ff = SupplierInvoice.objects.filter(grn_ref=grn.receipt_number).first()
        self.assertIsNotNone(ff, 'A receção não gerou dívida ao fornecedor.')
        self.assertEqual(ff.amount, Decimal('80000.00'),
                         'O valor da dívida não é a quantidade recebida × o custo.')
        self.assertEqual(ff.supplier_id_ref, self.fornecedor.id)
        self.assertEqual(ff.status, 'OPEN')

    def test_a_divida_nao_se_duplica_em_tentativas_repetidas(self):
        """Duas tentativas de validar não podem dar duas dívidas pela mesma entrega."""
        grn = self._recepcao(quantidade='100', custo='800.00')
        self.client.post(f'/api/procurement/goods-receipts/{grn.id}/validate_receipt/', {},
                         format='json')
        self.assertEqual(SupplierInvoice.objects.filter(grn_ref=grn.receipt_number).count(), 1,
                         'A mesma receção gerou duas dívidas ao fornecedor.')

    def test_numeracao_da_divida_nao_colide_com_a_do_financeiro(self):
        """As duas apps numeram as faturas de fornecedor com o MESMO formato (FF-000001).

        O Financeiro salta os números já usados; as Compras faziam `count()+1` sem
        verificar. Com uma numeração com falhas (faturas lançadas à mão e alguma
        apagada), o número calculado já existia, a gravação rebentava — e o erro
        era ENGOLIDO por um `except: pass`: a mercadoria entrava em stock e a casa
        ficava a dever dinheiro a um fornecedor que nunca aparecia nas contas a pagar.
        """
        hoje = self.hoje
        for n in (1, 3):      # deixa de propósito o "FF-000002" livre
            SupplierInvoice.objects.create(number=f'FF-{n:06d}', supplier_name='Outro',
                                           date=hoje, amount=Decimal('1000.00'))
        grn = self._recepcao(quantidade='10', custo='500.00')
        ff = SupplierInvoice.objects.filter(grn_ref=grn.receipt_number).first()
        self.assertIsNotNone(ff, 'A receção entrou em stock mas a dívida ao fornecedor desapareceu.')
        self.assertEqual(ff.amount, Decimal('5000.00'))


# ==========================================================================
# DEVOLUÇÕES A FORNECEDOR
# ==========================================================================
class DevolucoesAFornecedor(ComprasMontadas):

    def _devolucao(self, quantidade='20'):
        r = self.client.post('/api/procurement/returns/', {
            'supplier': self.fornecedor.id, 'warehouse': self.armazem.id,
            'reason': 'Mercadoria fora de prazo',
            'lines': [{'item': self.cerveja.id, 'quantity': quantidade}],
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        return PurchaseReturn.objects.get(pk=r.data['id'])

    def test_devolucao_confirmada_tira_a_mercadoria_do_armazem(self):
        self._recepcao(quantidade='100', custo='800.00')
        dev = self._devolucao('20')
        r = self.client.post(f'/api/procurement/returns/{dev.id}/confirm/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(self._saldo(), Decimal('80.0000'),
                         'A devolução ao fornecedor não baixou o stock.')

    def test_devolucao_nao_mexe_no_custo_medio(self):
        """Devolver é uma saída: tira quantidade, não reavalia o que ficou."""
        self._recepcao(quantidade='100', custo='800.00')
        dev = self._devolucao('20')
        self.client.post(f'/api/procurement/returns/{dev.id}/confirm/', {}, format='json')
        self.assertEqual(self._custo(), Decimal('800.0000'))

    def test_nao_se_devolve_mais_do_que_existe_no_armazem(self):
        """Devolver 150 de 100 punha o stock a −50.

        E um saldo negativo não fica só errado nele: o cálculo do custo médio da
        compra seguinte passa a ponderar com uma quantidade que não existe, e o
        custo do artigo sai de qualquer maneira.
        """
        self._recepcao(quantidade='100', custo='800.00')
        dev = self._devolucao('150')
        r = self.client.post(f'/api/procurement/returns/{dev.id}/confirm/', {}, format='json')
        self.assertEqual(r.status_code, 409,
                         'Devolveu 150 unidades de um armazém que só tem 100.')
        self.assertEqual(self._saldo(), Decimal('100.0000'),
                         'O stock ficou negativo por causa de uma devolução.')

    def test_devolucao_sem_linhas_nao_se_confirma(self):
        r = self.client.post('/api/procurement/returns/', {
            'supplier': self.fornecedor.id, 'warehouse': self.armazem.id}, format='json')
        dev_id = r.data['id']
        r2 = self.client.post(f'/api/procurement/returns/{dev_id}/confirm/', {}, format='json')
        self.assertEqual(r2.status_code, 400)

    def test_devolucao_nao_se_confirma_duas_vezes(self):
        self._recepcao(quantidade='100', custo='800.00')
        dev = self._devolucao('20')
        self.client.post(f'/api/procurement/returns/{dev.id}/confirm/', {}, format='json')
        r = self.client.post(f'/api/procurement/returns/{dev.id}/confirm/', {}, format='json')
        self.assertEqual(r.status_code, 400, 'A mesma devolução saiu do stock duas vezes.')
        self.assertEqual(self._saldo(), Decimal('80.0000'))


# ==========================================================================
# O CICLO ANTES DA ENCOMENDA: requisição → aprovação → RFQ → cotações → OC
# ==========================================================================
class CicloDeAprovacao(ComprasMontadas):

    def _requisicao(self):
        r = self.client.post('/api/procurement/requisitions/', {
            'warehouse': self.armazem.id, 'requester': 'Chefe de Cozinha',
            'lines': [{'item': self.arroz.id, 'quantity': '200', 'uom': self.un.id}],
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        return PurchaseRequisition.objects.get(pk=r.data['id'])

    def test_requisicao_nasce_em_rascunho_com_numero_proprio(self):
        req = self._requisicao()
        self.assertEqual(req.status, 'DRAFT')
        self.assertTrue(req.number.startswith('REQ-'))
        self.assertEqual(req.lines.count(), 1)

    def test_requisicao_sem_aprovacao_nao_vai_a_mercado(self):
        """Pedir preços a fornecedores em nome da casa sem aprovação interna é
        comprometer a casa. O pedido de cotação só nasce de uma requisição aprovada."""
        req = self._requisicao()
        r = self.client.post(f'/api/procurement/requisitions/{req.id}/create_rfq/', {}, format='json')
        self.assertEqual(r.status_code, 400,
                         'Gerou um pedido de cotação a partir de uma requisição não aprovada.')

    def test_requisicao_aprovada_gera_pedido_de_cotacao_com_as_mesmas_linhas(self):
        req = self._requisicao()
        self.client.post(f'/api/procurement/requisitions/{req.id}/submit/', {}, format='json')
        a = self.client.post(f'/api/procurement/requisitions/{req.id}/approve/',
                             {'approver': 'Director'}, format='json')
        self.assertEqual(a.data['status'], 'APPROVED')
        req.refresh_from_db()
        self.assertEqual(req.approver, 'Director')
        self.assertIsNotNone(req.decided_at, 'Uma aprovação sem data não serve de prova.')

        r = self.client.post(f'/api/procurement/requisitions/{req.id}/create_rfq/', {}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(len(r.data['lines']), 1,
                         'O pedido de cotação não levou as linhas da requisição.')
        self.assertEqual(Decimal(str(r.data['lines'][0]['quantity'])), Decimal('200'))

    def test_cotacao_usa_o_preco_acordado_do_catalogo_do_fornecedor(self):
        """O preço acordado em contrato é o que deve aparecer — não um zero que
        depois alguém aprova sem olhar."""
        SupplierProductCatalog.objects.create(supplier=self.fornecedor, item=self.arroz,
                                              agreed_price=Decimal('1450.0000'))
        rfq = self._rfq_aprovado()
        r = self.client.post(f'/api/procurement/rfqs/{rfq["id"]}/add_quote/',
                             {'supplier': self.fornecedor.id, 'quote_ref': 'COT-1'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(Decimal(str(r.data['lines'][0]['unit_price'])), Decimal('1450.0000'),
                         'A cotação não foi pré-preenchida com o preço acordado do catálogo.')

    def test_comparacao_de_propostas_aponta_o_mais_barato(self):
        """É este quadro que justifica a escolha do fornecedor perante o dono."""
        outro = Supplier.objects.create(code='F002', commercial_name='Angomarte', nif='5417000001')
        rfq = self._rfq_aprovado()
        self.client.post(f'/api/procurement/rfqs/{rfq["id"]}/add_quote/',
                         {'supplier': self.fornecedor.id,
                          'prices': [{'item': self.arroz.id, 'unit_price': '1500.00'}]}, format='json')
        self.client.post(f'/api/procurement/rfqs/{rfq["id"]}/add_quote/',
                         {'supplier': outro.id,
                          'prices': [{'item': self.arroz.id, 'unit_price': '1300.00'}]}, format='json')
        r = self.client.get(f'/api/procurement/rfqs/{rfq["id"]}/comparison/')
        self.assertEqual(r.status_code, 200)
        linha = r.data['rows'][0]
        self.assertEqual(linha['best_supplier'], 'Angomarte',
                         'A comparação não escolheu a proposta mais barata.')
        self.assertEqual(Decimal(str(linha['best_price'])), Decimal('1300.0000'))
        totais = {t['supplier']: Decimal(str(t['total'])) for t in r.data['quote_totals']}
        self.assertEqual(totais['Angomarte'], Decimal('260000.0000'),
                         'O total da proposta não é 200 × 1.300.')

    def test_cotacao_escolhida_vira_encomenda_com_os_precos_cotados(self):
        """O preço que vai para a encomenda tem de ser o preço cotado. Se mudasse
        aqui, aprovava-se uma proposta e encomendava-se outra."""
        rfq = self._rfq_aprovado()
        q = self.client.post(f'/api/procurement/rfqs/{rfq["id"]}/add_quote/',
                             {'supplier': self.fornecedor.id,
                              'prices': [{'item': self.arroz.id, 'unit_price': '1400.00'}]},
                             format='json')
        r = self.client.post(f'/api/procurement/quotes/{q.data["id"]}/convert_to_po/', {}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        po = PurchaseOrder.objects.get(pk=r.data['id'])
        self.assertEqual(po.total_amount, Decimal('280000.00'),
                         'A encomenda não ficou com o valor da proposta aceite (200 × 1.400).')
        self.assertEqual(po.lines.first().unit_price, Decimal('1400.0000'))
        self.assertEqual(po.delivery_warehouse_id, self.armazem.id,
                         'A encomenda não foi entregue no armazém que a requisição pediu.')

    def _rfq_aprovado(self):
        req = self._requisicao()
        self.client.post(f'/api/procurement/requisitions/{req.id}/approve/', {}, format='json')
        r = self.client.post(f'/api/procurement/requisitions/{req.id}/create_rfq/', {}, format='json')
        return r.data


# ==========================================================================
# PAINÉIS DE COMPRAS
# ==========================================================================
class PaineisDeCompras(ComprasMontadas):

    def test_dashboard_conta_os_documentos_por_estado(self):
        self._encomenda()
        r = self.client.get('/api/procurement/dashboard/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['purchase_orders'].get('Approved'), 1)
        self.assertEqual(r.data['goods_receipts'], 0)

    def test_planeamento_sugere_repor_o_que_esta_abaixo_do_minimo(self):
        """É a lista com que o economato faz a encomenda da semana.

        Mínimo 50, em casa 10 → faltam 40 para o máximo (50). O custo estimado tem
        de usar o custo médio real, senão o orçamento da encomenda é fantasia.
        """
        self._recepcao(quantidade='10', custo='800.00')
        lvl = StockLevel.objects.get(warehouse=self.armazem, item=self.cerveja)
        lvl.min_stock_alert = Decimal('50'); lvl.max_stock_capacity = Decimal('200')
        lvl.save()

        r = self.client.get('/api/procurement/planning/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['count'], 1, f"Não sugeriu reposição: {r.data}")
        linha = r.data['suggestions'][0]
        self.assertEqual(linha['code'], 'B001')
        self.assertEqual(Decimal(str(linha['suggested_qty'])), Decimal('190'),
                         'A quantidade a repor não é a que falta para o máximo.')
        self.assertEqual(Decimal(str(linha['est_cost'])), Decimal('152000'),
                         'O custo estimado da reposição não usa o custo médio real.')

    def test_artigo_com_stock_suficiente_nao_aparece_na_reposicao(self):
        """Uma lista de reposição com artigos que não faltam é uma lista que
        ninguém usa."""
        self._recepcao(quantidade='500', custo='800.00')
        lvl = StockLevel.objects.get(warehouse=self.armazem, item=self.cerveja)
        lvl.min_stock_alert = Decimal('50')
        lvl.save()
        r = self.client.get('/api/procurement/planning/')
        self.assertEqual(r.data['count'], 0,
                         'Sugeriu repor um artigo que tem stock de sobra.')


# ==========================================================================
# LOTES E VALIDADES NA RECEÇÃO — a metade que faltava
# ==========================================================================
class LotesNaRecepcao(ComprasMontadas):
    """A GUIA DO FORNECEDOR TRAZ UM LOTE E UM PRAZO, e a receção tinha-os perdido.

    Este era o caminho por onde entrava a maior parte da mercadoria da casa, e o
    único sem onde escrever o lote: quem recebia lia o prazo na caixa e não tinha
    campo para ele. O motor de stock criava então um lote com o número do
    documento e sem validade — e a lista de validades, o FEFO e a resposta a uma
    recolha do fornecedor ("este lote, de que guia veio?") ficavam sem a metade
    que conta.
    """

    def _lotes(self, artigo=None, armazem=None):
        return StockLot.objects.filter(warehouse=armazem or self.armazem,
                                       item=artigo or self.cerveja)

    def test_a_rececao_cria_o_lote_com_o_numero_e_o_prazo_da_guia(self):
        prazo = self.hoje + timedelta(days=60)
        self._recepcao(quantidade='240', lote='L-RFG-7781', validade=prazo)
        lote = self._lotes().get()
        self.assertEqual(lote.lot_number, 'L-RFG-7781')
        self.assertEqual(lote.expiry_date, prazo)
        self.assertEqual(lote.quantity, Decimal('240.0000'))

    def test_sem_lote_na_guia_o_rasto_e_o_numero_da_rececao(self):
        """Ninguém escreve lotes todos os dias. Sem lote, o rasto tem de ser o
        documento — é por ele que se descobre de quem veio."""
        grn = self._recepcao(quantidade='100')
        self.assertEqual(self._lotes().get().lot_number, grn.receipt_number)

    def test_sem_prazo_na_guia_vale_a_validade_da_ficha_do_artigo(self):
        self.arroz.shelf_life_days = 30
        self.arroz.save(update_fields=['shelf_life_days'])
        self._recepcao(artigo=self.arroz, quantidade='50')
        lote = self._lotes(artigo=self.arroz).get()
        self.assertEqual(lote.expiry_date, self.hoje + timedelta(days=30))

    def test_a_soma_dos_lotes_bate_com_o_saldo_depois_de_receber(self):
        self._recepcao(quantidade='240', lote='L-1')
        self._recepcao(quantidade='120', lote='L-2')
        self.assertEqual(sum(l.quantity for l in self._lotes()), self._saldo(),
                         'A soma dos lotes deixou de bater com o saldo do armazém.')

    def test_duas_entregas_do_mesmo_lote_nao_fazem_dois_lotes(self):
        """A mesma guia em duas partes: soma-se ao que lá está. É o que o
        empregado conta na prateleira."""
        prazo = self.hoje + timedelta(days=45)
        self._recepcao(quantidade='100', lote='L-IGUAL', validade=prazo)
        self._recepcao(quantidade='60', lote='L-IGUAL', validade=prazo)
        self.assertEqual(self._lotes().count(), 1)
        self.assertEqual(self._lotes().get().quantity, Decimal('160.0000'))

    def test_anular_a_rececao_tira_o_lote_que_ela_criou_e_nao_o_mais_antigo(self):
        """O DEFEITO QUE ISTO FECHA. O estorno saía por FEFO: devolvia-se ao
        fornecedor a mercadoria errada no papel — o lote da guia anulada ficava em
        armazém com a sua validade, e o lote que estava mesmo a expirar
        desaparecia das contagens sem ninguém o ter consumido."""
        # Primeiro entra um lote QUASE A EXPIRAR (é o que o FEFO escolheria).
        self._recepcao(quantidade='50', lote='L-VELHO',
                       validade=self.hoje + timedelta(days=2))
        # Depois a guia errada, com prazo longe.
        errada = self._recepcao(quantidade='80', lote='L-ERRADA',
                                validade=self.hoje + timedelta(days=200))

        r = self.client.post(f'/api/procurement/goods-receipts/{errada.id}/cancel/',
                             {}, format='json')
        self.assertEqual(r.status_code, 200, f'a anulação falhou: {r.data}')

        velho = self._lotes().filter(lot_number='L-VELHO').first()
        self.assertEqual(velho.quantity, Decimal('50.0000'),
                         'A anulação comeu o lote que estava a expirar — esse não '
                         'foi consumido por ninguém, nem devolvido a ninguém.')
        errado = self._lotes().filter(lot_number='L-ERRADA').first()
        self.assertEqual((errado.quantity if errado else Decimal('0')), Decimal('0.0000'),
                         'O lote da guia anulada continua em armazém.')
        self.assertEqual(self._saldo(), Decimal('50.0000'))
        self.assertEqual(sum(l.quantity for l in self._lotes()), self._saldo(),
                         'Depois de anular, a soma dos lotes não bate com o saldo.')

    def test_anular_uma_rececao_sem_lote_escrito_usa_o_numero_do_documento(self):
        """Quem não escreveu lote nenhum tem de poder anular do mesmo jeito: o
        lote chama-se como o documento."""
        grn = self._recepcao(quantidade='100')
        r = self.client.post(f'/api/procurement/goods-receipts/{grn.id}/cancel/',
                             {}, format='json')
        self.assertEqual(r.status_code, 200, f'a anulação falhou: {r.data}')
        self.assertEqual(self._saldo(), Decimal('0.0000'))
        self.assertEqual(sum(l.quantity for l in self._lotes()), Decimal('0'))
