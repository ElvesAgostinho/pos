# -*- coding: utf-8 -*-
"""CONTABILIDADE GERAL (PGC-AO) — o que tem de bater, sempre.

A contabilidade não é um relatório bonito: é a prova de que o dinheiro que entrou
e saiu da casa tem uma explicação. Numa inspecção, três perguntas matam:

  1. Os lançamentos SALDAM? (débitos = créditos, sempre, sem excepção)
  2. O mesmo documento foi lançado DUAS VEZES? (receita a mais)
  3. Algum documento NÃO foi lançado? (receita a menos — e é a pior, porque
     não se vê: não há nenhuma linha errada, há uma linha que falta)

Estes testes atacam as três. Cada um diz, no nome e no comentário, o que o dono
veria se o defeito voltasse: o balancete desequilibrado, o razão vazio, a conta
de IVA a declarar imposto que a factura nunca liquidou.
"""
import io
from decimal import Decimal
from types import SimpleNamespace

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APITestCase

from accounting import posting
from accounting.models import (Account, Journal, FiscalPeriod, JournalEntry,
                               JournalEntryLine)


# ──────────────────────────────────────────────────────────────────────────────
# DOCUMENTOS DE ORIGEM FINGIDOS
#
# O auto-posting lê tickets do POS e documentos do Financeiro. Montar um ticket
# POS a sério exige setor, artigo, unidade, categoria e sessão de caixa — e
# passaríamos a testar o POS, não a contabilidade. O que a contabilidade precisa
# de saber de um ticket são SEIS números; é isso que estes objectos dão, com os
# valores postos à mão exactamente como o `recompute()` do POS os deixa.
# ──────────────────────────────────────────────────────────────────────────────
class _LinhasFingidas:
    """Imita `ticket.lines.filter(is_void=False).select_related('item')`."""

    def __init__(self, linhas):
        self._linhas = linhas

    def filter(self, **_):
        return self

    def select_related(self, *_):
        return self._linhas

    def __iter__(self):
        return iter(self._linhas)

    def count(self):
        return len(self._linhas)


def linha_pos(line_total, taxa=14, conta_analitica=None):
    """Uma linha de conta POS: `line_total` é o preço COM IVA (convenção AO)."""
    return SimpleNamespace(
        line_total=Decimal(str(line_total)),
        tax_percentage=Decimal(str(taxa)),
        is_void=False,
        item=SimpleNamespace(analytic_account_sale=conta_analitica),
    )


def ticket_pos(numero, linhas, grand_total=None, tax_total=None, sector='REST'):
    agora = timezone.now()
    bruto = sum((l.line_total for l in linhas), Decimal('0'))
    iva = sum(((l.line_total - l.line_total / (Decimal('1') + l.tax_percentage / 100))
               if l.tax_percentage else Decimal('0')) for l in linhas)
    return SimpleNamespace(
        ticket_number=numero,
        lines=_LinhasFingidas(linhas),
        outlet=SimpleNamespace(code=sector),
        opened_at=agora, closed_at=agora,
        grand_total=Decimal(str(grand_total)) if grand_total is not None else bruto,
        tax_total=Decimal(str(tax_total)) if tax_total is not None else iva.quantize(Decimal('0.01')),
        status='PAID',
    )


def fatura_fornecedor(numero, total, iva=0):
    return SimpleNamespace(number=numero, amount=Decimal(str(total)),
                           tax_amount=Decimal(str(iva)), date=timezone.localdate(),
                           supplier_name='Distribuidora Luanda')


def recebimento(numero, valor, tipo_conta='CASH'):
    return SimpleNamespace(number=numero, amount=Decimal(str(valor)),
                           date=timezone.localdate(), party_name='Sonangol EP',
                           account=SimpleNamespace(account_type=tipo_conta),
                           status='CONFIRMED')


def pagamento(numero, valor, tipo_conta='BANK'):
    return SimpleNamespace(number=numero, amount=Decimal(str(valor)),
                           date=timezone.localdate(), party_name='Distribuidora Luanda',
                           account=SimpleNamespace(account_type=tipo_conta),
                           status='CONFIRMED')


