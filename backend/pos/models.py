from django.db import models
from identity.models import Hotel, PosOperator, Area, Workstation
from inventory.models import Item
from mdm.models import PaymentMethod, DocumentSeries
import uuid


# ==========================================================================
# POS MANAGEMENT (BackOffice) — configuração. NÃO vende.
# Consome entidades do Master Data (Artigos, Métodos de Pagamento); nunca as recria.
# ==========================================================================

class Outlet(models.Model):
    """Ponto de venda dentro de um hotel (Restaurante, Bar, Pool Bar, Room Service...)."""
    OUTLET_TYPES = [
        ('RESTAURANT', 'Restaurante'),
        ('BAR', 'Bar'),
        ('POOL_BAR', 'Pool Bar'),
        ('COFFEE', 'Coffee Shop'),
        ('ROOM_SERVICE', 'Room Service'),
        ('MINIBAR', 'Minibar'),
        ('SPA', 'Spa'),
        ('SHOP', 'Loja'),
        ('BANQUET', 'Banquetes'),
        ('OTHER', 'Outro'),
    ]
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='outlets')
    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=100)
    outlet_type = models.CharField(max_length=20, choices=OUTLET_TYPES, default='RESTAURANT')
    # Tabela de Preço da área/outlet (o mesmo artigo tem preço diferente por área).
    price_list = models.ForeignKey('inventory.PriceList', on_delete=models.SET_NULL, blank=True, null=True, related_name='outlets')
    # Armazém de onde a venda dá saída de stock (consumo/ficha técnica).
    warehouse = models.ForeignKey('inventory.Warehouse', on_delete=models.SET_NULL, blank=True, null=True, related_name='outlets')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def price_for(self, item):
        """Preço do artigo nesta área: Tabela de Preço → preço de venda base."""
        if self.price_list_id:
            p = self.price_list.price_of(item)
            if p is not None:
                return p
        return item.sale_price or 0

    class Meta:
        db_table = 'pos_outlet'

    def __str__(self):
        return f"[{self.code}] {self.name}"


class POSProductConfig(models.Model):
    """
    Configuração POS de um Artigo do Master Data para um Outlet.
    O artigo continua a viver no Master Data; aqui só se define disponibilidade,
    preço específico do POS (override opcional), categoria POS e ordem.
    """
    outlet = models.ForeignKey(Outlet, on_delete=models.CASCADE, related_name='product_configs')
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name='pos_configs')
    is_available = models.BooleanField(default=True)
    pos_price = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True,
                                    help_text="Preço específico no POS. Vazio = usa o preço de venda do artigo.")
    pos_category = models.CharField(max_length=100, blank=True, null=True)
    button_color = models.CharField(max_length=20, blank=True, null=True)
    sort_order = models.PositiveIntegerField(default=0)
    # Routing de produção (Motor 5 / KDS): para onde o pedido é encaminhado.
    KDS_STATIONS = [('KITCHEN', 'Cozinha'), ('BAR', 'Bar'), ('PASTRY', 'Pastelaria'), ('NONE', 'Sem produção')]
    kds_station = models.CharField(max_length=10, choices=KDS_STATIONS, default='KITCHEN')

    class Meta:
        db_table = 'pos_product_config'
        unique_together = ('outlet', 'item')
        ordering = ['sort_order']

    def __str__(self):
        return f"{self.item.name} @ {self.outlet.code}"

    @property
    def effective_price(self):
        return self.pos_price if self.pos_price is not None else (self.item.sale_price or 0)


class OutletPaymentMethod(models.Model):
    """
    Disponibilidade de um Método de Pagamento (Master Data) num Outlet.
    Implementa o princípio: o método é criado no Master Data e apenas AUTORIZADO aqui.
    """
    outlet = models.ForeignKey(Outlet, on_delete=models.CASCADE, related_name='payment_methods')
    payment_method = models.ForeignKey(PaymentMethod, on_delete=models.CASCADE, related_name='outlet_availability')
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'pos_outlet_payment_method'
        unique_together = ('outlet', 'payment_method')
        ordering = ['sort_order']

    def __str__(self):
        return f"{self.payment_method.name} @ {self.outlet.code}"


