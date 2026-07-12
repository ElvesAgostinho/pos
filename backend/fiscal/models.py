"""
Angola Tax & Fiscal Compliance Center — motor fiscal parametrizável.

Princípio: as REGRAS FISCAIS são DADOS (FiscalConfig + FiscalDocType), não código.
Quando a AGT altera um requisito, ajusta-se a configuração/o catálogo, sem reescrever
o POS/Financeiro/PMS. Documentos são assinados (RSA) e encadeados por hash (imutáveis).
"""
from decimal import Decimal
from django.db import models


class FiscalConfig(models.Model):
    """Perfil fiscal da empresa + parâmetros do motor (singleton por instalação)."""
    ENV = [('TEST', 'Testes'), ('PROD', 'Produção')]
    company_nif = models.CharField(max_length=20, blank=True, null=True)
    company_name = models.CharField(max_length=200, blank=True, null=True)
    tax_regime = models.CharField(max_length=60, default='Regime Geral')
    vat_regime = models.CharField(max_length=60, default='Regime Geral do IVA')
    tax_office = models.CharField(max_length=100, blank=True, null=True)   # repartição fiscal
    # Dados de cabeçalho/rodapé que a fatura legal exige (ver exemplos FR).
    trade_name = models.CharField(max_length=200, blank=True, null=True)   # nome comercial (ex: "System Mwana Lodge")
    address_line = models.CharField(max_length=250, blank=True, null=True)
    city = models.CharField(max_length=80, default='Luanda')
    province = models.CharField(max_length=80, blank=True, null=True)
    phone = models.CharField(max_length=60, blank=True, null=True)
    fax = models.CharField(max_length=60, blank=True, null=True)
    email = models.CharField(max_length=120, blank=True, null=True)
    share_capital = models.CharField(max_length=60, blank=True, null=True)  # capital social
    crc_number = models.CharField(max_length=60, blank=True, null=True)     # C.R.C.L. nº
    logo_url = models.CharField(max_length=300, blank=True, null=True)
    certificate_number = models.CharField(max_length=20, default='0000')   # nº atribuído pela AGT
    key_version = models.PositiveIntegerField(default=1)                    # versão da chave privada
    environment = models.CharField(max_length=4, choices=ENV, default='TEST')
    qr_enabled = models.BooleanField(default=True)
    saft_version = models.CharField(max_length=20, default='1.01_01')
    generic_customer_nif = models.CharField(max_length=20, default='999999999')
    # Tipos de documento por defeito para emissão automática a partir de outros módulos.
    pos_doc_type = models.CharField(max_length=6, default='FR')      # POS (pago na hora) -> Factura-Recibo
    invoice_doc_type = models.CharField(max_length=6, default='FT')  # Financeiro -> Factura
    prices_include_tax = models.BooleanField(default=True)           # AO hotelaria: preços com IVA incluído
    default_exemption_code = models.CharField(max_length=12, default='M99')
    auto_emit_pos = models.BooleanField(default=True)               # POS emite documento fiscal ao pagar

    class Meta:
        db_table = 'fis_config'

    def __str__(self):
        return f"Fiscal · {self.company_name or 'Empresa'} ({self.environment})"

    @classmethod
    def get(cls):
        obj = cls.objects.first()
        return obj or cls.objects.create()


class TaxRate(models.Model):
    """Tax/IVA Engine — taxas de imposto parametrizáveis (não hardcoded)."""
    code = models.CharField(max_length=12, unique=True)     # IVA14, IVA7, IVA5, IVA0, ISE
    name = models.CharField(max_length=60)
    tax_type = models.CharField(max_length=10, default='IVA')  # IVA, IS (imposto de selo), NS
    percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    is_default = models.BooleanField(default=False)
    is_exempt = models.BooleanField(default=False)          # taxa 0 por isenção
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'fis_tax_rate'
        ordering = ['-percentage', 'code']

    def __str__(self):
        return f"{self.code} ({self.percentage}%)"


class TaxExemptionReason(models.Model):
    """Motivos de isenção (código + norma legal) — obrigatório em linhas isentas."""
    code = models.CharField(max_length=12, unique=True)     # M01, M02...
    description = models.CharField(max_length=200)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'fis_exemption_reason'
        ordering = ['code']

    def __str__(self):
        return f"{self.code} · {self.description}"


