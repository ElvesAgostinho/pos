from django.db import models
from identity.models import Hotel
from inventory.models import Item

class SupplierCategory(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, null=True)

    def __str__(self):
        return self.name

class Supplier(models.Model):
    TYPE_CHOICES = [
        ('INDIVIDUAL', 'Pessoa Singular'),
        ('COMPANY', 'Empresa'),
        ('GROUP', 'Grupo Empresarial')
    ]
    
    STATUS_CHOICES = [
        ('ACTIVE', 'Ativo'),
        ('BLOCKED', 'Bloqueado'),
        ('EVALUATION', 'Em Avaliação')
    ]

    code = models.CharField(max_length=50, unique=True)
    supplier_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='COMPANY')
    commercial_name = models.CharField(max_length=255)
    legal_name = models.CharField(max_length=255, blank=True, null=True)
    nif = models.CharField(max_length=50, unique=True, blank=True, null=True)
    vat_number = models.CharField(max_length=50, blank=True, null=True)
    website = models.URLField(blank=True, null=True)
    
    currency = models.CharField(max_length=10, default='AOA')
    language = models.CharField(max_length=20, default='pt-PT')
    
    country = models.CharField(max_length=100, default='Angola')
    city = models.CharField(max_length=100, blank=True, null=True)
    zone = models.CharField(max_length=100, blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    
    # Condições Comerciais embutidas
    payment_terms = models.CharField(max_length=100, blank=True, null=True) # Ex: Pronto Pagamento, 30 Dias
    minimum_order_value = models.DecimalField(max_digits=15, decimal_places=2, default=0.00)
    delivery_days = models.IntegerField(default=1)
    
    categories = models.ManyToManyField(SupplierCategory, related_name='suppliers', blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='EVALUATION')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"[{self.code}] {self.commercial_name}"

class SupplierContact(models.Model):
    ROLE_CHOICES = [
        ('PURCHASING', 'Compras'),
        ('FINANCE', 'Financeiro'),
        ('LOGISTICS', 'Logística'),
        ('COMMERCIAL', 'Comercial'),
        ('EMERGENCY', 'Emergência'),
        ('SUPPORT', 'Suporte'),
    ]

    supplier = models.ForeignKey(Supplier, on_delete=models.CASCADE, related_name='contacts')
    role = models.CharField(max_length=50, choices=ROLE_CHOICES, default='COMMERCIAL')
    name = models.CharField(max_length=255)
    job_title = models.CharField(max_length=100, blank=True, null=True)
    phone = models.CharField(max_length=50, blank=True, null=True)
    whatsapp = models.CharField(max_length=50, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)

    def __str__(self):
        return f"{self.name} ({self.get_role_display()}) - {self.supplier.commercial_name}"

class SupplierProductCatalog(models.Model):
    supplier = models.ForeignKey(Supplier, on_delete=models.CASCADE, related_name='catalog')
    item = models.ForeignKey(Item, on_delete=models.RESTRICT, related_name='supplier_catalogs')
    
    supplier_item_code = models.CharField(max_length=100, blank=True, null=True)
    agreed_price = models.DecimalField(max_digits=15, decimal_places=4)
    vat_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=14.00)
    
    is_active = models.BooleanField(default=True)
    
    class Meta:
        unique_together = ('supplier', 'item')

    def __str__(self):
        return f"{self.item.name} via {self.supplier.commercial_name} a {self.agreed_price}"

class SupplierContract(models.Model):
    supplier = models.ForeignKey(Supplier, on_delete=models.CASCADE, related_name='contracts')
    reference = models.CharField(max_length=100, unique=True)
    start_date = models.DateField()
    end_date = models.DateField(blank=True, null=True)
    
    base_discount_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    bonus_description = models.TextField(blank=True, null=True)
    incoterms = models.CharField(max_length=50, blank=True, null=True) # Ex: EXW, FOB, CIF
    
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"Contrato {self.reference} - {self.supplier.commercial_name}"

class SupplierDocument(models.Model):
    DOC_TYPES = [
        ('CONTRACT', 'Contrato'),
        ('LICENSE', 'Licença'),
        ('CERTIFICATE', 'Certificado (ISO, HACCP)'),
        ('INSURANCE', 'Seguro'),
        ('PERMIT', 'Alvará'),
        ('OTHER', 'Outro')
    ]

    supplier = models.ForeignKey(Supplier, on_delete=models.CASCADE, related_name='documents')
    document_type = models.CharField(max_length=50, choices=DOC_TYPES, default='OTHER')
    title = models.CharField(max_length=255)
    file_url = models.URLField(blank=True, null=True)
    issue_date = models.DateField(blank=True, null=True)
    expiration_date = models.DateField(blank=True, null=True)

    def __str__(self):
        return f"{self.title} ({self.get_document_type_display()}) - {self.supplier.commercial_name}"

class SupplierQualityControl(models.Model):
    supplier = models.ForeignKey(Supplier, on_delete=models.CASCADE, related_name='quality_controls')
    requires_haccp = models.BooleanField(default=False)
    requires_cold_chain = models.BooleanField(default=False)
    required_temperature = models.CharField(max_length=50, blank=True, null=True)
    audit_notes = models.TextField(blank=True, null=True)
    last_audit_date = models.DateField(blank=True, null=True)

    def __str__(self):
        return f"CQ - {self.supplier.commercial_name}"

class SupplierPerformanceProfile(models.Model):
    supplier = models.OneToOneField(Supplier, on_delete=models.CASCADE, related_name='performance_profile')
    
    overall_score = models.IntegerField(default=100) # 0 to 100
    
    punctuality_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=100.00)
    completeness_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=100.00)
    price_variance_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    return_rate_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    
    total_orders = models.IntegerField(default=0)
    total_grns = models.IntegerField(default=0)
    
    last_calculated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Performance {self.overall_score}/100 - {self.supplier.commercial_name}"
