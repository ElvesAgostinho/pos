from django.contrib import admin
from .models import Profile, Role, Group, Resource, Policy

@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'category', 'is_global', 'status', 'company')
    list_filter = ('category', 'is_global', 'status')
    search_fields = ('code', 'name')

@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ('user', 'profile', 'created_at')

@admin.register(Group)
class GroupAdmin(admin.ModelAdmin):
    list_display = ('name',)
    filter_horizontal = ('users',)

@admin.register(Resource)
class ResourceAdmin(admin.ModelAdmin):
    list_display = ('urn', 'name', 'module')
    list_filter = ('module',)
    search_fields = ('urn', 'name')

@admin.register(Policy)
class PolicyAdmin(admin.ModelAdmin):
    list_display = ('profile', 'resource', 'action', 'effect')
    list_filter = ('action', 'effect', 'profile')
    search_fields = ('profile__name', 'resource__urn')