class BaseContabilidade(APITestCase):
    """Plano de contas PGC-AO + diários + exercício aberto, como numa instalação real."""

    def setUp(self):
        # o comando escreve direto no stdout: desviado para não sujar os testes
        call_command('seed_accounting', verbosity=0, stdout=io.StringIO())
        self.user = User.objects.create_superuser('contabilista', '', 'x')
        self.client.force_authenticate(self.user)
        hoje = timezone.localdate()
        self.exercicio, _ = FiscalPeriod.objects.get_or_create(
            year=hoje.year, name=str(hoje.year),
            defaults={'start_date': hoje.replace(month=1, day=1),
                      'end_date': hoje.replace(month=12, day=31)})

    # utilitário: lançamento manual equilibrado
    def _lancar(self, pares, descricao='Teste', data=None, lancar=True):
        """pares = [(codigo_conta, debito, credito), ...]"""
        data = data or timezone.localdate()
        n = JournalEntry.objects.count() + 1
        e = JournalEntry.objects.create(
            number=f'MAN{n:06d}', journal=Journal.objects.get(code='OD'),
            period=self.exercicio, entry_date=data, description=descricao, source='MANUAL')
        for codigo, d, c in pares:
            JournalEntryLine.objects.create(entry=e, account=Account.objects.get(code=codigo),
                                            debit=Decimal(str(d)), credit=Decimal(str(c)))
        if lancar:
            e.post(by='contabilista')
        return e


# ══════════════════════════════════════════════════════════════════════════════
# 1. PLANO DE CONTAS (PGC-AO)
# ══════════════════════════════════════════════════════════════════════════════
class PlanoDeContasTests(BaseContabilidade):

    def test_o_plano_tem_as_oito_classes_do_pgc_ao(self):
        """Falta uma classe e há movimentos que não têm onde cair — e o balanço
        deixa de fechar sem ninguém saber de onde vem a diferença."""
        classes = set(Account.objects.values_list('account_class', flat=True))
        for c in '12345678':
            self.assertIn(c, classes, f'A classe {c} do PGC-AO não existe no plano.')

    def test_contas_agregadoras_nao_aceitam_lancamentos(self):
        """Lançar na "31" (Mercadorias, título) e também na "311" faz o balancete
        somar o mesmo valor duas vezes. As agregadoras só somam as filhas."""
        titulo = Account.objects.get(code='1')
        self.assertFalse(titulo.is_movement,
                         'A conta de topo "1" está marcada como de movimento.')

    def test_o_mapa_de_contas_recusa_apontar_para_uma_agregadora(self):
        """Se o mapa do auto-posting apontar para um título, o erro tem de sair
        AQUI — não à meia-noite, no fecho, quando ninguém sabe porquê."""
        with self.assertRaises(ValueError):
            posting._acc('POS_CASH', {'POS_CASH': '1'})   # "1" é agregadora

    def test_todas_as_contas_do_mapa_por_defeito_existem_no_plano(self):
        """Uma chave do mapa sem conta no plano faz o lançamento sair SEM essa
        linha — e um lançamento a que falta uma linha não salda."""
        for chave, codigo in posting.DEFAULT_MAP.items():
            self.assertTrue(Account.objects.filter(code=codigo).exists(),
                            f'O mapa aponta {chave} -> conta {codigo}, que não existe no plano.')