# ==========================================================================
# MOTOR 2 — GESTÃO DE CAIXA (POS FrontOffice)
# Abertura, movimentos (sangrias/reforços/entradas/saídas) e fecho com reconciliação.
# ==========================================================================

class CashSession(models.Model):
    """Sessão de caixa: da abertura (fundo inicial) ao fecho (contagem + reconciliação)."""
    STATUS_CHOICES = [('OPEN', 'Aberta'), ('CLOSED', 'Fechada')]

    outlet = models.ForeignKey(Outlet, on_delete=models.SET_NULL, blank=True, null=True, related_name='cash_sessions')
    terminal_name = models.CharField(max_length=100, blank=True, null=True)  # caixa/terminal
    operator_name = models.CharField(max_length=100)

    opening_float = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    opened_at = models.DateTimeField(auto_now_add=True)
    opened_by = models.CharField(max_length=100, blank=True, null=True)

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='OPEN')

    # Preenchidos no fecho
    counted_amount = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    expected_amount = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    difference = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    closing_notes = models.TextField(blank=True, null=True)
    closed_at = models.DateTimeField(blank=True, null=True)
    closed_by = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        db_table = 'pos_cash_session'
        ordering = ['-opened_at']

    def __str__(self):
        return f"Caixa {self.terminal_name or '-'} · {self.operator_name} ({self.get_status_display()})"

    @property
    def expected_cash(self):
        """Esperado = fundo inicial + reforços/entradas − sangrias/saídas. (Vendas em dinheiro: integração futura.)"""
        from decimal import Decimal
        total = Decimal(self.opening_float)
        for m in self.movements.all():
            if m.movement_type in ('REFORCO', 'ENTRADA'):
                total += m.amount
            else:  # SANGRIA, SAIDA
                total -= m.amount
        return total


class CashMovement(models.Model):
    """Movimento de caixa durante a sessão."""
    TYPE_CHOICES = [
        ('SANGRIA', 'Sangria'),
        ('REFORCO', 'Reforço'),
        ('ENTRADA', 'Entrada Manual'),
        ('SAIDA', 'Saída Manual'),
    ]
    session = models.ForeignKey(CashSession, on_delete=models.CASCADE, related_name='movements')
    movement_type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    reason = models.CharField(max_length=255, blank=True, null=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pos_cash_movement'
        ordering = ['created_at']

    def __str__(self):
        return f"{self.get_movement_type_display()} {self.amount}"


# ==========================================================================
# MOTOR 3 (Mesas) + MOTOR 4 (Pedidos) + núcleo do MOTOR 6 (Financeiro)
# O ticket é a operação de venda. Consome POS Product Config (preço) e os
# Métodos de Pagamento AUTORIZADOS no outlet. Liga-se à sessão de caixa.
# ==========================================================================

class POSTable(models.Model):
    # Estados avançados (POS Enterprise): livre/reservada/ocupada/limpeza/bloqueada/manutenção.
    STATUS = [
        ('FREE', 'Livre'), ('RESERVED', 'Reservada'), ('OCCUPIED', 'Ocupada'),
        ('DIRTY', 'Limpeza'), ('BLOCKED', 'Bloqueada'), ('MAINTENANCE', 'Manutenção'),
    ]
    SHAPES = [('SQUARE', 'Quadrada'), ('ROUND', 'Redonda'), ('RECT', 'Retangular'),
              ('BAR', 'Balcão'), ('SOFA', 'Sofá')]
    outlet = models.ForeignKey(Outlet, on_delete=models.CASCADE, related_name='tables')
    zone = models.CharField(max_length=50, blank=True, null=True)      # área/sala (Terraço, VIP, Piscina…)
    table_number = models.CharField(max_length=20)
    name = models.CharField(max_length=50, blank=True, null=True)      # ex: "Mesa VIP 01"
    seats = models.PositiveIntegerField(default=4)                     # lugares (capacidade normal)
    recommended_capacity = models.PositiveIntegerField(default=4)
    max_capacity = models.PositiveIntegerField(default=6)
    is_vip = models.BooleanField(default=False)                        # mesa VIP (serviço prioritário)
    vip_discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)  # desconto auto VIP
    cost_center = models.CharField(max_length=40, blank=True, null=True)
    group = models.ForeignKey('POSTableGroup', on_delete=models.SET_NULL, blank=True, null=True, related_name='tables')
    status = models.CharField(max_length=12, choices=STATUS, default='FREE')
    # Mapa gráfico (Motor 3): posição no plano da sala e forma.
    pos_x = models.PositiveIntegerField(default=40)
    pos_y = models.PositiveIntegerField(default=40)
    shape = models.CharField(max_length=8, choices=SHAPES, default='SQUARE')

    class Meta:
        db_table = 'pos_table_v2'
        unique_together = ('outlet', 'table_number')

    def __str__(self):
        return f"Mesa {self.table_number} ({self.outlet.code})"


