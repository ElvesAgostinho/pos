from django.contrib import admin
from .models import Peripheral, WorkstationPeripheral


class WorkstationPeripheralInline(admin.TabularInline):
    model = WorkstationPeripheral
    extra = 0


@admin.register(Peripheral)
class PeripheralAdmin(admin.ModelAdmin):
    list_display = ('peripheral_type', 'brand', 'model', 'serial_number', 'connection_type', 'status', 'hotel')
    list_filter = ('peripheral_type', 'status', 'connection_type', 'hotel')
    search_fields = ('brand', 'model', 'serial_number')
    inlines = [WorkstationPeripheralInline]


@admin.register(WorkstationPeripheral)
class WorkstationPeripheralAdmin(admin.ModelAdmin):
    list_display = ('workstation', 'peripheral', 'logical_purpose', 'is_active')
    list_filter = ('logical_purpose', 'is_active')
