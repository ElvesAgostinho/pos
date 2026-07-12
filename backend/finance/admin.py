from django.contrib import admin
from .models import CostCenter, FinanceAccount, Receipt, PaymentVoucher, Invoice, InvoiceLine


@admin.register(CostCenter)
class CostCenterAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'hotel', 'is_active')


@admin.register(FinanceAccount)
class FinanceAccountAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'account_type', 'currency', 'opening_balance', 'is_active')


@admin.register(Receipt)
class ReceiptAdmin(admin.ModelAdmin):
    list_display = ('number', 'account', 'party_name', 'amount', 'date', 'status')
    list_filter = ('status', 'account')


@admin.register(PaymentVoucher)
class PaymentVoucherAdmin(admin.ModelAdmin):
    list_display = ('number', 'account', 'party_name', 'amount', 'date', 'status')
    list_filter = ('status', 'account')


class InvoiceLineInline(admin.TabularInline):
    model = InvoiceLine
    extra = 0


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ('number', 'customer_name', 'date', 'total', 'status')
    list_filter = ('status',)
    inlines = [InvoiceLineInline]