class POSTableGroup(models.Model):
    """Grupo de mesas (ex.: 'Grupo 20-22') — várias mesas servidas por uma única conta."""
    outlet = models.ForeignKey(Outlet, on_delete=models.CASCADE, related_name='table_groups')
    name = models.CharField(max_length=60)
    ticket = models.ForeignKey('POSTicket', on_delete=models.SET_NULL, blank=True, null=True, related_name='+')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pos_table_group'

    def __str__(self):
        return self.name


class ServiceDestination(models.Model):
    """
    Destino de serviço genérico (Delivery Destination Center).
    Cobre locais SEM tabela própria (Piscina, Praia, Spa, Ginásio, Evento, Cabana,
    Lounge, VIP, Jardim, Rooftop, Conferência...). Mesa e Quarto NÃO se duplicam aqui —
    reutilizam POSTable e pms.Room via o campo dest_kind do ticket.
    """
    TYPES = [
        ('POOL', 'Piscina'), ('BEACH', 'Praia'), ('SPA', 'Spa'), ('GYM', 'Ginásio'),
        ('EVENT', 'Evento'), ('CONFERENCE', 'Sala de Conferência'), ('CABANA', 'Cabana'),
        ('LOUNGE', 'Lounge'), ('LOBBY', 'Lobby'), ('ROOFTOP', 'Rooftop'), ('TERRACE', 'Terraço'),
        ('GARDEN', 'Jardim'), ('GOLF', 'Campo de Golfe'), ('TENNIS', 'Campo de Ténis'),
        ('VIP', 'Zona VIP'), ('OFFICE', 'Escritório'), ('OTHER', 'Outro'),
    ]
    PRIORITY = [('LOW', 'Baixa'), ('NORMAL', 'Normal'), ('HIGH', 'Alta'), ('URGENT', 'Urgente')]
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=100)
    dtype = models.CharField(max_length=12, choices=TYPES, default='OTHER')
    hotel = models.ForeignKey('identity.Hotel', on_delete=models.CASCADE, related_name='service_destinations', blank=True, null=True)
    outlet = models.ForeignKey(Outlet, on_delete=models.SET_NULL, related_name='service_destinations', blank=True, null=True)
    zone = models.CharField(max_length=80, blank=True, null=True)          # zona/piso/área
    location_detail = models.CharField(max_length=120, blank=True, null=True)  # cabana/espreguiçadeira/mesa nº
    responsible = models.CharField(max_length=100, blank=True, null=True)
    eta_minutes = models.PositiveIntegerField(default=15)                  # tempo médio de entrega
    priority = models.CharField(max_length=8, choices=PRIORITY, default='NORMAL')
    open_time = models.CharField(max_length=5, blank=True, null=True)      # restrição horária (HH:MM)
    close_time = models.CharField(max_length=5, blank=True, null=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'pos_service_destination'
        ordering = ['dtype', 'name']

    def __str__(self):
        return f"{self.get_dtype_display()} · {self.name}"

    @property
    def label(self):
        base = self.name
        if self.location_detail:
            base = f"{base} · {self.location_detail}"
        return base


class POSTicket(models.Model):
    STATUS = [
        ('OPEN', 'Aberta'), ('SUSPENDED', 'Suspensa'), ('PAID', 'Paga'),
        ('REFUNDED', 'Estornada'), ('VOID', 'Anulada'),
    ]
    ticket_number = models.CharField(max_length=30, unique=True)
    # Motor 9 (offline): id gerado no cliente para idempotência na sincronização.
    client_uuid = models.CharField(max_length=64, unique=True, blank=True, null=True)
    outlet = models.ForeignKey(Outlet, on_delete=models.PROTECT, related_name='tickets')
    table = models.ForeignKey(POSTable, on_delete=models.SET_NULL, blank=True, null=True, related_name='tickets')
    cash_session = models.ForeignKey(CashSession, on_delete=models.SET_NULL, blank=True, null=True, related_name='tickets')
    operator_name = models.CharField(max_length=100)
    guests = models.PositiveIntegerField(default=1)
    # Associação de cliente/hóspede à mesa (aparece na comanda e na fatura).
    customer_name = models.CharField(max_length=200, blank=True, null=True)
    customer_tax_id = models.CharField(max_length=30, blank=True, null=True)   # NIF -> fatura com contribuinte
    company_name = models.CharField(max_length=200, blank=True, null=True)
    adults = models.PositiveIntegerField(default=0)
    children = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=10, choices=STATUS, default='OPEN')

    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)   # % desconto (VIP/manual)
    discount_authorized_by = models.CharField(max_length=100, blank=True, null=True)
    discount_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    grand_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(blank=True, null=True)
    stock_consumed = models.BooleanField(default=False)  # saída de stock já lançada (idempotência)

    # --- Destino de serviço (Delivery Destination) ---
    # dest_kind resolve para a tabela certa: Mesa->POSTable, Quarto->pms.Room, Destino->ServiceDestination.
    DEST_KIND = [('TABLE', 'Mesa'), ('ROOM', 'Quarto'), ('DESTINATION', 'Destino')]
    dest_kind = models.CharField(max_length=12, choices=DEST_KIND, default='TABLE')
    dest_ref = models.CharField(max_length=40, blank=True, null=True)      # id da entidade de destino
    dest_label = models.CharField(max_length=120, blank=True, null=True)   # snapshot legível (ex: "Quarto 503")
    dest_note = models.CharField(max_length=255, blank=True, null=True)    # observações de entrega
    dest_priority = models.CharField(max_length=8, default='NORMAL')

    # --- Fluxo de entrega ---
    DELIVERY = [('NONE', 'N/A'), ('PENDING', 'Por despachar'), ('DISPATCHED', 'Despachado'), ('DELIVERED', 'Entregue')]
    delivery_status = models.CharField(max_length=10, choices=DELIVERY, default='NONE')
    dispatched_at = models.DateTimeField(blank=True, null=True)
    delivered_at = models.DateTimeField(blank=True, null=True)
    delivered_by = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        db_table = 'pos_ticket'
        ordering = ['-opened_at']

    def __str__(self):
        return f"Ticket {self.ticket_number} ({self.get_status_display()})"

    def recompute(self, save=True):
        # Preços de menu são IVA-INCLUÍDO (convenção AO e alinhado com o motor fiscal):
        # o IVA é DECOMPOSTO do preço, não somado por cima. Assim o total do ticket
        # coincide com o total do recibo fiscal (FR).
        from decimal import Decimal, ROUND_HALF_UP
        def q(v):
            return v.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        net = Decimal('0'); tax = Decimal('0'); gross = Decimal('0')
        for l in self.lines.all():
            line_gross = l.line_total  # qty * unit_price = preço com IVA incluído
            rate = l.tax_percentage or Decimal('0')
            line_net = q(line_gross / (Decimal('1') + rate / Decimal('100'))) if rate > 0 else line_gross
            net += line_net
            tax += (line_gross - line_net)
            gross += line_gross
        self.subtotal = q(net)
        self.tax_total = q(tax)
        # Desconto (VIP/manual) sobre o total (com IVA incluído).
        if self.discount_percent:
            self.discount_total = q(gross * self.discount_percent / Decimal('100'))
        self.grand_total = q(gross) - self.discount_total
        if save:
            self.save(update_fields=['subtotal', 'tax_total', 'discount_total', 'grand_total'])

    @property
    def paid_amount(self):
        from decimal import Decimal
        return sum((p.amount for p in self.payments.all()), Decimal('0'))

    @property
    def balance_due(self):
        return self.grand_total - self.paid_amount


