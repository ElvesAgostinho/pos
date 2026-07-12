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
    # Desenho da planta da sala (o mapa é uma planta a sério, não uma grelha).
    width = models.PositiveIntegerField(default=90)
    height = models.PositiveIntegerField(default=110)
    color = models.CharField(max_length=20, default='#0f8b8d')
    text_color = models.CharField(max_length=20, default='#ffffff')
    # Reservas online (a mesa aceita reservas do site/motor de reservas?)
    online_reservation = models.BooleanField(default=False)
    min_seats = models.PositiveIntegerField(default=0)
    max_seats = models.PositiveIntegerField(default=0)
    preferred_seats = models.PositiveIntegerField(default=0)
    sector = models.ForeignKey('PosSector', on_delete=models.SET_NULL, blank=True, null=True,
                               related_name='tables')

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
    # O desconto APLICADO (o código autorizado). Sem isto, o relatório de descontos
    # do fim do mês é uma coluna de percentagens sem explicação.
    discount = models.ForeignKey('PosDiscount', on_delete=models.SET_NULL, blank=True, null=True,
                                 related_name='tickets')
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
        discountable = Decimal('0')   # base do desconto: exclui os artigos "sem desconto"
        scope_ids = None
        if self.discount_id:
            ids = list(self.discount.items.values_list('id', flat=True))
            scope_ids = set(ids) if ids else None
        for l in self.lines.filter(is_void=False).select_related('item'):   # anuladas não somam (mas ficam no registo)
            line_gross = l.line_total  # qty * unit_price = preço com IVA incluído
            rate = l.tax_percentage or Decimal('0')
            line_net = q(line_gross / (Decimal('1') + rate / Decimal('100'))) if rate > 0 else line_gross
            net += line_net
            tax += (line_gross - line_net)
            gross += line_gross
            # (Artigo) "Não permite desconto" — o tabaco e as garrafas de marca não
            # levam os 10% do gerente. A caixa exclui a linha da BASE do desconto.
            if not (l.item and getattr(l.item, 'no_discount', False)):
                # Âmbito do desconto (separador F&B): se o desconto só vale para certos
                # artigos, a base é só desses. "Desconto de bebidas" não desconta a comida.
                if scope_ids is None or (l.item_id in scope_ids):
                    discountable += line_gross
        self.subtotal = q(net)
        self.tax_total = q(tax)
        # Desconto — só sobre as linhas que o permitem e que estão no âmbito.
        if self.discount_id and self.discount.base == 'VALUE':
            # Desconto de VALOR fixo: nunca pode ultrapassar a base (senão o total ia a negativo).
            self.discount_total = q(min(self.discount.value, discountable))
        elif self.discount_percent:
            self.discount_total = q(discountable * self.discount_percent / Decimal('100'))
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
        ('READY', 'Pronto'), ('SERVED', 'Servido'), ('CANCELLED', 'ANULADO'),
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
    # Anulação: uma linha JÁ ENVIADA à produção nunca é apagada — é marcada como anulada,
    # continua a existir para auditoria e a estação recebe o aviso de anulação.
    is_void = models.BooleanField(default=False)
    void_reason = models.CharField(max_length=255, blank=True, null=True)
    voided_at = models.DateTimeField(blank=True, null=True)
    kds_ack_at = models.DateTimeField(blank=True, null=True)   # estação confirmou que viu a anulação

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
    error = models.CharField(max_length=200, blank=True, null=True)   # porque é que falhou
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


# ==========================================================================
# CONFIGURAÇÃO POS — Módulos, Terminais e Parâmetros
# ==========================================================================

class PosModule(models.Model):
    """MÓDULO do sistema — o que aparece no menu e no ambiente de trabalho.

    "Licenciado" NÃO se marca aqui à mão: vem da licença assinada. Se bastasse
    uma caixa para licenciar um módulo, a licença não valia nada.
    """
    module_id = models.CharField(max_length=60, unique=True)     # mwana-pos-config
    name = models.CharField(max_length=80)
    description = models.CharField(max_length=160, blank=True, null=True)
    sort_order = models.PositiveIntegerField(default=100)
    right_id = models.PositiveIntegerField(default=0)            # permissão necessária
    text_key = models.CharField(max_length=40, blank=True, null=True)
    menu = models.CharField(max_length=60, blank=True, null=True)
    license_key = models.CharField(max_length=40, blank=True, null=True)  # módulo da licença
    is_active = models.BooleanField(default=True)
    show_in_menu = models.BooleanField(default=True)
    show_on_desktop = models.BooleanField(default=False)
    is_iframe = models.BooleanField(default=False)
    is_external_window = models.BooleanField(default=False)
    is_widget = models.BooleanField(default=False)

    class Meta:
        db_table = 'pos_module'
        ordering = ['sort_order', 'name']

    def __str__(self):
        return self.name


class PosTerminal(models.Model):
    """TERMINAL — o posto de venda físico (ou virtual).

    Um terminal "Virtual" não tem hardware: serve para vendas de outro sistema
    (ex.: o menu digital do quarto) entrarem no POS como se fossem de um posto.
    """
    TYPES = [('NORMAL', 'Normal'), ('VIRTUAL', 'Virtual'), ('MOBILE', 'Portátil')]
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=80)
    terminal_type = models.CharField(max_length=10, choices=TYPES, default='NORMAL')
    outlet = models.ForeignKey('Outlet', on_delete=models.SET_NULL, blank=True, null=True,
                               related_name='terminals')
    # Parâmetros do posto (o quadro "Geral": nº do parâmetro → valor).
    params = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'pos_terminal'
        ordering = ['code']

    def __str__(self):
        return f'{self.code} · {self.name}'


class TerminalPrinter(models.Model):
    """Que impressoras este terminal usa, e como."""
    LOCATIONS = [('TERMINAL', 'Terminal'), ('SERVER', 'Servidor'), ('NETWORK', 'Rede')]
    terminal = models.ForeignKey(PosTerminal, on_delete=models.CASCADE, related_name='printers')
    printer = models.ForeignKey('inventory.Printer', on_delete=models.CASCADE, related_name='terminals')
    port = models.CharField(max_length=40, blank=True, null=True)       # COM1, USB001, IP:porta
    location = models.CharField(max_length=10, choices=LOCATIONS, default='TERMINAL')
    one_item_per_ticket = models.BooleanField(default=False)   # um talão por artigo
    kds_monitor = models.CharField(max_length=60, blank=True, null=True)  # ecrã de cozinha
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'pos_terminal_printer'
        unique_together = ('terminal', 'printer')

    def __str__(self):
        return f'{self.terminal.code} → {self.printer.name}'