# ══════════════════════════════════════════════════════════════════════════════
# 2. PARTIDAS DOBRADAS — o lançamento tem de saldar, sempre
# ══════════════════════════════════════════════════════════════════════════════
class PartidasDobradasTests(BaseContabilidade):

    def test_lancamento_que_nao_salda_nao_e_lancado(self):
        """Débito 1000 e crédito 900: faltam 100 Kz que não existem em sítio
        nenhum. Deixar lançar isto é ter um balancete que nunca fecha."""
        e = self._lancar([('112', 1000, 0), ('622', 0, 900)], lancar=False)
        with self.assertRaises(ValidationError):
            e.post()
        e.refresh_from_db()
        self.assertEqual(e.status, 'DRAFT', 'Um lançamento desequilibrado ficou lançado.')

    def test_lancamento_sem_linhas_nao_e_lancado(self):
        e = JournalEntry.objects.create(
            number='VAZIO1', journal=Journal.objects.get(code='OD'), period=self.exercicio,
            entry_date=timezone.localdate(), description='Sem linhas')
        with self.assertRaises(ValidationError):
            e.post()

    def test_lancamento_lancado_e_imutavel(self):
        """Um movimento lançado é um facto arquivado. Corrige-se por estorno,
        nunca por edição — senão o histórico passa a poder ser reescrito."""
        e = self._lancar([('112', 1000, 0), ('622', 0, 1000)])
        with self.assertRaises(ValidationError):
            e.post()            # lançar duas vezes
        r = self.client.patch(f'/api/accounting/entries/{e.id}/', {'description': 'mudado'},
                              format='json')
        self.assertEqual(r.status_code, 400,
                         'A API deixou editar um lançamento já lançado.')

    def test_linha_com_debito_e_credito_ao_mesmo_tempo_e_recusada(self):
        """UMA linha com 1000 a débito E 1000 a crédito na MESMA conta faz as duas
        somas de controlo subirem 1000 — o lançamento parece saldar e não movimenta
        nada. É a forma mais simples de fazer passar um lançamento inventado."""
        linha = JournalEntryLine(entry=self._lancar([('112', 500, 0), ('622', 0, 500)]),
                                 account=Account.objects.get(code='112'),
                                 debit=Decimal('1000'), credit=Decimal('1000'))
        with self.assertRaises(ValidationError):
            linha.clean()

    def test_a_api_recusa_criar_linhas_com_debito_e_credito(self):
        """O `clean()` do modelo não corre sozinho quando as linhas entram pela
        API (serializer encaixado). Sem validação explícita, o ecrã grava a linha
        impossível e só o balancete, mais tarde, mostra o estrago."""
        r = self.client.post('/api/accounting/entries/', {
            'number': 'API0001', 'journal': Journal.objects.get(code='OD').id,
            'period': self.exercicio.id, 'entry_date': timezone.localdate().isoformat(),
            'description': 'Linha impossível', 'source': 'MANUAL',
            'lines': [{'account': Account.objects.get(code='112').id,
                       'debit': '1000.00', 'credit': '1000.00'}],
        }, format='json')
        self.assertEqual(r.status_code, 400,
                         'A API aceitou uma linha com débito E crédito em simultâneo.')

    def test_a_api_recusa_linhas_a_zero(self):
        """Uma linha sem valor nenhum não é um movimento: é ruído no razão."""
        r = self.client.post('/api/accounting/entries/', {
            'number': 'API0002', 'journal': Journal.objects.get(code='OD').id,
            'entry_date': timezone.localdate().isoformat(), 'description': 'Linha a zero',
            'lines': [{'account': Account.objects.get(code='112').id,
                       'debit': '0', 'credit': '0'}],
        }, format='json')
        self.assertEqual(r.status_code, 400, 'A API aceitou uma linha sem valor.')