class POSTicketLine(models.Model):
    KDS_STATUS = [
        ('NEW', 'Novo'), ('FIRED', 'Enviado'), ('PREPARING', 'Em Preparação'),
        ('READY', 'Pronto'), ('SERVED', 'Servido'),
    ]
    ticket = models.ForeignKey(POSTicket, on_delete=models.CASCADE, related_name='lines')
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name='pos_ticket_lines')
    description = models.CharField(max_length=255)  # snapshot do nome no momento da venda
    quantity = models.DecimalField(max_digits=10, decimal_places=3, default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    tax_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    line_total = models.DecimalField(max_digits=14, decimal_places=2, editable=False, default=0)
    note = models.CharField(max_length=255, blank=True, null=True)  # observação p/ cozinha
    # Motor 5 (KDS)
    kds_station = models.CharField(max_length=10, default='KITCHEN')
    kds_status = models.CharField(max_length=10, choices=KDS_STATUS, default='NEW')
    fired_at = models.DateTimeField(blank=True, null=True)
    ready_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'pos_ticket_line'

    def save(self, *args, **kwargs):
        self.line_total = (self.quantity * self.unit_price)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.quantity}x {self.description}"


class POSTicketPayment(models.Model):
    ticket = models.ForeignKey(POSTicket, on_delete=models.CASCADE, related_name='payments')
    payment_method = models.ForeignKey(PaymentMethod, on_delete=models.PROTECT, related_name='ticket_payments')
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    change_due = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pos_ticket_payment'

    def __str__(self):
        return f"{self.payment_method.name}: {self.amount}"


