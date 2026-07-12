from django.db import models


class Tax(models.Model):
    """Imposto / taxa (IVA, etc.) — cadastro mestre único."""
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=100)
    percentage = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'mdm_tax'
        ordering = ['code']

    def __str__(self):
        return f"[{self.code}] {self.name} ({self.percentage}%)"


class Brand(models.Model):
    """Marca / Fabricante — cadastro mestre único."""
    name = models.CharField(max_length=150, unique=True)
    manufacturer = models.CharField(max_length=150, blank=True, null=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'mdm_brand'
        ordering = ['name']

    def __str__(self):
        return self.name


DOCUMENT_TYPES = [
    ('PROFORMA', 'Pré-conta / Proforma'),
    ('INVOICE', 'Fatura'),
    ('SIMPLIFIED', 'Fatura Simplificada'),
    ('CREDIT_NOTE', 'Nota de Crédito'),
    ('RECEIPT', 'Recibo'),
]


class DocumentSeries(models.Model):
    """
    Série de documentos com numeração sequencial — cadastro mestre único (Master Data).
    O POS consome as séries para numerar faturas/recibos; a numeração é atómica.
    """
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=100)
    document_type = models.CharField(max_length=20, choices=DOCUMENT_TYPES)
    prefix = models.CharField(max_length=10, default='FT')
    year = models.PositiveIntegerField(default=2026)
    current_number = models.PositiveIntegerField(default=0)  # último nº emitido
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'mdm_document_series'
        ordering = ['document_type', 'code']

    def __str__(self):
        return f"[{self.code}] {self.name} ({self.prefix}{self.year})"


class PaymentMethod(models.Model):
    """
    Método de Pagamento — cadastro mestre ÚNICO (Master Data).
    O POS consome estes registos e configura a disponibilidade por contexto
    (outlet/terminal/operador) sem os recriar. Fonte única de verdade.
    """
    METHOD_TYPES = [
        ('CASH', 'Dinheiro'),
        ('CARD', 'Cartão'),
        ('ROOM', 'Conta Quarto'),
        ('COMPANY', 'Conta Empresa'),
        ('VOUCHER', 'Voucher'),
        ('GIFTCARD', 'Gift Card'),
        ('CREDIT', 'Crédito Cliente'),
        ('MIXED', 'Pagamento Misto'),
        ('OTHER', 'Outro'),
    ]
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=100)
    method_type = models.CharField(max_length=20, choices=METHOD_TYPES, default='CASH')
    currency = models.CharField(max_length=10, default='AOA')

    allows_change = models.BooleanField(default=True)        # permite troco
    allows_refund = models.BooleanField(default=True)        # permite estorno
    allows_partial = models.BooleanField(default=True)       # permite pagamento parcial
    allows_mixed = models.BooleanField(default=True)         # permite pagamento misto
    allows_multicurrency = models.BooleanField(default=False)

    fee_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)  # comissão/taxa
    sort_order = models.PositiveIntegerField(default=0)
    icon = models.CharField(max_length=50, blank=True, null=True)
    color = models.CharField(max_length=20, blank=True, null=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'mdm_payment_method'
        ordering = ['sort_order', 'name']

    def __str__(self):
        return f"[{self.code}] {self.name}"


# ==========================================================================
# Cadastros mestres adicionais (fonte única) — consumidos por todo o ERP.
# ==========================================================================

class Currency(models.Model):
    code = models.CharField(max_length=8, unique=True)          # AOA, USD, EUR
    name = models.CharField(max_length=60)
    symbol = models.CharField(max_length=8, blank=True, null=True)
    rate_to_base = models.DecimalField(max_digits=14, decimal_places=6, default=1)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'mdm_currency'
        ordering = ['code']

    def __str__(self):
        return f"[{self.code}] {self.name}"


class Country(models.Model):
    code = models.CharField(max_length=3, unique=True)          # AO, PT, US
    name = models.CharField(max_length=80)
    phone_code = models.CharField(max_length=8, blank=True, null=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'mdm_country'
        ordering = ['name']

    def __str__(self):
        return self.name


class Bank(models.Model):
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=120)
    swift = models.CharField(max_length=20, blank=True, null=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'mdm_bank'
        ordering = ['name']

    def __str__(self):
        return f"[{self.code}] {self.name}"


class Language(models.Model):
    code = models.CharField(max_length=10, unique=True)         # pt-PT, en
    name = models.CharField(max_length=60)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'mdm_language'
        ordering = ['name']

    def __str__(self):
        return self.name


class Customer(models.Model):
    """Cliente (contas a receber / faturação) — cadastro mestre único."""
    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=200)
    tax_id = models.CharField(max_length=50, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=40, blank=True, null=True)
    address = models.CharField(max_length=255, blank=True, null=True)
    country = models.CharField(max_length=80, blank=True, null=True)
    is_active = models.BooleanField(default=True)
    # Cliente VIP: desconto automático + limite de crédito (contas a receber).
    is_vip = models.BooleanField(default=False)
    vip_discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    credit_limit = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'mdm_customer'
        ordering = ['name']

    def __str__(self):
        return f"[{self.code}] {self.name}"
