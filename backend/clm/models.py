from django.db import models

class Client(models.Model):
    CLIENT_TYPES = [
        ('INDIVIDUAL', 'Pessoa Singular'),
        ('COMPANY', 'Empresa'),
        ('GROUP', 'Grupo Empresarial')
    ]
    STATUS_CHOICES = [
        ('LEAD', 'Lead'),
        ('PROSPECT', 'Prospect'),
        ('DEMO', 'Demonstração'),
        ('TRIAL', 'Trial'),
        ('ACTIVE', 'Ativo'),
        ('SUSPENDED', 'Suspenso'),
        ('EXPIRED', 'Expirado'),
        ('CANCELED', 'Cancelado')
    ]

    code = models.CharField(max_length=50, unique=True)
    client_type = models.CharField(max_length=20, choices=CLIENT_TYPES, default='COMPANY')
    commercial_name = models.CharField(max_length=255)
    legal_name = models.CharField(max_length=255, blank=True, null=True)
    nif = models.CharField(max_length=50, unique=True, blank=True, null=True)
    commercial_registry = models.CharField(max_length=100, blank=True, null=True)
    
    country = models.CharField(max_length=100, default='Angola')
    province = models.CharField(max_length=100, blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    postal_code = models.CharField(max_length=50, blank=True, null=True)
    
    phone = models.CharField(max_length=50, blank=True, null=True)
    whatsapp = models.CharField(max_length=50, blank=True, null=True)
    general_email = models.EmailField(blank=True, null=True)
    website = models.URLField(blank=True, null=True)
    
    language = models.CharField(max_length=20, default='pt-PT')
    currency = models.CharField(max_length=10, default='AOA')
    timezone = models.CharField(max_length=50, default='Africa/Luanda')
    
    logo_url = models.URLField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='LEAD')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"[{self.code}] {self.commercial_name}"

class Contact(models.Model):
    ROLE_CHOICES = [
        ('DIRECTOR', 'Diretor Geral'),
        ('FINANCE', 'Financeiro'),
        ('PURCHASING', 'Compras'),
        ('IT', 'TI'),
        ('SUPPORT', 'Suporte'),
        ('ACCOUNTING', 'Contabilidade')
    ]

    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='contacts')
    role = models.CharField(max_length=50, choices=ROLE_CHOICES)
    name = models.CharField(max_length=255)
    job_title = models.CharField(max_length=100, blank=True, null=True)
    phone = models.CharField(max_length=50, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    whatsapp = models.CharField(max_length=50, blank=True, null=True)
    language = models.CharField(max_length=20, default='pt-PT')

    def __str__(self):
        return f"{self.name} ({self.get_role_display()}) - {self.client.commercial_name}"

class CommercialData(models.Model):
    client = models.OneToOneField(Client, on_delete=models.CASCADE, related_name='commercial_data')
    plan = models.CharField(max_length=100)
    reseller = models.CharField(max_length=100, blank=True, null=True)
    partner = models.CharField(max_length=100, blank=True, null=True)
    responsible_consultant = models.CharField(max_length=255, blank=True, null=True)
    
    contract_date = models.DateField(blank=True, null=True)
    activation_date = models.DateField(blank=True, null=True)
    expiration_date = models.DateField(blank=True, null=True)
    renewal_date = models.DateField(blank=True, null=True)
    
    payment_method = models.CharField(max_length=100, blank=True, null=True)
    periodicity = models.CharField(max_length=50, blank=True, null=True) # Mensal, Anual

    def __str__(self):
        return f"Commercial Data - {self.client.commercial_name}"

class License(models.Model):
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='licenses')
    license_number = models.CharField(max_length=100, unique=True)
    plan = models.CharField(max_length=100)
    
    # JSON array with active modules like ['POS', 'PMS', 'WMS']
    modules = models.JSONField(default=list)
    feature_flags = models.JSONField(default=dict)
    
    valid_until = models.DateField(blank=True, null=True)
    is_offline = models.BooleanField(default=True)
    
    # Limits
    max_hotels = models.IntegerField(default=1)
    max_pos = models.IntegerField(default=1)
    max_users = models.IntegerField(default=5)
    max_rooms = models.IntegerField(default=0)
    max_events = models.IntegerField(default=0)
    max_apis = models.IntegerField(default=0)

    # Cryptographic signature to ensure validity when offline
    signature = models.TextField(blank=True, null=True)

    # Certificação AGT (gerida pelo fornecedor no PCC; entregue ao cliente).
    agt_certificate_number = models.CharField(max_length=40, blank=True, null=True)
    agt_public_key = models.TextField(blank=True, null=True)     # PEM (entregue ao cliente)
    agt_private_key = models.TextField(blank=True, null=True)    # PEM (privado do fornecedor)
    agt_issued_at = models.DateTimeField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"License {self.license_number} ({self.client.commercial_name})"