# ==========================================================================
# MOTOR 7 — DOCUMENTOS (pré-conta, fatura, nota de crédito, recibo)
# Numeração sequencial atómica a partir de uma Série do Master Data.
# ==========================================================================

class POSDocument(models.Model):
    STATUS = [('ISSUED', 'Emitido'), ('VOID', 'Anulado')]

    document_type = models.CharField(max_length=20)
    series = models.ForeignKey(DocumentSeries, on_delete=models.PROTECT, related_name='documents')
    number = models.PositiveIntegerField()
    full_number = models.CharField(max_length=40, unique=True)  # ex: FT2026/0001
    ticket = models.ForeignKey(POSTicket, on_delete=models.SET_NULL, blank=True, null=True, related_name='documents')

    customer_name = models.CharField(max_length=200, blank=True, null=True)
    customer_tax_id = models.CharField(max_length=50, blank=True, null=True)

    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    grand_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    status = models.CharField(max_length=10, choices=STATUS, default='ISSUED')
    notes = models.TextField(blank=True, null=True)
    issued_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pos_document'
        ordering = ['-issued_at']

    def __str__(self):
        return self.full_number


# ==========================================================================
# MOTOR 8 — COMUNICAÇÃO (spooler de impressão)
# A cozinha/documentos geram print jobs numa fila; um agente local imprime e marca.
# ==========================================================================

