# -*- coding: utf-8 -*-
"""O DINHEIRO DO POS TEM DE CHEGAR À TESOURARIA — e chegar UMA vez.

Na base de demonstração havia 340 talões vendidos, 61 caixas fechadas e 185
documentos fiscais. Na tesouraria: quatro recebimentos, todos escritos à mão.
Nenhuma venda do POS lá chegava — e o ecrã Financeiro mostrava "Saldo" com ar de
resumo financeiro da casa quando era o saldo de um caderno.

Estes testes exercitam o fecho de caixa a sério e exigem três coisas, por esta
ordem de gravidade:

 1. o dinheiro ENTRA, na conta certa de cada meio de pagamento;
 2. NÃO entra duas vezes — fechar a mesma caixa outra vez não repete nada;
 3. a contabilidade lança a TRANSFERÊNCIA e não uma receita nova. A venda já foi
    lançada quando o talão fechou; contá-la outra vez inflaciona o resultado do
    exercício, e isso é um erro que se paga ao Estado.

E duas que evitam inventar dinheiro: um meio sem conta configurada não lança
(mas é denunciado), e uma conta-quarto não entra em caixa nenhuma — ainda não
foi paga.
"""
from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from accounting.models import JournalEntry
from finance.models import FinanceAccount, Receipt
from identity.models import Company, EnterpriseGroup, Hotel
from mdm.models import PaymentMethod
from pos.models import CashSession, Outlet, POSTicket, POSTicketPayment
from pos.tesouraria import lancar_fecho_de_caixa


class FechoDeCaixaDaEntradaNaTesouraria(APITestCase):

    def setUp(self):
        self.user = User.objects.create_superuser('caixa_test', '', 'x')
        self.client.force_authenticate(self.user)

        grupo = EnterpriseGroup.objects.create(name='Grupo')
        empresa = Company.objects.create(group=grupo, name='Empresa', tax_id='5000000000')
        self.hotel = Hotel.objects.create(company=empresa, name='Hotel Teste')
        self.outlet = Outlet.objects.create(hotel=self.hotel, code='REST', name='Restaurante')

        self.caixa_conta = FinanceAccount.objects.create(
            hotel=self.hotel, code='CX', name='Caixa Central', account_type='CASH')
        self.banco = FinanceAccount.objects.create(
            hotel=self.hotel, code='BK', name='Banco', account_type='BANK')

        self.dinheiro = PaymentMethod.objects.create(
            code='NUM', name='Numerário', method_type='CASH', treasury_account=self.caixa_conta)
        self.tpa = PaymentMethod.objects.create(
            code='TPA', name='Multicaixa', method_type='CARD', treasury_account=self.banco)
        # De propósito SEM conta: é o caso que não pode inventar uma.
        self.voucher = PaymentMethod.objects.create(
            code='VCH', name='Voucher', method_type='VOUCHER')
        self.quarto = PaymentMethod.objects.create(
            code='QRT', name='Conta Quarto', method_type='ROOM', treasury_account=self.caixa_conta)

        self.sessao = CashSession.objects.create(
            outlet=self.outlet, operator_name='Ana', opening_float=Decimal('5000'))

    def _talao(self, total, pagamentos):
        t = POSTicket.objects.create(
            ticket_number='T%03d' % POSTicket.objects.count(), outlet=self.outlet,
            operator_name='Ana', status='PAID', grand_total=Decimal(total),
            subtotal=Decimal(total), cash_session=self.sessao)
        for metodo, valor in pagamentos:
            POSTicketPayment.objects.create(ticket=t, payment_method=metodo, amount=Decimal(valor))
        return t

    # ------------------------------------------------------------------
    def test_o_dinheiro_entra_na_conta_de_cada_meio_de_pagamento(self):
        self._talao('10000', [(self.dinheiro, '10000')])
        self._talao('25000', [(self.tpa, '25000')])
        self._talao('8000', [(self.dinheiro, '3000'), (self.tpa, '5000')])

        lancados, por_configurar = lancar_fecho_de_caixa(self.sessao)

        self.assertEqual(len(lancados), 2, 'devia lançar um recebimento por meio de pagamento')
        self.assertEqual(por_configurar, [])

        por_conta = {r.account_id: r.amount for r in lancados}
        self.assertEqual(por_conta[self.caixa_conta.id], Decimal('13000'),
                         'o numerário não foi todo para o caixa')
        self.assertEqual(por_conta[self.banco.id], Decimal('30000'),
                         'o cartão não foi todo para o banco')

    def test_fechar_a_mesma_caixa_outra_vez_nao_repete_o_dinheiro(self):
        """Duplo clique, retry de rede, o agendador em cima de alguém."""
        self._talao('10000', [(self.dinheiro, '10000')])
        lancar_fecho_de_caixa(self.sessao)
        segunda, _ = lancar_fecho_de_caixa(self.sessao)

        self.assertEqual(segunda, [], 'a segunda passagem criou recebimentos a mais')
        self.assertEqual(Receipt.objects.filter(source_module='pos').count(), 1)
        self.assertEqual(
            Receipt.objects.filter(source_module='pos').first().amount, Decimal('10000'))

    def test_um_meio_sem_conta_configurada_nao_inventa_conta(self):
        """Dinheiro na conta errada é pior do que dinheiro por lançar: o segundo
        vê-se no fecho, o primeiro só aparece na reconciliação, meses depois."""
        self._talao('4000', [(self.voucher, '4000')])

        lancados, por_configurar = lancar_fecho_de_caixa(self.sessao)

        self.assertEqual(lancados, [])
        self.assertEqual(por_configurar, [('Voucher', Decimal('4000'))],
                         'o fecho tem de DIZER o que ficou por lançar')

    def test_uma_conta_quarto_nao_entra_em_caixa_nenhuma(self):
        """Passa para o folio e é cobrada no check-out. Dar-lhe entrada aqui era
        inventar um recebimento que não houve — e voltar a recebê-lo depois."""
        self._talao('30000', [(self.quarto, '30000')])

        lancados, por_configurar = lancar_fecho_de_caixa(self.sessao)

        self.assertEqual(lancados, [])
        self.assertEqual(por_configurar, [])

    def test_a_contabilidade_lanca_transferencia_e_nao_receita_nova(self):
        """A venda já foi lançada quando o talão fechou.

        Se o fecho a lançasse outra vez como recebimento de cliente, creditava
        CLIENTES por uma dívida que nunca existiu (a venda foi a pronto) e
        deixava a Caixa POS a crescer para sempre. O balancete batia no total e
        mentia em duas contas.
        """
        from django.core.management import call_command
        call_command('seed_accounting')   # plano de contas PGC-AO

        self._talao('10000', [(self.dinheiro, '10000')])
        lancados, _ = lancar_fecho_de_caixa(self.sessao)
        self.assertEqual(len(lancados), 1)

        entry = JournalEntry.objects.filter(source='TREASURY').first()
        self.assertIsNotNone(entry, 'o recebimento do fecho não chegou ao razão')
        contas = {l.account.code: (l.debit, l.credit) for l in entry.lines.all()}

        # A débito, o dinheiro que entrou no caixa físico (111).
        self.assertIn('111', contas)
        self.assertEqual(contas['111'][0], Decimal('10000'))
        # A crédito, a Caixa POS (112) — e NÃO os clientes (211).
        self.assertIn('112', contas, 'a contrapartida devia ser a Caixa POS')
        self.assertEqual(contas['112'][1], Decimal('10000'))
        self.assertNotIn('211', contas,
                         'creditou CLIENTES por uma dívida que nunca existiu — '
                         'a venda do POS é a pronto')