# ══════════════════════════════════════════════════════════════════════════════
# 3. AUTO-POSTING — do documento para o lançamento, uma vez e só uma
# ══════════════════════════════════════════════════════════════════════════════
class AutoPostingVendasTests(BaseContabilidade):

    def test_venda_pos_lanca_caixa_vendas_e_iva(self):
        """A venda de 11.400 Kz com IVA 14% são 10.000 de receita e 1.400 de
        imposto do Estado. Meter os 11.400 todos em "Vendas" é declarar 1.400 Kz
        de receita que nunca foi da casa — e esconder o IVA que se tem de entregar."""
        t = ticket_pos('T-0001', [linha_pos('11400', 14)])
        e = posting.post_pos_ticket(t, by='caixa')
        self.assertIsNotNone(e, 'A venda POS não gerou lançamento.')
        self.assertEqual(e.status, 'POSTED')
        por_conta = {l.account.code: (l.debit, l.credit) for l in e.lines.all()}
        self.assertEqual(por_conta['112'][0], Decimal('11400.00'), 'Caixa POS errada.')
        self.assertEqual(por_conta['622'][1], Decimal('10000.00'), 'Receita líquida errada.')
        self.assertEqual(por_conta['2431'][1], Decimal('1400.00'), 'IVA liquidado errado.')

    def test_a_mesma_venda_nao_e_lancada_duas_vezes(self):
        """Correr o auto-posting outra vez (ou o utilizador clicar duas vezes)
        não pode duplicar a receita. Foi este o defeito que já apanhámos no POS:
        o MESMO consumo declarado duas vezes."""
        t = ticket_pos('T-0002', [linha_pos('11400', 14)])
        self.assertIsNotNone(posting.post_pos_ticket(t))
        self.assertIsNone(posting.post_pos_ticket(t),
                          'A mesma venda foi lançada uma segunda vez.')
        self.assertEqual(JournalEntry.objects.filter(reference='T-0002').count(), 1)

    def test_a_receita_reparte_se_pelos_centros_de_custo(self):
        """A contabilidade geral diz quanto o hotel vendeu; a analítica diz QUEM
        vendeu. Sem repartição, o bar e o restaurante caem na mesma conta e o dono
        nunca sabe qual dos dois lhe dá dinheiro."""
        t = ticket_pos('T-0003', [linha_pos('11400', 14, conta_analitica='BAR'),
                                  linha_pos('5700', 14, conta_analitica='REST')])
        e = posting.post_pos_ticket(t)
        centros = {l.cost_center: l.credit for l in e.lines.all() if l.cost_center}
        self.assertEqual(set(centros), {'BAR', 'REST'})
        self.assertEqual(sum(centros.values()), Decimal('15000.00'),
                         'A repartição por centro de custo não soma o líquido total.')

    def test_o_lancamento_salda_mesmo_com_repartição_que_nao_divide_redonda(self):
        """3 centros de custo e um líquido que não divide por 3: o último fica com
        o resto. Se cada parte fosse arredondada por si, o lançamento ficava a
        faltar 1 cêntimo — e um lançamento que não salda não é lançado."""
        t = ticket_pos('T-0004', [linha_pos('3333.34', 14, conta_analitica='A'),
                                  linha_pos('3333.33', 14, conta_analitica='B'),
                                  linha_pos('3333.33', 14, conta_analitica='C')])
        e = posting.post_pos_ticket(t)
        self.assertEqual(e.status, 'POSTED',
                         'O lançamento ficou em rascunho por causa do arredondamento.')
        self.assertEqual(e.total_debit, e.total_credit)

    def test_venda_sem_iva_nao_cria_linha_de_imposto_a_zero(self):
        """Uma venda isenta não liquida imposto. Uma linha de IVA a 0,00 no razão
        da conta 2431 é ruído que faz o contabilista procurar o que não existe."""
        t = ticket_pos('T-0005', [linha_pos('10000', 0)])
        e = posting.post_pos_ticket(t)
        self.assertFalse(any(l.account.code == '2431' for l in e.lines.all()),
                         'Venda isenta criou linha de IVA.')
        self.assertEqual(e.total_debit, Decimal('10000.00'))

    def test_o_iva_lancado_e_o_que_a_factura_liquidou_mesmo_com_desconto(self):
        """ESTE É O DEFEITO DA FAMÍLIA "IVA errado".

        No POS, `tax_total` é o IVA do bruto ANTES do desconto de mesa, mas
        `grand_total` já vem descontado. Lançar `líquido = grand_total − tax_total`
        credita na conta 2431 (IVA a pagar) imposto que a factura do cliente NUNCA
        liquidou, e deixa a receita líquida abaixo do que foi facturado.

        Conta: 11.400 com 14% e 10% de desconto de mesa.
          - a factura (fiscal_lines) cobra 10.260 -> base 9.000 + IVA 1.260
          - o ticket guarda tax_total = 1.400 (IVA do bruto) e grand_total = 10.260
          - a conta errada dava base 8.860 e IVA 1.400: 140 Kz de imposto a mais
            declarados ao Estado, e 140 Kz de receita a menos no razão.
        """
        t = ticket_pos('T-0006', [linha_pos('11400', 14)],
                       grand_total='10260.00', tax_total='1400.00')
        e = posting.post_pos_ticket(t)
        por_conta = {l.account.code: (l.debit, l.credit) for l in e.lines.all()}
        self.assertEqual(por_conta['112'][0], Decimal('10260.00'),
                         'A caixa não recebeu o que o cliente pagou.')
        self.assertEqual(por_conta['2431'][1], Decimal('1260.00'),
                         'A conta de IVA declara imposto que a factura não liquidou.')
        self.assertEqual(por_conta['622'][1], Decimal('9000.00'),
                         'A receita lançada não é a que foi facturada.')