class FiscalDocType(models.Model):
    """Catálogo de tipos de documento (Rules Engine). Diz o que assina, imprime, exporta."""
    SAFT = [('SalesInvoice', 'Documento comercial (4.1)'),
            ('WorkingDocument', 'Documento de conferência (4.3)'),
            ('MovementOfGoods', 'Movimentação de mercadorias (4.2)'),
            ('Payment', 'Recibo (4.4)')]
    code = models.CharField(max_length=6, unique=True)        # FT, FR, FS, NC, ND, GR, GT, OR, PF, RC...
    name = models.CharField(max_length=80)
    saft_type = models.CharField(max_length=20, choices=SAFT, default='SalesInvoice')
    invoice_type = models.CharField(max_length=6, blank=True, null=True)  # sigla SAF-T (FT/NC/ND...)
    signable = models.BooleanField(default=True)              # gera assinatura RSA
    prints_mention = models.BooleanField(default=True)        # "Processado por programa validado"
    is_rectifying = models.BooleanField(default=False)        # NC/ND
    allow_negative = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'fis_doc_type'
        ordering = ['code']

    def __str__(self):
        return f"[{self.code}] {self.name}"


class FiscalSeries(models.Model):
    """Série fiscal — sequência contínua por tipo/estabelecimento/exercício."""
    code = models.CharField(max_length=20)                    # identificador da série
    doc_type = models.ForeignKey(FiscalDocType, on_delete=models.PROTECT, related_name='series')
    establishment = models.CharField(max_length=60, blank=True, null=True)
    year = models.PositiveIntegerField(default=2026)
    prefix = models.CharField(max_length=10, blank=True, null=True)
    current_number = models.PositiveIntegerField(default=0)
    key_version = models.PositiveIntegerField(default=1)
    certified = models.BooleanField(default=True)
    environment = models.CharField(max_length=4, default='TEST')
    is_active = models.BooleanField(default=True)             # descontinuada = inativa (nunca apagar)

    class Meta:
        db_table = 'fis_series'
        unique_together = ('code', 'doc_type', 'year')
        ordering = ['doc_type', 'code']

    def __str__(self):
        return f"{self.doc_type.code} {self.code}/{self.year}"


class FiscalDocument(models.Model):
    """Documento fiscal assinado e encadeado por hash — IMUTÁVEL após emissão."""
    STATUS = [('N', 'Normal'), ('A', 'Anulado')]
    series = models.ForeignKey(FiscalSeries, on_delete=models.PROTECT, related_name='documents')
    doc_type = models.ForeignKey(FiscalDocType, on_delete=models.PROTECT, related_name='documents')
    number = models.PositiveIntegerField()
    invoice_no = models.CharField(max_length=60, unique=True)   # ex: "FT A/1"
    doc_date = models.DateField()
    system_entry_date = models.DateTimeField()                  # data/hora de gravação (imutável)
    customer_name = models.CharField(max_length=200, blank=True, null=True)
    customer_tax_id = models.CharField(max_length=30, blank=True, null=True)
    customer_address = models.CharField(max_length=250, blank=True, null=True)
    # Contexto operacional (aparece na fatura: Mesa, Utilizador, Quarto).
    operator_name = models.CharField(max_length=120, blank=True, null=True)
    place_ref = models.CharField(max_length=80, blank=True, null=True)   # Mesa/destino
    room_ref = models.CharField(max_length=80, blank=True, null=True)    # Quarto
    payment_method = models.CharField(max_length=80, blank=True, null=True)
    tax_inclusive = models.BooleanField(default=True)   # preços das linhas já incluem IVA
    net_total = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    discount_total = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    gross_total = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    amount_in_words = models.CharField(max_length=400, blank=True, null=True)  # valor por extenso (AGT)
    print_count = models.PositiveIntegerField(default=0)  # 0=ainda não impresso -> "Original"
    # Assinatura e encadeamento (não encriptar; arquivo legal)
    previous_hash = models.TextField(blank=True, null=True)
    doc_hash = models.TextField()                               # assinatura RSA (base64)
    key_version = models.PositiveIntegerField(default=1)
    print_mention = models.CharField(max_length=120, blank=True, null=True)
    qr_data = models.TextField(blank=True, null=True)
    source_billing = models.CharField(max_length=1, default='P')  # P=próprio, I=integrado, M=manual
    source_module = models.CharField(max_length=20, blank=True, null=True)  # pos, finance, pms, manual
    source_ref = models.CharField(max_length=60, blank=True, null=True)     # id do doc de origem
    reference_doc = models.CharField(max_length=60, blank=True, null=True)  # NC/ND: doc retificado
    status = models.CharField(max_length=1, choices=STATUS, default='N')
    # Ciclo de vida (Documents Center): estados após emissão/assinatura.
    agt_status = models.CharField(max_length=10, default='PENDING')  # PENDING/SENT/ACCEPTED/REJECTED
    settled = models.BooleanField(default=False)                     # pago
    is_archived = models.BooleanField(default=False)                 # arquivo fiscal
    created_by = models.CharField(max_length=100, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'fis_document'
        ordering = ['-created_at']

    def __str__(self):
        return self.invoice_no

    @property
    def lifecycle_state(self):
        """Estado consolidado do documento no ciclo Documents Center."""
        if self.status == 'A':
            return 'VOID'
        if self.is_archived:
            return 'ARCHIVED'
        if self.settled:
            return 'PAID'
        if self.agt_status == 'ACCEPTED':
            return 'ACCEPTED'
        if self.agt_status == 'SENT':
            return 'SENT_AGT'
        if self.doc_type.signable and self.doc_hash and self.doc_hash != '0':
            return 'SIGNED'
        return 'ISSUED'


class FiscalDocumentLine(models.Model):
    document = models.ForeignKey(FiscalDocument, on_delete=models.CASCADE, related_name='lines')
    description = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=14, decimal_places=3, default=1)
    unit_price = models.DecimalField(max_digits=16, decimal_places=4, default=0)
    tax_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    line_total = models.DecimalField(max_digits=16, decimal_places=2, default=0)   # sem imposto
    exemption_reason = models.CharField(max_length=120, blank=True, null=True)

    class Meta:
        db_table = 'fis_document_line'


