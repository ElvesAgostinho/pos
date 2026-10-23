# -*- coding: utf-8 -*-
"""O DINHEIRO — contado duas vezes, como se conta na vida.

Esta app mexe em dinheiro que existe: o que está na caixa, o que entrou do
cliente, o que saiu para o fornecedor. Até hoje não tinha um único teste. Um
erro aqui não dá ecrã branco nem mensagem nenhuma — dá uma caixa que fecha com
menos dinheiro do que o sistema diz, ou um fornecedor pago duas vezes sem que
ninguém perceba antes do fecho do mês.

Por isso os testes aqui seguem sempre a mesma regra: fazer a operação PELA API
(a mesma porta que o ecrã usa) e depois CONTAR o dinheiro. Não basta o pedido
devolver 200 — tem de ficar o valor certo na conta certa.

Leitura: o nome do teste diz o que a casa espera; a mensagem do `assert` diz o
que se perdeu quando falha.
"""
from decimal import Decimal

from django.contrib.auth.models import User
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from identity.models import Company, EnterpriseGroup, Hotel

from .models import (BankReconciliation, CostCenter, FinanceAccount, Invoice,
                     InvoiceLine, PaymentVoucher, Receipt, SupplierInvoice)


class TesourariaMontada(APITestCase):
    """O mínimo para haver tesouraria: uma empresa, um hotel, uma caixa e um banco.

    A caixa abre com 500.000 Kz de fundo — é o "opening_balance", o dinheiro que
    já lá estava antes de o sistema existir. Tudo o que os testes somam e subtraem
    parte deste número.
    """

    def setUp(self):
        self.user = User.objects.create_superuser('dono_financeiro', '', 'x')
        self.client.force_authenticate(self.user)

        grupo = EnterpriseGroup.objects.create(name='Grupo Principal')
        empresa = Company.objects.create(group=grupo, name='Mwana Lodge, Lda.', tax_id='5000000000')
        self.hotel = Hotel.objects.create(company=empresa, name='Mwana Lodge', is_master=True)

        self.caixa = FinanceAccount.objects.create(
            hotel=self.hotel, code='CX01', name='Caixa Recepção',
            account_type='CASH', opening_balance=Decimal('500000.00'))
        self.banco = FinanceAccount.objects.create(
            hotel=self.hotel, code='BC01', name='BAI · Conta à Ordem',
            account_type='BANK', opening_balance=Decimal('0.00'))

        self.cc_restaurante = CostCenter.objects.create(
            hotel=self.hotel, code='REST', name='Restaurante')
        self.hoje = timezone.localdate()

    # ---------------------------------------------------------------- utilidades
    def _recebimento(self, conta=None, valor='10000.00', estado='DRAFT', **extra):
        return Receipt.objects.create(
            number=extra.pop('number', f'REC-T{Receipt.objects.count() + 1:04d}'),
            account=conta or self.caixa, party_name=extra.pop('party_name', 'Cliente Balcão'),
            amount=Decimal(valor), date=self.hoje, status=estado, **extra)

    def _pagamento(self, conta=None, valor='10000.00', estado='DRAFT', **extra):
        return PaymentVoucher.objects.create(
            number=extra.pop('number', f'PAG-T{PaymentVoucher.objects.count() + 1:04d}'),
            account=conta or self.caixa, party_name=extra.pop('party_name', 'Fornecedor'),
            amount=Decimal(valor), date=self.hoje, status=estado, **extra)

    def _fatura_emitida(self, quantidade='2', preco='50000.00', iva='14.00', cliente='Sonangol, SA'):
        """Uma fatura de cliente já emitida, pelo caminho da API (é como o ecrã faz)."""
        r = self.client.post('/api/finance/invoices/', {
            'customer_name': cliente, 'date': str(self.hoje),
            'lines': [{'description': 'Alojamento', 'quantity': quantidade,
                       'unit_price': preco, 'tax_percentage': iva}],
        }, format='json')
        self.assertEqual(r.status_code, 201, f'não consegui criar a fatura: {r.data}')
        inv_id = r.data['id']
        r2 = self.client.post(f'/api/finance/invoices/{inv_id}/issue/', {}, format='json')
        self.assertEqual(r2.status_code, 200, f'não consegui emitir a fatura: {r2.data}')
        return Invoice.objects.get(pk=inv_id)


