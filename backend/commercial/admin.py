from django.contrib import admin
from .models import Promotion, Combo, ComboItem


@admin.register(Promotion)
class PromotionAdmin(admin.ModelAdmin):
    list_display = ('name', 'scope', 'discount_type', 'value', 'happy_start', 'happy_end', 'is_active')
    list_filter = ('scope', 'discount_type', 'is_active')


class ComboItemInline(admin.TabularInline):
    model = ComboItem
    extra = 1


@admin.register(Combo)
class ComboAdmin(admin.ModelAdmin):
    list_display = ('name', 'price', 'outlet', 'is_active')
    inlines = [ComboItemInline]
