# -*- coding: utf-8 -*-
"""O ARQUIVO — todo o documento se encontra pelo número, e abre.

O Centro de Documentos é o sítio onde se responde a uma pergunta que ninguém faz
em dia de serviço e todos fazem num dia mau: "este número, o que é?". Um
fornecedor que reclama, um auditor que pede, uma falta de stock que não se
explica — começa sempre por um número escrito num papel.

Por isso o que estes testes verificam é uma coisa só, e repete-se: **procurar
pelo número do documento encontra o documento, e abri-lo mostra o que ele tem
dentro**. Não é o mesmo que encontrar os efeitos dele: o arquivo tinha os
MOVIMENTOS de stock que uma receção gera, mas não a receção; tinha a factura do
fornecedor que chega no fim, mas não a guia pela qual a mercadoria entrou.

E a segunda coisa, que é a mais fácil de deixar passar: o painel do documento
tinha de ABRIR. Esta vista vive toda dentro de `try/except` — um módulo que
falte não pode derrubar o arquivo — e por isso uma família que ela não conheça
não dá erro: devolve um painel vazio. Silêncio em vez de defeito.
"""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase

from identity.models import Company, EnterpriseGroup, Hotel
from inventory.models import (InventoryCount, InventoryCountLine, Item, ItemCategory,
                              ProductionOrder, StockTransfer, StockTransferLine,
                              UnitOfMeasure, Warehouse)
from mdm.models import Customer
from pos.models import StockDoc, StockDocLine, StockDocSeries
from esm.models import Supplier
from procurement.models import (GoodsReceipt, GoodsReceiptLine, PurchaseOrder,
                                PurchaseOrderLine, PurchaseRequisition,
                                RequisitionLine)


class CasaComArquivo(APITestCase):
    """Um documento de cada família, para o arquivo ter o que guardar."""

    def setUp(self):
        self.user = User.objects.create_superuser('arquivista', '', 'x')
        self.client.force_authenticate(self.user)

        grupo = EnterpriseGroup.objects.create(name='Grupo Principal')
        empresa = Company.objects.create(group=grupo, name='Mwana Lodge, Lda.',
                                         tax_id='5000000000')
        self.hotel = Hotel.objects.create(company=empresa, name='Mwana Lodge', is_master=True)
        self.armazem = Warehouse.objects.create(hotel=self.hotel, code='ECO',
                                                name='Economato', is_main=True)
        self.bar = Warehouse.objects.create(hotel=self.hotel, code='BAR', name='Bar')

        self.un = UnitOfMeasure.objects.create(code='UN', name='Unidade')
        cat = ItemCategory.objects.create(name='Mercearia')
        self.farinha = Item.objects.create(code='F001', name='Farinha de Trigo',
                                           item_type='RawMaterial', category=cat,
                                           base_uom=self.un)
        self.pao = Item.objects.create(code='P001', name='Pão da Casa',
                                       item_type='Manufactured', category=cat,
                                       base_uom=self.un)
        self.fornecedor = Supplier.objects.create(code='F100', commercial_name='Moageira, Lda.',
                                                  nif='5417000000', status='ACTIVE')
        self.hoje = timezone.localdate()

    # -- os documentos, um de cada família --------------------------------
    def requisicao(self):
        d = PurchaseRequisition.objects.create(number='RQ-0001', hotel=self.hotel,
                                               warehouse=self.armazem,
                                               requester='Chefe de Cozinha')
        RequisitionLine.objects.create(requisition=d, item=self.farinha,
                                               quantity=Decimal('50'), uom=self.un)
        return d

    def encomenda(self):
        d = PurchaseOrder.objects.create(po_number='OC-0001', supplier=self.fornecedor,
                                         hotel=self.hotel, delivery_warehouse=self.armazem,
                                         total_amount=Decimal('40000'))
        PurchaseOrderLine.objects.create(purchase_order=d, item=self.farinha,
                                         quantity_requested=Decimal('50'), uom=self.un,
                                         unit_price=Decimal('800'))
        return d

    def rececao(self, po=None):
        d = GoodsReceipt.objects.create(receipt_number='GRN-0001', supplier=self.fornecedor,
                                        delivery_warehouse=self.armazem,
                                        supplier_invoice_ref='FT 2026/881',
                                        purchase_order=po)
        GoodsReceiptLine.objects.create(goods_receipt=d, item=self.farinha,
                                        quantity_received=Decimal('50'), uom=self.un,
                                        unit_cost=Decimal('800'), lot_number='L-MOAG-5',
                                        expiry_date=self.hoje + timedelta(days=90))
        return d

    def documento_de_stock(self):
        serie = StockDocSeries.objects.create(code='REQ', name='Requisição Interna',
                                              kind='REQUEST')
        entidade = Customer.objects.create(code='C001', name='Cozinha Central')
        d = StockDoc.objects.create(series=serie, doc_date=self.hoje,
                                    warehouse=self.armazem, entity=entidade)
        StockDocLine.objects.create(doc=d, item=self.farinha, quantity=Decimal('10'),
                                    unit_cost=Decimal('800'), lot='L-MOAG-5')
        return d

    def ordem_de_producao(self):
        return ProductionOrder.objects.create(number='OP00001', warehouse=self.armazem,
                                              item=self.pao, quantity=Decimal('40'),
                                              lot_number='PAO-HOJE',
                                              expiry_date=self.hoje + timedelta(days=2))

    def transferencia(self):
        d = StockTransfer.objects.create(number='TR-0001', source=self.armazem,
                                         destination=self.bar)
        StockTransferLine.objects.create(transfer=d, item=self.farinha, quantity=Decimal('5'))
        return d

    def contagem(self):
        d = InventoryCount.objects.create(number='CT-0001', warehouse=self.armazem)
        InventoryCountLine.objects.create(count=d, item=self.farinha,
                                          system_qty=Decimal('50'),
                                          counted_qty=Decimal('47'))
        return d

    # -- utilitários de leitura -------------------------------------------
    def procurar(self, numero):
        r = self.client.get('/api/documents/center/', {'q': numero})
        self.assertEqual(r.status_code, 200, r.content[:300])
        return r.data['results']

    def abrir(self, linha):
        r = self.client.get('/api/documents/links/',
                            {'module': linha['module'], 'id': linha['ref']})
        self.assertEqual(r.status_code, 200, r.content[:300])
        return r.data

    def encontrada(self, numero):
        """A linha deste documento no arquivo — e falha a dizer o que falta."""
        linhas = self.procurar(numero)
        achada = [l for l in linhas if l['number'] == numero]
        self.assertTrue(achada,
                        f'Procurar "{numero}" não encontra o documento no arquivo. '
                        f'Quem tem este número escrito num papel não tem por onde '
                        f'começar. Vieram {len(linhas)} linhas, nenhuma dele.')
        return achada[0]


