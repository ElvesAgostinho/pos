"""
Balcão de Receção (Front Desk) — o ecrã de trabalho do rececionista.

Não é a lista de reservas: é o DIA. Responde às três perguntas que a receção faz
a cada minuto — quem chega hoje, quem está cá dentro, quem sai hoje — e mostra
os bloqueios que impedem cada operação (quarto por atribuir, quarto sujo, folio
com saldo em aberto). É o equivalente ao "Front Desk" do Opera.
"""
from datetime import date, timedelta

from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response

from core.tenancy import scope_qs
from .models import Reservation, Room, Folio
from .serializers import ReservationSerializer


def _parse(d, default):
    try:
        return date.fromisoformat(d) if d else default
    except ValueError:
        return default


def _blockers(res, business_date):
    """Porque é que esta reserva NÃO pode avançar (o rececionista tem de saber já)."""
    out = []
    if res.status == 'BOOKED':
        if not res.room:
            out.append('Quarto por atribuir')
        elif res.room.status == 'OCCUPIED':
            out.append(f'Quarto {res.room.number} ainda ocupado')
        elif res.room.status == 'VACANT_DIRTY':
            out.append(f'Quarto {res.room.number} por limpar')
        elif res.room.status == 'OUT_OF_ORDER':
            out.append(f'Quarto {res.room.number} fora de serviço')
        if res.check_in < business_date:
            out.append('Chegada em atraso (devia ter entrado antes)')
    if res.status == 'CHECKED_IN':
        folio = getattr(res, 'folio', None)
        if folio and folio.balance and folio.balance > 0:
            out.append(f'Conta em aberto: {folio.balance}')
        if res.check_out < business_date:
            out.append('Saída em atraso (devia ter saído)')
    return out


def _pack(qs, business_date):
    rows = []
    for r in qs:
        d = ReservationSerializer(r).data
        d['blockers'] = _blockers(r, business_date)
        d['ready'] = not d['blockers']
        rows.append(d)
    return rows


class FrontDeskView(APIView):
    """GET /api/pms/frontdesk/?date=YYYY-MM-DD"""

    def get(self, request):
        today = _parse(request.query_params.get('date'), date.today())
        # Isolamento: o rececionista só vê o SEU hotel.
        base = scope_qs(request, (Reservation.objects
                                  .select_related('guest', 'room', 'room_type', 'folio')
                                  .order_by('check_in')))

        arrivals = base.filter(check_in=today, status='BOOKED')
        # Chegadas em atraso: era para terem entrado e continuam por entrar.
        overdue_in = base.filter(check_in__lt=today, status='BOOKED')
        inhouse = base.filter(status='CHECKED_IN')
        departures = base.filter(check_out=today, status='CHECKED_IN')
        overdue_out = base.filter(check_out__lt=today, status='CHECKED_IN')

        rooms = scope_qs(request, Room.objects.select_related('room_type').all())
        by_status = {}
        for r in rooms:
            by_status[r.status] = by_status.get(r.status, 0) + 1
        total_rooms = rooms.count() or 1
        occupied = by_status.get('OCCUPIED', 0)

        # Quartos disponíveis para atribuir hoje (limpos e livres).
        available = [
            {'id': r.id, 'number': r.number, 'room_type': r.room_type_id,
             'room_type_name': r.room_type.name, 'status': r.status, 'floor': r.floor}
            for r in rooms.filter(status='VACANT_CLEAN')
        ]

        open_folios = scope_qs(request, Folio.objects.filter(status='OPEN'), 'reservation__hotel')
        due = sum((f.balance for f in open_folios), 0)

        return Response({
            'business_date': today.isoformat(),
            'kpi': {
                'arrivals': arrivals.count(),
                'departures': departures.count(),
                'inhouse': inhouse.count(),
                'overdue_in': overdue_in.count(),
                'overdue_out': overdue_out.count(),
                'occupancy': round(occupied * 100.0 / total_rooms, 1),
                'rooms_total': total_rooms,
                'rooms_occupied': occupied,
                'rooms_clean': by_status.get('VACANT_CLEAN', 0),
                'rooms_dirty': by_status.get('VACANT_DIRTY', 0),
                'rooms_ooo': by_status.get('OUT_OF_ORDER', 0),
                'balance_due': str(due),
            },
            'arrivals': _pack(list(arrivals) + list(overdue_in), today),
            'inhouse': _pack(inhouse, today),
            'departures': _pack(list(departures) + list(overdue_out), today),
            'available_rooms': available,
        })