class TerminalHardware(models.Model):
    """Periféricos ligados ao terminal (gaveta, balança, leitor, display)."""
    TYPES = [('DRAWER', 'Gaveta'), ('SCALE', 'Balança'), ('SCANNER', 'Leitor de códigos'),
             ('DISPLAY', 'Display de cliente'), ('CARD', 'Terminal bancário'), ('OTHER', 'Outro')]
    terminal = models.ForeignKey(PosTerminal, on_delete=models.CASCADE, related_name='hardware')
    code = models.CharField(max_length=30)
    description = models.CharField(max_length=80)
    hw_type = models.CharField(max_length=10, choices=TYPES, default='OTHER')
    port = models.CharField(max_length=40, blank=True, null=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'pos_terminal_hardware'

    def __str__(self):
        return f'{self.code} ({self.get_hw_type_display()})'


class PosParameter(models.Model):
    """CATÁLOGO DE PARÂMETROS — as perguntas de configuração, com número.

    O número (8523, 8517…) é a referência: é por ele que o suporte fala com o
    cliente ao telefone ("mude o 8610"). O valor concreto vive no terminal.
    """
    KINDS = [('BOOL', 'Sim/Não'), ('INT', 'Número'), ('TEXT', 'Texto'), ('CHOICE', 'Escolha')]
    SCOPES = [('GLOBAL', 'Sistema'), ('TERMINAL', 'Terminal'), ('SECTOR', 'Setor')]
    scope = models.CharField(max_length=10, choices=SCOPES, default='TERMINAL')
    value = models.CharField(max_length=250, blank=True, null=True)   # valor GLOBAL
    number = models.PositiveIntegerField(unique=True)          # 8523
    name = models.CharField(max_length=120)                    # "Tipo Posto"
    kind = models.CharField(max_length=8, choices=KINDS, default='BOOL')
    group = models.CharField(max_length=40, default='Geral')
    choices = models.JSONField(default=list, blank=True)       # ["Mesas", "Venda Direta", …]
    default = models.CharField(max_length=120, blank=True, null=True)
    help_text = models.CharField(max_length=250, blank=True, null=True)

    class Meta:
        db_table = 'pos_parameter'
        ordering = ['group', 'number']

    def __str__(self):
        return f'({self.number}) {self.name}'


class PosSector(models.Model):
    """SETOR — a sala de venda (Restaurante, Lounge Bar, Rooftop).

    É o que o operador escolhe ao iniciar sessão. Determina o TECLADO que vê, o
    NÍVEL DE PREÇO que se aplica, o ARMAZÉM de onde sai o stock e o HAPPY HOUR em vigor.
    O mesmo artigo custa mais no Rooftop do que no Restaurante — é aqui que isso se define.
    """
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=80)
    price_level = models.PositiveSmallIntegerField(default=1)     # nível de preço (1..6)
    happy_hour = models.ForeignKey('commercial.Promotion', on_delete=models.SET_NULL,
                                   blank=True, null=True, related_name='sectors')
    warehouse = models.ForeignKey('inventory.Warehouse', on_delete=models.SET_NULL,
                                  blank=True, null=True, related_name='sectors')
    outlet = models.ForeignKey(Outlet, on_delete=models.SET_NULL, blank=True, null=True,
                               related_name='sectors')
    seats = models.PositiveIntegerField(default=0)
    keyboard = models.CharField(max_length=60, blank=True, null=True)   # teclado do Front Office
    params = models.JSONField(default=dict, blank=True)                 # parâmetros do setor
    # Planta da sala
    map_bg_color = models.CharField(max_length=20, default='#fdeef0')
    map_text_color = models.CharField(max_length=20, default='#ffffff')
    is_active = models.BooleanField(default=True)

    # --- Interface com o PMS ---
    # É por aqui que o consumo do hóspede entra no folio do quarto com o encargo certo.
    pms_department = models.CharField(max_length=60, blank=True, null=True)
    pms_default_account = models.CharField(max_length=40, blank=True, null=True)   # Conta por defeito
    pms_paymaster = models.CharField(max_length=20, blank=True, null=True)         # conta interna do PMS
    pms_visible = models.BooleanField(default=True)                                # visível no PMS

    class Meta:
        db_table = 'pos_sector'
        ordering = ['code']

    def __str__(self):
        return f'{self.code} · {self.name}'


# ==========================================================================
# TECLADOS DO POS — o que o operador vê e toca no terminal.
#
# Estrutura: TECLADO → PÁGINAS (COMIDAS, BEBIDAS, CAFETARIA) → TECLAS.
# Uma tecla é uma PASTA (abre outro nível: SNACKS, PETISCOS…) ou um ARTIGO
# (vende). É esta árvore que o POS frontend desenha no ecrã.
# ==========================================================================

class PosKeyboard(models.Model):
    number = models.PositiveIntegerField(unique=True)
    name = models.CharField(max_length=80)
    price_level = models.PositiveSmallIntegerField(default=1)   # nível de preço a usar
    cols = models.PositiveSmallIntegerField(default=4)          # Horizontal
    rows = models.PositiveSmallIntegerField(default=4)          # Vertical
    show_codes = models.BooleanField(default=False)             # Visualizar Códigos
    show_prices = models.BooleanField(default=False)            # Visualizar Preços
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'pos_keyboard'
        ordering = ['number']

    def __str__(self):
        return f'{self.number} · {self.name}'


