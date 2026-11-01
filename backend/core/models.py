from django.db import models

class GlobalConfig(models.Model):
    key = models.CharField(max_length=100, unique=True)
    value = models.JSONField()

    def __str__(self):
        return self.key


# ==========================================================================
# Configuração transversal — Integração (20), Notificações (06), Documentos (18),
# Sistema (21). Registos de configuração; os conectores reais ligam-se quando
# houver credenciais (mesma filosofia dos conectores OTA/pagamento/AGT).
# ==========================================================================

class IntegrationConnector(models.Model):
    """Conector de integração de hardware/serviço (fechaduras, TPA, balanças, impressoras, APIs)."""
    KINDS = [
        ('LOCK', 'Fechaduras eletrónicas'),
        ('BANK_POS', 'TPA / Terminal de pagamento'),
        ('SCALE', 'Balança'),
        ('PRINTER', 'Impressora'),
        ('API', 'API externa'),
    ]
    STATUS = [('CONFIGURED', 'Configurado'), ('PENDING', 'Pendente'), ('ERROR', 'Erro'), ('DISABLED', 'Desativado')]
    kind = models.CharField(max_length=12, choices=KINDS)
    name = models.CharField(max_length=120)
    vendor = models.CharField(max_length=120, blank=True, null=True)       # Ex: Assa Abloy, Multicaixa, Epson
    endpoint = models.CharField(max_length=255, blank=True, null=True)     # host/URL/porta
    api_key = models.CharField(max_length=255, blank=True, null=True)
    config = models.JSONField(default=dict, blank=True)
    enabled = models.BooleanField(default=False)
    status = models.CharField(max_length=12, choices=STATUS, default='PENDING')
    last_sync_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'cfg_integration_connector'
        ordering = ['kind', 'name']

    def __str__(self):
        return f"[{self.kind}] {self.name}"


class NotificationChannel(models.Model):
    """Canal de notificação (email/SMS/push) + credenciais do fornecedor."""
    CHANNELS = [('EMAIL', 'Email'), ('SMS', 'SMS'), ('PUSH', 'Push'), ('WHATSAPP', 'WhatsApp')]
    channel = models.CharField(max_length=10, choices=CHANNELS)
    name = models.CharField(max_length=120)
    provider = models.CharField(max_length=120, blank=True, null=True)     # SMTP, Twilio, FCM…
    sender = models.CharField(max_length=160, blank=True, null=True)       # remetente/from
    config = models.JSONField(default=dict, blank=True)
    enabled = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'cfg_notification_channel'
        ordering = ['channel', 'name']

    def __str__(self):
        return f"[{self.channel}] {self.name}"


class NotificationRule(models.Model):
    """Regra/alerta: quando um evento ocorre, envia por um canal com um modelo."""
    event = models.CharField(max_length=80)          # ex: reservation.created, stock.low, invoice.overdue
    name = models.CharField(max_length=140)
    channel = models.ForeignKey(NotificationChannel, on_delete=models.SET_NULL, blank=True, null=True, related_name='rules')
    template = models.TextField(blank=True, null=True)
    recipients = models.CharField(max_length=255, blank=True, null=True)   # lista/segmento
    enabled = models.BooleanField(default=True)

    class Meta:
        db_table = 'cfg_notification_rule'
        ordering = ['event']

    def __str__(self):
        return f"{self.event} · {self.name}"