class AutoPostingComprasTesourariaTests(BaseContabilidade):

    def test_fatura_de_fornecedor_separa_iva_dedutivel(self):
        """O IVA de uma compra é dinheiro a recuperar do Estado, não um custo.
        Metê-lo em "Mercadorias" infla o custo e perde-se o direito à dedução."""
        e = posting.post_supplier_invoice(fatura_fornecedor('FF-1', '11400', '1400'))
        por_conta = {l.account.code: (l.debit, l.credit) for l in e.lines.all()}
        self.assertEqual(por_conta['31'][0], Decimal('10000.00'))
        self.assertEqual(por_conta['2432'][0], Decimal('1400.00'), 'IVA dedutível errado.')
        self.assertEqual(por_conta['221'][1], Decimal('11400.00'), 'Dívida ao fornecedor errada.')

    def test_recebimento_baixa_a_divida_do_cliente(self):
        e = posting.post_receipt(recebimento('R-1', '5000', 'CASH'))
        por_conta = {l.account.code: (l.debit, l.credit) for l in e.lines.all()}
        self.assertEqual(por_conta['111'][0], Decimal('5000.00'))
        self.assertEqual(por_conta['211'][1], Decimal('5000.00'))

    def test_recebimento_por_banco_nao_entra_na_caixa(self):
        """Uma transferência que entra na caixa física deixa o fecho de caixa a
        acusar dinheiro que não está na gaveta."""
        e = posting.post_receipt(recebimento('R-2', '5000', 'BANK'))
        contas = {l.account.code for l in e.lines.all()}
        self.assertIn('121', contas, 'O recebimento por banco não foi ao banco.')
        self.assertNotIn('111', contas, 'O recebimento por banco entrou na caixa.')

    def test_pagamento_baixa_a_divida_ao_fornecedor(self):
        e = posting.post_payment(pagamento('P-1', '7000', 'BANK'))
        por_conta = {l.account.code: (l.debit, l.credit) for l in e.lines.all()}
        self.assertEqual(por_conta['221'][0], Decimal('7000.00'))
        self.assertEqual(por_conta['121'][1], Decimal('7000.00'))

    def test_recebimento_e_pagamento_com_o_mesmo_numero_nao_se_confundem(self):
        """O nº 7 de um recibo e o nº 7 de uma ordem de pagamento são documentos
        diferentes. Se a chave de idempotência fosse só o número, o segundo nunca
        era lançado — e faltava dinheiro na contabilidade."""
        self.assertIsNotNone(posting.post_receipt(recebimento('7', '1000')))
        self.assertIsNotNone(posting.post_payment(pagamento('7', '1000')),
                             'O pagamento nº 7 foi confundido com o recibo nº 7.')

    def test_um_documento_que_ficou_em_rascunho_continua_por_lancar(self):
        """DEFEITO DA FAMÍLIA "receita a menos", e o pior tipo: silencioso.

        Se o lançamento automático não conseguir lançar (período fechado, conta
        em falta), fica em RASCUNHO. A lista de pendências considerava qualquer
        lançamento — mesmo em rascunho — como "já contabilizado": o documento
        desaparecia da lista e nunca mais era lançado por ninguém. Receita a
        menos, sem uma única linha errada à vista.
        """
        self.exercicio.is_closed = True
        self.exercicio.save(update_fields=['is_closed'])
        t = ticket_pos('T-0100', [linha_pos('11400', 14)])
        e = posting.post_pos_ticket(t)
        self.assertEqual(e.status, 'DRAFT', 'Lançou num período fechado.')

        refs_lancadas = set(JournalEntry.objects.filter(status='POSTED')
                            .values_list('reference', flat=True))
        self.assertNotIn('T-0100', refs_lancadas)
        rascunhos = posting.rascunhos_por_lancar()
        self.assertIn('T-0100', [r['ref'] for r in rascunhos],
                      'O documento em rascunho não aparece em sítio nenhum — '
                      'ficou receita por contabilizar sem ninguém saber.')

    def test_reabrir_o_periodo_permite_lancar_os_rascunhos_que_ficaram(self):
        """Depois de o contabilista reabrir o exercício, correr o auto-posting
        outra vez tem de recuperar o que ficou em rascunho — sem duplicar."""
        self.exercicio.is_closed = True
        self.exercicio.save(update_fields=['is_closed'])
        t = ticket_pos('T-0101', [linha_pos('11400', 14)])
        posting.post_pos_ticket(t)
        self.exercicio.is_closed = False
        self.exercicio.save(update_fields=['is_closed'])

        n = posting.lancar_rascunhos(by='contabilista')
        self.assertEqual(n, 1, 'O rascunho que ficou não foi recuperado.')
        self.assertEqual(JournalEntry.objects.filter(reference='T-0101').count(), 1,
                         'Recuperar o rascunho criou um lançamento a mais.')
        self.assertEqual(JournalEntry.objects.get(reference='T-0101').status, 'POSTED')


