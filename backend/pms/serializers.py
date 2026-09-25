from rest_framework import serializers
from .models import (
    RoomType, Room, RatePlan, RateOverride, Block, BlockRoomType, Reservation, Folio, FolioCharge, MealPlanEntry,
    NightAuditRun, LostFoundItem, HousekeepingTask, PhoneDirectoryEntry,
    BookingSettings, Channel, ChannelSyncLog, ChatbotSettings, Event,
)


class RoomTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoomType
        fields = '__all__'
        extra_kwargs = {'hotel': {'required': False}}


class RoomSerializer(serializers.ModelSerializer):
    room_type_name = serializers.CharField(source='room_type.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    floor_name = serializers.CharField(source='floor.name', read_only=True, default=None)

    class Meta:
        model = Room
        fields = '__all__'
        extra_kwargs = {'hotel': {'required': False}}


class RatePlanSerializer(serializers.ModelSerializer):
    room_type_name = serializers.CharField(source='room_type.name', read_only=True)
    room_type_code = serializers.CharField(source='room_type.code', read_only=True)

    class Meta:
        model = RatePlan
        fields = '__all__'
        extra_kwargs = {'hotel': {'required': False}}


class RateOverrideSerializer(serializers.ModelSerializer):
    class Meta:
        model = RateOverride
        fields = '__all__'


class BlockRoomTypeSerializer(serializers.ModelSerializer):
    room_type_name = serializers.CharField(source='room_type.name', read_only=True)
    rooms_picked_up = serializers.IntegerField(read_only=True)

    class Meta:
        model = BlockRoomType
        fields = '__all__'


class BlockSerializer(serializers.ModelSerializer):
    main_entity_name = serializers.CharField(source='main_entity.name', read_only=True, default=None)
    nights = serializers.IntegerField(read_only=True)
    room_types = BlockRoomTypeSerializer(many=True, read_only=True)
    reservations_count = serializers.IntegerField(source='reservations.count', read_only=True)
    default_rate_plan_code = serializers.CharField(source='default_rate_plan.code', read_only=True, default=None)
    total_rooms = serializers.SerializerMethodField()

    class Meta:
        model = Block
        fields = '__all__'
        extra_kwargs = {'hotel': {'required': False}}

    def get_total_rooms(self, obj):
        return sum(rt.rooms_blocked for rt in obj.room_types.all())


class FolioChargeSerializer(serializers.ModelSerializer):
    charge_type_display = serializers.CharField(source='get_charge_type_display', read_only=True)

    class Meta:
        model = FolioCharge
        fields = '__all__'


class FolioSerializer(serializers.ModelSerializer):
    charges = FolioChargeSerializer(many=True, read_only=True)
    charges_total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    payments_total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    balance = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    guest_name = serializers.CharField(source='reservation.guest.name', read_only=True)
    room_number = serializers.CharField(source='reservation.room.number', read_only=True, default=None)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    payer_type_display = serializers.CharField(source='get_payer_type_display', read_only=True)
    confirmation = serializers.CharField(source='reservation.confirmation', read_only=True)
    sibling_folios = serializers.SerializerMethodField()

    class Meta:
        model = Folio
        fields = '__all__'

    def get_sibling_folios(self, obj):
        return [{'id': f.id, 'number': f.number, 'label': f.label, 'status': f.status}
                for f in obj.reservation.folios.exclude(pk=obj.pk)]


class ReservationSerializer(serializers.ModelSerializer):
    guest_name = serializers.CharField(source='guest.name', read_only=True)
    guest_tax_id = serializers.CharField(source='guest.tax_id', read_only=True)
    room_type_name = serializers.CharField(source='room_type.name', read_only=True)
    room_number = serializers.CharField(source='room.number', read_only=True, default=None)
    block_code = serializers.CharField(source='block.code', read_only=True, default=None)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    source_display = serializers.CharField(source='get_source_display', read_only=True)
    segment_name = serializers.CharField(source='segment.name', read_only=True, default=None)
    subsegment_name = serializers.CharField(source='sub_segment.name', read_only=True, default=None)
    channel_name = serializers.CharField(source='channel.name', read_only=True, default=None)
    nights = serializers.IntegerField(read_only=True)
    folio_id = serializers.SerializerMethodField()
    folio_balance = serializers.SerializerMethodField()
    folios_count = serializers.IntegerField(source='folios.count', read_only=True)
    rate_plan_code = serializers.CharField(source='rate_plan.code', read_only=True, default=None)

    class Meta:
        model = Reservation
        fields = '__all__'
        extra_kwargs = {'hotel': {'required': False}, 'confirmation': {'required': False}}

    def get_folio_id(self, obj):
        f = obj.folio
        return f.id if f else None

    def get_folio_balance(self, obj):
        f = obj.folio
        return str(f.balance) if f else None


class NightAuditRunSerializer(serializers.ModelSerializer):
    hotel_name = serializers.CharField(source='hotel.name', read_only=True, default=None)

    class Meta:
        model = NightAuditRun
        fields = '__all__'
        extra_kwargs = {'hotel': {'required': False}}


class LostFoundItemSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    room_number = serializers.CharField(source='room.number', read_only=True, default=None)
    guest_name = serializers.CharField(source='guest.name', read_only=True, default=None)

    class Meta:
        model = LostFoundItem
        fields = '__all__'
        extra_kwargs = {'hotel': {'required': False}}


class HousekeepingTaskSerializer(serializers.ModelSerializer):
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    room_number = serializers.CharField(source='room.number', read_only=True, default=None)

    class Meta:
        model = HousekeepingTask
        fields = '__all__'
        extra_kwargs = {'hotel': {'required': False}}


class PhoneDirectoryEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = PhoneDirectoryEntry
        fields = '__all__'
        extra_kwargs = {'hotel': {'required': False}}


class MealPlanEntrySerializer(serializers.ModelSerializer):
    meal_display = serializers.CharField(source='get_meal_code_display', read_only=True)

    class Meta:
        model = MealPlanEntry
        fields = '__all__'


# ==========================================================================
# BOOKING ENGINE / CHANNEL MANAGER / CHATBOT / EMS
# ==========================================================================

class BookingSettingsSerializer(serializers.ModelSerializer):
    # `enabled` é o nome que BookingEngineView.tsx já usa em toda a parte —
    # o modelo guarda o mesmo valor como `is_active` (ver comentário no models.py).
    # `fields` é explícito (não '__all__') de propósito: `enabled` é o mesmo
    # valor que `is_active` (só com o nome que o ecrã já usa) — com '__all__'
    # o DRF gerava as DUAS chaves (is_active E enabled) para o mesmo campo.
    enabled = serializers.BooleanField(source='is_active', required=False)
    hotel_name = serializers.CharField(source='hotel.name', read_only=True)

    class Meta:
        model = BookingSettings
        fields = ['id', 'hotel', 'hotel_name', 'slug', 'api_key', 'enabled', 'currency',
                  'deposit_percent', 'payment_enabled', 'payment_provider', 'primary_color',
                  'welcome_text', 'cancellation_policy', 'custom_domain', 'logo_url',
                  'hero_image_url', 'min_advance_days', 'max_advance_days', 'created_at']
        extra_kwargs = {'hotel': {'required': False}, 'api_key': {'read_only': True}, 'slug': {'required': False}}


class ChannelSyncLogSerializer(serializers.ModelSerializer):
    channel_name = serializers.CharField(source='channel.name', read_only=True)
    # Nomes que ChannelManagerView.tsx já lê — o modelo usa `message`/`synced_at`
    # (ver comentário no models.py); o serializer expõe com os nomes do ecrã.
    summary = serializers.CharField(source='message', read_only=True)
    created_at = serializers.DateTimeField(source='synced_at', read_only=True)

    class Meta:
        model = ChannelSyncLog
        fields = ['id', 'channel', 'channel_name', 'direction', 'event', 'status', 'summary', 'created_at']


class ChannelSerializer(serializers.ModelSerializer):
    # `provider`/`provider_display` são os nomes que ChannelManagerView.tsx já
    # usa — o modelo guarda o mesmo valor como `ota_type` (mais alinhado com o
    # resto do PMS, que fala de "categorias"/"tipos"); ver models.py.
    provider = serializers.ChoiceField(source='ota_type', choices=Channel.OTA_TYPES)
    provider_display = serializers.CharField(source='get_ota_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    mapped_rooms = serializers.SerializerMethodField()
    last_sync_at = serializers.SerializerMethodField()

    class Meta:
        model = Channel
        fields = ['id', 'hotel', 'name', 'provider', 'provider_display', 'property_id', 'api_key',
                  'commission_percent', 'status', 'status_display', 'created_at', 'mapped_rooms', 'last_sync_at']
        extra_kwargs = {'hotel': {'required': False}}

    def get_mapped_rooms(self, obj):
        # Não existe (ainda) um modelo de mapeamento categoria-de-quarto ↔
        # categoria-na-OTA — devolve 0 com honestidade em vez de inventar um número.
        return 0

    def get_last_sync_at(self, obj):
        last = obj.sync_logs.order_by('-synced_at').first()
        return last.synced_at if last else None


class ChatbotSettingsSerializer(serializers.ModelSerializer):
    hotel_name = serializers.CharField(source='hotel.name', read_only=True)

    class Meta:
        model = ChatbotSettings
        fields = '__all__'
        extra_kwargs = {'hotel': {'required': False}}


class EventSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    # SerializerMethodField (não CharField(source='client.name', default=None)) de
    # propósito: um CharField de source composto com `default` fica inconsistente
    # logo a seguir a um `.save()` dentro do mesmo pedido (ex.: PATCH) — desaparece
    # da resposta nesse caso específico, mesmo continuando presente num GET normal.
    client_name = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = '__all__'
        extra_kwargs = {'hotel': {'required': False}}

    def get_client_name(self, obj):
        return obj.client.name if obj.client_id else None
