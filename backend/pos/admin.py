from django.contrib import admin
from .models import (
    Outlet, POSProductConfig, OutletPaymentMethod,
    CashSession, CashMovement, POSTable, POSTicket, POSTicketLine, POSTicketPayment, POSDocument,
    POSAuditLog, PrintJob, POSReservation, POSLineModifier, GiftCard,
)


@admin.register(POSAuditLog)
class POSAuditLogAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'event_type', 'reference', 'operator_name', 'user', 'outlet', 'amount', 'ip_address')
    list_filter = ('event_type', 'outlet')
    search_fields = ('reference', 'operator_name', 'description')
    readonly_fields = [f.name for f in POSAuditLog._meta.fields]


@admin.register(POSDocument)
class POSDocumentAdmin(admin.ModelAdmin):
    list_display = ('full_number', 'document_type', 'ticket', 'customer_name', 'grand_total', 'status', 'issued_at')
    list_filter = ('document_type', 'status')
    search_fields = ('full_number', 'customer_name', 'customer_tax_id')


class POSTicketLineInline(admin.TabularInline):
    model = POSTicketLine
    extra = 0


class POSTicketPaymentInline(admin.TabularInline):
    model = POSTicketPayment
    extra = 0


@admin.register(POSTicket)
class POSTicketAdmin(admin.ModelAdmin):
    list_display = ('ticket_number', 'outlet', 'table', 'operator_name', 'status', 'grand_total', 'opened_at')
    list_filter = ('status', 'outlet')
    search_fields = ('ticket_number',)
    inlines = [POSTicketLineInline, POSTicketPaymentInline]


@admin.register(POSTable)
class POSTableAdmin(admin.ModelAdmin):
    list_display = ('table_number', 'name', 'outlet', 'zone', 'seats', 'status')
    list_filter = ('outlet', 'status')


class CashMovementInline(admin.TabularInline):
    model = CashMovement
    extra = 0


@admin.register(CashSession)
class CashSessionAdmin(admin.ModelAdmin):
    list_display = ('id', 'terminal_name', 'operator_name', 'status', 'opening_float', 'expected_amount', 'counted_amount', 'difference', 'opened_at', 'closed_at')
    list_filter = ('status', 'outlet')
    search_fields = ('terminal_name', 'operator_name')
    inlines = [CashMovementInline]


@admin.register(Outlet)
class OutletAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'outlet_type', 'hotel', 'is_active')
    list_filter = ('outlet_type', 'is_active', 'hotel')
    search_fields = ('code', 'name')


@admin.register(POSProductConfig)
class POSProductConfigAdmin(admin.ModelAdmin):
    list_display = ('item', 'outlet', 'is_available', 'pos_price', 'pos_category', 'sort_order')
    list_filter = ('outlet', 'is_available')
    search_fields = ('item__code', 'item__name')
    autocomplete_fields = ('item',)


@admin.register(OutletPaymentMethod)
class OutletPaymentMethodAdmin(admin.ModelAdmin):
    list_display = ('payment_method', 'outlet', 'is_active', 'sort_order')
    list_filter = ('outlet', 'is_active')


@admin.register(PrintJob)
class PrintJobAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'job_type', 'title', 'target', 'reference', 'status', 'printed_at')
    list_filter = ('job_type', 'status')
    search_fields = ('title', 'reference')


@admin.register(POSReservation)
class POSReservationAdmin(admin.ModelAdmin):
    list_display = ('guest_name', 'outlet', 'table', 'party_size', 'reserved_for', 'status')
    list_filter = ('status', 'outlet')
    search_fields = ('guest_name', 'phone')


@admin.register(GiftCard)
class GiftCardAdmin(admin.ModelAdmin):
    list_display = ('code', 'initial_balance', 'balance', 'is_active', 'created_at')
    search_fields = ('code',)


admin.site.register(POSLineModifier)