class SubmissionQueue(models.Model):
    """Fila de submissão à AGT (store-and-forward). Nunca comunica diretamente — passa por aqui."""
    STATUS = [('QUEUED', 'Em fila'), ('SENT', 'Enviado'), ('ACK', 'Aceite'), ('REJECTED', 'Rejeitado'), ('RETRY', 'A reenviar')]
    document = models.ForeignKey(FiscalDocument, on_delete=models.CASCADE, related_name='submissions')
    status = models.CharField(max_length=10, choices=STATUS, default='QUEUED')
    attempts = models.PositiveIntegerField(default=0)
    response = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'fis_submission'
        ordering = ['-created_at']


class CommercialDocument(models.Model):
    """
    Documento comercial NÃO fiscal (Orçamento, Proforma, Encomenda de Cliente).
    Editável enquanto rascunho, tem workflow próprio e CONVERTE-SE em documento fiscal
    (Fatura) — nesse momento entra no motor de assinatura/SAF-T. Nunca é assinado aqui.
    """
    KIND = [('BUDGET', 'Orçamento'), ('PROFORMA', 'Proforma'), ('ORDER', 'Encomenda de Cliente')]
    STATE = [('DRAFT', 'Rascunho'), ('APPROVAL', 'Em Aprovação'), ('APPROVED', 'Aprovado'),
             ('SENT', 'Enviado'), ('ACCEPTED', 'Aceite'), ('REJECTED', 'Rejeitado'),
             ('EXPIRED', 'Expirado'), ('CONVERTED', 'Convertido')]
    PREFIX = {'BUDGET': 'ORC', 'PROFORMA': 'PRF', 'ORDER': 'ENC'}
    kind = models.CharField(max_length=10, choices=KIND, default='BUDGET')
    number = models.CharField(max_length=40, unique=True)
    year = models.PositiveIntegerField(default=2026)
    seq = models.PositiveIntegerField(default=0)
    doc_date = models.DateField()
    valid_until = models.DateField(blank=True, null=True)
    customer_name = models.CharField(max_length=200, blank=True, null=True)
    customer_tax_id = models.CharField(max_length=30, blank=True, null=True)
    customer_address = models.CharField(max_length=250, blank=True, null=True)
    operator_name = models.CharField(max_length=120, blank=True, null=True)
    notes = models.CharField(max_length=400, blank=True, null=True)
    tax_inclusive = models.BooleanField(default=True)
    net_total = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    gross_total = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    state = models.CharField(max_length=10, choices=STATE, default='DRAFT')
    converted_to = models.ForeignKey('FiscalDocument', on_delete=models.SET_NULL, blank=True, null=True,
                                     related_name='origin_commercial')
    source_ref = models.CharField(max_length=60, blank=True, null=True)  # doc de origem (conversão em cadeia)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'fis_commercial_document'
        ordering = ['-created_at']

    def __str__(self):
        return self.number

    @property
    def editable(self):
        return self.state == 'DRAFT'

    def recompute(self):
        from decimal import Decimal
        from . import tax_engine
        from .services import summarize_by_rate, _q
        items = []
        for l in self.lines.all():
            rate, exemption = tax_engine.resolve({'tax_code': l.tax_code, 'tax_percentage': l.tax_percentage,
                                                  'exemption_reason': l.exemption_reason})
            amount = _q(Decimal(str(l.quantity)) * Decimal(str(l.unit_price)))
            if self.tax_inclusive and rate > 0:
                net = _q(amount / (Decimal('1') + rate / Decimal('100')))
            else:
                net = amount
            l.tax_percentage = rate
            l.tax_amount = _q((amount - net) if self.tax_inclusive and rate > 0 else net * rate / Decimal('100'))
            l.line_total = net
            l.exemption_reason = exemption
            l.save(update_fields=['tax_percentage', 'tax_amount', 'line_total', 'exemption_reason'])
            items.append((rate, net + l.tax_amount))
        summ = summarize_by_rate(items)
        self.net_total = sum((s['base'] for s in summ), Decimal('0'))
        self.tax_total = sum((s['tax'] for s in summ), Decimal('0'))
        self.gross_total = sum((s['gross'] for s in summ), Decimal('0'))
        self.save(update_fields=['net_total', 'tax_total', 'gross_total'])