# ══════════════════════════════════════════════════════════════════════════════
# 4. ESTORNO — corrigir sem apagar, e sem inventar prejuízo
# ══════════════════════════════════════════════════════════════════════════════
class EstornoTests(BaseContabilidade):

    def test_estorno_nao_deixa_o_razao_com_receita_negativa(self):
        """DEFEITO DA FAMÍLIA "receita declarada a menos".

        Estornar é lançar o contrário: o original fica como estava e o estorno
        anula-o — somados, dão zero. O erro era marcar o original como
        ESTORNADO e deixá-lo FORA dos relatórios, mas contar o estorno. Ficava
        só o lado negativo: uma venda de 10.000 Kz passava a −10.000 Kz de
        receita no razão e na Demonstração de Resultados — prejuízo inventado,
        e IVA negativo a pagar ao Estado.
        """
        venda = posting.post_pos_ticket(ticket_pos('T-0010', [linha_pos('11400', 14)]))
        r = self.client.post(f'/api/accounting/entries/{venda.id}/reverse_entry/', {},
                             format='json')
        self.assertEqual(r.status_code, 200, r.content[:300])

        razao = self.client.get('/api/accounting/ledger/?account=622').data
        self.assertEqual(Decimal(str(razao['final_balance'])), Decimal('0'),
                         f"O razão das vendas ficou a {razao['final_balance']} depois "
                         f"de um estorno — devia ficar a zero.")
        dr = self.client.get('/api/accounting/income-statement/').data
        self.assertEqual(Decimal(str(dr['total_income'])), Decimal('0'),
                         'A Demonstração de Resultados ficou com receita negativa.')

    def test_o_estorno_nao_apaga_o_historico(self):
        """O original continua a existir e a ver-se: é o que prova à AGT que
        houve um movimento e que foi corrigido, não escondido."""
        venda = posting.post_pos_ticket(ticket_pos('T-0011', [linha_pos('11400', 14)]))
        self.client.post(f'/api/accounting/entries/{venda.id}/reverse_entry/', {}, format='json')
        venda.refresh_from_db()
        self.assertEqual(venda.status, 'REVERSED')
        self.assertEqual(JournalEntry.objects.filter(reference=venda.number).count(), 1,
                         'Não ficou registado qual o lançamento que estornou o original.')

    def test_so_se_estornam_lancamentos_lancados(self):
        e = self._lancar([('112', 100, 0), ('622', 0, 100)], lancar=False)
        r = self.client.post(f'/api/accounting/entries/{e.id}/reverse_entry/', {}, format='json')
        self.assertEqual(r.status_code, 400, 'Estornou um rascunho.')

    def test_estornar_e_voltar_a_lancar_conta_a_venda_uma_vez_so(self):
        """Depois de um estorno, o documento volta a estar por contabilizar.
        Lançá-lo outra vez tem de deixar a receita no valor certo — uma vez —
        e não a dobrar nem a zero."""
        t = ticket_pos('T-0012', [linha_pos('11400', 14)])
        venda = posting.post_pos_ticket(t)
        self.client.post(f'/api/accounting/entries/{venda.id}/reverse_entry/', {}, format='json')
        self.assertIsNotNone(posting.post_pos_ticket(t),
                             'Depois do estorno o documento ficou impossível de lançar.')
        razao = self.client.get('/api/accounting/ledger/?account=622').data
        self.assertEqual(Decimal(str(razao['final_balance'])), Decimal('10000.00'),
                         'A venda não acabou contabilizada exactamente uma vez.')


