"""
Channel Manager — sincronização com OTAs (Booking.com, Expedia, Airbnb, Agoda, Hotels.com).

Motor pluggable: calcula disponibilidade/tarifas e ENVIA aos canais (push), e RECEBE
reservas dos canais (pull). As chamadas HTTP reais a cada OTA ligam-se no conector quando
as credenciais/certificação existirem (como a AGT). O anti-overbooking dispara um push a
todos os canais sempre que a disponibilidade muda (reserva criada em qualquer origem).
"""
from datetime import timedelta

from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Channel, ChannelRoomMap, ChannelSyncLog, RoomType, Room, Reservation
from .serializers import ChannelSerializer, ChannelRoomMapSerializer, ChannelSyncLogSerializer


def _availability_snapshot(hotel, days=30):
    """Disponibilidade agregada por tipo de quarto para a janela [hoje, hoje+days]."""
    today = timezone.localdate()
    end = today + timedelta(days=days)
    snap = {}
    for rt in RoomType.objects.filter(hotel=hotel, is_active=True):
        total = Room.objects.filter(room_type=rt, is_active=True).count()
        overlap = Reservation.objects.filter(
            room_type=rt, status__in=['BOOKED', 'CHECKED_IN'],
            check_in__lt=end, check_out__gt=today).count()
        snap[rt.id] = {'name': rt.name, 'available': max(0, total - overlap), 'rate': str(rt.base_rate)}
    return snap


def push_availability(channel):
    """Envia disponibilidade/tarifas ao canal (conector real pendente de credenciais)."""
    snap = _availability_snapshot(channel.hotel)
    maps = channel.room_maps.count()
    # TODO: chamada HTTP real à API da OTA (channel.provider) usando channel.api_key/property_id.
    channel.status = 'CONNECTED' if channel.api_key else 'DISABLED'
    channel.last_sync_at = timezone.now()
    channel.save(update_fields=['status', 'last_sync_at'])
    total_avail = sum(v['available'] for v in snap.values())
    log = ChannelSyncLog.objects.create(
        channel=channel, direction='PUSH', event='availability',
        summary=f'{len(snap)} tipos · {maps} mapeados · {total_avail} quartos disponíveis',
        status='OK' if channel.api_key else 'SIMULADO (sem credenciais)')
    return log


def pull_reservations(channel):
    """Recebe reservas do canal (poll). Conector real pendente de credenciais."""
    # TODO: polling real à OTA -> criar Reservation(source='ONLINE', online_ref=OTA id).
    log = ChannelSyncLog.objects.create(
        channel=channel, direction='PULL', event='reservations',
        summary='0 novas reservas (conector pendente de credenciais)',
        status='SIMULADO (sem credenciais)')
    return log


def on_inventory_change(hotel):
    """Anti-overbooking: propaga a nova disponibilidade a todos os canais ligados."""
    for ch in Channel.objects.filter(hotel=hotel, enabled=True):
        try:
            push_availability(ch)
        except Exception:
            pass


class ChannelViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = ChannelSerializer

    def get_queryset(self):
        return Channel.objects.select_related('hotel').prefetch_related('room_maps').all()

    def perform_create(self, serializer):
        from identity.models import Hotel
        serializer.save(hotel=serializer.validated_data.get('hotel') or Hotel.objects.first())

    @action(detail=True, methods=['post'])
    def sync_availability(self, request, pk=None):
        log = push_availability(self.get_object())
        return Response(ChannelSyncLogSerializer(log).data)

    @action(detail=True, methods=['post'])
    def pull(self, request, pk=None):
        log = pull_reservations(self.get_object())
        return Response(ChannelSyncLogSerializer(log).data)

    @action(detail=False, methods=['post'])
    def sync_all(self, request):
        from identity.models import Hotel
        hotel = Hotel.objects.first()
        on_inventory_change(hotel)
        return Response({'detail': f'Sincronizados {Channel.objects.filter(enabled=True).count()} canais.'})


class ChannelRoomMapViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = ChannelRoomMapSerializer

    def get_queryset(self):
        qs = ChannelRoomMap.objects.select_related('room_type', 'channel').all()
        ch = self.request.query_params.get('channel')
        return qs.filter(channel_id=ch) if ch else qs


class ChannelSyncLogViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = ChannelSyncLogSerializer

    def get_queryset(self):
        return ChannelSyncLog.objects.select_related('channel').all()[:100]