class ComprasNoArquivoTests(CasaComArquivo):
    """A cadeia de compras — e a GUIA pela qual a mercadoria entrou."""

    def test_a_rececao_de_mercadoria_esta_no_arquivo(self):
        """O documento que FAZ a mercadoria entrar em armazém. Em "Compras" só
        aparecia a factura do fornecedor, que é o papel que chega no fim."""
        self.rececao()
        linha = self.encontrada('GRN-0001')
        self.assertEqual(linha['category'], 'COMPRAS')
        self.assertEqual(linha['party'], 'Moageira, Lda.')

    def test_a_rececao_abre_e_mostra_o_lote_e_a_validade(self):
        """É esta a pergunta de uma recolha do fornecedor: "este lote, de que guia
        veio, e com que prazo?"."""
        self.rececao()
        painel = self.abrir(self.encontrada('GRN-0001'))
        self.assertTrue(painel['detail'], 'O painel da receção abriu VAZIO.')
        self.assertEqual(painel['detail']['fields']['Guia/Factura do fornecedor'],
                         'FT 2026/881')
        corpo = ' '.join(painel['detail']['items'])
        self.assertIn('L-MOAG-5', corpo)
        self.assertIn('Farinha', corpo)

    def test_a_rececao_aponta_para_a_encomenda_que_a_pediu(self):
        po = self.encomenda()
        self.rececao(po=po)
        painel = self.abrir(self.encontrada('GRN-0001'))
        ligados = [l['number'] for l in painel['links']]
        self.assertIn('OC-0001', ligados,
                      'Da receção não se chega à encomenda — o fluxo parte-se a meio.')

    def test_a_encomenda_esta_no_arquivo_e_aponta_para_as_rececoes(self):
        po = self.encomenda()
        self.rececao(po=po)
        linha = self.encontrada('OC-0001')
        self.assertEqual(linha['amount'], '40000.00')
        painel = self.abrir(linha)
        self.assertIn('GRN-0001', [l['number'] for l in painel['links']])

    def test_a_requisicao_de_compra_esta_no_arquivo_e_abre(self):
        self.requisicao()
        painel = self.abrir(self.encontrada('RQ-0001'))
        self.assertEqual(painel['detail']['fields']['Requisitante'], 'Chefe de Cozinha')

    def test_procurar_pelo_fornecedor_traz_a_cadeia_toda(self):
        """Quem liga é o fornecedor, não o número: "o que é que a Moageira nos
        entregou?"."""
        po = self.encomenda()
        self.rececao(po=po)
        numeros = [l['number'] for l in self.procurar('Moageira')]
        self.assertIn('GRN-0001', numeros)
        self.assertIn('OC-0001', numeros)