class PosKeyboardKey(models.Model):
    """Uma tecla. Sem `parent` = PÁGINA (a fila de cima). Com `parent` = tecla dessa página.

    Uma tecla-PASTA abre o nível seguinte; uma tecla-ARTIGO vende.
    """
    KINDS = [('PAGE', 'Página'), ('FOLDER', 'Pasta'), ('ITEM', 'Artigo')]
    keyboard = models.ForeignKey(PosKeyboard, on_delete=models.CASCADE, related_name='keys')
    parent = models.ForeignKey('self', on_delete=models.CASCADE, blank=True, null=True,
                               related_name='children')
    kind = models.CharField(max_length=6, choices=KINDS, default='FOLDER')
    label = models.CharField(max_length=60)
    item = models.ForeignKey('inventory.Item', on_delete=models.CASCADE, blank=True, null=True,
                             related_name='keyboard_keys')
    color = models.CharField(max_length=20, default='#1565c0')
    text_color = models.CharField(max_length=20, default='#ffffff')
    sort_order = models.PositiveIntegerField(default=0)
    span = models.PositiveSmallIntegerField(default=1)     # nº de colunas que ocupa

    class Meta:
        db_table = 'pos_keyboard_key'
        ordering = ['sort_order', 'id']

    def __str__(self):
        return f'{self.keyboard.name} · {self.label}'


class TimeBand(models.Model):
    """HORÁRIO-PERÍODO — a faixa horária (ex.: "08:01 as 10:00").

    É a unidade com que o sistema fala de tempo: os relatórios agrupam vendas por
    faixa (para se saber a que horas o restaurante enche), o happy hour aplica-se a
    faixas, e os turnos dos operadores encaixam nelas. A COR é a que aparece nos
    gráficos e nas grelhas de ocupação.
    """
    code = models.CharField(max_length=10, unique=True)     # 001, 002…
    name = models.CharField(max_length=60)                  # "08:01 as 10:00"
    color = models.CharField(max_length=20, default='#0080FF')
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'pos_time_band'
        ordering = ['sort_order', 'code']

    def __str__(self):
        return f'{self.code} · {self.name}'


class TimeBandSlot(models.Model):
    """Os intervalos concretos da faixa. Uma faixa pode ter vários (ex.: o almoço
    corta a meio para o serviço de esplanada)."""
    band = models.ForeignKey(TimeBand, on_delete=models.CASCADE, related_name='slots')
    time_from = models.TimeField()
    time_to = models.TimeField()

    class Meta:
        db_table = 'pos_time_band_slot'
        ordering = ['time_from']

    def __str__(self):
        return f'{self.time_from:%H:%M} → {self.time_to:%H:%M}'


class PosSchedule(models.Model):
    """HORÁRIO — junta faixas horárias a dias da semana.

    "Happy Hour de Verão" = faixas 16:01-19:00, de segunda a sexta.
    É o que o motor de promoções e os turnos consultam para saber se estão em vigor.
    """
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=80)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'pos_schedule'
        ordering = ['code']

    def __str__(self):
        return f'{self.code} · {self.name}'


class PosScheduleLine(models.Model):
    """Uma linha: este dia da semana, esta faixa horária."""
    WEEKDAYS = [(0, 'Segunda'), (1, 'Terça'), (2, 'Quarta'), (3, 'Quinta'),
                (4, 'Sexta'), (5, 'Sábado'), (6, 'Domingo')]
    schedule = models.ForeignKey(PosSchedule, on_delete=models.CASCADE, related_name='lines')
    weekday = models.PositiveSmallIntegerField(choices=WEEKDAYS)
    band = models.ForeignKey('TimeBand', on_delete=models.CASCADE, related_name='schedule_lines')

    class Meta:
        db_table = 'pos_schedule_line'
        unique_together = ('schedule', 'weekday', 'band')
        ordering = ['weekday']


class PosRight(models.Model):
    """CATÁLOGO DE PERMISSÕES — cada função do sistema tem um número.

    20000=Configuração, 20008=Adicionar artigo, 20258=Permitir alterar preço…
    O número é a referência estável: o suporte diz "dê-lhe o 20258" e toda a gente
    sabe do que se fala. Hierárquico: 20007=Artigos tem filhos (Adicionar/Editar/Apagar).
    """
    number = models.PositiveIntegerField(unique=True)
    name = models.CharField(max_length=120)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, blank=True, null=True,
                               related_name='children')
    module = models.CharField(max_length=30, default='POS')      # POS, PMS, Geral
    group = models.CharField(max_length=40, default='Geral')

    class Meta:
        db_table = 'pos_right'
        ordering = ['number']

    def __str__(self):
        return f'{self.number}={self.name}'


class PosUserGroup(models.Model):
    """GRUPO DE UTILIZADORES — o perfil (Comercial, FO-MANAGER, KITCHEN…).

    As permissões dão-se ao GRUPO, não à pessoa: quando entra um empregado novo,
    põe-se no grupo e ele fica com tudo o que precisa — e nada do que não precisa.
    """
    number = models.PositiveIntegerField(default=0)
    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=80)
    memo = models.TextField(blank=True, null=True)
    default_module = models.CharField(max_length=30, blank=True, null=True)
    is_active = models.BooleanField(default=True)
    # Permissões numeradas (a árvore da direita).
    rights = models.ManyToManyField(PosRight, blank=True, related_name='groups')
    # Funções do POS por separador (as caixas da esquerda).
    pos_tables = models.JSONField(default=dict, blank=True)      # Ecrã de mesas
    pos_documents = models.JSONField(default=dict, blank=True)   # Documentos
    pos_shortcuts = models.JSONField(default=dict, blank=True)   # Atalhos barra superior
    pos_payments = models.JSONField(default=dict, blank=True)    # Pagamentos
    data_protection = models.JSONField(default=dict, blank=True) # Proteção de Dados (leitura/escrita)

    class Meta:
        db_table = 'pos_user_group'
        ordering = ['code']

    def __str__(self):
        return f'{self.code} · {self.name}'


