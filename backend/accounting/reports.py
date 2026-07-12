"""Relatórios contabilísticos — Razão, Balancete, Balanço e Demonstração de Resultados.
Todos derivam das linhas de lançamentos LANÇADOS (fonte única)."""
from decimal import Decimal

from django.db.models import Sum
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Account, JournalEntry, JournalEntryLine, Journal


def _posted_lines(period=None, date_from=None, date_to=None):
    qs = JournalEntryLine.objects.filter(entry__status='POSTED').select_related('account', 'entry')
    if period:
        qs = qs.filter(entry__period_id=period)
    if date_from:
        qs = qs.filter(entry__entry_date__gte=date_from)
    if date_to:
        qs = qs.filter(entry__entry_date__lte=date_to)
    return qs


def _balances_by_account(period=None, date_to=None):
    """{account_id: (debit_sum, credit_sum)} sobre movimentos lançados."""
    rows = (_posted_lines(period=period, date_to=date_to)
            .values('account_id').annotate(d=Sum('debit'), c=Sum('credit')))
    return {r['account_id']: (r['d'] or Decimal('0'), r['c'] or Decimal('0')) for r in rows}


class TrialBalanceView(APIView):
    """GET /api/accounting/trial-balance/ — Balancete (débito, crédito, saldo por conta)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        period = request.query_params.get('period')
        date_to = request.query_params.get('date_to')
        bal = _balances_by_account(period, date_to)
        rows = []
        td = tc = tsd = tsc = Decimal('0')
        for acc in Account.objects.filter(is_movement=True).order_by('code'):
            d, c = bal.get(acc.id, (Decimal('0'), Decimal('0')))
            if not d and not c:
                continue
            saldo = (d - c) if acc.normal_side == 'D' else (c - d)
            sd = saldo if saldo >= 0 and acc.normal_side == 'D' else (Decimal('0'))
            # saldo devedor / credor para o balancete
            net = d - c
            saldo_dev = net if net > 0 else Decimal('0')
            saldo_cred = -net if net < 0 else Decimal('0')
            rows.append({
                'code': acc.code, 'name': acc.name, 'class': acc.account_class,
                'debit': float(d), 'credit': float(c),
                'saldo_devedor': float(saldo_dev), 'saldo_credor': float(saldo_cred),
            })
            td += d; tc += c; tsd += saldo_dev; tsc += saldo_cred
        return Response({
            'rows': rows,
            'totals': {'debit': float(td), 'credit': float(tc),
                       'saldo_devedor': float(tsd), 'saldo_credor': float(tsc)},
            'balanced': abs(td - tc) < Decimal('0.01'),
        })


class LedgerView(APIView):
    """GET /api/accounting/ledger/?account=CODE — Razão de uma conta (com saldo acumulado)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        code = request.query_params.get('account')
        if not code:
            return Response({'detail': 'Indique a conta (?account=CODE).'}, status=400)
        acc = Account.objects.filter(code=code).first()
        if not acc:
            return Response({'detail': 'Conta não encontrada.'}, status=404)
        lines = (_posted_lines()
                 .filter(account__code__startswith=code)
                 .order_by('entry__entry_date', 'entry__id'))
        running = Decimal('0')
        rows = []
        for ln in lines:
            delta = (ln.debit - ln.credit) if acc.normal_side == 'D' else (ln.credit - ln.debit)
            running += delta
            rows.append({
                'date': ln.entry.entry_date.isoformat(), 'entry': ln.entry.number,
                'description': ln.description or ln.entry.description,
                'debit': float(ln.debit), 'credit': float(ln.credit), 'balance': float(running),
            })
        return Response({'account': {'code': acc.code, 'name': acc.name, 'normal_side': acc.normal_side},
                         'rows': rows, 'final_balance': float(running)})


