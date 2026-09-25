"""
Relatórios do PMS — agregações só de leitura sobre Reservation/Room/Folio/
FolioCharge (as imagens de referência: Performance/Receita/Ocupação/
Pagamentos/Encargos/Limpeza). Nunca escreve nada.

Convenções usadas (documentadas aqui porque não há um "campo revenue" pronto
no modelo — é preciso decidir o que conta):
- "Receita do quarto" de uma noite = Reservation.rate se > 0, senão o preço do
  rate_plan associado, senão 0. É a tarifa efetiva da estadia, não os
  lançamentos avulsos no folio (que entram no relatório de Encargos à parte).
- Reservas CANCELLED/NO_SHOW nunca contam para ocupação/receita.
- Um "room-night" só conta no dia D se check_in <= D < check_out.
"""
from datetime import date, timedelta

from rest_framework.views import APIView
from rest_framework.response import Response

from core.tenancy import scope_qs
from .models import Reservation, Room, FolioCharge


def _parse_date(d, default=None):
    try:
        return date.fromisoformat(d) if d else default
    except (ValueError, TypeError):
        return default


def _period(request):
    today = date.today()
    date_from = _parse_date(request.query_params.get('date_from'), today.replace(day=1))
    date_to = _parse_date(request.query_params.get('date_to'), today)
    if date_to < date_from:
        date_from, date_to = date_to, date_from
    if (date_to - date_from).days > 366:
        date_to = date_from + timedelta(days=366)
    return date_from, date_to


def _daterange(d1, d2):
    d = d1
    while d <= d2:
        yield d
        d += timedelta(days=1)


def _active_reservations(request, date_from, date_to):
    """Reservas com pelo menos uma noite dentro do período — nunca canceladas/no-show."""
    qs = scope_qs(request, Reservation.objects.select_related('room_type', 'rate_plan', 'room'))
    qs = qs.exclude(status__in=['CANCELLED', 'NO_SHOW'])
    qs = qs.filter(check_in__lt=date_to + timedelta(days=1), check_out__gt=date_from)
    return list(qs)


def _effective_rate(r):
    """A mesma conta que o check-in usa para lançar a 1ª diária (ver
    ReservationViewSet.check_in) — para o relatório nunca divergir do que
    realmente se lançou no folio."""
    if r.rate and r.rate > 0:
        return r.rate
    if r.rate_plan_id and r.rate_plan and r.rate_plan.price_per_night:
        return r.rate_plan.price_per_night
    if r.room_type_id and r.room_type:
        return r.room_type.base_rate
    return 0


def _nights_in_period(r, date_from, date_to):
    """Quantas noites desta reserva caem dentro de [date_from, date_to]."""
    start = max(r.check_in, date_from)
    end = min(r.check_out, date_to + timedelta(days=1))
    return max((end - start).days, 0)


class PerformanceReportView(APIView):
    def get(self, request):
        date_from, date_to = _period(request)
        reservations = _active_reservations(request, date_from, date_to)
        total_rooms = scope_qs(request, Room.objects.filter(is_active=True)).count()

        room_nights_sold = 0
        revenue = 0
        by_day: dict = {d: {'revenue': 0, 'rooms': 0} for d in _daterange(date_from, date_to)}
        by_source: dict = {}
        by_category: dict = {}

        for r in reservations:
            nights = _nights_in_period(r, date_from, date_to)
            rate = _effective_rate(r)
            room_nights_sold += nights
            revenue += rate * nights
            src = r.get_source_display()
            by_source.setdefault(src, {'revenue': 0, 'reservations': 0})
            by_source[src]['revenue'] += rate * nights
            by_source[src]['reservations'] += 1
            cat = r.room_type.name if r.room_type_id else '—'
            by_category.setdefault(cat, {'revenue': 0, 'nights': 0})
            by_category[cat]['revenue'] += rate * nights
            by_category[cat]['nights'] += nights

            d = max(r.check_in, date_from)
            end = min(r.check_out, date_to + timedelta(days=1))
            while d < end:
                if d in by_day:
                    by_day[d]['revenue'] += rate
                    by_day[d]['rooms'] += 1
                d += timedelta(days=1)

        days_count = (date_to - date_from).days + 1
        room_nights_available = total_rooms * days_count
        adr = float(revenue) / room_nights_sold if room_nights_sold else 0
        revpar = float(revenue) / room_nights_available if room_nights_available else 0
        occupancy_pct = (room_nights_sold / room_nights_available * 100) if room_nights_available else 0

        return Response({
            'date_from': date_from.isoformat(), 'date_to': date_to.isoformat(),
            'reservations': len(reservations), 'revenue': round(float(revenue), 2),
            'adr': round(adr, 2), 'revpar': round(revpar, 2), 'occupancy_pct': round(occupancy_pct, 1),
            'daily_revenue': [{'date': d.isoformat(), 'revenue': round(float(v['revenue']), 2)} for d, v in sorted(by_day.items())],
            'daily_occupancy_pct': [{'date': d.isoformat(), 'occupancy_pct': round(v['rooms'] / total_rooms * 100, 1) if total_rooms else 0} for d, v in sorted(by_day.items())],
            'reservation_sources': [{'source': k, **{kk: round(float(vv), 2) if kk == 'revenue' else vv for kk, vv in v.items()}} for k, v in by_source.items()],
            'revpar_by_category': [{'room_type': k, 'revpar': round(float(v['revenue']) / room_nights_available, 2) if room_nights_available else 0} for k, v in by_category.items()],
        })


