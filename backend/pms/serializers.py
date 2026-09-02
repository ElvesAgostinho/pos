from rest_framework import serializers
from .models import (
    RoomType, Room, RatePlan, Block, BlockRoomType, Reservation, Folio, FolioCharge, MealPlanEntry,
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


class MealPlanEntrySerializer(serializers.ModelSerializer):
    meal_display = serializers.CharField(source='get_meal_code_display', read_only=True)

    class Meta:
        model = MealPlanEntry
        fields = '__all__'
