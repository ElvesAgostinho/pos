from django.contrib import admin

from .models import (
    Allergen, ProductionArea, KitchenEquipment, ItemProductionProfile, Recipe, RecipeLine
)


@admin.register(Allergen)
class AllergenAdmin(admin.ModelAdmin):
    list_display = ('code', 'name')
    search_fields = ('code', 'name')


class KitchenEquipmentInline(admin.TabularInline):
    model = KitchenEquipment
    extra = 0


@admin.register(ProductionArea)
class ProductionAreaAdmin(admin.ModelAdmin):
    list_display = ('name', 'area_type', 'hotel', 'is_active')
    list_filter = ('area_type', 'hotel', 'is_active')
    search_fields = ('name',)
    inlines = [KitchenEquipmentInline]


@admin.register(KitchenEquipment)
class KitchenEquipmentAdmin(admin.ModelAdmin):
    list_display = ('name', 'equipment_type', 'area', 'capacity', 'is_active')
    list_filter = ('equipment_type', 'is_active')
    search_fields = ('name',)


@admin.register(ItemProductionProfile)
class ItemProductionProfileAdmin(admin.ModelAdmin):
    list_display = ('item', 'is_semi_finished', 'shelf_life_hours', 'energy_kcal')
    list_filter = ('is_semi_finished',)
    search_fields = ('item__code', 'item__name')
    filter_horizontal = ('allergens',)
    autocomplete_fields = ('item',)


class RecipeLineInline(admin.TabularInline):
    model = RecipeLine
    extra = 1
    autocomplete_fields = ('component_item',)


@admin.register(Recipe)
class RecipeAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'final_item', 'version', 'status', 'area', 'theoretical_cost')
    list_filter = ('status', 'area', 'is_active')
    search_fields = ('code', 'name', 'final_item__name')
    autocomplete_fields = ('final_item',)
    filter_horizontal = ('equipments',)
    inlines = [RecipeLineInline]
    readonly_fields = ('theoretical_cost',)

    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)
        # Após gravar as linhas (inline), recalcula o custo teórico.
        form.instance.compute_cost(save=True)