# ══════════════════════════════════════════════════════════════════════════════
# 5. BALANCETE, RAZÃO, BALANÇO
# ══════════════════════════════════════════════════════════════════════════════
class RelatoriosTests(BaseContabilidade):

    def setUp(self):
        super().setUp()
        posting.post_pos_ticket(ticket_pos('T-0020', [linha_pos('11400', 14)]))
        posting.post_supplier_invoice(fatura_fornecedor('FF-20', '5700', '700'))

    def test_o_balancete_salda_sempre(self):
        """Débitos ≠ créditos no balancete significa que há movimentos a entrar
        por fora das partidas dobradas. É o primeiro número que um inspector olha."""
        d = self.client.get('/api/accounting/trial-balance/').data
        self.assertTrue(d['balanced'],
                        f"Balancete desequilibrado: débito {d['totals']['debit']} "
                        f"≠ crédito {d['totals']['credit']}.")

    def test_o_balancete_nao_perde_nenhum_movimento_lancado(self):
        """O balancete lista só contas DE MOVIMENTO. Se um lançamento tivesse ido
        a uma conta agregadora, desaparecia do balancete mas continuava no razão —
        e a diferença nunca se explicava."""
        soma_linhas = sum((l.debit for l in JournalEntryLine.objects.filter(
            entry__status__in=['POSTED', 'REVERSED'])), Decimal('0'))
        d = self.client.get('/api/accounting/trial-balance/').data
        self.assertEqual(Decimal(str(d['totals']['debit'])), soma_linhas,
                         'O balancete não mostra todos os débitos lançados.')

    def test_o_razao_de_uma_conta_titulo_soma_as_filhas(self):
        """Pedir o razão de "Vendas/Prestações" (62) tem de trazer o que caiu em
        622 (Restauração) e 623 (Bar). Sem isto, o razão de um título vinha vazio."""
        d = self.client.get('/api/accounting/ledger/?account=62').data
        self.assertTrue(d['rows'], 'O razão da conta-título 62 veio vazio.')
        self.assertEqual(Decimal(str(d['final_balance'])), Decimal('10000.00'))

    def test_o_razao_de_uma_conta_que_nao_existe_responde_404(self):
        self.assertEqual(self.client.get('/api/accounting/ledger/?account=99999').status_code, 404)

    def test_o_balanco_equilibra_activo_com_passivo_e_fundos_proprios(self):
        d = self.client.get('/api/accounting/balance-sheet/').data
        self.assertTrue(d['balanced'],
                        f"Balanço desequilibrado: activo {d['total_assets']} ≠ "
                        f"passivo+fundos {d['total_liabilities_equity']}.")

    def test_a_demonstracao_de_resultados_bate_com_o_balanco(self):
        """O resultado do exercício aparece nos dois sítios. Dois números
        diferentes para o mesmo lucro é um relatório que não se pode assinar."""
        dr = self.client.get('/api/accounting/income-statement/').data
        bal = self.client.get('/api/accounting/balance-sheet/').data
        self.assertEqual(Decimal(str(dr['net_result'])), Decimal(str(bal['net_result'])),
                         'O lucro da DR não é o mesmo do Balanço.')

    def test_o_painel_mostra_os_mesmos_totais_que_os_relatorios(self):
        painel = self.client.get('/api/accounting/dashboard/').data
        dr = self.client.get('/api/accounting/income-statement/').data
        self.assertEqual(Decimal(str(painel['total_income'])),
                         Decimal(str(dr['total_income'])),
                         'O painel e a DR declaram receitas diferentes.')


