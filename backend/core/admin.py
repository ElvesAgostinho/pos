from django.contrib import admin
from .models import GlobalConfig


@admin.register(GlobalConfig)
class GlobalConfigAdmin(admin.ModelAdmin):
    list_display = ('key',)
    search_fields = ('key',)
