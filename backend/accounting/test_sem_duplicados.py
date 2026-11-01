# -*- coding: utf-8 -*-
"""O RAZÃO NÃO PODE LANÇAR A MESMA ORIGEM DUAS VEZES.

O lançamento automático é um LOTE: passa por todos os documentos pendentes e
lança os que ainda não foram. Corre quando alguém carrega no botão, e pode
correr outra vez cinco minutos depois — por um segundo utilizador, por um
agendador, ou simplesmente porque a primeira passagem pareceu não responder.

Se a segunda passagem voltasse a lançar, duplicava a receita e o IVA do
exercício. Não é um erro que se vê no ecrã: vê-se na declaração, quando o
imposto a pagar sai ao dobro.

A defesa é a chave de origem — cada lançamento guarda DE ONDE veio (`source`) e
QUAL documento (`reference`), e o motor recusa um segundo com o mesmo par. Este
teste corre o lote duas vezes e exige que o razão fique igual.

Guarda as quatro origens ao mesmo tempo, incluindo a do PMS, que é nova: uma
origem acrescentada sem esta trava passaria despercebida até ao fecho do ano.
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APITestCase

from accounting.models import JournalEntry
from accounting.posting import run_autopost
from finance.models import FinanceAccount, Receipt
from fiscal.models import FiscalDocType, FiscalDocument, FiscalSeries
from identity.models import Company, EnterpriseGroup, Hotel
from mdm.models import PaymentMethod
from pos.models import CashSession, Outlet, POSTicket, POSTicketPayment


class OLoteNaoDuplica(APITestCase):

    def setUp(self):
        self.user = User.objects.create_superuser('contab', '', 'x')
        self.client.force_authenticate(self.user)
        call_command('seed_accounting')

        grupo = EnterpriseGroup.objects.create(name='Grupo')
        empresa = Company.objects.create(group=grupo, name='Empresa', tax_id='5000000000')
        self.hotel = Hotel.objects.create(company=empresa, name='Hotel')
        self.outlet = Outlet.objects.create(hotel=self.hotel, code='REST', name='Restaurante')
        conta = FinanceAccount.objects.create(
            hotel=self.hotel, code='CX', name='Caixa', account_type='CASH')
        metodo = PaymentMethod.objects.create(
            code='NUM', name='Numerário', method_type='CASH', treasury_account=conta)

        # Uma venda do POS.
        sessao = CashSession.objects.create(outlet=self.outlet, operator_name='Ana')
        t = POSTicket.objects.create(
            ticket_number='T1', outlet=self.outlet, operator_name='Ana', status='PAID',
            grand_total=Decimal('11400'), subtotal=Decimal('11400'),
            cash_session=sessao, closed_at=timezone.now())
        POSTicketPayment.objects.create(ticket=t, payment_method=metodo, amount=Decimal('11400'))

        # Uma factura do hotel.
        tipo = FiscalDocType.objects.create(code='FT', name='Factura')
        serie = FiscalSeries.objects.create(code='A', doc_type=tipo, year=date.today().year)
        FiscalDocument.objects.create(
            hotel=self.hotel, series=serie, doc_type=tipo, number=1, invoice_no='FT A/1',
            doc_date=date.today(), system_entry_date=timezone.now(),
            customer_name='Hóspede', source_module='pms',
            net_total=Decimal('100000'), tax_total=Decimal('14000'), gross_total=Decimal('114000'))

        # Um recebimento na tesouraria.
        Receipt.objects.create(
            number='R1', account=conta, party_name='Cliente', amount=Decimal('5000'),
            date=date.today(), status='CONFIRMED')

    def test_correr_o_lote_duas_vezes_nao_duplica_nada(self):
        run_autopost(by='contab')
        depois_da_primeira = JournalEntry.objects.count()
        self.assertGreaterEqual(depois_da_primeira, 3,
                                'o lote não lançou as origens todas (POS, PMS, tesouraria)')

        run_autopost(by='contab')

        self.assertEqual(JournalEntry.objects.count(), depois_da_primeira,
                         'a segunda passagem duplicou lançamentos — a receita e o IVA do '
                         'exercício sairiam ao dobro na declaração')

    def test_cada_documento_tem_um_lancamento_e_so_um(self):
        run_autopost(by='contab')
        run_autopost(by='contab')

        vistos = set()
        for e in JournalEntry.objects.exclude(status='REVERSED'):
            chave = (e.source, e.reference)
            self.assertNotIn(chave, vistos,
                             'o documento %s da origem %s foi lançado duas vezes'
                             % (e.reference, e.source))
            vistos.add(chave)

    def test_a_origem_pms_entrou_mesmo_no_lote(self):
        """Uma origem acrescentada e esquecida no lote não lança nada — e isso
        não dá erro nenhum: o documento fica pendente para sempre."""
        run_autopost(by='contab')
        self.assertTrue(JournalEntry.objects.filter(source='PMS', reference='FT A/1').exists(),
                        'a factura do hotel não foi lançada pelo lote automático')
