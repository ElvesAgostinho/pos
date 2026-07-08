from django.contrib import admin
from .models import (
    EnterpriseGroup, Company, Hotel
)

@admin.register(EnterpriseGroup)
class EnterpriseGroupAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_at')

@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ('name', 'tax_id', 'group')
    list_filter = ('group',)

@admin.register(Hotel)
class HotelAdmin(admin.ModelAdmin):
    list_display = ('name', 'location', 'company')
    list_filter = ('company',)
