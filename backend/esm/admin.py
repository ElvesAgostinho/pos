from django.contrib import admin
from .models import (
    SupplierCategory, Supplier, SupplierContact, SupplierProductCatalog,
    SupplierContract, SupplierDocument, SupplierQualityControl, SupplierPerformanceProfile
)


class SupplierContactInline(admin.TabularInline):
    model = SupplierContact
    extra = 0


class SupplierProductCatalogInline(admin.TabularInline):
    model = SupplierProductCatalog
    extra = 0
    autocomplete_fields = ('item',)


class SupplierContractInline(admin.TabularInline):
    model = SupplierContract
    extra = 0


class SupplierDocumentInline(admin.TabularInline):
    model = SupplierDocument
    extra = 0


class SupplierQualityControlInline(admin.TabularInline):
    model = SupplierQualityControl
    extra = 0


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ('code', 'commercial_name', 'nif', 'country', 'status', 'created_at')
    list_filter = ('status', 'supplier_type', 'country')
    search_fields = ('code', 'commercial_name', 'legal_name', 'nif')
    filter_horizontal = ('categories',)
    inlines = [
        SupplierContactInline, SupplierProductCatalogInline, SupplierContractInline,
        SupplierDocumentInline, SupplierQualityControlInline,
    ]


@admin.register(SupplierCategory)
class SupplierCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'description')
    search_fields = ('name',)


@admin.register(SupplierPerformanceProfile)
class SupplierPerformanceProfileAdmin(admin.ModelAdmin):
    list_display = ('supplier', 'overall_score', 'punctuality_percentage', 'completeness_percentage', 'total_grns', 'last_calculated_at')
    search_fields = ('supplier__commercial_name',)


@admin.register(SupplierProductCatalog)
class SupplierProductCatalogAdmin(admin.ModelAdmin):
    list_display = ('supplier', 'item', 'agreed_price', 'vat_percentage', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('supplier__commercial_name', 'item__name', 'supplier_item_code')


@admin.register(SupplierDocument)
class SupplierDocumentAdmin(admin.ModelAdmin):
    list_display = ('supplier', 'document_type', 'title', 'expiration_date')
    list_filter = ('document_type',)
    search_fields = ('supplier__commercial_name', 'title')
