from django.contrib import admin
from .models import SoftwareRelease, WorkstationUpdateStatus

@admin.register(SoftwareRelease)
class SoftwareReleaseAdmin(admin.ModelAdmin):
    list_display = ('version_number', 'target_module', 'release_date', 'is_mandatory')
    list_filter = ('target_module', 'is_mandatory')

@admin.register(WorkstationUpdateStatus)
class WorkstationUpdateStatusAdmin(admin.ModelAdmin):
    list_display = ('workstation', 'release', 'status', 'last_checked')
    list_filter = ('status', 'release__version_number')
