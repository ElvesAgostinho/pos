from django.db import models
from django.contrib.auth.models import User
from identity.models import Company

class Profile(models.Model):
    STATUS_CHOICES = [
        ('Draft', 'Draft'),
        ('Active', 'Active'),
        ('Inactive', 'Inactive')
    ]
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    category = models.CharField(max_length=50, default='Operação')
    color = models.CharField(max_length=7, blank=True, null=True)
    icon = models.CharField(max_length=50, blank=True, null=True)
    priority = models.IntegerField(default=0)
    is_global = models.BooleanField(default=True)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, null=True, blank=True, related_name='eae_profiles')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Active')
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"[{self.code}] {self.name}"

class Role(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='eae_roles')
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='assigned_roles')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'profile')

class Group(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, null=True)
    users = models.ManyToManyField(User, related_name='eae_groups', blank=True)

class Resource(models.Model):
    urn = models.CharField(max_length=255, unique=True)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    module = models.CharField(max_length=50)

    def __str__(self):
        return self.urn

class Policy(models.Model):
    ACTION_CHOICES = [
        ('view', 'View'),
        ('create', 'Create'),
        ('edit', 'Edit'),
        ('delete', 'Delete'),
        ('export', 'Export'),
        ('print', 'Print'),
        ('approve', 'Approve'),
        ('execute', 'Execute'),
        ('*', 'All Actions'),
    ]
    EFFECT_CHOICES = [
        ('allow', 'Allow'),
        ('deny', 'Deny'),
    ]

    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='policies')
    resource = models.ForeignKey(Resource, on_delete=models.CASCADE, related_name='policies')
    action = models.CharField(max_length=50, choices=ACTION_CHOICES)
    effect = models.CharField(max_length=10, choices=EFFECT_CHOICES, default='allow')
    abac_conditions = models.JSONField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('profile', 'resource', 'action')