class Installation(models.Model):
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='installations')
    name = models.CharField(max_length=100) # Servidor Produção, Testes, etc.
    install_type = models.CharField(max_length=50, default='PRODUCTION') # PROD, STAGE, BACKUP
    server_ip = models.GenericIPAddressField(blank=True, null=True)
    version = models.CharField(max_length=50, blank=True, null=True)
    last_ping = models.DateTimeField(blank=True, null=True)

    def __str__(self):
        return f"{self.name} - {self.client.commercial_name}"

class Equipment(models.Model):
    installation = models.ForeignKey(Installation, on_delete=models.CASCADE, related_name='equipments')
    equipment_type = models.CharField(max_length=50) # Servidor, POS, Impressora, Tablet, Balança
    brand = models.CharField(max_length=100, blank=True, null=True)
    model = models.CharField(max_length=100, blank=True, null=True)
    serial_number = models.CharField(max_length=100, blank=True, null=True)
    ip_address = models.GenericIPAddressField(blank=True, null=True)

    def __str__(self):
        return f"{self.equipment_type} ({self.brand} {self.model})"

class AuditLogCLM(models.Model):
    action = models.CharField(max_length=100) # CREATE_CLIENT, RENEW_LICENSE, SUSPEND_CLIENT
    details = models.JSONField(blank=True, null=True)
    user_identity = models.CharField(max_length=255) # Quem fez (operador do PCC)
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.action} by {self.user_identity} at {self.timestamp}"

class TerminalLicense(models.Model):
    ASSET_TYPES = [
        ('POS', 'Point of Sale'),
        ('KIOSK', 'Kiosk'),
        ('TABLET', 'Tablet Room Service'),
        ('KDS', 'Kitchen Display System'),
        ('PAYMENT', 'Terminal de Pagamento')
    ]
    
    STATUS_CHOICES = [
        ('CREATED', 'Criado'),
        ('LICENSED', 'Licenciado'),
        ('ACTIVATED', 'Ativado'),
        ('SUSPENDED', 'Suspenso'),
        ('TRANSFERRED', 'Transferido'),
        ('DEACTIVATED', 'Desativado')
    ]

    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='terminal_licenses')
    asset_type = models.CharField(max_length=50, choices=ASSET_TYPES, default='POS')
    terminal_id = models.CharField(max_length=50, unique=True) # e.g. POS-00001234
    
    # Activation & Fingerprinting
    activation_key = models.CharField(max_length=50, unique=True, blank=True, null=True) # e.g. 7A9B-44DF-XXXX
    hardware_fingerprint = models.CharField(max_length=255, blank=True, null=True)
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='CREATED')
    
    # Optional constraints
    assigned_hotel_id = models.CharField(max_length=50, blank=True, null=True)
    assigned_department_id = models.CharField(max_length=50, blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    activated_at = models.DateTimeField(blank=True, null=True)
    last_ping = models.DateTimeField(blank=True, null=True)

    def __str__(self):
        return f"{self.terminal_id} ({self.get_asset_type_display()}) - {self.client.commercial_name}"
