from django.contrib import admin
from .models import (FiscalConfig, FiscalDocType, FiscalSeries, FiscalDocument,
                     FiscalDocumentLine, SubmissionQueue, FiscalAuditLog,
                     AGTConnection, DigitalCertificate)


@admin.register(AGTConnection)
class AGTConnectionAdmin(admin.ModelAdmin):
    list_display = ('name', 'environment', 'is_active', 'last_health_status', 'last_health_at')
    exclude = ('client_secret_enc', 'password_enc', 'api_key_enc', 'access_token', 'refresh_token')


@admin.register(DigitalCertificate)
class DigitalCertificateAdmin(admin.ModelAdmin):
    list_display = ('alias', 'status', 'algorithm', 'key_bits', 'valid_until', 'is_default')
    list_filter = ('status',)
    exclude = ('private_key_enc', 'private_key_password_enc')


@admin.register(FiscalConfig)
class FiscalConfigAdmin(admin.ModelAdmin):
    list_display = ('company_name', 'company_nif', 'environment', 'certificate_number', 'key_version')


@admin.register(FiscalDocType)
class FiscalDocTypeAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'saft_type', 'signable', 'prints_mention', 'is_rectifying', 'is_active')
    list_filter = ('saft_type', 'signable', 'is_active')


@admin.register(FiscalSeries)
class FiscalSeriesAdmin(admin.ModelAdmin):
    list_display = ('code', 'doc_type', 'year', 'current_number', 'certified', 'environment', 'is_active')
    list_filter = ('environment', 'certified', 'is_active')


class LineInline(admin.TabularInline):
    model = FiscalDocumentLine
    extra = 0


@admin.register(FiscalDocument)
class FiscalDocumentAdmin(admin.ModelAdmin):
    list_display = ('invoice_no', 'doc_date', 'customer_name', 'gross_total', 'status', 'key_version')
    list_filter = ('status', 'doc_type', 'series')
    search_fields = ('invoice_no', 'customer_name', 'customer_tax_id')
    readonly_fields = [f.name for f in FiscalDocument._meta.fields]
    inlines = [LineInline]

    # Imutabilidade legal (AGT): documentos fiscais NÃO se apagam nem editam.
    # Correção/anulação faz-se por Nota de Crédito/Débito ou pelo estado 'Anulado'.
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(SubmissionQueue)
class SubmissionQueueAdmin(admin.ModelAdmin):
    list_display = ('document', 'status', 'attempts', 'created_at', 'sent_at')
    list_filter = ('status',)


@admin.register(FiscalAuditLog)
class FiscalAuditLogAdmin(admin.ModelAdmin):
    list_display = ('event', 'document_ref', 'user', 'ip_address', 'created_at')
    list_filter = ('event',)


from .models import CommercialDocument, CommercialDocumentLine


class CommercialLineInline(admin.TabularInline):
    model = CommercialDocumentLine
    extra = 0


@admin.register(CommercialDocument)
class CommercialDocumentAdmin(admin.ModelAdmin):
    list_display = ('number', 'kind', 'state', 'customer_name', 'gross_total', 'converted_to', 'created_at')
    list_filter = ('kind', 'state')
    search_fields = ('number', 'customer_name', 'customer_tax_id')
    inlines = [CommercialLineInline]
