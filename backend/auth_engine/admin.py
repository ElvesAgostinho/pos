from django.contrib import admin
from .models import UserSession, AuthEventLog

@admin.register(UserSession)
class UserSessionAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'pos_operator', 'workstation', 'status', 'login_time')
    list_filter = ('status', 'login_time')

@admin.register(AuthEventLog)
class AuthEventLogAdmin(admin.ModelAdmin):
    list_display = ('event_type', 'identity_attempt', 'workstation', 'timestamp')
    list_filter = ('event_type', 'timestamp')