class DocumentTemplate(models.Model):
    """COMO O DOCUMENTO SAI NO PAPEL — por tipo de documento.

    ─── O QUE ISTO RESOLVE ───────────────────────────────────────────────
    O desenho da fatura estava escrito no código: a cor, o que se mostrava e
    o que se escondia, o texto do rodapé. Cada casa que quisesse a sua morada
    no rodapé, ou o IBAN, ou não quisesse o resumo de IVA à vista, obrigava a
    uma alteração do programa — e um programa certificado pela AGT não se
    altera por causa do gosto de um cliente.

    Agora é uma FICHA. O hotel preenche-a uma vez e todos os documentos desse
    tipo saem assim.

    ─── O QUE NÃO SE DEIXA ESCOLHER, E PORQUÊ ────────────────────────────
    Nada do que a lei exige. O número do documento, a data, o NIF, o resumo
    de IVA por taxa, o total por extenso, o QR Code e a menção "Processado
    por programa validado" saem SEMPRE — não há caixa para os desligar. Uma
    factura sem eles não é uma factura mal desenhada: é uma factura inválida,
    e quem responde por isso é o hotel.

    As caixas abaixo mexem no que é mesmo opcional: a marca, o que se
    acrescenta, e o que se mostra por conveniência (as formas de pagamento,
    o espaço para assinar).
    """
    FORMATS = [('A4', 'A4'), ('A5', 'A5'), ('THERMAL_80', 'Talão 80mm'), ('THERMAL_58', 'Talão 58mm')]
    name = models.CharField(max_length=140)
    doc_type = models.CharField(max_length=40)         # FT, FR, VOUCHER, RC, BEO…
    page_format = models.CharField(max_length=12, choices=FORMATS, default='A4')
    header = models.TextField(blank=True, null=True)
    body = models.TextField(blank=True, null=True)
    footer = models.TextField(blank=True, null=True)
    show_logo = models.BooleanField(default=True)
    show_qr = models.BooleanField(default=True)
    signature_enabled = models.BooleanField(default=False)   # assinatura digital no PDF
    signature_label = models.CharField(max_length=160, blank=True, null=True)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    # ─── A MARCA DA CASA ──────────────────────────────────────────────────
    # A COR não é decoração: é a única coisa no papel que diz, antes de se ler
    # nada, de que hotel é aquela factura. Estava fixa no código a azul, e um
    # lodge de marca verde recebia papel azul.
    accent_color = models.CharField(max_length=9, default='#1F3A5F',
                                    help_text='Cor da marca no papel (#RRGGBB)')
    logo_height_mm = models.PositiveSmallIntegerField(default=16)

    # ─── O QUE SE ACRESCENTA ──────────────────────────────────────────────
    # Dados que a lei não exige mas sem os quais o cliente não consegue pagar
    # nem devolver: para onde transferir, e a quem se queixar.
    bank_details = models.TextField(blank=True, default='',
                                    help_text='IBAN / conta para transferência')
    payment_terms = models.CharField(max_length=200, blank=True, default='')
    legal_notes = models.TextField(blank=True, default='',
                                   help_text='Condições, reclamações, devoluções')

    # ─── O QUE SE MOSTRA POR CONVENIÊNCIA ─────────────────────────────────
    show_payments = models.BooleanField(default=True, verbose_name='Formas de pagamento')
    show_signature_line = models.BooleanField(default=False, verbose_name='Linha para assinar')
    show_bank_details = models.BooleanField(default=False)
    show_page_numbers = models.BooleanField(default=True)

    # O HOTEL A QUE PERTENCE. Um grupo com três hotéis tem três papéis
    # diferentes; sem isto, mudar o rodapé de um mudava o dos outros dois.
    # Nulo = serve qualquer hotel, que é o que uma instalação de um hotel só
    # quer e o que as fichas que já existem passam a ser.
    hotel = models.ForeignKey('identity.Hotel', on_delete=models.CASCADE,
                              null=True, blank=True, related_name='document_templates')

    class Meta:
        db_table = 'cfg_document_template'
        ordering = ['doc_type', 'name']

    def __str__(self):
        return f"{self.name} ({self.doc_type})"


class ScheduledTask(models.Model):
    """Tarefa agendada do sistema (backup, night audit, sync, limpeza)."""
    FREQ = [('HOURLY', 'De hora a hora'), ('DAILY', 'Diária'), ('WEEKLY', 'Semanal'), ('MONTHLY', 'Mensal')]
    name = models.CharField(max_length=140)
    task_type = models.CharField(max_length=40)        # BACKUP, NIGHT_AUDIT, OTA_SYNC, CLEANUP…
    frequency = models.CharField(max_length=10, choices=FREQ, default='DAILY')
    run_at = models.CharField(max_length=10, blank=True, null=True)   # HH:MM
    enabled = models.BooleanField(default=True)
    last_run_at = models.DateTimeField(blank=True, null=True)
    last_status = models.CharField(max_length=20, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'cfg_scheduled_task'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.frequency})"


# ==========================================================================
# Workflow Center (19) — fluxos de aprovação/tarefas transversais.
# ==========================================================================

class WorkflowFlow(models.Model):
    """Definição de um fluxo de trabalho (ex: aprovação de compras, check-out VIP)."""
    name = models.CharField(max_length=140)
    trigger_event = models.CharField(max_length=80, blank=True, null=True)   # requisition.created…
    description = models.CharField(max_length=255, blank=True, null=True)
    steps = models.JSONField(default=list, blank=True)   # [{name, role, order}]
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'wfc_flow'
        ordering = ['name']

    def __str__(self):
        return self.name


class WorkflowTask(models.Model):
    """Tarefa/pendência de um fluxo — atribuída a alguém, com estado."""
    STATUS = [('PENDING', 'Pendente'), ('IN_PROGRESS', 'Em curso'), ('DONE', 'Concluída'), ('CANCELLED', 'Cancelada')]
    PRIORITY = [('LOW', 'Baixa'), ('NORMAL', 'Normal'), ('HIGH', 'Alta'), ('URGENT', 'Urgente')]
    flow = models.ForeignKey(WorkflowFlow, on_delete=models.SET_NULL, blank=True, null=True, related_name='tasks')
    title = models.CharField(max_length=180)
    assignee = models.CharField(max_length=120, blank=True, null=True)
    status = models.CharField(max_length=12, choices=STATUS, default='PENDING')
    priority = models.CharField(max_length=8, choices=PRIORITY, default='NORMAL')
    due_date = models.DateField(blank=True, null=True)
    note = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'wfc_task'
        ordering = ['-created_at']

    def __str__(self):
        return self.title


# Trilho de auditoria universal (o modelo vive em core/audit_trail.py).
from .audit_trail import AuditEvent  # noqa: E402,F401