class PrintJob(models.Model):
    JOB_TYPES = [
        ('KITCHEN', 'Comanda Cozinha'), ('BAR', 'Comanda Bar'), ('PASTRY', 'Comanda Pastelaria'),
        ('RECEIPT', 'Talão'), ('INVOICE', 'Fatura'), ('DRAWER', 'Abrir Gaveta'),
    ]
    STATUS = [('QUEUED', 'Em fila'), ('PRINTED', 'Impresso'), ('FAILED', 'Falhou'), ('CANCELED', 'Cancelado')]

    job_type = models.CharField(max_length=10, choices=JOB_TYPES)
    target = models.CharField(max_length=60, blank=True, null=True)  # estação/impressora
    outlet = models.ForeignKey(Outlet, on_delete=models.SET_NULL, blank=True, null=True, related_name='print_jobs')
    title = models.CharField(max_length=120)
    content = models.TextField(blank=True, null=True)  # texto renderizado da comanda/documento
    reference = models.CharField(max_length=60, blank=True, null=True)
    copies = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=10, choices=STATUS, default='QUEUED')
    created_at = models.DateTimeField(auto_now_add=True)
    printed_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'pos_print_job'
        ordering = ['-created_at']

    def __str__(self):
        return f"[{self.get_job_type_display()}] {self.title} ({self.get_status_display()})"


# ==========================================================================
# MOTOR 10 — AUDITORIA DE OPERAÇÃO (regista tudo: quem/quando/IP/valor)
# ==========================================================================

class POSAuditLog(models.Model):
    EVENTS = [
        ('TICKET_OPEN', 'Ticket aberto'),
        ('LINE_ADD', 'Linha adicionada'),
        ('LINE_VOID', 'Linha removida'),
        ('KITCHEN_FIRE', 'Enviado p/ cozinha'),
        ('KDS_ADVANCE', 'Estado de produção'),
        ('PAYMENT', 'Pagamento'),
        ('DOC_ISSUE', 'Documento emitido'),
        ('DOC_VOID', 'Documento anulado'),
        ('TICKET_VOID', 'Ticket anulado'),
        ('CASH_OPEN', 'Abertura de caixa'),
        ('CASH_MOVE', 'Movimento de caixa'),
        ('CASH_CLOSE', 'Fecho de caixa'),
    ]
    event_type = models.CharField(max_length=20, choices=EVENTS)
    description = models.CharField(max_length=255)
    operator_name = models.CharField(max_length=100, blank=True, null=True)
    user = models.CharField(max_length=100, blank=True, null=True)  # utilizador API
    outlet = models.ForeignKey(Outlet, on_delete=models.SET_NULL, blank=True, null=True, related_name='audit_logs')
    terminal_name = models.CharField(max_length=100, blank=True, null=True)
    reference = models.CharField(max_length=60, blank=True, null=True)  # ticket_number, full_number...
    ip_address = models.GenericIPAddressField(blank=True, null=True)
    old_value = models.CharField(max_length=100, blank=True, null=True)
    new_value = models.CharField(max_length=100, blank=True, null=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pos_audit_log'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.event_type} · {self.reference or ''} @ {self.created_at:%Y-%m-%d %H:%M}"


# ==========================================================================
# MOTOR 3 (aprofundamento) — RESERVAS DE MESA
# ==========================================================================

class POSReservation(models.Model):
    STATUS = [
        ('BOOKED', 'Confirmada'), ('ARRIVED', 'Chegada'), ('SEATED', 'Sentada'),
        ('CANCELLED', 'Cancelada'), ('NO_SHOW', 'No-show'),
    ]
    PREFERENCE = [
        ('', 'Sem preferência'), ('WINDOW', 'Janela'), ('TERRACE', 'Terraço'),
        ('VIP', 'VIP'), ('NON_SMOKING', 'Não fumador'),
    ]
    outlet = models.ForeignKey(Outlet, on_delete=models.CASCADE, related_name='reservations')
    table = models.ForeignKey(POSTable, on_delete=models.SET_NULL, blank=True, null=True, related_name='reservations')
    guest_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=40, blank=True, null=True)
    party_size = models.PositiveIntegerField(default=2)
    reserved_for = models.DateTimeField()
    preference = models.CharField(max_length=15, choices=PREFERENCE, blank=True, null=True)
    status = models.CharField(max_length=10, choices=STATUS, default='BOOKED')
    note = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pos_reservation'
        ordering = ['reserved_for']

    def __str__(self):
        return f"{self.guest_name} · {self.party_size}p @ {self.reserved_for:%d/%m %H:%M}"