class StockNoArquivoTests(CasaComArquivo):
    """Os DOCUMENTOS de stock — não só os movimentos que eles geram."""

    def test_o_documento_de_stock_do_pos_esta_no_arquivo(self):
        """Entradas, requisições, transferências e inventários do POS. O arquivo
        tinha as LINHAS do ledger que eles geram, mas não o documento: sem estado,
        sem total, sem saber se foi anulado."""
        self.documento_de_stock()
        linha = self.encontrada('REQ/1')
        self.assertEqual(linha['category'], 'STOCK')
        self.assertEqual(linha['status'], 'Por lançar')

    def test_o_documento_de_stock_diz_se_foi_lancado_ou_anulado(self):
        """A diferença entre os três estados é a diferença entre mercadoria que
        mexeu e mercadoria que não mexeu. Num arquivo, é a primeira coisa a ver."""
        d = self.documento_de_stock()
        d.posted = True
        d.save(update_fields=['posted'])
        self.assertEqual(self.encontrada('REQ/1')['status'], 'Lançado')
        d.voided = True
        d.save(update_fields=['voided'])
        self.assertEqual(self.encontrada('REQ/1')['status'], 'Anulado')

    def test_o_documento_de_stock_abre_com_as_linhas_e_o_lote(self):
        self.documento_de_stock()
        painel = self.abrir(self.encontrada('REQ/1'))
        self.assertTrue(painel['detail'], 'O painel do documento de stock abriu VAZIO.')
        self.assertIn('L-MOAG-5', ' '.join(painel['detail']['items']))

    def test_a_ordem_de_producao_esta_no_arquivo(self):
        """Criada neste trabalho — e por isso nada no arquivo a conhecia."""
        self.ordem_de_producao()
        linha = self.encontrada('OP00001')
        self.assertEqual(linha['category'], 'STOCK')
        self.assertEqual(linha['doc_type'], 'Ordem de Produção')

    def test_a_ordem_de_producao_abre_com_o_lote_do_rotulo(self):
        self.ordem_de_producao()
        painel = self.abrir(self.encontrada('OP00001'))
        self.assertEqual(painel['detail']['fields']['Lote'], 'PAO-HOJE')
        self.assertEqual(painel['detail']['fields']['Produzido'], 'P001 · Pão da Casa')

    def test_a_transferencia_do_centro_de_armazem_esta_no_arquivo(self):
        self.transferencia()
        linha = self.encontrada('TR-0001')
        self.assertEqual(linha['party'], 'Economato → Bar')
        self.assertTrue(self.abrir(linha)['detail'])

    def test_a_contagem_de_inventario_esta_no_arquivo_e_mostra_a_diferenca(self):
        self.contagem()
        painel = self.abrir(self.encontrada('CT-0001'))
        corpo = ' '.join(painel['detail']['items'])
        self.assertIn('47', corpo, 'A contagem abriu sem dizer o que foi contado.')
        self.assertIn('50', corpo, 'A contagem abriu sem dizer o que o sistema tinha.')


class NenhumPainelAbreVazioTests(CasaComArquivo):
    """O defeito mais fácil de não ver: o painel que abre em branco.

    Esta vista vive dentro de `try/except` — e com razão, porque um módulo que a
    licença não inclua não pode derrubar o arquivo. O efeito colateral é que uma
    família de documentos que ela não conheça não dá erro nenhum: devolve `{}`, e
    quem clica vê um painel vazio e conclui que o documento não tem nada dentro.
    """

    def test_toda_a_linha_do_arquivo_abre_com_conteudo(self):
        po = self.encomenda()
        self.requisicao()
        self.rececao(po=po)
        self.documento_de_stock()
        self.ordem_de_producao()
        self.transferencia()
        self.contagem()

        r = self.client.get('/api/documents/center/', {'limit': 200})
        self.assertEqual(r.status_code, 200, r.content[:300])
        linhas = r.data['results']
        self.assertGreaterEqual(len(linhas), 7,
                                f'O arquivo só trouxe {len(linhas)} linhas para sete '
                                f'documentos criados.')

        vazios = []
        for l in linhas:
            if not l.get('module'):
                continue
            painel = self.abrir(l)
            if not painel['detail']:
                vazios.append(f"{l['category']}/{l['doc_type']} {l['number']} "
                              f"(module={l['module']})")
        self.assertFalse(vazios,
                         'Estes documentos aparecem no arquivo mas abrem VAZIOS — '
                         'quem clica não vê erro, vê silêncio:\n  '
                         + '\n  '.join(vazios))

    def test_o_painel_do_dia_conta_o_que_entrou_e_o_que_se_produziu(self):
        self.rececao()
        op = self.ordem_de_producao()
        op.status = 'DONE'
        op.produced_at = timezone.now()
        op.save(update_fields=['status', 'produced_at'])
        self.documento_de_stock()

        r = self.client.get('/api/documents/dashboard/')
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertEqual(r.data['receipts'], 1, 'O painel não conta a mercadoria recebida hoje.')
        self.assertEqual(r.data['production'], 1, 'O painel não conta o que se produziu hoje.')
        self.assertEqual(r.data['stock_docs'], 1)
        self.assertGreaterEqual(r.data['total_today'], 3)

    def test_um_numero_que_nao_existe_devolve_uma_lista_vazia_e_nao_um_erro(self):
        r = self.client.get('/api/documents/center/', {'q': 'ZZZ-9999'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['results'], [])
