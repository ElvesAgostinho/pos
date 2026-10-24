"""Dashboard de gestão — agrega KPIs de tudo o que está ligado (POS, stock, financeiro, PMS).

É o ecrã do "17 · Reporting Center" (frontend: components/reporting/ManagementDashboard.tsx)
e, ao contrário dos relatórios por pastas (pos/reports.py), não tem período: é o
PULSO DE HOJE. Por isso cada número aqui tem de ser o MESMO que o relatório
correspondente daria para hoje — dois ecrãs da mesma casa a dar ocupações
diferentes é o fim da confiança em qualquer deles.
"""
from decimal import Decimal
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response


class ManagementDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        # CADA BLOCO FALHA SOZINHO, mas NÃO EM SILÊNCIO. Antes era um
        # `except Exception: pass` por bloco: se o POS rebentasse (um campo
        # renomeado, um artigo sem ficha), a chave 'pos' simplesmente não vinha
        # na resposta e o ecrã mostrava "Vendas do dia: 0,00". Zero é um número
        # que o dono acredita — e num dia de casa cheia é a pior mentira que
        # este ecrã pode contar. A avaria passa a vir escrita em `problems`.
        data = {'date': str(today), 'problems': []}

        # POS: vendas do dia + margem real (preço − custo médio)
        try:
            from pos.models import POSTicket
            paid = POSTicket.objects.filter(status='PAID', closed_at__date=today).prefetch_related('lines__item')
            total = Decimal('0'); cost = Decimal('0'); count = 0
            top = {}
            for t in paid:
                count += 1; total += t.grand_total
                for l in t.lines.all():
                    # AS LINHAS ANULADAS NÃO CUSTARAM NADA À CASA: o prato não
                    # saiu da cozinha. Estavam a entrar no custo do dia (e na
                    # lista dos mais vendidos), o que fazia a margem aparecer
                    # mais baixa do que é — e um prato que ninguém comeu
                    # aparecer no top. Ver também pos/reports.py:r_margem, que
                    # já exclui `is_void` há muito.
                    if l.is_void:
                        continue
                    cost += (l.item.current_average_cost or Decimal('0')) * l.quantity
                    top[l.description] = top.get(l.description, Decimal('0')) + l.quantity
            data['pos'] = {'sales': total, 'count': count, 'cost': cost, 'margin': total - cost,
                           'avg_ticket': (total / count) if count else Decimal('0'),
                           'top_products': sorted([{'name': k, 'qty': v} for k, v in top.items()], key=lambda x: x['qty'], reverse=True)[:5]}
        except Exception as e:
            data['problems'].append(f'Vendas e margem do POS: {e}')

        # Stock: valor total e ruturas
        try:
            from inventory.models import StockLevel
            val = Decimal('0'); low = 0
            for s in StockLevel.objects.select_related('item'):
                qtd = s.quantity_on_hand or Decimal('0')
                val += qtd * (s.item.current_average_cost or Decimal('0'))
                if s.min_stock_alert and qtd <= s.min_stock_alert:
                    low += 1
            data['stock'] = {'value': val, 'low_count': low}
        except Exception as e:
            data['problems'].append(f'Stock: {e}')

        # Financeiro: contas a pagar/receber + tesouraria
        try:
            from finance.models import SupplierInvoice, Invoice, FinanceAccount
            ap = sum((i.balance for i in SupplierInvoice.objects.exclude(status='CANCELLED')), Decimal('0'))
            ar = sum((i.balance for i in Invoice.objects.exclude(status__in=['DRAFT', 'CANCELLED'])), Decimal('0'))
            treasury = sum((a.balance for a in FinanceAccount.objects.all()), Decimal('0'))
            data['finance'] = {'payable': ap, 'receivable': ar, 'treasury': treasury}
        except Exception as e:
            data['problems'].append(f'Financeiro: {e}')

        # PMS: ocupação
        try:
            from pms.models import Room
            # SÓ OS QUARTOS ATIVOS contam como capacidade da casa — um quarto
            # desativado (em obras, fora de serviço) não está à venda. Com ele no
            # denominador, este ecrã dava 40% de ocupação enquanto o relatório
            # "Ocupação por dia" (pms/reports_catalog.py, que sempre filtrou
            # is_active) dava 50% para o mesmo momento: dois números para a mesma
            # pergunta, no mesmo sistema.
            quartos = Room.objects.filter(is_active=True)
            total_r = quartos.count(); occ = quartos.filter(status='OCCUPIED').count()
            data['pms'] = {'rooms': total_r, 'occupied': occ, 'occupancy_pct': round(occ / total_r * 100, 1) if total_r else 0}
        except Exception as e:
            data['problems'].append(f'Ocupação (PMS): {e}')

        return Response(data)