class OccupancyReportView(APIView):
    def get(self, request):
        date_from, date_to = _period(request)
        reservations = _active_reservations(request, date_from, date_to)

        rows = {d: {'date': d.isoformat(), 'rooms_occupied': 0, 'check_ins': 0, 'check_outs': 0, 'day_revenue': 0} for d in _daterange(date_from, date_to)}
        for r in reservations:
            rate = _effective_rate(r)
            if r.check_in in rows:
                rows[r.check_in]['check_ins'] += 1
            if r.check_out in rows:
                rows[r.check_out]['check_outs'] += 1
            d = max(r.check_in, date_from)
            end = min(r.check_out, date_to + timedelta(days=1))
            while d < end:
                if d in rows:
                    rows[d]['rooms_occupied'] += 1
                    rows[d]['day_revenue'] += rate
                d += timedelta(days=1)

        ordered = [rows[d] for d in sorted(rows)]
        for row in ordered:
            row['day_revenue'] = round(float(row['day_revenue']), 2)
        return Response({
            'date_from': date_from.isoformat(), 'date_to': date_to.isoformat(),
            'rows': ordered,
            'total_revenue': round(sum(r['day_revenue'] for r in ordered), 2),
        })


class RevenueReportView(APIView):
    def get(self, request):
        date_from, date_to = _period(request)
        reservations = _active_reservations(request, date_from, date_to)

        # As reservas já vêm filtradas por hotel (_active_reservations); os
        # folios que se buscam a seguir são só os DESSAS reservas, por isso
        # já não é preciso voltar a filtrar por hotel aqui.
        charge_qs = FolioCharge.objects.filter(is_void=False).select_related('folio')

        rows = []
        grand = {'room_charges': 0, 'payments': 0, 'revenue': 0}
        for r in reservations:
            folio_ids = list(r.folios.values_list('id', flat=True))
            charges = charge_qs.filter(folio_id__in=folio_ids) if folio_ids else charge_qs.none()
            room_charges = sum((c.amount for c in charges if c.charge_type != 'PAYMENT'), 0)
            payments = sum((c.amount for c in charges if c.charge_type == 'PAYMENT'), 0)
            rate_revenue = _effective_rate(r) * _nights_in_period(r, date_from, date_to)
            rows.append({
                'reservation': r.confirmation, 'date': r.check_in.isoformat(),
                'rooms': r.room.number if r.room_id else '—',
                'room_charges': round(float(room_charges), 2), 'payments': round(float(payments), 2),
                'revenue': round(float(rate_revenue), 2),
            })
            grand['room_charges'] += room_charges
            grand['payments'] += payments
            grand['revenue'] += rate_revenue

        return Response({
            'date_from': date_from.isoformat(), 'date_to': date_to.isoformat(),
            'rows': rows,
            'grand_total': {k: round(float(v), 2) for k, v in grand.items()},
        })


class PaymentsReportView(APIView):
    def get(self, request):
        date_from, date_to = _period(request)
        qs = FolioCharge.objects.filter(
            charge_type='PAYMENT', is_void=False,
            created_at__date__gte=date_from, created_at__date__lte=date_to,
        ).select_related('folio', 'folio__reservation').order_by('created_at')
        qs = scope_qs(request, qs, hotel_path='folio__reservation__hotel')
        rows = [{
            'date': c.created_at.date().isoformat(), 'description': c.description,
            'reservation': c.folio.reservation.confirmation if c.folio_id else '—',
            'value': round(float(c.amount), 2),
        } for c in qs]
        return Response({
            'date_from': date_from.isoformat(), 'date_to': date_to.isoformat(),
            'rows': rows, 'total': round(sum(r['value'] for r in rows), 2),
        })


class ChargesReportView(APIView):
    def get(self, request):
        date_from, date_to = _period(request)
        qs = FolioCharge.objects.filter(
            is_void=False, created_at__date__gte=date_from, created_at__date__lte=date_to,
        ).exclude(charge_type__in=['ROOM', 'PAYMENT']).select_related('folio', 'folio__reservation')
        qs = scope_qs(request, qs, hotel_path='folio__reservation__hotel')

        by_item: dict = {}
        for c in qs:
            e = by_item.setdefault(c.description, {'item': c.description, 'quantity': 0, 'revenue': 0})
            e['quantity'] += 1
            e['revenue'] += c.amount
        rows = sorted(by_item.values(), key=lambda x: -x['revenue'])
        for row in rows:
            row['revenue'] = round(float(row['revenue']), 2)
        return Response({
            'date_from': date_from.isoformat(), 'date_to': date_to.isoformat(),
            'rows': rows, 'total': round(sum(r['revenue'] for r in rows), 2),
        })


class HousekeepingReportView(APIView):
    def get(self, request):
        date_from, date_to = _period(request)
        reservations = _active_reservations(request, date_from, date_to)

        rows = {d: {'date': d.isoformat(), 'check_ins': [], 'check_outs': [], 'stay_overs': []} for d in _daterange(date_from, date_to)}
        for r in reservations:
            room_no = r.room.number if r.room_id else '—'
            info = {'room': room_no, 'guest': r.guest.name, 'reservation': r.confirmation}
            if r.check_in in rows:
                rows[r.check_in]['check_ins'].append(info)
            if r.check_out in rows:
                rows[r.check_out]['check_outs'].append(info)
            d = max(r.check_in, date_from)
            end = min(r.check_out, date_to + timedelta(days=1))
            while d < end:
                if d in rows and d != r.check_in:
                    rows[d]['stay_overs'].append(info)
                d += timedelta(days=1)

        ordered = [rows[d] for d in sorted(rows)]
        for row in ordered:
            row['check_ins_count'] = len(row['check_ins'])
            row['check_outs_count'] = len(row['check_outs'])
            row['stay_overs_count'] = len(row['stay_overs'])
        return Response({'date_from': date_from.isoformat(), 'date_to': date_to.isoformat(), 'rows': ordered})
