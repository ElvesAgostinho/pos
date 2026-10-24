# -*- coding: utf-8 -*-
"""O QUE ACONTECE QUANDO A REDE CAI, E O QUE ACONTECE QUANDO SE VENDE FIADO.

São dois caminhos que fogem ao balcão e que, por isso, passavam ao lado de tudo o
que o balcão garante:

  · A VENDA OFFLINE — o terminal continua a servir com a rede em baixo e manda as
    contas mais tarde. O servidor gravava-as com o preço que o terminal dissesse,
    não dava saída do stock e NÃO EMITIA DOCUMENTO FISCAL: uma noite inteira de
    serviço era uma noite de receita não declarada à AGT, com a mercadoria a
    aparecer no sistema como se ainda estivesse na prateleira.

  · A VENDA A CRÉDITO — a empresa que janta hoje e paga ao fim do mês. A conta
    guardava o nome do cliente em texto e nada mais; a conta corrente constrói-se
    a partir dos documentos ligados à ENTIDADE do cadastro. Sem essa ligação, a
    dívida da empresa não aparecia em sítio nenhum e ninguém a cobrava.

Os dois mexem em dinheiro e nos dois o erro é silencioso: não há ecrã onde ele se
veja. Só somando.
"""
from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from fiscal.models import FiscalConfig, FiscalDocType, FiscalSeries, FiscalDocument, TaxRate
from identity.models import Company, EnterpriseGroup, Hotel
from inventory.models import Item, ItemCategory, ItemPrice, StockLevel, UnitOfMeasure, Warehouse
from mdm.models import Customer, PaymentMethod
from pos.models import CashSession, Outlet, OutletPaymentMethod, POSTicket


class BalcaoComRedeAbaixo(APITestCase):
    """Um bar, um artigo, uma caixa aberta — e a série fiscal configurada."""

    def setUp(self):
        self.user = User.objects.create_superuser('dono_offline', '', 'x')
        self.client.force_authenticate(self.user)

        grupo = EnterpriseGroup.objects.create(name='Grupo Principal')
        empresa = Company.objects.create(group=grupo, name='Mwana Lodge, Lda.',
                                         tax_id='5000000000')
        self.hotel = Hotel.objects.create(company=empresa, name='Mwana Lodge', is_master=True)
        self.armazem = Warehouse.objects.create(hotel=self.hotel, code='BAR', name='Bar',
                                                is_main=True)
        # O ARMAZÉM DO PONTO DE VENDA: é de lá que a venda tira a mercadoria.
        # Sem ele, o consumo não tem de onde sair (e o motor não adivinha um).
        self.outlet = Outlet.objects.create(hotel=self.hotel, name='Bar da Piscina',
                                            code='BAR', warehouse=self.armazem)

        un = UnitOfMeasure.objects.create(code='UN', name='Unidade')
        cat = ItemCategory.objects.create(name='Bebidas')
        self.whisky = Item.objects.create(code='W001', name='Whisky 12 anos',
                                          item_type='FinishedGood', category=cat,
                                          base_uom=un, sale_price=Decimal('12000'),
                                          tax_percentage=Decimal('14'))
        self.dinheiro = PaymentMethod.objects.create(code='DIN', name='Dinheiro',
                                                     method_type='CASH', for_pos=True)
        OutletPaymentMethod.objects.create(outlet=self.outlet, payment_method=self.dinheiro)

        cfg = FiscalConfig.get()
        cfg.company_name, cfg.company_nif = 'Mwana Lodge, Lda.', '5000000000'
        cfg.auto_emit_pos = True
        cfg.save()
        TaxRate.objects.create(code='IVA14', name='IVA 14%', percentage=Decimal('14'),
                               is_default=True, is_active=True)
        from django.utils import timezone
        for codigo, nome in (('FR', 'Fatura-Recibo'), ('FT', 'Fatura')):
            tipo = FiscalDocType.objects.create(code=codigo, name=nome, invoice_type=codigo)
            FiscalSeries.objects.create(code='A', doc_type=tipo, year=timezone.localdate().year,
                                        prefix=codigo, certified=True)

        self.caixa = CashSession.objects.create(outlet=self.outlet,
                                                opening_float=Decimal('10000'),
                                                opened_by='dono_offline',
                                                operator_name='Empregado 1', status='OPEN')
        StockLevel.objects.create(warehouse=self.armazem, item=self.whisky,
                                  quantity_on_hand=Decimal('50'))

    def sincronizar(self, linhas, pagamentos=None, uuid='OFF-0001'):
        corpo = {'tickets': [{
            'client_uuid': uuid, 'outlet': self.outlet.id, 'operator_name': 'Empregado 1',
            'cash_session': self.caixa.id, 'lines': linhas,
            'payments': pagamentos if pagamentos is not None else [
                {'payment_method': self.dinheiro.id, 'amount': '13680.00'}],
        }]}
        return self.client.post('/api/pos/tickets/sync/', corpo, format='json')


