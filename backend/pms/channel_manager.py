"""
Channel Manager — sincronização com OTAs (Booking.com, Expedia, Airbnb…).

A estrutura (canal, credenciais, log de sincronização, anti-overbooking já
garantido pelo próprio modelo de Reservation/Room) está pronta e é real.
O que NÃO existe — e este ficheiro não finge que existe — é um cliente HTTP
homologado por cada OTA: Booking.com só dá a Connectivity API a parceiros
aprovados, o mesmo para a Expedia EPS Rapid, etc. (ver a tabela "Onde obter
as credenciais" no próprio ecrã). Por isso `_sync()`:
  - sem `api_key`/`property_id` preenchidos: nem tenta, regista SKIPPED;
  - com credenciais preenchidas: continua a não fingir sucesso — regista
    ERROR a dizer claramente que o conector desta OTA ainda não está
    implementado. O dia em que a Booking/Expedia aprovarem o acesso e um
    cliente HTTP real for escrito, é AQUI que ele substitui este comentário.
Isto segue a mesma disciplina já usada no resto do sistema para integrações
pendentes de credenciais (ver `core.models.IntegrationConnector`,
`fiscal/agt_client.py` — nunca simular um "sucesso" sem uma chamada real).
"""
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.tenancy import HotelScopedMixin
from .models import Channel, ChannelSyncLog, ChannelRoomMap
from .serializers import (
    ChannelSerializer, ChannelSyncLogSerializer, ChannelRoomMapSerializer,
)
from .views import HotelDefaultMixin


def _sync(channel, direction, event):
    # SEM MAPEAMENTO NÃO HÁ NADA PARA ENVIAR. A OTA não conhece o nosso
    # `RoomType`; conhece o código de quarto dela. Enviar disponibilidade antes
    # de alguém dizer "o nosso Standard é o quarto 12345 lá" é enviar números
    # sem destino — por isso esta é a primeira verificação, antes mesmo das
    # credenciais: é a que o dono consegue resolver sozinho, sem esperar pela
    # aprovação comercial da plataforma.
    if not channel.room_maps.filter(is_active=True).exists():
        return ChannelSyncLog.objects.create(
            channel=channel, direction=direction, event=event, status='SKIPPED',
            message='Nenhuma categoria de quarto mapeada neste canal — ligue as suas '
                    'categorias aos códigos de quarto da OTA (botão "Mapeamento") antes '
                    'de sincronizar.',
        )
    if not channel.api_key or not channel.property_id:
        log = ChannelSyncLog.objects.create(
            channel=channel, direction=direction, event=event, status='SKIPPED',
            message=f'Sem credenciais — preencha o Property ID e a Chave API de '
                     f'{channel.get_ota_type_display()} antes de sincronizar.',
        )
        return log
    # Ver o comentário do módulo: credenciais preenchidas, mas ainda não há
    # nenhum cliente HTTP real para esta OTA — não fingimos que o envio foi
    # feito só porque a chave existe.
    log = ChannelSyncLog.objects.create(
        channel=channel, direction=direction, event=event, status='ERROR',
        message=f'Credenciais guardadas, mas o conector de {channel.get_ota_type_display()} '
                 f'ainda não está implementado/homologado nesta instalação — nenhuma '
                 f'chamada foi feita à OTA.',
    )
    return log


