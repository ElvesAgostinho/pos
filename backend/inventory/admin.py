from django.contrib import admin
from .models import (
    UnitOfMeasure, ItemCategory, Item, Recipe, RecipeIngredient, Warehouse, StockLevel,
    ProductionOrder, ProductionOrderConsumption
)


@admin.register(UnitOfMeasure)
class UnitOfMeasureAdmin(admin.ModelAdmin):
    list_display = ('code', 'name')
    search_fields = ('code', 'name')


@admin.register(ItemCategory)
class ItemCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'parent')
    search_fields = ('name',)


@admin.register(Item)
class ItemAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'item_type', 'category', 'current_average_cost', 'sale_price', 'is_active')
    list_filter = ('item_type', 'is_active', 'category')
    search_fields = ('code', 'name')  # necessário para autocomplete no ESM/WMS


class RecipeIngredientInline(admin.TabularInline):
    model = RecipeIngredient
    extra = 0
    autocomplete_fields = ('ingredient_item',)


@admin.register(Recipe)
class RecipeAdmin(admin.ModelAdmin):
    list_display = ('final_item', 'theoretical_cost')
    search_fields = ('final_item__name',)
    inlines = [RecipeIngredientInline]


@admin.register(Warehouse)
class WarehouseAdmin(admin.ModelAdmin):
    list_display = ('name', 'hotel', 'department', 'is_main')
    list_filter = ('hotel', 'is_main')
    search_fields = ('name',)


@admin.register(StockLevel)
class StockLevelAdmin(admin.ModelAdmin):
    list_display = ('item', 'warehouse', 'quantity_on_hand', 'quantity_reserved', 'min_stock_alert')
    list_filter = ('warehouse',)
    search_fields = ('item__name', 'item__code')


class ProductionOrderConsumptionInline(admin.TabularInline):
    model = ProductionOrderConsumption
    extra = 0
    # O que saiu de facto do armazém e a que custo: é a prova da produção, não se
    # edita a posteriori — mexer aqui era mudar a história sem mexer no stock.
    readonly_fields = ('item', 'quantity', 'unit_cost', 'total_cost')
    can_delete = False


@admin.register(ProductionOrder)
class ProductionOrderAdmin(admin.ModelAdmin):
    list_display = ('number', 'item', 'quantity', 'warehouse', 'status', 'unit_cost',
                    'total_cost', 'produced_at')
    list_filter = ('status', 'warehouse')
    search_fields = ('number', 'item__code', 'item__name')
    readonly_fields = ('unit_cost', 'total_cost', 'produced_at')
    inlines = [ProductionOrderConsumptionInline]