class VendaOfflineTests(BalcaoComRedeAbaixo):

    def test_a_venda_offline_entra_com_o_preco_da_casa_e_nao_o_do_terminal(self):
        """O ATAQUE QUE ISTO FECHA: bastava um pedido forjado com `unit_price: 1`
        para o whisky entrar a 1 Kz — e a factura saía assinada com esse valor."""
        r = self.sincronizar([{'item': self.whisky.id, 'quantity': 1, 'unit_price': '1.00'}])
        self.assertEqual(r.status_code, 200, r.content[:300])
        conta = POSTicket.objects.get(client_uuid='OFF-0001')
        linha = conta.lines.get()
        self.assertEqual(linha.unit_price, Decimal('12000.00'),
                         f'A venda entrou a {linha.unit_price} — o preço veio do '
                         f'terminal, não da tabela da casa.')

    def test_a_diferenca_de_preco_fica_dita_a_quem_sincroniza(self):
        """Se não ficasse dita, a diferença aparecia só no fecho de caixa, sem
        ninguém saber de onde vinha."""
        r = self.sincronizar([{'item': self.whisky.id, 'quantity': 1, 'unit_price': '1.00'}])
        ajustes = r.data['synced'][0].get('price_adjusted')
        self.assertTrue(ajustes, 'A sincronização aceitou o preço e não disse nada.')
        self.assertIn('W001', str(ajustes))

    def test_artigo_de_preco_manual_mantem_o_preco_do_terminal(self):
        """O peixe ao quilo e o vinho a copo do dia: o preço não está em tabela
        nenhuma, é o empregado que o diz. Recusá-lo aqui era perder a venda."""
        self.whisky.manual_price = True
        self.whisky.save(update_fields=['manual_price'])
        self.sincronizar([{'item': self.whisky.id, 'quantity': 1, 'unit_price': '9500.00'}])
        conta = POSTicket.objects.get(client_uuid='OFF-0001')
        self.assertEqual(conta.lines.get().unit_price, Decimal('9500.00'))

    def test_a_venda_offline_respeita_o_nivel_de_preco_do_setor(self):
        """A MESMA regra do balcão, porque é o MESMO código (`preco_do_servidor`).
        Se fossem duas cópias, uma ficava para trás — e foi o que aconteceu."""
        from pos.models import PosSector
        ItemPrice.objects.create(item=self.whisky, level=3, price=Decimal('15000'))
        PosSector.objects.create(outlet=self.outlet, name='Esplanada', price_level=3)
        self.sincronizar([{'item': self.whisky.id, 'quantity': 1}])
        conta = POSTicket.objects.get(client_uuid='OFF-0001')
        self.assertEqual(conta.lines.get().unit_price, Decimal('15000.00'))

    def test_a_venda_offline_emite_documento_fiscal(self):
        """O BURACO FISCAL. A conta fechava como PAGA e não era declarada à AGT:
        a venda não existia no SAF-T."""
        self.sincronizar([{'item': self.whisky.id, 'quantity': 1}],
                         pagamentos=[{'payment_method': self.dinheiro.id,
                                      'amount': '13680.00'}])
        conta = POSTicket.objects.get(client_uuid='OFF-0001')
        self.assertEqual(conta.status, 'PAID')
        doc = FiscalDocument.objects.filter(source_module='pos',
                                            source_ref=str(conta.id)).first()
        self.assertIsNotNone(doc, 'A venda offline fechou paga e sem documento fiscal — '
                                  'receita cobrada e não declarada.')
        self.assertEqual(doc.gross_total, conta.grand_total,
                         'O documento não declara o que a venda cobrou.')
        self.assertTrue(doc.invoice_no, 'Documento sem número.')

    def test_a_venda_offline_da_saida_do_stock(self):
        """A mercadoria saiu da prateleira na noite anterior. Se o stock não baixar,
        a contagem seguinte encontra uma falta que ninguém explica."""
        self.sincronizar([{'item': self.whisky.id, 'quantity': 2}],
                         pagamentos=[{'payment_method': self.dinheiro.id,
                                      'amount': '27360.00'}])
        nivel = StockLevel.objects.get(warehouse=self.armazem, item=self.whisky)
        self.assertEqual(nivel.quantity_on_hand, Decimal('48.0000'),
                         f'Ficaram {nivel.quantity_on_hand} de 50 — a venda offline '
                         f'não deu saída das 2 garrafas.')

    def test_a_venda_offline_entra_na_caixa_em_que_foi_feita(self):
        """Sem a sessão de caixa, o dinheiro não entrava no fecho dessa caixa e o
        fecho dava sempre diferença: a venda existia, a entrada não."""
        self.sincronizar([{'item': self.whisky.id, 'quantity': 1}])
        conta = POSTicket.objects.get(client_uuid='OFF-0001')
        self.assertEqual(conta.cash_session_id, self.caixa.id)

    def test_sincronizar_duas_vezes_nao_duplica_a_venda_nem_a_factura(self):
        """A rede volta a cair a meio da sincronização e o terminal reenvia o lote.
        Idempotência: a mesma venda, uma só vez."""
        linhas = [{'item': self.whisky.id, 'quantity': 1}]
        self.sincronizar(linhas)
        r2 = self.sincronizar(linhas)
        self.assertEqual(r2.data['synced'][0]['status'], 'exists')
        self.assertEqual(POSTicket.objects.filter(client_uuid='OFF-0001').count(), 1)
        conta = POSTicket.objects.get(client_uuid='OFF-0001')
        self.assertEqual(FiscalDocument.objects.filter(source_module='pos',
                                                        source_ref=str(conta.id)).count(), 1,
                         'Saíram duas facturas da mesma venda.')
        self.assertEqual(StockLevel.objects.get(warehouse=self.armazem,
                                                 item=self.whisky).quantity_on_hand,
                         Decimal('49.0000'), 'O stock saiu duas vezes.')

    def test_uma_conta_offline_nao_paga_nao_e_facturada(self):
        """Uma conta sincronizada sem pagamento fica ABERTA. Facturá-la era
        declarar à AGT um recebimento que não existiu."""
        self.sincronizar([{'item': self.whisky.id, 'quantity': 1}], pagamentos=[])
        conta = POSTicket.objects.get(client_uuid='OFF-0001')
        self.assertEqual(conta.status, 'OPEN')
        self.assertFalse(FiscalDocument.objects.filter(source_module='pos',
                                                        source_ref=str(conta.id)).exists())


