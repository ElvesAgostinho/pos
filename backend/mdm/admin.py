from django.contrib import admin
from .models import Brand, PaymentMethod, DocumentSeries


@admin.register(DocumentSeries)
class DocumentSeriesAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'document_type', 'prefix', 'year', 'current_number', 'is_active')
    list_filter = ('document_type', 'is_active')
    search_fields = ('code', 'name')


@admin.register(PaymentMethod)
class PaymentMethodAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'method_type', 'currency', 'is_active', 'sort_order')
    list_filter = ('method_type', 'is_active')
    search_fields = ('code', 'name')


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = ('name', 'manufacturer', 'is_active')
    search_fields = ('name', 'manufacturer')
