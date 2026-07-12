from django.contrib import admin
from .models import FeatureFlag, FeatureOverride


class FeatureOverrideInline(admin.TabularInline):
    model = FeatureOverride
    extra = 0


@admin.register(FeatureFlag)
class FeatureFlagAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'module', 'default_state', 'is_locked')
    list_filter = ('module', 'default_state', 'is_locked')
    search_fields = ('code', 'name')
    inlines = [FeatureOverrideInline]


@admin.register(FeatureOverride)
class FeatureOverrideAdmin(admin.ModelAdmin):
    list_display = ('feature_flag', 'group', 'company', 'hotel', 'is_enabled')
    list_filter = ('is_enabled',)
