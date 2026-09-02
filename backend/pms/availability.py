"""
Disponibilidade — o gráfico/lista que responde "quantos quartos livres tenho,
por categoria, em cada dia deste período?". É a MESMA pergunta que qualquer
rececionista faz antes de aceitar uma reserva nova.
"""
from datetime import date, timedelta

from rest_framework.views import APIView
from rest_framework.response import Response

from core.tenancy import scope_qs
from .models import RoomType, Room, Reservation, Block, BlockRoomType


def _parse(d, default):
    try:
        return date.fromisoformat(d) if d else default
    except ValueError:
        return default


BOOKED_STATUS = ('BOOKED', 'CHECKED_IN')


class AvailabilityView(APIView):
    """GET /api/pms/availability/?date_from=&date_to=&room_type=&block=
    &include_allotment=1&only_guaranteed=1
    Devolve, por categoria e por dia: total de quartos, livres e a reserva
    dividida por estado real (reservado/opção/lista de espera), mais
    overbooking e allotment (quartos retidos por blocos, não fatura própria)."""

    def get(self, request):
        p = request.query_params
        today = date.today()
        d_from = _parse(p.get('date_from'), today)
        d_to = _parse(p.get('date_to'), today + timedelta(days=6))
        if d_to < d_from:
            d_from, d_to = d_to, d_from
        days = [d_from + timedelta(days=i) for i in range((d_to - d_from).days + 1)]

        room_types = scope_qs(request, RoomType.objects.filter(is_active=True))
        rt_id = p.get('room_type')
        if rt_id:
            room_types = room_types.filter(pk=rt_id)
        rt_ids = list(room_types.values_list('id', flat=True))

        inventory = {}
        for rt in room_types:
            inventory[rt.id] = scope_qs(request, Room.objects.filter(room_type=rt, is_active=True)).count()

        reservas_qs = (Reservation.objects
                       .filter(room_type__in=room_types)
                       .filter(check_in__lte=d_to, check_out__gte=d_from))
        block_id = p.get('block')
        if block_id:
            reservas_qs = reservas_qs.filter(block_id=block_id)
        reservations = list(scope_qs(request, reservas_qs))

        include_allotment = p.get('include_allotment') in ('1', 'true', 'True')
        only_guaranteed = p.get('only_guaranteed') in ('1', 'true', 'True')
        allotment_hold = {}   # (room_type_id, date) -> quartos retidos por blocos, ainda não "pickup"
        if include_allotment:
            blocks = scope_qs(request, Block.objects.filter(valid_from__lte=d_to, valid_to__gte=d_from))
            if block_id:
                blocks = blocks.filter(pk=block_id)
            if only_guaranteed:
                blocks = blocks.filter(is_guaranteed=True)
            brt_qs = (BlockRoomType.objects
                      .filter(block__in=blocks, room_type_id__in=rt_ids, date__gte=d_from, date__lte=d_to))
            for brt in brt_qs.select_related('block'):
                held = max(brt.rooms_blocked - brt.rooms_picked_up, 0)
                if held:
                    key = (brt.room_type_id, brt.date)
                    allotment_hold[key] = allotment_hold.get(key, 0) + held

        by_category = []
        for rt in room_types:
            total = inventory.get(rt.id, 0)
            series = []
            for day in days:
                live_here = [r for r in reservations if r.room_type_id == rt.id
                             and r.check_in <= day < r.check_out]
                booked = sum(1 for r in live_here if r.status in BOOKED_STATUS)
                option = sum(1 for r in live_here if r.status == 'OPTION')
                waitlist = sum(1 for r in live_here if r.status == 'WAITLIST')
                allotment = allotment_hold.get((rt.id, day), 0)
                reserved = booked + option + waitlist + allotment
                free = max(total - reserved, 0)
                overbook = max(reserved - total, 0)
                series.append({
                    'date': day.isoformat(), 'total': total, 'reserved': reserved,
                    'booked': booked, 'option': option, 'waitlist': waitlist, 'allotment': allotment,
                    'free': free, 'overbook': overbook,
                })
            by_category.append({'room_type': rt.id, 'code': rt.code, 'name': rt.name,
                                'total': total, 'days': series})

        # Totais agregados (todas as categorias juntas) — a série do gráfico principal.
        total_days = []
        for i, day in enumerate(days):
            total = sum(c['total'] for c in by_category)
            row = {k: sum(c['days'][i][k] for c in by_category)
                   for k in ('reserved', 'booked', 'option', 'waitlist', 'allotment', 'overbook')}
            row.update({'date': day.isoformat(), 'total': total, 'free': max(total - row['reserved'], 0)})
            total_days.append(row)

        return Response({'date_from': d_from.isoformat(), 'date_to': d_to.isoformat(),
                         'total': total_days, 'by_category': by_category})
