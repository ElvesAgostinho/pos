from django.contrib import admin
from .models import PurchaseOrder, PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine


class PurchaseOrderLineInline(admin.TabularInline):
    model = PurchaseOrderLine
    extra = 0
    autocomplete_fields = ('item',)


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = ('po_number', 'supplier', 'hotel', 'status', 'total_amount', 'expected_delivery_date')
    list_filter = ('status', 'hotel')
    search_fields = ('po_number', 'supplier__commercial_name')
    autocomplete_fields = ('supplier',)
    inlines = [PurchaseOrderLineInline]


class GoodsReceiptLineInline(admin.TabularInline):
    model = GoodsReceiptLine
    extra = 0
    autocomplete_fields = ('item',)


@admin.register(GoodsReceipt)
class GoodsReceiptAdmin(admin.ModelAdmin):
    list_display = ('receipt_number', 'supplier', 'purchase_order', 'status', 'receipt_date')
    list_filter = ('status',)
    search_fields = ('receipt_number', 'supplier__commercial_name', 'supplier_invoice_ref')
    autocomplete_fields = ('supplier',)
    inlines = [GoodsReceiptLineInline]