class PosUser(models.Model):
    """UTILIZADOR — quem entra no sistema.

    As PERMISSÕES vêm do GRUPO (PosUserGroup), não daqui: quando o dono muda o que
    um perfil pode fazer, muda para toda a gente desse perfil de uma vez.
    Aqui fica o que é DA PESSOA: identificação, contactos, caixas atribuídas,
    setores onde pode vender, e as comissões que ganha.
    """
    # --- Dados de login ---
    code = models.CharField(max_length=30, unique=True)          # AS, HHS, CONNECTOR…
    group = models.ForeignKey('PosUserGroup', on_delete=models.SET_NULL, blank=True, null=True,
                              related_name='users')
    is_blocked = models.BooleanField(default=False)
    must_change_password = models.BooleanField(default=False)
    password_changed_at = models.DateTimeField(blank=True, null=True)
    auth_user = models.OneToOneField('auth.User', on_delete=models.SET_NULL, blank=True, null=True,
                                     related_name='pos_user')

    # --- Dados do utilizador ---
    number = models.PositiveIntegerField(default=0)
    title = models.CharField(max_length=30, blank=True, null=True)
    last_name = models.CharField(max_length=60, blank=True, null=True)    # Apelido
    first_name = models.CharField(max_length=60, blank=True, null=True)   # Nome
    language = models.CharField(max_length=10, default='pt-PT')
    section = models.CharField(max_length=60, blank=True, null=True)      # Secção
    birth_date = models.DateField(blank=True, null=True)
    direct_dial = models.CharField(max_length=40, blank=True, null=True)
    position = models.CharField(max_length=60, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    entry_date = models.DateField(blank=True, null=True)
    exit_date = models.DateField(blank=True, null=True)

    # --- Caixas atribuídas (que caixas este utilizador pode abrir) ---
    cash_registers = models.JSONField(default=dict, blank=True)

    # --- Impersonation (ligação a um servidor/relatórios específicos) ---
    imp_data_access = models.CharField(max_length=60, blank=True, null=True)
    imp_reporting = models.CharField(max_length=60, blank=True, null=True)
    imp_sql_server = models.CharField(max_length=120, blank=True, null=True)
    imp_database = models.CharField(max_length=120, blank=True, null=True)

    # --- Complexos e secções de tarifas ---
    all_complexes = models.BooleanField(default=True)
    complexes = models.JSONField(default=list, blank=True)
    rate_sections = models.JSONField(default=list, blank=True)

    # --- Dados pessoais ---
    street = models.CharField(max_length=150, blank=True, null=True)
    city = models.CharField(max_length=60, blank=True, null=True)
    postal_code = models.CharField(max_length=20, blank=True, null=True)
    country = models.CharField(max_length=60, default='Angola')
    phone = models.CharField(max_length=40, blank=True, null=True)
    mobile = models.CharField(max_length=40, blank=True, null=True)
    fax = models.CharField(max_length=40, blank=True, null=True)
    personal_email = models.EmailField(blank=True, null=True)

    # --- Dados POS ---
    pos_group = models.ForeignKey('PosUserGroup', on_delete=models.SET_NULL, blank=True, null=True,
                                  related_name='pos_users')
    all_sectors = models.BooleanField(default=True)
    sectors = models.ManyToManyField('PosSector', blank=True, related_name='users')
    internal_consumption = models.BooleanField(default=False)   # pode lançar consumo interno
    discount_profile = models.CharField(max_length=60, blank=True, null=True)
    use_cost_price = models.BooleanField(default=False)         # vende ao preço de custo
    pos_pin = models.CharField(max_length=128, blank=True, null=True)   # PIN do terminal (hash)
    pos_must_change_pin = models.BooleanField(default=False)

    # --- EMS / F&B ---
    is_event_manager = models.BooleanField(default=False)
    email_group = models.CharField(max_length=60, blank=True, null=True)
    is_fnb_user = models.BooleanField(default=False)

    memo = models.TextField(blank=True, null=True)
    email_signature = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'pos_user'
        ordering = ['code']

    def __str__(self):
        return f'{self.code} · {self.first_name or ""} {self.last_name or ""}'.strip()

    @property
    def full_name(self):
        return f'{self.first_name or ""} {self.last_name or ""}'.strip() or self.code


class PosUserCommission(models.Model):
    """COMISSÃO — quanto o empregado ganha ao vender determinado artigo/sub-família.

    É o que motiva a sala a vender a garrafa de vinho em vez do copo. Sem isto,
    o hotel paga comissões numa folha de Excel e ninguém confere.
    """
    TYPES = [('PERCENT', 'Percentagem'), ('VALUE', 'Valor fixo')]
    user = models.ForeignKey(PosUser, on_delete=models.CASCADE, related_name='commissions')
    subfamily = models.ForeignKey('inventory.ItemSubFamily', on_delete=models.CASCADE,
                                  blank=True, null=True, related_name='commissions')
    item = models.ForeignKey('inventory.Item', on_delete=models.CASCADE,
                             blank=True, null=True, related_name='commissions')
    commission_type = models.CharField(max_length=8, choices=TYPES, default='PERCENT')
    value = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    class Meta:
        db_table = 'pos_user_commission'

    def __str__(self):
        alvo = self.item.name if self.item else (self.subfamily.name if self.subfamily else '—')
        return f'{self.user.code}: {alvo} = {self.value}'


class HRType(models.Model):
    """TIPO R.H. — a família de recursos humanos (Tratamentos, Sala, Cozinha…).

    Serve para agrupar as pessoas que PRESTAM serviço e são escolhidas no momento
    da venda: a terapeuta do spa, o massagista, o barbeiro. É por aqui que o POS
    sabe que lista de profissionais mostrar quando se lança um tratamento.
    """
    code = models.CharField(max_length=40, unique=True)
    name = models.CharField(max_length=120)
    notes = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'pos_hr_type'
        ordering = ['code']

    def __str__(self):
        return self.name


class HumanResource(models.Model):
    """RECURSO HUMANO — a pessoa que executa o serviço e a quem se paga comissão.

    Não é um utilizador do sistema (esse é o PosUser): pode nem sequer ter login.
    É quem aparece no POS a perguntar "quem fez este tratamento?" — e é por essa
    escolha que a comissão é calculada e o horário validado.
    """
    GENDERS = [('F', 'Feminino'), ('M', 'Masculino'), ('O', 'Outro')]

    code = models.CharField(max_length=30, unique=True)
    first_name = models.CharField(max_length=60)                  # Nome
    last_name = models.CharField(max_length=60, blank=True, null=True)   # Apelido
    hr_type = models.ForeignKey(HRType, on_delete=models.PROTECT, related_name='resources')
    gender = models.CharField(max_length=1, choices=GENDERS, blank=True, null=True)
    sort_order = models.PositiveIntegerField(default=0)           # Ordem
    license_code = models.CharField(max_length=40, blank=True, null=True)   # Código Licença (cédula profissional)
    space = models.ForeignKey('PosSector', on_delete=models.SET_NULL, blank=True, null=True,
                              related_name='resources')           # Espaço (gabinete/sala onde trabalha)

    is_active = models.BooleanField(default=True)
    is_front_office_user = models.BooleanField(default=False)     # também atende na receção

    # Serviços que esta pessoa está habilitada a executar
    services = models.ManyToManyField('inventory.Item', blank=True, related_name='resources')

    # Período de validade do horário
    schedule_from = models.DateField(blank=True, null=True)
    schedule_to = models.DateField(blank=True, null=True)

    class Meta:
        db_table = 'pos_human_resource'
        ordering = ['sort_order', 'code']

    def __str__(self):
        return f'{self.code} · {self.full_name}'

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name or ""}'.strip()