# ==========================================================================
# CONTAS DE TESOURARIA — o saldo é a soma dos movimentos, não um número guardado
# ==========================================================================
class ContasDeTesouraria(TesourariaMontada):

    def test_saldo_e_o_fundo_mais_o_que_entrou_menos_o_que_saiu(self):
        """O saldo tem de ser reconstruível a partir dos movimentos.

        Se o saldo fosse um campo guardado, qualquer falha a meio de uma gravação
        deixava a conta com um número que não corresponde a movimento nenhum —
        e ninguém consegue explicar a diferença ao dono. Aqui recalcula-se sempre.
        """
        self._recebimento(valor='100000.00', estado='CONFIRMED')
        self._pagamento(valor='30000.00', estado='CONFIRMED')
        self.assertEqual(
            self.caixa.balance, Decimal('570000.00'),
            'O saldo da caixa não é o fundo (500.000) + recebido (100.000) − pago (30.000).')

    def test_movimentos_em_rascunho_nao_contam_para_o_saldo(self):
        """Um recebimento em rascunho é uma intenção, não é dinheiro na gaveta.

        Se contasse, o ecrã mostrava dinheiro que ninguém entregou — e o empregado
        fechava a caixa a faltar.
        """
        self._recebimento(valor='250000.00', estado='DRAFT')
        self._pagamento(valor='80000.00', estado='DRAFT')
        self.assertEqual(self.caixa.balance, Decimal('500000.00'),
                         'Movimentos em RASCUNHO estão a mexer no saldo da conta.')

    def test_movimentos_anulados_saem_do_saldo(self):
        """Anular devolve o dinheiro ao saldo — senão a caixa fica com um buraco."""
        rec = self._recebimento(valor='100000.00', estado='CONFIRMED')
        self.client.post(f'/api/finance/receipts/{rec.id}/cancel/', {}, format='json')
        self.assertEqual(self.caixa.balance, Decimal('500000.00'),
                         'Um recebimento anulado continua a somar ao saldo.')

    def test_cada_conta_tem_o_seu_proprio_saldo(self):
        """Dinheiro na caixa não é dinheiro no banco.

        É o erro clássico de somar tudo num só número: o dono vê saldo que tem,
        mas não no sítio onde precisa dele para pagar.
        """
        self._recebimento(conta=self.banco, valor='900000.00', estado='CONFIRMED')
        self.assertEqual(self.banco.balance, Decimal('900000.00'))
        self.assertEqual(self.caixa.balance, Decimal('500000.00'),
                         'Um recebimento no banco mexeu no saldo da caixa.')

    def test_api_devolve_o_saldo_calculado_junto_com_a_conta(self):
        """O ecrã das contas mostra o saldo; tem de vir já calculado da API."""
        self._recebimento(valor='1000.00', estado='CONFIRMED')
        r = self.client.get(f'/api/finance/accounts/{self.caixa.id}/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(Decimal(str(r.data['balance'])), Decimal('501000.00'),
                         'A API da conta não devolve o saldo real.')

    def test_saldos_para_reconciliacao_dizem_sempre_a_moeda(self):
        """MOEDAS: cada conta tem a sua moeda e o sistema NÃO converte nada.

        Não existe tabela de câmbios em sítio nenhum do sistema (ver relatório).
        Enquanto não existir, a única defesa é o ecrã nunca somar contas de moedas
        diferentes — e para isso a moeda tem de vir em cada linha. Se um dia a
        moeda deixar de vir, alguém vai somar dólares com kwanzas num único total.
        """
        FinanceAccount.objects.create(hotel=self.hotel, code='USD1', name='Conta USD',
                                      account_type='BANK', currency='USD',
                                      opening_balance=Decimal('1000.00'))
        r = self.client.get('/api/finance/account-balances/')
        self.assertEqual(r.status_code, 200)
        moedas = {linha['code']: linha['currency'] for linha in r.data['accounts']}
        self.assertEqual(moedas.get('USD1'), 'USD', 'A conta em dólares não diz que é em dólares.')
        self.assertEqual(moedas.get('CX01'), 'AOA')
        self.assertNotIn('total', r.data,
                         'A API está a somar um total único com contas de moedas diferentes.')


