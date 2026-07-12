from django.contrib import admin
from .models import (
    Client, Contact, CommercialData, License, Installation, Equipment,
    AuditLogCLM, TerminalLicense
)


class ContactInline(admin.TabularInline):
    model = Contact
    extra = 0


class CommercialDataInline(admin.StackedInline):
    model = CommercialData
    extra = 0


class LicenseInline(admin.TabularInline):
    model = License
    extra = 0
    fields = ('license_number', 'plan', 'modules', 'valid_until', 'is_active')


class TerminalLicenseInline(admin.TabularInline):
    model = TerminalLicense
    extra = 0
    fields = ('terminal_id', 'asset_type', 'activation_key', 'status')


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ('code', 'commercial_name', 'nif', 'country', 'status', 'created_at')
    list_filter = ('status', 'client_type', 'country')
    search_fields = ('code', 'commercial_name', 'nif')
    inlines = [CommercialDataInline, ContactInline, LicenseInline, TerminalLicenseInline]


@admin.register(License)
class LicenseAdmin(admin.ModelAdmin):
    list_display = ('license_number', 'client', 'plan', 'valid_until', 'is_active', 'created_at')
    list_filter = ('is_active', 'plan')
    search_fields = ('license_number', 'client__commercial_name')


@admin.register(TerminalLicense)
class TerminalLicenseAdmin(admin.ModelAdmin):
    list_display = ('terminal_id', 'client', 'asset_type', 'status', 'activated_at')
    list_filter = ('status', 'asset_type')
    search_fields = ('terminal_id', 'activation_key', 'client__commercial_name')


@admin.register(Installation)
class InstallationAdmin(admin.ModelAdmin):
    list_display = ('name', 'client', 'install_type', 'server_ip', 'version', 'last_ping')
    list_filter = ('install_type',)


@admin.register(AuditLogCLM)
class AuditLogCLMAdmin(admin.ModelAdmin):
    list_display = ('action', 'user_identity', 'timestamp')
    list_filter = ('action', 'timestamp')
    search_fields = ('action', 'user_identity')