class VendaACreditoTests(BalcaoComRedeAbaixo):
    """A empresa que janta hoje e paga ao fim do mês."""

    def setUp(self):
        super().setUp()
        self.empresa = Customer.objects.create(code='E001', name='Sonangol EP',
                                               tax_id='5417000000',
                                               credit_limit=Decimal('500000'))
        self.corrente = PaymentMethod.objects.create(code='CC', name='Conta Corrente',
                                                     method_type='CREDIT', for_pos=True,
                                                     current_account=True)
        OutletPaymentMethod.objects.create(outlet=self.outlet, payment_method=self.corrente)

    def _conta_com_jantar(self):
        r = self.client.post('/api/pos/tickets/', {
            'outlet': self.outlet.id, 'guest_type': 'PASSANTE',
            'cash_session': self.caixa.id, 'operator_name': 'Empregado 1'}, format='json')
        conta = r.data['id']
        self.client.post(f'/api/pos/tickets/{conta}/add_line/',
                         {'item': self.whisky.id, 'quantity': 1}, format='json')
        return conta

    def test_a_venda_a_credito_liga_a_conta_a_entidade_do_cadastro(self):
        """A LIGAÇÃO, não o nome escrito à mão: é por ela que a dívida chega à
        conta corrente da empresa."""
        conta = self._conta_com_jantar()
        total = self.client.get(f'/api/pos/tickets/{conta}/').data['grand_total']
        r = self.client.post(f'/api/pos/tickets/{conta}/pay/',
                             {'payment_method': self.corrente.id, 'amount': str(total),
                              'customer': self.empresa.id}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:400])
        ticket = POSTicket.objects.get(pk=conta)
        self.assertEqual(ticket.customer_id, self.empresa.id,
                         'A conta fechou a crédito sem ficar ligada à entidade — a '
                         'dívida não aparece na conta corrente de ninguém.')

    def test_a_factura_a_credito_aparece_na_conta_corrente_da_empresa(self):
        """O teste que interessa ao dono: a dívida existe e está em nome de quem a
        contraiu. É esta consulta que o limite de crédito e a cobrança usam."""
        conta = self._conta_com_jantar()
        total = self.client.get(f'/api/pos/tickets/{conta}/').data['grand_total']
        self.client.post(f'/api/pos/tickets/{conta}/pay/',
                         {'payment_method': self.corrente.id, 'amount': str(total),
                          'customer': self.empresa.id}, format='json')
        em_divida = FiscalDocument.objects.filter(customer=self.empresa, settled=False)
        self.assertEqual(em_divida.count(), 1,
                         'A factura da empresa não está na conta corrente dela.')
        self.assertEqual(em_divida.first().gross_total, Decimal(total))

    def test_a_factura_a_credito_nasce_por_receber(self):
        """Uma fatura-recibo diz que o dinheiro entrou. A crédito, não entrou: o
        documento é FATURA (FT) e nasce por receber, senão declara-se à AGT um
        recebimento falso e a conta corrente fica a zero com o cliente a dever."""
        conta = self._conta_com_jantar()
        total = self.client.get(f'/api/pos/tickets/{conta}/').data['grand_total']
        self.client.post(f'/api/pos/tickets/{conta}/pay/',
                         {'payment_method': self.corrente.id, 'amount': str(total),
                          'customer': self.empresa.id}, format='json')
        doc = FiscalDocument.objects.get(customer=self.empresa)
        self.assertFalse(doc.settled)
        self.assertEqual(doc.doc_type.code, 'FT')

    def test_escolher_o_cliente_na_mesa_ja_liga_a_entidade(self):
        """O 👤 do topo do terminal. Quem escolhe aqui a empresa está a dizer quem
        leva a factura — e isso tem de ficar na conta, não só no ecrã."""
        conta = self._conta_com_jantar()
        r = self.client.post(f'/api/pos/tickets/{conta}/set_customer/',
                             {'entity': self.empresa.id}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:300])
        ticket = POSTicket.objects.get(pk=conta)
        self.assertEqual(ticket.customer_id, self.empresa.id)
        self.assertEqual(ticket.customer_name, 'Sonangol EP')
        self.assertEqual(ticket.customer_tax_id, '5417000000')

    def test_a_factura_emitida_a_mao_usa_a_entidade_da_conta(self):
        """O botão de facturar do painel de pagamentos já lia `ticket.customer_id`
        — um campo que não existia, e por isso era sempre vazio. A empresa
        escolhida na mesa não chegava à factura."""
        conta = self._conta_com_jantar()
        self.client.post(f'/api/pos/tickets/{conta}/set_customer/',
                         {'entity': self.empresa.id}, format='json')
        r = self.client.post(f'/api/pos/tickets/{conta}/issue_document/',
                             {'doc_type': 'FT'}, format='json')
        self.assertIn(r.status_code, (200, 201), r.content[:400])
        doc = FiscalDocument.objects.filter(customer=self.empresa).first()
        self.assertIsNotNone(doc, 'A factura saiu sem a entidade que estava na conta.')
