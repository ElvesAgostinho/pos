from django.db import models


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

    # ---- Identificação ----
    other_code = models.CharField(max_length=20, blank=True, null=True)    # Código (Outro): CC, MB…
    abbreviation = models.CharField(max_length=30, blank=True, null=True)
    document_type = models.CharField(max_length=10, default='INVOICE',
                                     choices=[('INVOICE', 'Fatura'), ('RECEIPT', 'Talão')])
    document_model_code = models.CharField(max_length=10, blank=True, null=True)
    pms_reference = models.CharField(max_length=20, blank=True, null=True)
    accounting_account = models.CharField(max_length=40, blank=True, null=True)

    # ---- Onde aparece ----
    for_ems = models.BooleanField(default=False)
    for_pos = models.BooleanField(default=True)
    for_fnb = models.BooleanField(default=False)      # F&B (contas a pagar)

    # ---- Detalhes (cada um MUDA o pagamento; ver pos/views.pay) ----
    tip_from_change = models.BooleanField(default=False)   # converter troco em gratificação
    tip_item = models.ForeignKey('inventory.Item', on_delete=models.SET_NULL, blank=True, null=True,
                                 related_name='tip_methods')
    internal_consumption = models.BooleanField(default=False)   # consumo interno (staff)
    internal_item = models.ForeignKey('inventory.Item', on_delete=models.SET_NULL, blank=True, null=True,
                                      related_name='internal_methods')
    charge_to_room = models.BooleanField(default=False)         # lançar no folio do quarto
    opens_drawer = models.BooleanField(default=False)           # abre a gaveta do dinheiro
    external_interface = models.BooleanField(default=False)     # TPA/terminal de cartões
    external_device = models.CharField(max_length=60, blank=True, null=True)
    cross_selling = models.BooleanField(default=False)
    current_account = models.BooleanField(default=False)        # conta corrente (deixa saldo)
    close_only_zero_balance = models.BooleanField(default=False)
    direct_payment = models.BooleanField(default=False)
    ask_document_number = models.BooleanField(default=False)    # pede nº do documento (cheque, TRF)
    prints_document = models.BooleanField(default=True)
    bank_transfer = models.BooleanField(default=False)

    allow_pickup = models.BooleanField(default=False)
    pickup_alert_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    pickup_alert_email = models.EmailField(blank=True, null=True)

    class Meta:
        db_table = 'mdm_payment_method'
        ordering = ['sort_order', 'name']

    def __str__(self):
        return f"[{self.code}] {self.name}"


# ==========================================================================
# Cadastros mestres adicionais (fonte única) — consumidos por todo o ERP.
# ==========================================================================

class Currency(models.Model):
    """MOEDA — fonte única de todo o ERP (POS, faturação, PMS, contabilidade).

    Edita-se em Configuração POS > Financeiro > Moedas, mas o registo é um só:
    a taxa que o caixa usa para receber em dólares é a MESMA que a fatura imprime
    e a mesma que a contabilidade converte. Não há duas verdades.

    Compra ≠ Venda de propósito: o hotel compra dólares ao hóspede mais barato do
    que os vende. Essa diferença é a MARGEM — e é receita, por isso tem de ir
    parar a uma conta (Encargo para margem).
    """
    CHARGE_MODES = [('NONE', 'Nenhum'), ('MARGIN', 'Margem'), ('COMMISSION', 'Comissão')]
    COMMISSION_MODES = [('FIXED', 'Comissão Fixa'), ('PERCENT', 'Comissão Percentual')]

    code = models.CharField(max_length=8, unique=True)          # Código ISO: AOA, USD, EUR
    name = models.CharField(max_length=60)
    symbol = models.CharField(max_length=8, blank=True, null=True)
    symbol_unicode = models.CharField(max_length=16, blank=True, null=True)   # Kz, $, €
    is_active = models.BooleanField(default=True)

    # Só UMA moeda é a local (o Kwanza). É nela que a contabilidade fecha.
    is_local = models.BooleanField(default=False)
    print_on_pos_docs = models.BooleanField(default=False)      # imprimir o contravalor no talão

    # --- Taxas de câmbio de compra e venda (balcão) ---
    reference_date = models.DateField(blank=True, null=True)
    buy_rate = models.DecimalField(max_digits=24, decimal_places=16, default=0)
    sell_rate = models.DecimalField(max_digits=24, decimal_places=16, default=0)
    margin = models.DecimalField(max_digits=10, decimal_places=4, default=0)
    excluded = models.BooleanField(default=False)               # não aparece no balcão de câmbio

    # --- Taxa de câmbio para lançamentos em moeda estrangeira ---
    rate_to_base = models.DecimalField(max_digits=24, decimal_places=16, default=1)  # Taxa de Câmbio
    exchange_margin = models.DecimalField(max_digits=10, decimal_places=4, default=0)

    # --- Transação ---
    margin_charge = models.ForeignKey('inventory.Item', on_delete=models.SET_NULL, blank=True,
                                      null=True, related_name='margin_currencies')
    paymaster_account = models.CharField(max_length=40, blank=True, null=True)
    commission_mode = models.CharField(max_length=10, choices=COMMISSION_MODES, default='FIXED')
    commission_fixed = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    commission_percent = models.DecimalField(max_digits=8, decimal_places=4, default=0)
    commission_charge = models.ForeignKey('inventory.Item', on_delete=models.SET_NULL, blank=True,
                                          null=True, related_name='commission_currencies')

    class Meta:
        db_table = 'mdm_currency'
        ordering = ['code']

    def __str__(self):
        return f"[{self.code}] {self.name}"

    def save(self, *args, **kwargs):
        if self.is_local:
            Currency.objects.exclude(pk=self.pk).update(is_local=False)   # a local é uma só
        super().save(*args, **kwargs)


class CurrencyRateHistory(models.Model):
    """HISTÓRICO DA MOEDA — quem mudou a taxa, quando, e para quanto.

    Numa auditoria da AGT a pergunta é sempre a mesma: "com que taxa é que esta
    fatura de Novembro foi convertida?". Sem isto, ninguém sabe responder — as
    taxas de hoje já não são as de então. Cada gravação deixa aqui uma linha, e
    ninguém a pode apagar pelo ecrã.
    """
    currency = models.ForeignKey(Currency, on_delete=models.CASCADE, related_name='history')
    changed_at = models.DateTimeField(auto_now_add=True)
    changed_by = models.CharField(max_length=120, blank=True, null=True)
    code = models.CharField(max_length=8)
    name = models.CharField(max_length=60)
    rate_to_base = models.DecimalField(max_digits=18, decimal_places=8, default=0)
    buy_rate = models.DecimalField(max_digits=24, decimal_places=16, default=0)
    sell_rate = models.DecimalField(max_digits=24, decimal_places=16, default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'mdm_currency_history'
        ordering = ['changed_at']


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