class HRScheduleLine(models.Model):
    """Um turno do recurso: 'às terças, das 09:00 às 17:00'.

    O calendário que se vê ao lado é DERIVADO daqui — não é uma imagem: cada dia
    que cai num dia da semana com turno fica marcado como dia de trabalho.
    """
    resource = models.ForeignKey(HumanResource, on_delete=models.CASCADE, related_name='schedule')
    weekday = models.PositiveSmallIntegerField()      # 0=Domingo … 6=Sábado (igual ao ecrã)
    time_from = models.TimeField()
    time_to = models.TimeField()

    class Meta:
        db_table = 'pos_hr_schedule'
        ordering = ['weekday', 'time_from']


class HRCommission(models.Model):
    """Comissão do recurso — por sub-família ou por artigo."""
    TYPES = [('PERCENT', 'Percentagem'), ('VALUE', 'Valor fixo')]
    resource = models.ForeignKey(HumanResource, on_delete=models.CASCADE, related_name='commissions')
    subfamily = models.ForeignKey('inventory.ItemSubFamily', on_delete=models.CASCADE,
                                  blank=True, null=True, related_name='hr_commissions')
    item = models.ForeignKey('inventory.Item', on_delete=models.CASCADE,
                             blank=True, null=True, related_name='hr_commissions')
    commission_type = models.CharField(max_length=8, choices=TYPES, default='PERCENT')
    value = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    class Meta:
        db_table = 'pos_hr_commission'


class PosDiscount(models.Model):
    """DESCONTO — o desconto AUTORIZADO, com nome, validade e quem o pode dar.

    A diferença entre um hotel que ganha dinheiro e um que não ganha está aqui:
    sem isto, o desconto é um número que o empregado escreve à mão e ninguém
    consegue explicar ao fim do mês. Com isto, o desconto é um CÓDIGO — tem dono
    (que grupos o podem aplicar), tem prazo (válido de/até), tem âmbito (que
    artigos) e sai nos relatórios pelo nome.
    """
    BASES = [('PERCENT', 'Percentagem'), ('VALUE', 'Valor')]
    CALC_MODES = [('GENERAL', 'Geral'), ('NIGHTS', 'Por noites'), ('FIRST', 'Primeira noite')]

    number = models.PositiveIntegerField(default=0)          # Nr
    code = models.CharField(max_length=40, unique=True)      # DESCPOS10
    name = models.CharField(max_length=120)                  # Desconto POS 10%
    base = models.CharField(max_length=8, choices=BASES, default='PERCENT')
    value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    valid_from = models.DateField(blank=True, null=True)
    valid_to = models.DateField(blank=True, null=True)

    # Onde vale (os módulos onde o desconto aparece)
    for_pms = models.BooleanField(default=False)
    for_ems = models.BooleanField(default=False)
    for_pos = models.BooleanField(default=True)

    allow_manual = models.BooleanField(default=False)        # Permite Desconto Manual
    calc_mode = models.CharField(max_length=10, choices=CALC_MODES, default='GENERAL')
    calc_base = models.CharField(max_length=20, blank=True, null=True)
    set_nights = models.BooleanField(default=False)          # Definir dias a descontar
    stay_nights = models.PositiveIntegerField(default=0)     # Dias Estadia
    paid_nights = models.PositiveIntegerField(default=0)     # Dias Pagos
    use_intervals = models.BooleanField(default=False)

    # QUEM o pode dar. Vazio = ninguém no POS (é preciso autorizar um grupo).
    user_groups = models.ManyToManyField('PosUserGroup', blank=True, related_name='discounts')
    # A QUE artigos se aplica (separador F&B). Vazio = à conta toda.
    items = models.ManyToManyField('inventory.Item', blank=True, related_name='pos_discounts')

    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'pos_discount'
        ordering = ['code']

    def __str__(self):
        return f'{self.code} · {self.name}'

    def is_valid_on(self, day=None):
        from django.utils import timezone
        day = day or timezone.localdate()
        if not self.is_active:
            return False
        if self.valid_from and day < self.valid_from:
            return False
        if self.valid_to and day > self.valid_to:
            return False
        return True


class PmsHotelLink(models.Model):
    """LIGAÇÃO MULTI-HOTEL — o POS deste hotel a falar com o PMS de OUTRO.

    Serve as redes: o hóspede do Hotel A janta no restaurante do Hotel B e o consumo
    tem de cair no folio dele — que vive na base de dados do A. Sem isto, o empregado
    do B não consegue lançar no quarto e a conta perde-se.

    A password é de um SERVIÇO (utilizador da base de dados), não de uma pessoa:
    entra, fica guardada e NUNCA é devolvida pela API — só se substitui.
    """
    MODES = [('SIMPLE', 'Simples'), ('FULL', 'Completo')]

    is_active = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)
    hotel_id = models.CharField(max_length=20, default='0')      # Id do Hotel (no outro sistema)
    description = models.CharField(max_length=120)
    server = models.CharField(max_length=120, blank=True, null=True)
    database = models.CharField(max_length=120, blank=True, null=True)
    trusted = models.BooleanField(default=False)                 # autenticação integrada (sem password)
    username = models.CharField(max_length=60, blank=True, null=True)
    password = models.CharField(max_length=200, blank=True, null=True)   # write-only na API
    charge_code = models.CharField(max_length=40, blank=True, null=True)  # Encargo
    paymaster = models.CharField(max_length=20, blank=True, null=True)
    taxes = models.CharField(max_length=60, blank=True, null=True)        # Taxas a aplicar
    mode = models.CharField(max_length=8, choices=MODES, default='SIMPLE')

    last_test_at = models.DateTimeField(blank=True, null=True)
    last_test_ok = models.BooleanField(default=False)
    last_test_detail = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        db_table = 'pos_pms_hotel_link'
        ordering = ['description']

    def __str__(self):
        return self.description

    def save(self, *args, **kwargs):
        if self.is_default:
            PmsHotelLink.objects.exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)