# ==========================================================================
# MOTOR 4 (aprofundamento) — MODIFICADORES / EXTRAS por linha
# ==========================================================================

class POSLineModifier(models.Model):
    line = models.ForeignKey(POSTicketLine, on_delete=models.CASCADE, related_name='modifiers')
    name = models.CharField(max_length=100)          # ex: "Sem cebola", "Extra queijo"
    price_delta = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        db_table = 'pos_line_modifier'

    def __str__(self):
        return f"{self.name} ({self.price_delta:+})"


# ==========================================================================
# MOTOR 6 (aprofundamento) — GIFT CARD / VOUCHER com saldo
# ==========================================================================

class GiftCard(models.Model):
    code = models.CharField(max_length=40, unique=True)
    initial_balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pos_gift_card'
        ordering = ['-created_at']

    def __str__(self):
        return f"Gift {self.code} · saldo {self.balance}"


class Table(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE)
    area = models.ForeignKey(Area, on_delete=models.CASCADE)
    name = models.CharField(max_length=50) # e.g., "Mesa 12", "Balcão"
    seats = models.IntegerField(default=4)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        db_table = 'pos_table'
        unique_together = ('area', 'name')
        
    def __str__(self):
        return f"{self.area.name} - {self.name}"

class Order(models.Model):
    STATUS_CHOICES = [
        ('OPEN', 'Open'),
        ('PAID', 'Paid'),
        ('VOIDED', 'Voided'),
        ('SUSPENDED', 'Suspended'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    receipt_number = models.CharField(max_length=50, unique=True)
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE)
    workstation = models.ForeignKey(Workstation, on_delete=models.PROTECT)
    operator = models.ForeignKey(PosOperator, on_delete=models.PROTECT)
    table = models.ForeignKey(Table, on_delete=models.SET_NULL, null=True, blank=True)
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='OPEN')
    
    guests_count = models.IntegerField(default=1)
    
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    grand_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = 'pos_order'

    def __str__(self):
        return f"Order {self.receipt_number} ({self.status})"

class OrderLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(Order, related_name='lines', on_delete=models.CASCADE)
    item = models.ForeignKey(Item, on_delete=models.PROTECT)
    
    quantity = models.DecimalField(max_digits=10, decimal_places=3, default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2) # Captured at the moment of sale
    tax_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    line_total = models.DecimalField(max_digits=10, decimal_places=2)
    
    is_voided = models.BooleanField(default=False)
    void_reason = models.CharField(max_length=255, null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'pos_order_line'

    def __str__(self):
        return f"{self.quantity}x {self.item.name} for {self.order.receipt_number}"

class Payment(models.Model):
    PAYMENT_METHODS = [
        ('CASH', 'Dinheiro'),
        ('CARD', 'Cartão'),
        ('ROOM', 'Quarto'),
        ('EDC', 'EDC Transfer'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(Order, related_name='payments', on_delete=models.CASCADE)
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHODS)
    
    amount_tendered = models.DecimalField(max_digits=10, decimal_places=2)
    amount_applied = models.DecimalField(max_digits=10, decimal_places=2)
    change_due = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
    processed_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'pos_payment'
