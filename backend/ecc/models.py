from django.db import models
from identity.models import (
    EnterpriseGroup, Company, Hotel, Department, Area, Subarea, 
    Workstation, Collaborator, PosOperator
)

class Parameter(models.Model):
    DATA_TYPE_CHOICES = [
        ('Boolean', 'Boolean'),
        ('Text', 'Text'),
        ('Number', 'Number'),
        ('Date', 'Date'),
        ('Time', 'Time'),
        ('List', 'List'),
        ('JSON', 'JSON'),
    ]

    code = models.CharField(max_length=100, unique=True)
    category = models.CharField(max_length=100) # Ex: POS, Financeiro, Global
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    data_type = models.CharField(max_length=20, choices=DATA_TYPE_CHOICES, default='Text')
    default_value = models.JSONField(blank=True, null=True)
    
    is_mandatory = models.BooleanField(default=False)
    is_editable = models.BooleanField(default=True)
    is_auditable = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"[{self.category}] {self.name} ({self.code})"

class ParameterValue(models.Model):
    parameter = models.ForeignKey(Parameter, on_delete=models.CASCADE, related_name='values')
    value = models.JSONField()

    # Hierarquia de Herança. Apenas UM destes campos deve estar preenchido num registo.
    group = models.ForeignKey(EnterpriseGroup, on_delete=models.CASCADE, blank=True, null=True)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, blank=True, null=True)
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, blank=True, null=True)
    department = models.ForeignKey(Department, on_delete=models.CASCADE, blank=True, null=True)
    area = models.ForeignKey(Area, on_delete=models.CASCADE, blank=True, null=True)
    subarea = models.ForeignKey(Subarea, on_delete=models.CASCADE, blank=True, null=True)
    workstation = models.ForeignKey(Workstation, on_delete=models.CASCADE, blank=True, null=True)
    collaborator = models.ForeignKey(Collaborator, on_delete=models.CASCADE, blank=True, null=True)
    pos_operator = models.ForeignKey(PosOperator, on_delete=models.CASCADE, blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.parameter.code} = {self.value}"

class BusinessRule(models.Model):
    code = models.CharField(max_length=100, unique=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    module = models.CharField(max_length=100) # Ex: Stock, Compras
    
    # JSON estruturado no formato "Se -> Então"
    conditions = models.JSONField()
    actions = models.JSONField()
    
    is_active = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

class AuditLog(models.Model):
    parameter = models.ForeignKey(Parameter, on_delete=models.CASCADE, blank=True, null=True)
    action = models.CharField(max_length=100) # UPDATE_PARAM, LOGIN_FAILED, etc.
    old_value = models.JSONField(blank=True, null=True)
    new_value = models.JSONField(blank=True, null=True)
    
    user_identity = models.CharField(max_length=255, blank=True, null=True) # Nome ou ID de quem fez
    ip_address = models.GenericIPAddressField(blank=True, null=True)
    terminal = models.CharField(max_length=255, blank=True, null=True)
    
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.action} at {self.timestamp}"