class ChannelViewSet(HotelScopedMixin, HotelDefaultMixin, viewsets.ModelViewSet):
    queryset = Channel.objects.select_related('hotel').prefetch_related('sync_logs').all()
    serializer_class = ChannelSerializer

    @action(detail=True, methods=['post'], url_path='sync_availability')
    def sync_availability(self, request, pk=None):
        channel = self.get_object()
        log = _sync(channel, 'PUSH', 'availability')
        return Response(ChannelSyncLogSerializer(log).data)

    @action(detail=True, methods=['post'])
    def pull(self, request, pk=None):
        channel = self.get_object()
        log = _sync(channel, 'PULL', 'reservations')
        return Response(ChannelSyncLogSerializer(log).data)

    @action(detail=True, methods=['post'])
    def connect(self, request, pk=None):
        """Marca o canal como Ligado — ação manual de quem já verificou as
        credenciais fora do sistema (não é o sistema a certificar a ligação)."""
        channel = self.get_object()
        if not channel.api_key or not channel.property_id:
            return Response({'detail': 'Preencha o Property ID e a Chave API primeiro.'}, status=400)
        channel.status = 'CONNECTED'
        channel.save(update_fields=['status'])
        return Response(self.get_serializer(channel).data)

    @action(detail=True, methods=['post'])
    def disconnect(self, request, pk=None):
        channel = self.get_object()
        channel.status = 'DISCONNECTED'
        channel.save(update_fields=['status'])
        return Response(self.get_serializer(channel).data)

    @action(detail=False, methods=['post'])
    def sync_all(self, request):
        results = []
        for channel in self.get_queryset():
            log = _sync(channel, 'PUSH', 'availability')
            results.append(ChannelSyncLogSerializer(log).data)
        return Response({'synced': len(results), 'results': results})


class ChannelRoomMapViewSet(viewsets.ModelViewSet):
    """O MAPEAMENTO: a nossa categoria ↔ o código do quarto na OTA.

    É a peça que faltava para o Channel Manager poder sincronizar seja o que
    for — e a razão por que o ecrã mostrava sempre "0 tipo(s) mapeado(s)".
    """
    queryset = ChannelRoomMap.objects.select_related('channel', 'room_type', 'rate_plan').all()
    serializer_class = ChannelRoomMapSerializer

    def get_queryset(self):
        from core.tenancy import scope_qs
        qs = scope_qs(self.request, super().get_queryset(), hotel_path='channel__hotel')
        canal = self.request.query_params.get('channel')
        return qs.filter(channel_id=canal) if canal else qs

    @action(detail=False, methods=['post'], url_path='auto-map')
    def auto_map(self, request):
        """Propõe o mapeamento de todas as categorias ainda por ligar, usando o
        nosso próprio código de categoria como código na OTA.

        Não é adivinhar: várias plataformas deixam o hotel escolher o seu
        próprio identificador, e nos restantes casos isto poupa a criação das
        linhas — depois corrige-se o `ota_room_id` de cada uma, que é muito
        menos trabalho do que criar tudo à mão. Nunca mexe num mapeamento que
        já exista.
        """
        from .models import RoomType
        try:
            canal = Channel.objects.get(pk=request.data.get('channel'))
        except (Channel.DoesNotExist, ValueError, TypeError):
            return Response({'detail': 'Canal inválido.'}, status=400)

        from core.tenancy import scope_qs
        if not scope_qs(request, Channel.objects.filter(pk=canal.pk)).exists():
            return Response({'detail': 'Não tem acesso a este canal.'}, status=403)

        ja_mapeadas = set(canal.room_maps.values_list('room_type_id', flat=True))
        usados = set(canal.room_maps.values_list('ota_room_id', flat=True))
        criados = []
        for rt in RoomType.objects.filter(hotel=canal.hotel, is_active=True):
            if rt.id in ja_mapeadas or rt.code in usados:
                continue
            criados.append(ChannelRoomMap.objects.create(
                channel=canal, room_type=rt, ota_room_id=rt.code))
            usados.add(rt.code)
        return Response({
            'created': len(criados),
            'detail': (f'{len(criados)} categoria(s) ligada(s) ao canal. Confirme o ID de cada '
                       f'quarto no painel da {canal.get_ota_type_display()} e corrija se for '
                       f'diferente.') if criados else 'Já estavam todas as categorias mapeadas.',
            'results': ChannelRoomMapSerializer(criados, many=True).data,
        }, status=201 if criados else 200)


class ChannelSyncLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ChannelSyncLog.objects.select_related('channel').all()
    serializer_class = ChannelSyncLogSerializer

    def get_queryset(self):
        from core.tenancy import scope_qs
        qs = scope_qs(self.request, super().get_queryset(), hotel_path='channel__hotel')
        channel = self.request.query_params.get('channel')
        if channel:
            qs = qs.filter(channel_id=channel)
        return qs