class CommercialDocumentLine(models.Model):
    document = models.ForeignKey(CommercialDocument, on_delete=models.CASCADE, related_name='lines')
    description = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=14, decimal_places=3, default=1)
    unit_price = models.DecimalField(max_digits=16, decimal_places=4, default=0)
    tax_code = models.CharField(max_length=12, blank=True, null=True)
    tax_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    line_total = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    exemption_reason = models.CharField(max_length=120, blank=True, null=True)

    class Meta:
        db_table = 'fis_commercial_line'


class AGTConnection(models.Model):
    """
    Fiscal Connectivity Center — parametrização da ligação à AGT (endpoints + credenciais).
    Segredos guardados encriptados (ver secrets.py); nunca devolvidos em claro pela API.
    """
    ENV = [('SANDBOX', 'Sandbox / Testes'), ('PROD', 'Produção')]
    name = models.CharField(max_length=60, default='AGT')
    environment = models.CharField(max_length=8, choices=ENV, default='SANDBOX')
    is_active = models.BooleanField(default=True)
    # Endpoints (parametrizáveis — a AGT pode alterá-los)
    url_auth = models.CharField(max_length=300, blank=True, null=True)
    url_submit = models.CharField(max_length=300, blank=True, null=True)
    url_query = models.CharField(max_length=300, blank=True, null=True)
    url_cancel = models.CharField(max_length=300, blank=True, null=True)
    url_download = models.CharField(max_length=300, blank=True, null=True)
    url_saft = models.CharField(max_length=300, blank=True, null=True)
    url_health = models.CharField(max_length=300, blank=True, null=True)
    # Credenciais (encriptadas)
    client_id = models.CharField(max_length=200, blank=True, null=True)
    client_secret_enc = models.TextField(blank=True, null=True)
    username = models.CharField(max_length=120, blank=True, null=True)
    password_enc = models.TextField(blank=True, null=True)
    api_key_enc = models.TextField(blank=True, null=True)
    # Tokens de sessão (rotativos)
    access_token = models.TextField(blank=True, null=True)
    refresh_token = models.TextField(blank=True, null=True)
    token_expires_at = models.DateTimeField(blank=True, null=True)
    # Timeouts / reenvio
    timeout_seconds = models.PositiveIntegerField(default=30)
    max_retries = models.PositiveIntegerField(default=5)
    last_health_status = models.CharField(max_length=20, blank=True, null=True)
    last_health_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'fis_agt_connection'

    def __str__(self):
        return f"AGT [{self.environment}] {self.name}"


class DigitalCertificate(models.Model):
    """Certificate Manager — certificados digitais e par de chaves associado."""
    STATUS = [('ACTIVE', 'Ativo'), ('EXPIRED', 'Expirado'), ('REVOKED', 'Revogado')]
    alias = models.CharField(max_length=80)
    cert_type = models.CharField(max_length=40, default='X.509')
    serial_number = models.CharField(max_length=120, blank=True, null=True)
    issued_by = models.CharField(max_length=200, blank=True, null=True)
    issued_to = models.CharField(max_length=200, blank=True, null=True)
    fingerprint = models.CharField(max_length=120, blank=True, null=True)
    algorithm = models.CharField(max_length=40, default='RSA-SHA1')
    key_bits = models.PositiveIntegerField(default=1024)
    issued_at = models.DateField(blank=True, null=True)
    valid_until = models.DateField(blank=True, null=True)
    status = models.CharField(max_length=10, choices=STATUS, default='ACTIVE')
    is_default = models.BooleanField(default=False)
    # Material criptográfico (público em claro; privado SEMPRE encriptado, nunca devolvido)
    public_key_pem = models.TextField(blank=True, null=True)
    private_key_enc = models.TextField(blank=True, null=True)
    private_key_password_enc = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'fis_certificate'
        ordering = ['-is_default', 'alias']

    def __str__(self):
        return f"{self.alias} ({self.status})"


class FiscalAuditLog(models.Model):
    event = models.CharField(max_length=40)
    document_ref = models.CharField(max_length=60, blank=True, null=True)
    user = models.CharField(max_length=100, blank=True, null=True)
    ip_address = models.GenericIPAddressField(blank=True, null=True)
    detail = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'fis_audit'
        ordering = ['-created_at']