class PmsExternalLink(models.Model):
    """LIGAÇÃO EXTERNA — cada SETOR pode falar com um PMS/base de dados diferente.

    O Bar da Piscina de um resort pode estar noutra máquina que o Restaurante.
    Aqui diz-se onde é que cada setor vai buscar (e lançar) as contas dos quartos.
    """
    sector = models.OneToOneField(PosSector, on_delete=models.CASCADE, related_name='external_link')
    is_active = models.BooleanField(default=False)
    company_id = models.CharField(max_length=20, default='0')
    server = models.CharField(max_length=120, blank=True, null=True)
    database = models.CharField(max_length=120, blank=True, null=True)
    trusted = models.BooleanField(default=False)
    username = models.CharField(max_length=60, blank=True, null=True)
    password = models.CharField(max_length=200, blank=True, null=True)   # write-only na API

    last_test_at = models.DateTimeField(blank=True, null=True)
    last_test_ok = models.BooleanField(default=False)
    last_test_detail = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        db_table = 'pos_pms_external_link'

    def __str__(self):
        return f'Ligação de {self.sector.name}'


class StockErpLink(models.Model):
    """INTERFACE COM CONTROLO DE STOCKS — ligação a um ERP externo (Primavera, SAP…).

    Há hotéis que já têm um ERP de compras/armazém e não o vão largar. Em vez de
    duplicar o stock (e ter dois números diferentes para a mesma garrafa), o POS
    liga-se ao ERP e vai lá buscar os saldos.

    Enquanto estiver DESLIGADO, manda o motor de stock interno — que é o que o
    hotel normal usa. Ligar isto é assumir que a verdade do stock está lá fora.
    """
    BLOCK_MODES = [('WARN', 'Avisar'), ('BLOCK', 'Bloqueio'), ('NONE', 'Não controlar')]

    is_active = models.BooleanField(default=False)
    name = models.CharField(max_length=60, default='ERP Externo')
    url = models.CharField(max_length=200, blank=True, null=True)
    instance = models.CharField(max_length=60, blank=True, null=True)   # Instância
    company = models.CharField(max_length=60, blank=True, null=True)    # Empresa
    username = models.CharField(max_length=60, blank=True, null=True)
    password = models.CharField(max_length=200, blank=True, null=True)  # write-only na API

    # Que parte do catálogo é que vem de lá
    group = models.ForeignKey('inventory.ItemGroup', on_delete=models.SET_NULL, blank=True, null=True, related_name='+')
    family = models.ForeignKey('inventory.ItemFamily', on_delete=models.SET_NULL, blank=True, null=True, related_name='+')
    subfamily = models.ForeignKey('inventory.ItemSubFamily', on_delete=models.SET_NULL, blank=True, null=True, related_name='+')

    stock_control = models.BooleanField(default=False)
    block_mode = models.CharField(max_length=6, choices=BLOCK_MODES, default='WARN')
    import_rows = models.PositiveIntegerField(default=500)   # Importação - Número de linhas

    last_sync_at = models.DateTimeField(blank=True, null=True)
    last_test_at = models.DateTimeField(blank=True, null=True)
    last_test_ok = models.BooleanField(default=False)
    last_test_detail = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        db_table = 'pos_stock_erp_link'

    def __str__(self):
        return self.name


class HappyHour(models.Model):
    """HAPPY HOUR — a que HORAS e em que DIAS muda o preço.

    Não é um desconto solto: é uma GRELHA hora × dia da semana. Em cada célula
    escolhe-se o nível de preço (Preço 1..5) ou a percentagem de desconto. Às
    17h de quinta o gin passa ao Preço 2; às 20h volta ao normal — sozinho, sem
    ninguém se lembrar de o mudar.

    As células vivem em `cells`: {"3-17": 2} = quinta (3), hora 17, Preço 2.
    """
    KINDS = [('PRICE', 'Preço'), ('DISCOUNT', 'Desconto')]

    name = models.CharField(max_length=120)
    kind = models.CharField(max_length=8, choices=KINDS, default='PRICE')
    show_half_hours = models.BooleanField(default=False)
    outlet = models.ForeignKey(Outlet, on_delete=models.CASCADE, blank=True, null=True,
                               related_name='happy_hours')   # vazio = todos
    cells = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'pos_happy_hour'
        ordering = ['name']

    def __str__(self):
        return self.name

    def value_now(self, when=None):
        """O que está em vigor NESTE momento: (nível de preço) ou (% de desconto)."""
        from django.utils import timezone
        when = when or timezone.localtime()
        # Python: segunda=0 … domingo=6. O ecrã começa no domingo, como o original.
        dia = (when.weekday() + 1) % 7
        v = self.cells.get(f'{dia}-{when.hour}')
        if not v and self.show_half_hours and when.minute >= 30:
            v = self.cells.get(f'{dia}-{when.hour}.5')
        return v or None


class VoidReason(models.Model):
    """MOTIVO DE ANULAÇÃO — porque é que o prato voltou para trás.

    "Pedido Errado" não é o mesmo que "Reclamação Serviço Cozinha": o primeiro é
    erro do empregado, o segundo é a cozinha a falhar. Sem motivos, o relatório de
    anulações é uma lista de números e ninguém sabe onde está o problema.

    O texto da TECLA é o que o empregado vê no terminal; o da IMPRESSÃO é o que sai
    no talão de anulação que vai para a cozinha.
    """
    code = models.CharField(max_length=10, unique=True)
    key_label = models.CharField(max_length=80)      # Tecla (no terminal)
    print_label = models.CharField(max_length=80)    # Impressão (no talão da estação)
    sort_order = models.PositiveIntegerField(default=50)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'pos_void_reason'
        ordering = ['sort_order', 'code']

    def __str__(self):
        return self.key_label


