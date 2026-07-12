from django.contrib import admin
from django.contrib.auth.hashers import make_password, identify_hasher
from .models import (
    EnterpriseGroup, Company, Hotel, Department, Area, Subarea, Workstation,
    Shift, Collaborator, PosOperator, OperatorLocationConstraint, OperatorWorkstationConstraint
)

@admin.register(EnterpriseGroup)
class EnterpriseGroupAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_at')

@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ('name', 'tax_id', 'group')
    list_filter = ('group',)

@admin.register(Hotel)
class HotelAdmin(admin.ModelAdmin):
    list_display = ('name', 'location', 'company')
    list_filter = ('company',)
    search_fields = ('name',)

@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ('name', 'hotel')
    list_filter = ('hotel',)
    search_fields = ('name',)

@admin.register(Area)
class AreaAdmin(admin.ModelAdmin):
    list_display = ('name', 'department')
    search_fields = ('name',)

@admin.register(Subarea)
class SubareaAdmin(admin.ModelAdmin):
    list_display = ('name', 'area')
    search_fields = ('name',)

@admin.register(Workstation)
class WorkstationAdmin(admin.ModelAdmin):
    list_display = ('name', 'subarea', 'ip_address')
    search_fields = ('name',)

@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    list_display = ('name', 'hotel', 'start_time', 'end_time')
    list_filter = ('hotel',)

@admin.register(Collaborator)
class CollaboratorAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'job_title', 'hotel', 'department', 'status')
    list_filter = ('status', 'hotel', 'department')
    search_fields = ('code', 'name', 'nif', 'email')


class OperatorWorkstationConstraintInline(admin.TabularInline):
    model = OperatorWorkstationConstraint
    extra = 0


class OperatorLocationConstraintInline(admin.TabularInline):
    model = OperatorLocationConstraint
    extra = 0


@admin.register(PosOperator)
class PosOperatorAdmin(admin.ModelAdmin):
    list_display = ('name', 'collaborator', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('name', 'collaborator__name')
    inlines = [OperatorWorkstationConstraintInline, OperatorLocationConstraintInline]

    def save_model(self, request, obj, form, change):
        # Se o PIN foi introduzido em texto simples, hashear antes de gravar
        # (mantém a coerência com o login por PIN e nunca guarda PIN em claro).
        raw = obj.pin_code or ''
        if raw:
            try:
                identify_hasher(raw)
            except ValueError:
                obj.pin_code = make_password(raw)
        super().save_model(request, obj, form, change)
