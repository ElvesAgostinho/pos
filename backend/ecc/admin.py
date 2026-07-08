from django.contrib import admin
from .models import Parameter, ParameterValue, BusinessRule, AuditLog

@admin.register(Parameter)
class ParameterAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'category', 'data_type', 'is_mandatory')
    list_filter = ('category', 'data_type', 'is_mandatory', 'is_editable')
    search_fields = ('code', 'name')

@admin.register(ParameterValue)
class ParameterValueAdmin(admin.ModelAdmin):
    list_display = ('parameter', 'value', 'group', 'company', 'hotel')
    search_fields = ('parameter__code',)

@admin.register(BusinessRule)
class BusinessRuleAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'module', 'is_active')
    list_filter = ('module', 'is_active')

@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('action', 'user_identity', 'terminal', 'timestamp')
    list_filter = ('action', 'timestamp')
    search_fields = ('user_identity', 'terminal')
