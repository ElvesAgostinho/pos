"""
Centro de Operações — torre de controlo em tempo real (Painel do Proprietário).

Agrega, num único endpoint, o estado operacional de todos os módulos (POS/Mesas,
Cozinha/KDS, Caixa, Hotel/PMS, Stock) e gera ALERTAS inteligentes. Só leitura.
Imports guardados: cada secção degrada graciosamente se o módulo não estiver ativo.
"""
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated


class OperationsCenterView(APIView):
    """GET /api/ops/center/ — painel consolidado do proprietário + alertas."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        now = timezone.now()
        today = timezone.localdate()
        alerts = []
        data = {'time': now.strftime('%H:%M'), 'date': today.isoformat()}

        # ---------------- POS / Mesas / Caixa / Vendas ----------------
        tables = {'occupied': 0, 'free': 0, 'reserved': 0, 'total': 0, 'dirty': 0}
        sales = {'today': '0', 'tickets': 0, 'avg_ticket': '0', 'open_amount': '0'}
        cash = {'sessions_open': 0, 'expected': '0'}
        kitchen = {'pending': 0, 'preparing': 0, 'ready': 0, 'delayed': 0}
        try:
            from pos.models import POSTable, POSTicket, POSTicketLine, CashSession
            t_all = list(POSTable.objects.all())
            tables['total'] = len(t_all)
            for t in t_all:
                if t.status == 'OCCUPIED':
                    tables['occupied'] += 1
                elif t.status == 'RESERVED':
                    tables['reserved'] += 1
                elif t.status == 'FREE':
                    tables['free'] += 1
                elif t.status in ('DIRTY',):
                    tables['dirty'] += 1
            paid = list(POSTicket.objects.filter(status='PAID', closed_at__date=today))
            total = sum((t.grand_total for t in paid), Decimal('0'))
            sales['today'] = str(total)
            sales['tickets'] = len(paid)
            sales['avg_ticket'] = str((total / len(paid)) if paid else Decimal('0'))
            open_tk = list(POSTicket.objects.filter(status='OPEN').prefetch_related('lines'))
            sales['open_amount'] = str(sum((t.grand_total for t in open_tk), Decimal('0')))
            # Mesa há >20min sem pedido
            for t in open_tk:
                if t.lines.count() == 0 and t.opened_at and (now - t.opened_at) > timedelta(minutes=20):
                    mins = int((now - t.opened_at).total_seconds() // 60)
                    alerts.append({'level': 'warn', 'icon': '🍽️',
                                   'msg': f'{t.dest_label or t.ticket_number} há {mins}min sem pedido'})
            # Cozinha (KDS)
            kl = POSTicketLine.objects.filter(kds_status__in=['FIRED', 'PREPARING', 'READY', 'NEW'])
            for l in kl:
                if l.kds_status in ('NEW', 'FIRED'):
                    kitchen['pending'] += 1
                elif l.kds_status == 'PREPARING':
                    kitchen['preparing'] += 1
                elif l.kds_status == 'READY':
                    kitchen['ready'] += 1
                if l.fired_at and l.kds_status in ('FIRED', 'PREPARING') and (now - l.fired_at) > timedelta(minutes=15):
                    kitchen['delayed'] += 1
            if kitchen['delayed']:
                alerts.append({'level': 'error', 'icon': '👨‍🍳', 'msg': f"{kitchen['delayed']} pedido(s) atrasado(s) na cozinha"})
            # Caixa aberta há muito
            for s in CashSession.objects.filter(status='OPEN'):
                cash['sessions_open'] += 1
                cash['expected'] = str(getattr(s, 'expected_cash', 0) or 0)
                if s.opened_at and (now - s.opened_at) > timedelta(hours=12):
                    alerts.append({'level': 'warn', 'icon': '💰', 'msg': f'Caixa aberta há mais de 12h ({s.outlet.name})'})
        except Exception:
            pass

        # ---------------- Hotel / PMS ----------------
        hotel = {'rooms_total': 0, 'occupied': 0, 'occupancy_pct': 0, 'arrivals': 0, 'departures': 0}
        try:
            from pms.models import Room, Reservation, Folio
            rooms = Room.objects.all()
            hotel['rooms_total'] = rooms.count()
            hotel['occupied'] = rooms.filter(status='OCCUPIED').count()
            hotel['occupancy_pct'] = round(100 * hotel['occupied'] / hotel['rooms_total']) if hotel['rooms_total'] else 0
            hotel['arrivals'] = Reservation.objects.filter(status='BOOKED', check_in=today).count()
            hotel['departures'] = Reservation.objects.filter(status='CHECKED_IN', check_out=today).count()
            # Quarto a sair hoje com consumo pendente
            for res in Reservation.objects.filter(status='CHECKED_IN', check_out=today).select_related('room'):
                folio = getattr(res, 'folio', None)
                if folio and folio.status == 'OPEN' and folio.balance > 0:
                    alerts.append({'level': 'warn', 'icon': '🛏️',
                                   'msg': f'Quarto {res.room.number if res.room else "?"} sai hoje com {folio.balance} por liquidar'})
        except Exception:
            pass

        # ---------------- Stock ----------------
        stock = {'low_count': 0}
        try:
            from inventory.models import StockLevel
            low = 0
            for sl in StockLevel.objects.select_related('item').all():
                minq = getattr(sl.item, 'min_stock_alert', None) or getattr(sl.item, 'min_stock', 0) or 0
                if sl.quantity <= minq:
                    low += 1
            stock['low_count'] = low
            if low:
                alerts.append({'level': 'warn', 'icon': '📦', 'msg': f'{low} artigo(s) em rutura/baixo stock'})
        except Exception:
            pass

        data.update({'tables': tables, 'sales': sales, 'cash': cash, 'kitchen': kitchen,
                     'hotel': hotel, 'stock': stock, 'alerts': alerts,
                     'alerts_count': len(alerts)})
        return Response(data)