class PosHardware(models.Model):
    """HARDWARE — o catálogo dos aparelhos: impressoras, gavetas, balanças, TPA.

    É aqui que vive a configuração da PORTA SÉRIE (baud rate, paridade, stop bits…).
    Uma impressora térmica ligada a 9600 baud quando o aparelho fala a 19200 imprime
    caracteres estranhos — e ninguém percebe porquê. Estes números não são enfeite.

    Depois, cada Impressora (posto de impressão) aponta para um destes aparelhos.
    """
    TYPES = [('PRINTER', 'Impressora'), ('DRAWER', 'Gaveta'), ('SCALE', 'Balança'),
             ('SCANNER', 'Leitor de códigos'), ('DISPLAY', 'Display de cliente'),
             ('CARD', 'Terminal bancário (TPA)'), ('KDS', 'Monitor de cozinha'), ('OTHER', 'Outro')]
    BAUDS = [(b, str(b)) for b in (2400, 4800, 9600, 19200, 38400, 57600, 115200)]
    FLOWS = [('NONE', 'None'), ('XONXOFF', 'XON/XOFF'), ('RTSCTS', 'RTS/CTS')]
    PARITY = [('NONE', 'None'), ('EVEN', 'Even'), ('ODD', 'Odd')]

    hw_type = models.CharField(max_length=10, choices=TYPES, default='PRINTER')
    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=80)

    port = models.CharField(max_length=40, blank=True, null=True)     # COM1, USB, IP:porta
    baud_rate = models.PositiveIntegerField(choices=BAUDS, default=9600)
    flow_control = models.CharField(max_length=8, choices=FLOWS, default='NONE')
    parity = models.CharField(max_length=6, choices=PARITY, default='NONE')
    stop_bits = models.PositiveSmallIntegerField(default=1)
    data_bits = models.PositiveSmallIntegerField(default=8)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'pos_hardware'
        ordering = ['hw_type', 'code']

    def __str__(self):
        return f'{self.code} · {self.name}'


class KdsMonitor(models.Model):
    """MONITOR DE COZINHA — o ecrã que o cozinheiro vê.

    Não é um ecrã só: a cozinha quente, a fria, o bar e a pastelaria querem ver
    coisas diferentes. Cada monitor escolhe:
      · POR PEDIDO — o cozinheiro vê a MESA inteira e manda tudo junto (é o certo:
        os pratos da mesma mesa têm de sair ao mesmo tempo);
      · POR ARTIGO — vê cada prato solto (serve para postos de linha: só grelhados).

    Os BOTÕES são os passos que este posto usa. Uma pastelaria que só prepara e
    entrega não precisa do passo "Produção" a estorvar o ecrã.
    """
    KINDS = [('ORDER', 'Por pedido'), ('ITEM', 'Por artigo')]
    BUTTONS = ['PRODUCTION', 'FINISHED', 'DELIVERED', 'PRINT']

    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=80)
    kind = models.CharField(max_length=6, choices=KINDS, default='ORDER')
    station = models.CharField(max_length=10, default='KITCHEN',
                               choices=[('KITCHEN', 'Cozinha'), ('BAR', 'Bar'),
                                        ('PASTRY', 'Pastelaria'), ('CASHIER', 'Caixa')])
    buttons = models.JSONField(default=list, blank=True)     # ['PRODUCTION','FINISHED',...]
    options = models.JSONField(default=dict, blank=True)     # alergénios, tempos, som…

    header_text = models.CharField(max_length=120, blank=True, null=True)
    header_image_url = models.CharField(max_length=300, blank=True, null=True)
    footer_notifications = models.CharField(max_length=200, blank=True, null=True)

    # As impressoras ATIVAS aqui substituem as de origem do pedido.
    printers = models.ManyToManyField('inventory.Printer', blank=True, related_name='kds_monitors')

    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'pos_kds_monitor'
        ordering = ['code']

    def __str__(self):
        return f'{self.code} · {self.name}'


class SmartCash(models.Model):
    """CAIXA INTELIGENTE — a máquina que conta e guarda o dinheiro (Cashlogy, CashDro…).

    O empregado não toca nas notas: a máquina recebe, confere, dá o troco certo e
    sabe sempre quanto tem lá dentro. Acaba com a discussão do fecho de caixa e com o
    desvio de notas — que é a fuga de dinheiro mais comum num hotel.

    Fala-se com ela por HTTP: uma URL para as operações (pagar, troco, sangria) e
    outra para o menu de manutenção.
    """
    TYPES = [('CASHLOGY', 'Cashlogy'), ('CASHDRO', 'CashDro'), ('GLORY', 'Glory'), ('OTHER', 'Outro')]

    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=80)
    device_type = models.CharField(max_length=10, choices=TYPES, default='CASHLOGY')
    url_operations = models.CharField(max_length=250, blank=True, null=True)
    url_menu = models.CharField(max_length=250, blank=True, null=True)
    username = models.CharField(max_length=60, blank=True, null=True)
    password = models.CharField(max_length=200, blank=True, null=True)   # write-only na API
    terminal = models.ForeignKey('PosTerminal', on_delete=models.SET_NULL, blank=True, null=True,
                                 related_name='smart_cash')
    is_active = models.BooleanField(default=True)

    last_test_at = models.DateTimeField(blank=True, null=True)
    last_test_ok = models.BooleanField(default=False)
    last_test_detail = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        db_table = 'pos_smart_cash'
        ordering = ['code']

    def __str__(self):
        return f'{self.code} · {self.name}'


class CustomerType(models.Model):
    """TIPO DE CLIENTE — Hotel (hóspede), Passante (rua), Consumo Interno (staff).

    Não é uma etiqueta: é o que decide o PREÇO e o que o POS deixa fazer. O hóspede
    lança no quarto; o passante paga na hora; o consumo interno não paga mas fica
    registado. Sem isto, o relatório não distingue quem come de graça de quem paga.
    """
    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=80)
    for_ems = models.BooleanField(default=False)
    for_pos = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'pos_customer_type'
        ordering = ['code']

    def __str__(self):
        return self.name