class IncomeStatementView(APIView):
    """GET /api/accounting/income-statement/ — Demonstração de Resultados (Proveitos − Custos)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        period = request.query_params.get('period')
        date_to = request.query_params.get('date_to')
        bal = _balances_by_account(period, date_to)
        income, expense = [], []
        total_income = total_expense = Decimal('0')
        for acc in Account.objects.filter(is_movement=True, account_type__in=['INCOME', 'EXPENSE']).order_by('code'):
            d, c = bal.get(acc.id, (Decimal('0'), Decimal('0')))
            if not d and not c:
                continue
            if acc.account_type == 'INCOME':
                val = c - d
                income.append({'code': acc.code, 'name': acc.name, 'amount': float(val)})
                total_income += val
            else:
                val = d - c
                expense.append({'code': acc.code, 'name': acc.name, 'amount': float(val)})
                total_expense += val
        result = total_income - total_expense
        return Response({
            'income': income, 'expense': expense,
            'total_income': float(total_income), 'total_expense': float(total_expense),
            'net_result': float(result),
            'result_label': 'Lucro' if result >= 0 else 'Prejuízo',
        })


class BalanceSheetView(APIView):
    """GET /api/accounting/balance-sheet/ — Balanço (Ativo = Passivo + Fundos Próprios)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        period = request.query_params.get('period')
        date_to = request.query_params.get('date_to')
        bal = _balances_by_account(period, date_to)
        assets, liabilities, equity = [], [], []
        ta = tl = te = ti = tex = Decimal('0')
        for acc in Account.objects.filter(is_movement=True).order_by('code'):
            d, c = bal.get(acc.id, (Decimal('0'), Decimal('0')))
            if not d and not c:
                continue
            if acc.account_type == 'ASSET':
                v = d - c; assets.append({'code': acc.code, 'name': acc.name, 'amount': float(v)}); ta += v
            elif acc.account_type == 'LIABILITY':
                v = c - d; liabilities.append({'code': acc.code, 'name': acc.name, 'amount': float(v)}); tl += v
            elif acc.account_type == 'EQUITY':
                v = c - d; equity.append({'code': acc.code, 'name': acc.name, 'amount': float(v)}); te += v
            elif acc.account_type == 'INCOME':
                ti += (c - d)
            elif acc.account_type == 'EXPENSE':
                tex += (d - c)
        net_result = ti - tex           # resultado líquido do exercício → fundos próprios
        total_equity = te + net_result
        return Response({
            'assets': assets, 'liabilities': liabilities, 'equity': equity,
            'net_result': float(net_result),
            'total_assets': float(ta),
            'total_liabilities': float(tl),
            'total_equity': float(total_equity),
            'total_liabilities_equity': float(tl + total_equity),
            'balanced': abs(ta - (tl + total_equity)) < Decimal('0.01'),
        })


class AccountingDashboardView(APIView):
    """GET /api/accounting/dashboard/ — visão geral da contabilidade."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        bal = _balances_by_account()
        ti = tex = ta = tl = Decimal('0')
        types = {a.id: a.account_type for a in Account.objects.filter(is_movement=True)}
        for aid, (d, c) in bal.items():
            t = types.get(aid)
            if t == 'INCOME': ti += (c - d)
            elif t == 'EXPENSE': tex += (d - c)
            elif t == 'ASSET': ta += (d - c)
            elif t == 'LIABILITY': tl += (c - d)
        return Response({
            'accounts': Account.objects.count(),
            'movement_accounts': Account.objects.filter(is_movement=True).count(),
            'journals': Journal.objects.count(),
            'entries_total': JournalEntry.objects.count(),
            'entries_draft': JournalEntry.objects.filter(status='DRAFT').count(),
            'entries_posted': JournalEntry.objects.filter(status='POSTED').count(),
            'total_assets': float(ta),
            'total_liabilities': float(tl),
            'total_income': float(ti),
            'total_expense': float(tex),
            'net_result': float(ti - tex),
        })
