"""Reconciliação bancária — saldo do sistema vs. extrato."""
from decimal import Decimal

from rest_framework import serializers, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import FinanceAccount, BankReconciliation


class BankReconciliationSerializer(serializers.ModelSerializer):
    account_name = serializers.CharField(source='account.name', read_only=True)
    difference = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = BankReconciliation
        fields = '__all__'

    def create(self, validated):
        # Snapshot do saldo do sistema no momento da reconciliação
        if not validated.get('system_balance'):
            validated['system_balance'] = validated['account'].balance
        return super().create(validated)


class BankReconciliationViewSet(viewsets.ModelViewSet):
    serializer_class = BankReconciliationSerializer

    def get_queryset(self):
        qs = BankReconciliation.objects.select_related('account').all()
        account = self.request.query_params.get('account')
        return qs.filter(account_id=account) if account else qs


class AccountBalancesView(APIView):
    """GET /api/finance/account-balances/ — saldo atual de cada conta (para reconciliação)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = []
        for a in FinanceAccount.objects.filter(is_active=True):
            rows.append({
                'id': a.id, 'code': a.code, 'name': a.name, 'account_type': a.account_type,
                'currency': a.currency, 'balance': float(a.balance),
                'last_reconciliation': (a.reconciliations.first().statement_date.isoformat()
                                        if a.reconciliations.exists() else None),
            })
        return Response({'accounts': rows})
