from django.contrib import admin
from .models import TelemetryEvent, SystemAlert

@admin.register(TelemetryEvent)
class TelemetryEventAdmin(admin.ModelAdmin):
    list_display = ('severity', 'service', 'event_type', 'execution_time_ms', 'timestamp')
    list_filter = ('severity', 'service', 'event_type')
    search_fields = ('service', 'event_type', 'payload')

@admin.register(SystemAlert)
class SystemAlertAdmin(admin.ModelAdmin):
    list_display = ('title', 'is_resolved', 'created_at', 'resolved_at')
    list_filter = ('is_resolved',)