# ==========================================================================
# RECEBIMENTOS E PAGAMENTOS — dinheiro a entrar e a sair
# ==========================================================================
class RecebimentosEPagamentos(TesourariaMontada):

    def test_recebimento_criado_pela_api_recebe_numero_automatico(self):
        """O recibo tem de ter número; o empregado não o inventa à mão."""
        r = self.client.post('/api/finance/receipts/', {
            'account': self.caixa.id, 'party_name': 'Cliente Balcão',
            'amount': '15000.00', 'date': str(self.hoje),
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertTrue(r.data['number'].startswith('REC-'),
                        f"Recebimento ficou sem numeração própria: {r.data['number']}")

    def test_recebimento_nasce_em_rascunho_e_so_conta_depois_de_confirmado(self):
        """Confirmar é o acto de dizer "o dinheiro está cá". Antes disso, não está."""
        r = self.client.post('/api/finance/receipts/', {
            'account': self.caixa.id, 'party_name': 'Cliente', 'amount': '20000.00',
            'date': str(self.hoje)}, format='json')
        self.assertEqual(r.data['status'], 'DRAFT')
        self.assertEqual(self.caixa.balance, Decimal('500000.00'))

        self.client.post(f"/api/finance/receipts/{r.data['id']}/confirm/", {}, format='json')
        self.assertEqual(self.caixa.balance, Decimal('520000.00'),
                         'Confirmar o recebimento não pôs o dinheiro na caixa.')

    def test_recebimento_nao_se_confirma_duas_vezes(self):
        """Dois cliques em "Confirmar" não podem valer dinheiro a dobrar."""
        rec = self._recebimento(valor='20000.00')
        p1 = self.client.post(f'/api/finance/receipts/{rec.id}/confirm/', {}, format='json')
        p2 = self.client.post(f'/api/finance/receipts/{rec.id}/confirm/', {}, format='json')
        self.assertEqual(p1.status_code, 200)
        self.assertEqual(p2.status_code, 400, 'O mesmo recebimento foi confirmado duas vezes.')
        self.assertEqual(self.caixa.balance, Decimal('520000.00'))

    def test_pagamento_acima_do_saldo_da_conta_e_recusado(self):
        """Não se paga com dinheiro que não existe na conta.

        Uma caixa não pode ficar negativa: ou o dinheiro está lá, ou o pagamento
        sai de outra conta. Deixar passar é esconder um descoberto.
        """
        pag = self._pagamento(valor='900000.00')
        r = self.client.post(f'/api/finance/payments/{pag.id}/confirm/', {}, format='json')
        self.assertEqual(r.status_code, 409,
                         'Deixou pagar 900.000 Kz de uma caixa que só tem 500.000.')
        self.assertEqual(self.caixa.balance, Decimal('500000.00'))

    def test_pagamento_dentro_do_saldo_sai_da_conta(self):
        pag = self._pagamento(valor='120000.00', cost_center=self.cc_restaurante)
        r = self.client.post(f'/api/finance/payments/{pag.id}/confirm/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(self.caixa.balance, Decimal('380000.00'),
                         'O pagamento confirmado não saiu do saldo da caixa.')

    def test_valor_zero_nao_e_um_movimento_de_dinheiro(self):
        """Um recibo de 0 Kz é um documento sem conteúdo — polui o extrato e a
        conta corrente do cliente sem mexer em dinheiro nenhum."""
        r = self.client.post('/api/finance/receipts/', {
            'account': self.caixa.id, 'party_name': 'Cliente', 'amount': '0',
            'date': str(self.hoje)}, format='json')
        self.assertEqual(r.status_code, 400, 'Aceitou um recebimento de valor zero.')

    def test_recebimento_negativo_nao_pode_tirar_dinheiro_da_caixa(self):
        """Um valor negativo num RECEBIMENTO é uma saída disfarçada.

        Passava pela porta dos recebimentos, que não tem controlo de saldo nenhum,
        e tirava dinheiro da caixa sem deixar um pagamento no extrato — exactamente
        a forma de fazer desaparecer dinheiro sem rasto.
        """
        r = self.client.post('/api/finance/receipts/', {
            'account': self.caixa.id, 'party_name': 'Cliente', 'amount': '-50000.00',
            'date': str(self.hoje)}, format='json')
        self.assertEqual(r.status_code, 400, 'Aceitou um recebimento de valor negativo.')

    def test_pagamento_negativo_nao_pode_criar_dinheiro(self):
        """Um pagamento negativo é dinheiro vindo do nada — e passa ao lado do
        controlo de saldo (−50.000 nunca é "maior que o saldo")."""
        r = self.client.post('/api/finance/payments/', {
            'account': self.caixa.id, 'party_name': 'Fornecedor', 'amount': '-50000.00',
            'date': str(self.hoje)}, format='json')
        self.assertEqual(r.status_code, 400, 'Aceitou um pagamento de valor negativo.')

    def test_centro_de_custo_fica_colado_ao_pagamento(self):
        """Sem centro de custo não há como saber que a despesa foi do Restaurante."""
        pag = self._pagamento(valor='10000.00', cost_center=self.cc_restaurante)
        r = self.client.get(f'/api/finance/payments/{pag.id}/')
        self.assertEqual(r.data['cost_center'], self.cc_restaurante.id,
                         'O pagamento perdeu o centro de custo.')


# ==========================================================================
# FATURAS A CLIENTES (contas a receber) e CONTA CORRENTE
# ==========================================================================
class FaturacaoAClientes(TesourariaMontada):

    def test_fatura_calcula_subtotal_iva_e_total_a_partir_das_linhas(self):
        """O total nunca é escrito à mão: é sempre recalculado das linhas.

        2 × 50.000 = 100.000 + 14% de IVA = 114.000. Um cêntimo de diferença aqui
        é uma fatura que a AGT não aceita.
        """
        inv = self._fatura_emitida()
        self.assertEqual(inv.subtotal, Decimal('100000.00'))
        self.assertEqual(inv.tax_total, Decimal('14000.00'), 'O IVA de 14% não foi calculado.')
        self.assertEqual(inv.total, Decimal('114000.00'), 'O total da fatura está errado.')

    def test_linha_recalcula_o_seu_total_mesmo_que_o_cliente_o_mande_errado(self):
        """Se o cliente (ecrã, script, integração) mandar um total de linha errado,
        o servidor manda — senão o preço da fatura passa a ser o que o cliente disser."""
        r = self.client.post('/api/finance/invoices/', {
            'customer_name': 'Teste', 'date': str(self.hoje),
            'lines': [{'description': 'X', 'quantity': '3', 'unit_price': '1000.00',
                       'tax_percentage': '0', 'line_total': '1.00'}],
        }, format='json')
        linha = InvoiceLine.objects.get(invoice_id=r.data['id'])
        self.assertEqual(linha.line_total, Decimal('3000.00'),
                         'O total da linha veio do cliente em vez de ser calculado.')

    def test_fatura_so_se_emite_uma_vez(self):
        """Emitir é irreversível (gera documento fiscal). Duas emissões = duas
        faturas reais para a mesma venda."""
        inv = self._fatura_emitida()
        r = self.client.post(f'/api/finance/invoices/{inv.id}/issue/', {}, format='json')
        self.assertEqual(r.status_code, 400, 'A mesma fatura foi emitida duas vezes.')

    def test_recebimento_parcial_deixa_a_fatura_parcial_e_o_resto_em_divida(self):
        """O cliente pagou metade: a fatura não está paga, e o que falta tem de
        continuar a aparecer como dívida."""
        inv = self._fatura_emitida()
        r = self.client.post(f'/api/finance/invoices/{inv.id}/receive/',
                             {'account': self.caixa.id, 'amount': '14000.00'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        inv.refresh_from_db()
        self.assertEqual(inv.status, 'PARTIAL', 'Um recebimento parcial não deixou a fatura PARCIAL.')
        self.assertEqual(inv.balance, Decimal('100000.00'), 'O que falta receber está errado.')
        self.assertEqual(self.caixa.balance, Decimal('514000.00'),
                         'O recebimento parcial não entrou na caixa.')

    def test_recebimento_total_marca_a_fatura_paga(self):
        inv = self._fatura_emitida()
        r = self.client.post(f'/api/finance/invoices/{inv.id}/receive/',
                             {'account': self.caixa.id}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        inv.refresh_from_db()
        self.assertEqual(inv.status, 'PAID', 'A fatura recebida por inteiro não ficou PAGA.')
        self.assertEqual(inv.balance, Decimal('0.00'))

    def test_nao_se_recebe_mais_do_que_a_fatura_vale(self):
        """Receber acima do saldo da fatura é dinheiro sem documento.

        Fica na caixa (o saldo sobe) mas a conta corrente do cliente passa a
        NEGATIVA, e ninguém sabe a quem pertence aquele excesso: é adiantamento?
        é erro de contagem? O sistema tem de recusar e obrigar a tratar o caso.
        """
        inv = self._fatura_emitida()
        r = self.client.post(f'/api/finance/invoices/{inv.id}/receive/',
                             {'account': self.caixa.id, 'amount': '200000.00'}, format='json')
        self.assertEqual(r.status_code, 400,
                         'Recebeu 200.000 Kz por uma fatura de 114.000 Kz.')
        inv.refresh_from_db()
        self.assertEqual(inv.paid_amount, Decimal('0'), 'Ficou um recebimento a mais na fatura.')

    def test_fatura_em_rascunho_nao_se_recebe(self):
        """Receber sobre um rascunho é cobrar sem documento emitido."""
        r = self.client.post('/api/finance/invoices/', {
            'customer_name': 'Teste', 'date': str(self.hoje),
            'lines': [{'description': 'X', 'quantity': '1', 'unit_price': '1000.00'}],
        }, format='json')
        r2 = self.client.post(f"/api/finance/invoices/{r.data['id']}/receive/",
                              {'account': self.caixa.id}, format='json')
        self.assertEqual(r2.status_code, 400, 'Recebeu dinheiro de uma fatura em rascunho.')

    def test_conta_corrente_mostra_faturado_recebido_e_divida_por_cliente(self):
        """É este ecrã que diz a quem telefonar para cobrar."""
        inv = self._fatura_emitida(cliente='Sonangol, SA')
        self.client.post(f'/api/finance/invoices/{inv.id}/receive/',
                         {'account': self.caixa.id, 'amount': '14000.00'}, format='json')
        self._fatura_emitida(quantidade='1', preco='10000.00', iva='0', cliente='Endiama, SA')

        r = self.client.get('/api/finance/invoices/customers/')
        self.assertEqual(r.status_code, 200)
        por_cliente = {linha['customer']: linha for linha in r.data}
        self.assertEqual(Decimal(str(por_cliente['Sonangol, SA']['balance'])), Decimal('100000.00'),
                         'A dívida da Sonangol não é o faturado menos o recebido.')
        self.assertEqual(Decimal(str(por_cliente['Endiama, SA']['balance'])), Decimal('10000.00'))

    def test_rascunhos_e_anuladas_nao_entram_na_divida_do_cliente(self):
        """Um rascunho não é dívida: ninguém pode cobrar com base nele."""
        self.client.post('/api/finance/invoices/', {
            'customer_name': 'Cliente Rascunho', 'date': str(self.hoje),
            'lines': [{'description': 'X', 'quantity': '1', 'unit_price': '77000.00'}],
        }, format='json')
        r = self.client.get('/api/finance/invoices/customers/')
        self.assertNotIn('Cliente Rascunho', [linha['customer'] for linha in r.data],
                         'Uma fatura em rascunho está a aparecer como dívida do cliente.')

    def test_anular_fatura_ja_recebida_nao_pode_fazer_o_dinheiro_desaparecer(self):
        """Uma fatura paga não se anula sem primeiro desfazer o recebimento.

        A conta corrente ignora faturas anuladas. Se a fatura fosse anulada com o
        recebimento confirmado por baixo, o dinheiro continuava na caixa mas
        deixava de estar ligado a cliente nenhum: a caixa fecha com dinheiro a mais
        e a conta corrente do cliente fica a dever o que já pagou.
        """
        inv = self._fatura_emitida()
        self.client.post(f'/api/finance/invoices/{inv.id}/receive/',
                         {'account': self.caixa.id}, format='json')
        r = self.client.post(f'/api/finance/invoices/{inv.id}/cancel/', {}, format='json')
        self.assertEqual(r.status_code, 400,
                         'Anulou uma fatura que já tinha recebimentos confirmados.')
        inv.refresh_from_db()
        self.assertNotEqual(inv.status, 'CANCELLED')

    def test_fatura_sem_recebimentos_pode_ser_anulada(self):
        """O caso normal: emitiu-se por erro, ainda não se recebeu nada."""
        inv = self._fatura_emitida()
        r = self.client.post(f'/api/finance/invoices/{inv.id}/cancel/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        inv.refresh_from_db()
        self.assertEqual(inv.status, 'CANCELLED')


# ==========================================================================
# FATURAS DE FORNECEDOR (contas a pagar) — conta corrente do fornecedor
# ==========================================================================
class ContasAPagar(TesourariaMontada):

    def setUp(self):
        super().setUp()
        self.ff = SupplierInvoice.objects.create(
            number='FF-900001', supplier_name='Refriango, Lda.', date=self.hoje,
            amount=Decimal('200000.00'), tax_amount=Decimal('0'), status='OPEN')

    def test_pagamento_parcial_deixa_a_fatura_parcial(self):
        r = self.client.post(f'/api/finance/supplier-invoices/{self.ff.id}/pay/',
                             {'account': self.caixa.id, 'amount': '50000.00'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.ff.refresh_from_db()
        self.assertEqual(self.ff.status, 'PARTIAL')
        self.assertEqual(self.ff.balance, Decimal('150000.00'),
                         'O que ainda se deve ao fornecedor está errado.')
        self.assertEqual(self.caixa.balance, Decimal('450000.00'),
                         'O pagamento ao fornecedor não saiu da caixa.')

    def test_pagamento_total_marca_a_fatura_paga(self):
        r = self.client.post(f'/api/finance/supplier-invoices/{self.ff.id}/pay/',
                             {'account': self.caixa.id}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.ff.refresh_from_db()
        self.assertEqual(self.ff.status, 'PAID')
        self.assertEqual(self.ff.balance, Decimal('0.00'))

    def test_fatura_paga_nao_se_paga_outra_vez(self):
        self.client.post(f'/api/finance/supplier-invoices/{self.ff.id}/pay/',
                         {'account': self.caixa.id}, format='json')
        r = self.client.post(f'/api/finance/supplier-invoices/{self.ff.id}/pay/',
                             {'account': self.caixa.id, 'amount': '1000.00'}, format='json')
        self.assertEqual(r.status_code, 400, 'Pagou outra vez uma fatura já paga.')

    def test_nao_se_paga_ao_fornecedor_mais_do_que_se_lhe_deve(self):
        """Pagar acima do saldo é dinheiro que sai da casa sem dívida que o justifique.

        O caso real: dois pagamentos parciais seguidos, cada um "dentro do saldo da
        conta", que somados passam o valor da fatura. O fornecedor fica com o
        excesso e a conta corrente nunca o assinala — o saldo da fatura vai a
        negativo e o estado passa a PAGA de qualquer maneira.
        """
        self.client.post(f'/api/finance/supplier-invoices/{self.ff.id}/pay/',
                         {'account': self.caixa.id, 'amount': '150000.00'}, format='json')
        r = self.client.post(f'/api/finance/supplier-invoices/{self.ff.id}/pay/',
                             {'account': self.caixa.id, 'amount': '150000.00'}, format='json')
        self.assertEqual(r.status_code, 400,
                         'Pagou 300.000 Kz ao fornecedor por uma fatura de 200.000 Kz.')
        self.ff.refresh_from_db()
        self.assertEqual(self.ff.paid_amount, Decimal('150000.00'))
        self.assertGreaterEqual(self.ff.balance, Decimal('0'),
                                'A conta corrente do fornecedor ficou com saldo negativo.')

    def test_nao_se_paga_com_uma_caixa_sem_dinheiro(self):
        r = self.client.post(f'/api/finance/supplier-invoices/{self.ff.id}/pay/',
                             {'account': self.banco.id}, format='json')
        self.assertEqual(r.status_code, 409,
                         'Pagou 200.000 Kz de uma conta bancária com saldo zero.')

    def test_pagar_sem_dizer_de_que_conta_sai_e_recusado(self):
        """Sem conta não se sabe de onde saiu o dinheiro — e a tesouraria fica cega."""
        r = self.client.post(f'/api/finance/supplier-invoices/{self.ff.id}/pay/', {}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_extrato_da_fatura_lista_os_pagamentos_feitos(self):
        """É o documento que se mostra ao fornecedor quando ele reclama."""
        self.client.post(f'/api/finance/supplier-invoices/{self.ff.id}/pay/',
                         {'account': self.caixa.id, 'amount': '20000.00'}, format='json')
        r = self.client.get(f'/api/finance/supplier-invoices/{self.ff.id}/statement/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data['payments']), 1, 'O extrato não mostra o pagamento feito.')
        self.assertEqual(Decimal(str(r.data['balance'])), Decimal('180000.00'))

    def test_anular_o_pagamento_devolve_a_divida_ao_fornecedor(self):
        """Se o pagamento foi anulado (cheque devolvido, erro de conta), a dívida volta."""
        r = self.client.post(f'/api/finance/supplier-invoices/{self.ff.id}/pay/',
                             {'account': self.caixa.id}, format='json')
        pag_id = r.data['payment']['id']
        self.client.post(f'/api/finance/payments/{pag_id}/cancel/', {}, format='json')
        self.ff.refresh_from_db()
        self.assertEqual(self.ff.status, 'OPEN',
                         'Anulou-se o pagamento mas a fatura do fornecedor continua PAGA.')
        self.assertEqual(self.caixa.balance, Decimal('500000.00'),
                         'O dinheiro do pagamento anulado não voltou à caixa.')

    def test_iva_dedutivel_separa_se_do_valor_da_mercadoria(self):
        """O `net_amount` é a base que vai a custo; o IVA é imposto a recuperar.
        Confundi-los inflaciona o custo da mercadoria em 14%."""
        ff = SupplierInvoice.objects.create(
            number='FF-900002', supplier_name='Angomarte', date=self.hoje,
            amount=Decimal('114000.00'), tax_amount=Decimal('14000.00'))
        self.assertEqual(ff.net_amount, Decimal('100000.00'),
                         'O valor da mercadoria sem IVA está errado.')


# ==========================================================================
# RECONCILIAÇÃO BANCÁRIA
# ==========================================================================
class ReconciliacaoBancaria(TesourariaMontada):

    def test_reconciliacao_guarda_o_saldo_do_sistema_no_momento(self):
        """O saldo do sistema é um SNAPSHOT: tem de ficar gravado o que o sistema
        dizia no dia do extrato, senão amanhã a reconciliação "muda sozinha"."""
        self._recebimento(conta=self.banco, valor='300000.00', estado='CONFIRMED')
        r = self.client.post('/api/finance/reconciliations/', {
            'account': self.banco.id, 'statement_date': str(self.hoje),
            'statement_balance': '300000.00'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        rec = BankReconciliation.objects.get(pk=r.data['id'])
        self.assertEqual(rec.system_balance, Decimal('300000.00'),
                         'A reconciliação não guardou o saldo do sistema.')

        # Movimento posterior NÃO pode alterar a reconciliação já feita.
        self._recebimento(conta=self.banco, valor='50000.00', estado='CONFIRMED')
        rec.refresh_from_db()
        self.assertEqual(rec.system_balance, Decimal('300000.00'),
                         'Um movimento novo mexeu numa reconciliação antiga.')

    def test_diferenca_entre_extrato_e_sistema_e_mostrada(self):
        """A diferença é o ponto de partida do trabalho: 25.000 Kz que o banco tem
        e o sistema não (ou ao contrário) é uma transferência não lançada."""
        self._recebimento(conta=self.banco, valor='100000.00', estado='CONFIRMED')
        r = self.client.post('/api/finance/reconciliations/', {
            'account': self.banco.id, 'statement_date': str(self.hoje),
            'statement_balance': '125000.00'}, format='json')
        self.assertEqual(Decimal(str(r.data['difference'])), Decimal('25000.00'),
                         'A diferença entre o extrato e o sistema não está certa.')

    def test_contas_sem_reconciliacao_aparecem_sem_data(self):
        """Uma conta que nunca foi reconciliada tem de se ver à distância."""
        r = self.client.get('/api/finance/account-balances/')
        linhas = {linha['code']: linha for linha in r.data['accounts']}
        self.assertIsNone(linhas['BC01']['last_reconciliation'])


# ==========================================================================
# HOTEL POR OMISSÃO — o que acontece numa instalação acabada de montar
# ==========================================================================
class HotelPorOmissao(TesourariaMontada):

    def test_registos_herdam_o_hotel_sem_o_ecra_o_enviar(self):
        """O ecrã não pergunta o hotel numa instalação de hotel único.
        Se o servidor não o preencher, a gravação rebenta com erro interno."""
        r = self.client.post('/api/finance/cost-centers/',
                             {'code': 'BAR', 'name': 'Bar da Piscina'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(CostCenter.objects.get(code='BAR').hotel_id, self.hotel.id,
                         'O centro de custo ficou sem hotel.')

    def test_conta_de_tesouraria_tambem_herda_o_hotel(self):
        r = self.client.post('/api/finance/accounts/',
                             {'code': 'CX02', 'name': 'Caixa Bar', 'account_type': 'CASH'},
                             format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(FinanceAccount.objects.get(code='CX02').hotel_id, self.hotel.id)

    def test_fatura_tambem_herda_o_hotel(self):
        inv = self._fatura_emitida()
        self.assertEqual(inv.hotel_id, self.hotel.id, 'A fatura ficou sem hotel.')


class InstalacaoSemEmpresa(APITestCase):
    """O PRIMEIRO ecrã de um cliente novo: ainda não há empresa nenhuma criada.

    Aqui `Hotel.objects.first()` devolve None e a gravação violava o NOT NULL,
    devolvendo "erro interno" sem dizer o que fazer. A mensagem tem de dizer o
    passo que falta.
    """

    def setUp(self):
        self.user = User.objects.create_superuser('dono_novo', '', 'x')
        self.client.force_authenticate(self.user)

    def test_sem_empresa_criada_a_mensagem_diz_o_passo_que_falta(self):
        self.assertEqual(Hotel.objects.count(), 0)
        r = self.client.post('/api/finance/cost-centers/',
                             {'code': 'REST', 'name': 'Restaurante'}, format='json')
        self.assertEqual(r.status_code, 400,
                         'Sem empresa configurada, a gravação devia explicar-se e não rebentar.')
        self.assertIn('empresa', str(r.data).lower(),
                      f'A mensagem não diz ao utilizador que falta criar a empresa: {r.data}')
