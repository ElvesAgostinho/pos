"""
Front Desk — "Estado Hotel": o painel do dia da receção (chegadas, saídas,
ocupação e o mapa de quartos com quem está em cada um). Só leitura, agregado
só sobre Room/Reservation já existentes — nenhum modelo novo.
"""
from datetime import date as date_cls

from rest_framework.views import APIView
from rest_framework.response import Response

from core.tenancy import scope_qs
from .models import Reservation, Room


def _res_row(r, extra=None):
    row = {
        'id': r.id, 'confirmation': r.confirmation,
        'guest_name': r.guest.name if r.guest_id else None,
        'room_number': r.room.number if r.room_id else None,
        'room_type_name': r.room_type.name if r.room_type_id else None,
        'adults': r.adults, 'children': r.children,
        'status': r.status, 'status_display': r.get_status_display(),
        'check_in': r.check_in.isoformat(), 'check_out': r.check_out.isoformat(),
    }
    if extra:
        row.update(extra)
    return row


class HotelStatusView(APIView):
    """GET pms/frontdesk/hotel-status/ — chegadas de hoje, saídas de hoje,
    ocupação atual e o mapa de quartos (cada quarto, o seu estado e, se
    ocupado, a reserva que lá está)."""

    def get(self, request):
        today = date_cls.today()

        arrivals_qs = (scope_qs(request, Reservation.objects.select_related('guest', 'room', 'room_type'))
                        .filter(check_in=today, status__in=['OPTION', 'BOOKED', 'CHECKED_IN'])
                        .order_by('room__number', 'confirmation'))
        departures_qs = (scope_qs(request, Reservation.objects.select_related('guest', 'room', 'room_type'))
                          .filter(check_out=today, status__in=['CHECKED_IN', 'CHECKED_OUT'])
                          .order_by('room__number', 'confirmation'))

        arrivals = [_res_row(r, {'arrived': r.status == 'CHECKED_IN'}) for r in arrivals_qs]
        departures = [_res_row(r, {'departed': r.status == 'CHECKED_OUT'}) for r in departures_qs]

        rooms_qs = scope_qs(request, Room.objects.filter(is_active=True).select_related('room_type'))
        total_rooms = rooms_qs.count()
        occupied_rooms = rooms_qs.filter(status='OCCUPIED').count()

        current_by_room = {
            r.room_id: r for r in
            scope_qs(request, Reservation.objects.select_related('guest'))
            .filter(status='CHECKED_IN', room__isnull=False)
        }

        rooms = []
        for room in rooms_qs.order_by('number'):
            cur = current_by_room.get(room.id)
            rooms.append({
                'id': room.id, 'number': room.number,
                'room_type_name': room.room_type.name if room.room_type_id else None,
                'status': room.status, 'status_display': room.get_status_display(),
                'reservation': ({
                    'id': cur.id, 'confirmation': cur.confirmation,
                    'guest_name': cur.guest.name if cur.guest_id else None,
                    'check_in': cur.check_in.isoformat(), 'check_out': cur.check_out.isoformat(),
                } if cur else None),
            })

        return Response({
            'date': today.isoformat(),
            'arrivals': arrivals, 'arrivals_count': len(arrivals),
            'departures': departures, 'departures_count': len(departures),
            'occupancy': {
                'occupied': occupied_rooms, 'total': total_rooms,
                'pct': round(occupied_rooms / total_rooms * 100, 1) if total_rooms else 0,
            },
            'rooms': rooms,
        })
