from django.contrib import admin
from .models import Guest, RoomType, Room, Reservation, Folio, FolioCharge


@admin.register(Guest)
class GuestAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'hotel', 'document_id', 'phone', 'vip')
    search_fields = ('full_name', 'document_id', 'tax_id', 'email')


@admin.register(RoomType)
class RoomTypeAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'hotel', 'capacity', 'base_rate', 'is_active')


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ('number', 'hotel', 'room_type', 'floor', 'status', 'is_active')
    list_filter = ('status', 'hotel')


class FolioChargeInline(admin.TabularInline):
    model = FolioCharge
    extra = 0


@admin.register(Reservation)
class ReservationAdmin(admin.ModelAdmin):
    list_display = ('confirmation', 'guest', 'room_type', 'room', 'check_in', 'check_out', 'status')
    list_filter = ('status', 'hotel')
    search_fields = ('confirmation', 'guest__full_name')


@admin.register(Folio)
class FolioAdmin(admin.ModelAdmin):
    list_display = ('number', 'reservation', 'status', 'opened_at')
    inlines = [FolioChargeInline]
