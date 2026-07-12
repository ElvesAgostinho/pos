"""
Apuramento de resultados (fecho de exercício) — transfere os saldos das contas
de Proveitos (classe 6) e Custos (classe 7) para a conta de Resultado Líquido (88),
gerando o lançamento de apuramento em partidas dobradas.
"""
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Account, Journal, FiscalPeriod, JournalEntry, JournalEntryLine
from .reports import _balances_by_account

RESULT_CODE = '88'   # Resultado Líquido do Exercício


class CloseResultsView(APIView):
    """
    GET  /api/accounting/close-results/?period= — pré-visualiza o apuramento.
    POST /api/accounting/close-results/         — gera e lança o apuramento.
    """
    permission_classes = [IsAuthenticated]

    def _compute(self, period):
        bal = _balances_by_account(period)
        income, expense = [], []
        ti = te = Decimal('0')
        for acc in Account.objects.filter(is_movement=True, account_type__in=['INCOME', 'EXPENSE']):
            d, c = bal.get(acc.id, (Decimal('0'), Decimal('0')))
            if acc.account_type == 'INCOME':
                v = c - d
                if v:
                    income.append((acc, v)); ti += v
            else:
                v = d - c
                if v:
                    expense.append((acc, v)); te += v
        return income, expense, ti, te

    def get(self, request):
        period = request.query_params.get('period')
        income, expense, ti, te = self._compute(period)
        result = ti - te
        return Response({
            'total_income': float(ti), 'total_expense': float(te),
            'net_result': float(result), 'result_label': 'Lucro' if result >= 0 else 'Prejuízo',
            'income_accounts': len(income), 'expense_accounts': len(expense),
        })

    def post(self, request):
        period_id = request.data.get('period')
        period = FiscalPeriod.objects.filter(id=period_id).first() if period_id else None
        income, expense, ti, te = self._compute(period.id if period else None)
        if not income and not expense:
            return Response({'detail': 'Sem proveitos/custos para apurar.'}, status=400)

        result_acc = Account.objects.filter(code=RESULT_CODE).first()
        if not result_acc:
            return Response({'detail': f'Conta de resultado {RESULT_CODE} não existe no plano.'}, status=400)

        journal = Journal.objects.filter(journal_type='OPENING').first() or Journal.objects.filter(journal_type='GENERAL').first()
        if not journal:
            return Response({'detail': 'Sem diário para o apuramento.'}, status=400)

        # Evita apurar duas vezes o mesmo período.
        ref = f'APURAMENTO-{period.name if period else timezone.localdate().year}'
        if JournalEntry.objects.filter(source='CLOSING', reference=ref).exclude(status='REVERSED').exists():
            return Response({'detail': 'Este exercício já foi apurado.'}, status=400)

        result = ti - te
        with transaction.atomic():
            n = JournalEntry.objects.count() + 1
            entry = JournalEntry.objects.create(
                number=f'LC{n:06d}', journal=journal, period=period, entry_date=timezone.localdate(),
                description=f'Apuramento de resultados {ref}', reference=ref, source='CLOSING',
                status='DRAFT', created_by=request.user.get_username())
            # Zera proveitos (débito) e custos (crédito); a diferença vai para 88.
            for acc, v in income:
                JournalEntryLine.objects.create(entry=entry, account=acc, debit=v, credit=0,
                                                description='Apuramento — proveitos')
            for acc, v in expense:
                JournalEntryLine.objects.create(entry=entry, account=acc, debit=0, credit=v,
                                                description='Apuramento — custos')
            if result >= 0:
                JournalEntryLine.objects.create(entry=entry, account=result_acc, debit=0, credit=result,
                                                description='Resultado líquido (lucro)')
            else:
                JournalEntryLine.objects.create(entry=entry, account=result_acc, debit=-result, credit=0,
                                                description='Resultado líquido (prejuízo)')
            entry.post(by=request.user.get_username())
        return Response({'detail': f'Apuramento efetuado. Resultado: {result} ({"Lucro" if result >= 0 else "Prejuízo"}).',
                         'entry': entry.number, 'net_result': float(result)})