class CustomFieldDef(models.Model):
    """CAMPO PERSONALIZADO — o campo que ESTE hotel precisa e mais nenhum.

    Um resort quer guardar o nº do voo; um hotel de cidade, a taxa turística pré-paga.
    Em vez de mudar o sistema para cada cliente, define-se o campo aqui: onde aparece,
    que tipo tem, quem o pode ler e escrever, e como se valida.
    """
    LOCATIONS = [('ENTITY', 'Entidade'), ('RESERVATION', 'Reserva (Detalhe)'),
                 ('TICKET', 'Conta POS'), ('ITEM', 'Artigo'), ('GUEST', 'Hóspede')]
    TYPES = [('TEXT', 'Texto'), ('NUMBER', 'Número'), ('DATE', 'Data'),
             ('BOOL', 'Sim/Não'), ('LIST', 'Lista')]

    code = models.CharField(max_length=40, unique=True)
    name = models.CharField(max_length=100)
    location = models.CharField(max_length=12, choices=LOCATIONS, default='RESERVATION')
    field_type = models.CharField(max_length=8, choices=TYPES, default='TEXT')

    read_permission = models.PositiveIntegerField(default=0)    # nº da permissão (0 = todos)
    write_permission = models.PositiveIntegerField(default=0)
    regex = models.CharField(max_length=200, blank=True, null=True)   # Validação
    size = models.PositiveIntegerField(default=0)                    # Tamanho
    lines = models.PositiveIntegerField(default=0)                   # Número de linhas
    is_list = models.BooleanField(default=False)
    list_values = models.JSONField(default=list, blank=True)
    default_value = models.CharField(max_length=200, blank=True, null=True)

    show_in_search = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'pos_custom_field'
        ordering = ['code']

    def __str__(self):
        return f'{self.code} · {self.name}'


class CardType(models.Model):
    """TIPO DE CARTÃO — como se LÊ o cartão que o cliente encosta ao leitor.

    Um leitor de banda magnética devolve uma pista em bruto, assim:

        ;6034567890123456?

    O `;` é o START SENTINEL e o `?` o END SENTINEL — marcas que o leitor põe e que
    não fazem parte do número. A POSIÇÃO diz que pedaço do meio é o número do cartão
    (às vezes a pista traz mais coisas: validade, código do clube).

    Sem isto, o sistema guardava a pista inteira como se fosse o número — e o mesmo
    cartão nunca mais era reconhecido no dia seguinte.
    """
    TYPES = [('MAGNETIC', 'Banda magnética'), ('RFID', 'RFID / Contactless'),
             ('BARCODE', 'Código de barras'), ('QR', 'QR Code'), ('MANUAL', 'Manual')]

    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=80)
    card_kind = models.CharField(max_length=10, choices=TYPES, default='MAGNETIC')
    length = models.PositiveSmallIntegerField(default=0)      # Tamanho (0 = não valida)

    # Detalhes da pista
    start_sentinel = models.CharField(max_length=4, blank=True, null=True)
    end_sentinel = models.CharField(max_length=4, blank=True, null=True)
    # Posição (1-based, como o instalador conta). 0 = usar a pista toda.
    pos_start = models.PositiveSmallIntegerField(default=0)
    pos_end = models.PositiveSmallIntegerField(default=0)

    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'pos_card_type'
        ordering = ['code']

    def __str__(self):
        return f'{self.code} · {self.name}'

    def read(self, raw: str):
        """Extrai o NÚMERO do cartão a partir da pista em bruto do leitor.

        Devolve (numero, erro). O erro é uma frase para mostrar ao operador — não
        um código: quem está ao balcão precisa de saber o que fazer.
        """
        if not raw:
            return None, 'Cartão vazio.'
        s = raw.strip()
        if self.start_sentinel:
            i = s.find(self.start_sentinel)
            if i < 0:
                return None, f'Não é um cartão "{self.name}" (falta a marca inicial).'
            s = s[i + len(self.start_sentinel):]
        if self.end_sentinel:
            j = s.find(self.end_sentinel)
            if j < 0:
                return None, f'Leitura incompleta — passe o cartão outra vez.'
            s = s[:j]
        if self.pos_start or self.pos_end:
            ini = max(0, (self.pos_start or 1) - 1)
            fim = self.pos_end or len(s)
            s = s[ini:fim]
        s = s.strip()
        if self.length and len(s) != self.length:
            return None, f'O cartão devia ter {self.length} dígitos e tem {len(s)}.'
        return s or None, None if s else 'Cartão ilegível.'


class MemberCard(models.Model):
    """CARTÃO DE MEMBRO — o cartão do sócio, do all-inclusive, do cliente frequente.

    Um cartão pode fazer quatro coisas diferentes, e é preciso dizer QUAIS:
      · CRÉDITO  — o cartão tem saldo e paga (pré-pago, all-inclusive);
      · DÉBITO   — vai acumulando dívida para pagar no fim (conta corrente);
      · PONTOS   — acumula pontos por consumo (fidelização);
      · DESCONTO — dá desconto nos artigos da lista abaixo.

    Sem estas quatro caixas, "cartão" era só uma etiqueta. Com elas, o POS sabe o
    que fazer quando o cliente o encosta ao leitor.

    O HAPPY HOUR ligado ao cartão é o que faz o all-inclusive: entre as 10h e as
    18h, os artigos incluídos ficam a zero — mas só para quem tem o cartão.
    """
    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=80)
    price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.CharField(max_length=200, blank=True, null=True)

    has_credit = models.BooleanField(default=False)
    has_debit = models.BooleanField(default=False)
    has_points = models.BooleanField(default=False)
    has_discount = models.BooleanField(default=False)

    # Pacotes: os artigos que o cartão INCLUI (all-inclusive).
    packages = models.ManyToManyField('inventory.Item', blank=True, related_name='member_cards')
    happy_hour = models.ForeignKey('HappyHour', on_delete=models.SET_NULL, blank=True, null=True,
                                   related_name='member_cards')

    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'pos_member_card'
        ordering = ['code']

    def __str__(self):
        return f'{self.code} · {self.name}'

    def discount_for(self, item):
        """Que desconto (%) este cartão dá NESTE artigo. 0 se não der nenhum."""
        from decimal import Decimal
        if not (self.is_active and self.has_discount):
            return Decimal('0')
        d = self.discounts.filter(item=item).first()
        if not d and item.subfamily_id:
            d = self.discounts.filter(subfamily_id=item.subfamily_id, item__isnull=True).first()
        return d.discount_percent if d else Decimal('0')


class MemberCardDiscount(models.Model):
    """Desconto do cartão num artigo ou numa sub-família inteira."""
    card = models.ForeignKey(MemberCard, on_delete=models.CASCADE, related_name='discounts')
    item = models.ForeignKey('inventory.Item', on_delete=models.CASCADE, blank=True, null=True,
                             related_name='card_discounts')
    subfamily = models.ForeignKey('inventory.ItemSubFamily', on_delete=models.CASCADE,
                                  blank=True, null=True, related_name='card_discounts')
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    class Meta:
        db_table = 'pos_member_card_discount'
