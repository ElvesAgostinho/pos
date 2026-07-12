"""Dashboard de gestão — agrega KPIs de tudo o que está ligado (POS, stock, financeiro, PMS)."""
from decimal import Decimal
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response


class ManagementDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        data = {'date': str(today)}

        # POS: vendas do dia + margem real (preço − custo médio)
        try:
            from pos.models import POSTicket
            paid = POSTicket.objects.filter(status='PAID', closed_at__date=today).prefetch_related('lines__item')
            total = Decimal('0'); cost = Decimal('0'); count = 0
            top = {}
            for t in paid:
                count += 1; total += t.grand_total
                for l in t.lines.all():
                    cost += (l.item.current_average_cost or Decimal('0')) * l.quantity
                    top[l.description] = top.get(l.description, Decimal('0')) + l.quantity
            data['pos'] = {'sales': total, 'count': count, 'cost': cost, 'margin': total - cost,
                           'avg_ticket': (total / count) if count else Decimal('0'),
                           'top_products': sorted([{'name': k, 'qty': v} for k, v in top.items()], key=lambda x: x['qty'], reverse=True)[:5]}
        except Exception:
            pass

        # Stock: valor total e ruturas
        try:
            from inventory.models import StockLevel
            val = Decimal('0'); low = 0
            for s in StockLevel.objects.select_related('item'):
                val += (s.quantity_on_hand or Decimal('0')) * (s.item.current_average_cost or Decimal('0'))
                if s.min_stock_alert and s.quantity_on_hand <= s.min_stock_alert:
                    low += 1
            data['stock'] = {'value': val, 'low_count': low}
        except Exception:
            pass

        # Financeiro: contas a pagar/receber + tesouraria
        try:
            from finance.models import SupplierInvoice, Invoice, FinanceAccount
            ap = sum((i.balance for i in SupplierInvoice.objects.exclude(status='CANCELLED')), Decimal('0'))
            ar = sum((i.balance for i in Invoice.objects.exclude(status__in=['DRAFT', 'CANCELLED'])), Decimal('0'))
            treasury = sum((a.balance for a in FinanceAccount.objects.all()), Decimal('0'))
            data['finance'] = {'payable': ap, 'receivable': ar, 'treasury': treasury}
        except Exception:
            pass

        # PMS: ocupação
        try:
            from pms.models import Room
            total_r = Room.objects.count(); occ = Room.objects.filter(status='OCCUPIED').count()
            data['pms'] = {'rooms': total_r, 'occupied': occ, 'occupancy_pct': round(occ / total_r * 100, 1) if total_r else 0}
        except Exception:
            pass

        return Response(data)