# ══════════════════════════════════════════════════════════════════════════════
# 6. PERÍODOS E FECHO DE EXERCÍCIO
# ══════════════════════════════════════════════════════════════════════════════
class FechoDeExercicioTests(BaseContabilidade):

    def setUp(self):
        super().setUp()
        posting.post_pos_ticket(ticket_pos('T-0030', [linha_pos('11400', 14)]))
        self._lancar([('721', 2000, 0), ('111', 0, 2000)], descricao='Electricidade')

    def test_periodo_fechado_impede_novos_lancamentos(self):
        """Um exercício fechado e já declarado não pode receber movimentos novos:
        a declaração entregue deixaria de corresponder à contabilidade."""
        self.exercicio.is_closed = True
        self.exercicio.save(update_fields=['is_closed'])
        e = self._lancar([('112', 100, 0), ('622', 0, 100)], lancar=False)
        with self.assertRaises(ValidationError):
            e.post()

    def test_o_apuramento_zera_proveitos_e_custos_e_leva_o_resultado_a_88(self):
        """Fechar o exercício é passar a classe 6 e a classe 7 para a conta 88.
        Se não zerarem, o ano seguinte começa com a receita do anterior lá dentro."""
        r = self.client.post('/api/accounting/close-results/',
                             {'period': self.exercicio.id}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertEqual(Decimal(str(r.data['net_result'])), Decimal('8000.00'),
                         '10.000 de receita menos 2.000 de custo são 8.000 de lucro.')
        self.assertEqual(Account.objects.get(code='622').balance(period=self.exercicio),
                         Decimal('0'), 'A conta de receita não ficou zerada.')
        self.assertEqual(Account.objects.get(code='721').balance(period=self.exercicio),
                         Decimal('0'), 'A conta de custo não ficou zerada.')
        self.assertEqual(Account.objects.get(code='88').balance(period=self.exercicio),
                         Decimal('8000.00'), 'O resultado não foi para a conta 88.')

    def test_o_apuramento_salda(self):
        self.client.post('/api/accounting/close-results/',
                         {'period': self.exercicio.id}, format='json')
        e = JournalEntry.objects.get(source='CLOSING')
        self.assertEqual(e.total_debit, e.total_credit,
                         'O lançamento de apuramento não salda.')
        self.assertEqual(e.status, 'POSTED')

    def test_nao_se_apura_duas_vezes_o_mesmo_exercicio(self):
        """Apurar duas vezes duplica o resultado na conta 88 — e o balanço passa
        a declarar o dobro do lucro do ano."""
        self.client.post('/api/accounting/close-results/',
                         {'period': self.exercicio.id}, format='json')
        r = self.client.post('/api/accounting/close-results/',
                             {'period': self.exercicio.id}, format='json')
        self.assertEqual(r.status_code, 400, 'O exercício foi apurado duas vezes.')

    def test_a_pre_visualizacao_do_apuramento_nao_lanca_nada(self):
        """O GET é para o dono ver o resultado antes de decidir. Se lançasse,
        um simples refresh do ecrã fechava o exercício."""
        antes = JournalEntry.objects.count()
        self.client.get(f'/api/accounting/close-results/?period={self.exercicio.id}')
        self.assertEqual(JournalEntry.objects.count(), antes,
                         'A pré-visualização do apuramento criou lançamentos.')

    def test_apurar_um_exercicio_sem_movimentos_e_recusado(self):
        periodo = FiscalPeriod.objects.create(
            year=2099, name='2099', start_date='2099-01-01', end_date='2099-12-31')
        r = self.client.post('/api/accounting/close-results/', {'period': periodo.id},
                             format='json')
        self.assertEqual(r.status_code, 400)
