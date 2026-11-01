# -*- coding: utf-8 -*-
"""O DINHEIRO DO HOTEL TEM DE CHEGAR AO RAZÃO E À TESOURARIA.

Dois buracos, e o primeiro é o maior deste sistema:

 1. **A receita de alojamento nunca era lançada.** O lote automático da
    contabilidade conhecia três origens — POS, compras e tesouraria — e o PMS
    não era nenhuma delas. Num hotel, o alojamento é a maior receita de todas:
    o balancete e a demonstração de resultados mostravam a casa como se ela só
    vendesse comida e bebida.

 2. **O pagamento do hóspede não entrava em caixa nenhuma.** A conta fechava a
    zero, o check-out passava, e a tesouraria não via nada.

A ordem dos dois lançamentos é o que os torna correctos, e é o que estes testes
guardam: a factura nasce como DÍVIDA do hóspede; o pagamento é o segundo
momento, que baixa a dívida e põe o dinheiro na conta. Trocar isto — lançar o
dinheiro sem a dívida — criava um crédito a clientes que nunca existiu.
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APITestCase

from accounting.models import JournalEntry
from accounting.posting import post_pms_invoice
from finance.models import FinanceAccount, Receipt
from fiscal.models import FiscalDocType, FiscalDocument, FiscalSeries
from identity.models import Company, EnterpriseGroup, Hotel
from mdm.models import Customer, PaymentMethod
from pms.models import Folio, FolioCharge, Reservation, RoomType
from pms.tesouraria import lancar_pagamento_de_folio


class ODinheiroDoHotelChegaAoRazao(APITestCase):

    def setUp(self):
        self.user = User.objects.create_superuser('pms_tes', '', 'x')
        self.client.force_authenticate(self.user)
        call_command('seed_accounting')          # plano de contas PGC-AO

        grupo = EnterpriseGroup.objects.create(name='Grupo')
        empresa = Company.objects.create(group=grupo, name='Empresa', tax_id='5000000000')
        self.hotel = Hotel.objects.create(company=empresa, name='Hotel Teste')
        self.hospede = Customer.objects.create(code='H1', name='Hospede Teste')

        self.caixa = FinanceAccount.objects.create(
            hotel=self.hotel, code='CX', name='Caixa', account_type='CASH')
        self.dinheiro = PaymentMethod.objects.create(
            code='NUM', name='Numerário', method_type='CASH', treasury_account=self.caixa)
        self.sem_conta = PaymentMethod.objects.create(
            code='VCH', name='Voucher', method_type='VOUCHER')

        rt = RoomType.objects.create(hotel=self.hotel, code='STD', name='Standard', base_rate=30000)
        self.reserva = Reservation.objects.create(
            hotel=self.hotel, guest=self.hospede, room_type=rt,
            check_in=date.today(), check_out=date.today(), adults=1)
        self.folio = Folio.objects.create(reservation=self.reserva, number='F1')

    def _factura(self, bruto, liquido, imposto, rectifica=False):
        tipo = FiscalDocType.objects.create(
            code='NC' if rectifica else 'FT', name='Nota de crédito' if rectifica else 'Factura',
            is_rectifying=rectifica)
        serie = FiscalSeries.objects.create(code='A%s' % FiscalSeries.objects.count(),
                                            doc_type=tipo, year=date.today().year)
        return FiscalDocument.objects.create(
            hotel=self.hotel, series=serie, doc_type=tipo,
            number=FiscalDocument.objects.count() + 1,
            invoice_no='%s A/%d' % (tipo.code, FiscalDocument.objects.count() + 1),
            doc_date=date.today(), system_entry_date=timezone.now(),
            customer_name='Hospede Teste', source_module='pms',
            net_total=Decimal(liquido), tax_total=Decimal(imposto), gross_total=Decimal(bruto))

    # ------------------------------------------------------------------
    def test_a_factura_do_hotel_nasce_como_divida_do_hospede(self):
        doc = self._factura('114000', '100000', '14000')

        self.assertIsNotNone(post_pms_invoice(doc), 'a factura do PMS não foi lançada')

        entry = JournalEntry.objects.get(source='PMS', reference=doc.invoice_no)
        contas = {l.account.code: (l.debit, l.credit) for l in entry.lines.all()}
        self.assertEqual(contas['211'][0], Decimal('114000'), 'clientes a débito pelo total')
        self.assertEqual(contas['622'][1], Decimal('100000'), 'a receita a crédito, sem IVA')
        self.assertEqual(contas['2431'][1], Decimal('14000'), 'o IVA a crédito')

    def test_a_mesma_factura_nao_se_lanca_duas_vezes(self):
        doc = self._factura('114000', '100000', '14000')
        post_pms_invoice(doc)
        self.assertIsNone(post_pms_invoice(doc), 'lançou a mesma factura outra vez')
        self.assertEqual(JournalEntry.objects.filter(source='PMS').count(), 1)

    def test_a_nota_de_credito_desfaz_a_divida_e_a_receita(self):
        nc = self._factura('114000', '100000', '14000', rectifica=True)
        post_pms_invoice(nc)
        entry = JournalEntry.objects.get(source='PMS', reference=nc.invoice_no)
        contas = {l.account.code: (l.debit, l.credit) for l in entry.lines.all()}
        self.assertEqual(contas['211'][1], Decimal('114000'), 'a dívida tinha de sair a crédito')
        self.assertEqual(contas['622'][0], Decimal('100000'), 'a receita tinha de sair a débito')

    # ------------------------------------------------------------------
    def test_o_pagamento_do_hospede_entra_na_tesouraria(self):
        encargo = FolioCharge.objects.create(
            folio=self.folio, charge_type='PAYMENT', description='Pagamento',
            amount=Decimal('50000'), payment_method=self.dinheiro)

        recebimento, motivo = lancar_pagamento_de_folio(encargo)

        self.assertIsNotNone(recebimento, motivo)
        self.assertEqual(recebimento.account_id, self.caixa.id)
        self.assertEqual(recebimento.amount, Decimal('50000'))
        self.assertEqual(recebimento.source_module, 'pms')

    def test_o_pagamento_baixa_a_divida_do_hospede_e_nao_a_caixa_do_pos(self):
        """É o contrário do POS, onde a venda é a pronto.

        No hotel a factura nasce como dívida; o pagamento liquida-a. Creditar a
        Caixa POS aqui deixava a dívida do hóspede aberta para sempre e uma
        conta de caixa do restaurante a encolher sem razão.
        """
        encargo = FolioCharge.objects.create(
            folio=self.folio, charge_type='PAYMENT', description='Pagamento',
            amount=Decimal('50000'), payment_method=self.dinheiro)
        recebimento, _ = lancar_pagamento_de_folio(encargo)

        entry = JournalEntry.objects.get(source='TREASURY', reference=f'REC-{recebimento.number}')
        contas = {l.account.code: (l.debit, l.credit) for l in entry.lines.all()}
        self.assertEqual(contas['111'][0], Decimal('50000'), 'o dinheiro entra no caixa')
        self.assertEqual(contas['211'][1], Decimal('50000'), 'e baixa a dívida do hóspede')
        self.assertNotIn('112', contas, 'não é a Caixa POS — a venda do hotel não é a pronto')

    def test_lancar_o_mesmo_pagamento_outra_vez_nao_repete_o_dinheiro(self):
        encargo = FolioCharge.objects.create(
            folio=self.folio, charge_type='PAYMENT', description='Pagamento',
            amount=Decimal('50000'), payment_method=self.dinheiro)
        lancar_pagamento_de_folio(encargo)
        segundo, motivo = lancar_pagamento_de_folio(encargo)

        self.assertEqual(motivo, 'já tinha dado entrada')
        self.assertEqual(Receipt.objects.filter(source_module='pms').count(), 1)
        self.assertEqual(segundo.amount, Decimal('50000'))

    def test_sem_conta_configurada_nao_inventa_conta_mas_diz_porque(self):
        encargo = FolioCharge.objects.create(
            folio=self.folio, charge_type='PAYMENT', description='Pagamento',
            amount=Decimal('9000'), payment_method=self.sem_conta)

        recebimento, motivo = lancar_pagamento_de_folio(encargo)

        self.assertIsNone(recebimento)
        self.assertIn('Voucher', motivo)
        self.assertEqual(Receipt.objects.count(), 0)

    def test_um_pagamento_anulado_nao_e_dinheiro(self):
        encargo = FolioCharge.objects.create(
            folio=self.folio, charge_type='PAYMENT', description='Pagamento',
            amount=Decimal('9000'), payment_method=self.dinheiro, is_void=True)

        recebimento, _ = lancar_pagamento_de_folio(encargo)

        self.assertIsNone(recebimento)
        self.assertEqual(Receipt.objects.count(), 0)
