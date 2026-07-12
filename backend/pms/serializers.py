from rest_framework import serializers
from .models import Guest, RoomType, Room, Reservation, Folio, FolioCharge


class GuestSerializer(serializers.ModelSerializer):
    hotel = serializers.PrimaryKeyRelatedField(queryset=Guest._meta.get_field('hotel').related_model.objects.all(), required=False)

    class Meta:
        model = Guest
        fields = '__all__'


class RoomTypeSerializer(serializers.ModelSerializer):
    hotel = serializers.PrimaryKeyRelatedField(queryset=RoomType._meta.get_field('hotel').related_model.objects.all(), required=False)

    class Meta:
        model = RoomType
        fields = '__all__'


class RoomSerializer(serializers.ModelSerializer):
    hotel = serializers.PrimaryKeyRelatedField(queryset=Room._meta.get_field('hotel').related_model.objects.all(), required=False)
    room_type_name = serializers.CharField(source='room_type.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Room
        fields = '__all__'


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
    guest_name = serializers.CharField(source='reservation.guest.full_name', read_only=True)
    room_number = serializers.CharField(source='reservation.room.number', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    payer_type_display = serializers.CharField(source='get_payer_type_display', read_only=True)
    confirmation = serializers.CharField(source='reservation.confirmation', read_only=True)
    # As outras contas da MESMA reserva (para transferir lançamentos entre elas).
    sibling_folios = serializers.SerializerMethodField()

    class Meta:
        model = Folio
        fields = '__all__'

    def get_sibling_folios(self, obj):
        return [{'id': f.id, 'number': f.number, 'label': f.label, 'status': f.status}
                for f in obj.reservation.folios.exclude(pk=obj.pk)]


class ReservationSerializer(serializers.ModelSerializer):
    confirmation = serializers.CharField(required=False)
    hotel = serializers.PrimaryKeyRelatedField(queryset=Reservation._meta.get_field('hotel').related_model.objects.all(), required=False)
    guest_name = serializers.CharField(source='guest.full_name', read_only=True)
    room_type_name = serializers.CharField(source='room_type.name', read_only=True)
    room_number = serializers.CharField(source='room.number', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    nights = serializers.IntegerField(read_only=True)
    folio_id = serializers.IntegerField(source='folio.id', read_only=True)
    folio_balance = serializers.DecimalField(source='folio.balance', max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = Reservation
        fields = '__all__'


from .models import HousekeepingTask, MaintenanceOrder, RatePlan


class HousekeepingTaskSerializer(serializers.ModelSerializer):
    room_number = serializers.CharField(source='room.number', read_only=True)
    room_status = serializers.CharField(source='room.status', read_only=True)
    task_type_display = serializers.CharField(source='get_task_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = HousekeepingTask
        fields = '__all__'


class MaintenanceOrderSerializer(serializers.ModelSerializer):
    room_number = serializers.CharField(source='room.number', read_only=True, default=None)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)

    class Meta:
        model = MaintenanceOrder
        fields = '__all__'
        extra_kwargs = {'hotel': {'required': False}}


class RatePlanSerializer(serializers.ModelSerializer):
    room_type_name = serializers.CharField(source='room_type.name', read_only=True)
    room_type_code = serializers.CharField(source='room_type.code', read_only=True)

    class Meta:
        model = RatePlan
        fields = '__all__'
        extra_kwargs = {'hotel': {'required': False}}


from .models import LaundryOrder, MinibarItem, SpaAppointment


class LaundryOrderSerializer(serializers.ModelSerializer):
    room_number = serializers.CharField(source='room.number', read_only=True, default=None)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = LaundryOrder
        fields = '__all__'
        extra_kwargs = {'hotel': {'required': False}}


class MinibarItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = MinibarItem
        fields = '__all__'
        extra_kwargs = {'hotel': {'required': False}}


class SpaAppointmentSerializer(serializers.ModelSerializer):
    room_number = serializers.CharField(source='room.number', read_only=True, default=None)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = SpaAppointment
        fields = '__all__'
        extra_kwargs = {'hotel': {'required': False}}


from .models import CorporateAccount, NightAuditLog


class CorporateAccountSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)
    available_credit = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)

    class Meta:
        model = CorporateAccount
        fields = '__all__'
        extra_kwargs = {'hotel': {'required': False}}


class NightAuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = NightAuditLog
        fields = '__all__'


from .models import BookingSetting


class BookingSettingSerializer(serializers.ModelSerializer):
    hotel_name = serializers.CharField(source='hotel.name', read_only=True)

    class Meta:
        model = BookingSetting
        fields = '__all__'
        read_only_fields = ('api_key', 'slug')
        extra_kwargs = {'hotel': {'required': False}}


from .models import Channel, ChannelRoomMap, ChannelSyncLog


class ChannelSerializer(serializers.ModelSerializer):
    provider_display = serializers.CharField(source='get_provider_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    mapped_rooms = serializers.IntegerField(source='room_maps.count', read_only=True)

    class Meta:
        model = Channel
        fields = '__all__'
        extra_kwargs = {'hotel': {'required': False}, 'api_key': {'write_only': True}}


class ChannelRoomMapSerializer(serializers.ModelSerializer):
    room_type_name = serializers.CharField(source='room_type.name', read_only=True)

    class Meta:
        model = ChannelRoomMap
        fields = '__all__'


class ChannelSyncLogSerializer(serializers.ModelSerializer):
    channel_name = serializers.CharField(source='channel.name', read_only=True)

    class Meta:
        model = ChannelSyncLog
        fields = '__all__'
