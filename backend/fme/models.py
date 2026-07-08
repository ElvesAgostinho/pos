from django.db import models
from identity.models import EnterpriseGroup, Company, Hotel

class FeatureFlag(models.Model):
    MODULE_CHOICES = [
        ('POS', 'Ponto de Venda'),
        ('STK', 'Stock & Inventário'),
        ('PRC', 'Compras (Procurement)'),
        ('FIN', 'Financeiro'),
        ('HR', 'Recursos Humanos'),
        ('CRM', 'CRM & Fidelização'),
        ('BI', 'Business Intelligence'),
        ('CORE', 'Core ERP'),
    ]

    code = models.CharField(max_length=100, unique=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    module = models.CharField(max_length=10, choices=MODULE_CHOICES)
    
    # Se True, a funcionalidade está ligada por defeito para todos (útil para Core features)
    # Se False, requer um Override para ser ligada (útil para features Premium)
    default_state = models.BooleanField(default=False)
    
    # Se True, não pode ser alterada pelos utilizadores locais (só Global Admin)
    is_locked = models.BooleanField(default=False)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"[{self.module}] {self.name} ({self.code})"

class FeatureOverride(models.Model):
    feature_flag = models.ForeignKey(FeatureFlag, on_delete=models.CASCADE, related_name='overrides')
    
    # Herança: apenas UM destes pode estar preenchido
    group = models.ForeignKey(EnterpriseGroup, on_delete=models.CASCADE, blank=True, null=True)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, blank=True, null=True)
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, blank=True, null=True)
    
    is_enabled = models.BooleanField()
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Override {self.feature_flag.code}: {self.is_enabled}"

    class Meta:
        verbose_name = "Feature Override"
        verbose_name_plural = "Feature Overrides"
