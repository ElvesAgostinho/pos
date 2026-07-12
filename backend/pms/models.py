"""
PMS — Property Management System.

Reservas, quartos, check-in/out e folios (conta do hóspede). O folio é o ponto de
integração com o POS: uma venda paga com "Quarto" gera uma FolioCharge no folio aberto.
Consome Hotel do Master Data (identity); nunca recria organização.
"""
from decimal import Decimal
from django.db import models
from identity.models import Hotel


class Guest(models.Model):
    """Hóspede. Fonte única do cliente-hóspede do hotel."""
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='guests')
    full_name = models.CharField(max_length=200)
    document_id = models.CharField(max_length=50, blank=True, null=True)
    tax_id = models.CharField(max_length=50, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=40, blank=True, null=True)
    country = models.CharField(max_length=60, blank=True, null=True)
    vip = models.BooleanField(default=False)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pms_guest'
        ordering = ['full_name']

    def __str__(self):
        return self.full_name


class RoomType(models.Model):
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='room_types')
    code = models.CharField(max_length=20)
    name = models.CharField(max_length=100)
    capacity = models.PositiveIntegerField(default=2)
    base_rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'pms_room_type'
        unique_together = ('hotel', 'code')

    def __str__(self):
        return f"[{self.code}] {self.name}"


class Room(models.Model):
    STATUS = [
        ('VACANT_CLEAN', 'Livre / Limpo'),
        ('VACANT_DIRTY', 'Livre / Por limpar'),
        ('OCCUPIED', 'Ocupado'),
        ('OOO', 'Fora de serviço'),
    ]
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='rooms')
    room_type = models.ForeignKey(RoomType, on_delete=models.PROTECT, related_name='rooms')
    number = models.CharField(max_length=20)
    floor = models.CharField(max_length=20, blank=True, null=True)
    status = models.CharField(max_length=15, choices=STATUS, default='VACANT_CLEAN')
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'pms_room'
        unique_together = ('hotel', 'number')
        ordering = ['number']

    def __str__(self):
        return f"Quarto {self.number}"


class Reservation(models.Model):
    STATUS = [
        ('BOOKED', 'Reservada'),
        ('CHECKED_IN', 'Check-in'),
        ('CHECKED_OUT', 'Check-out'),
        ('CANCELLED', 'Cancelada'),
        ('NO_SHOW', 'No-show'),
    ]
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='reservations')
    confirmation = models.CharField(max_length=30, unique=True)
    guest = models.ForeignKey(Guest, on_delete=models.PROTECT, related_name='reservations')
    room_type = models.ForeignKey(RoomType, on_delete=models.PROTECT, related_name='reservations')
    room = models.ForeignKey(Room, on_delete=models.SET_NULL, blank=True, null=True, related_name='reservations')
    check_in = models.DateField()
    check_out = models.DateField()
    adults = models.PositiveIntegerField(default=1)
    children = models.PositiveIntegerField(default=0)
    rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=12, choices=STATUS, default='BOOKED')
    source = models.CharField(max_length=10, default='DIRECT')   # DIRECT (receção) ou ONLINE (booking engine)
    online_ref = models.CharField(max_length=60, blank=True, null=True)
    online_checkin = models.BooleanField(default=False)   # pré-check-in feito pelo hóspede online
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    checked_in_at = models.DateTimeField(blank=True, null=True)
    checked_out_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'pms_reservation'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.confirmation} · {self.guest.full_name}"

    @property
    def nights(self):
        return max((self.check_out - self.check_in).days, 0)


class Folio(models.Model):
    """Conta do hóspede: acumula charges (quarto, F&B do POS) e pagamentos."""
    STATUS = [('OPEN', 'Aberto'), ('CLOSED', 'Fechado')]
    reservation = models.OneToOneField(Reservation, on_delete=models.CASCADE, related_name='folio')
    number = models.CharField(max_length=30, unique=True)
    status = models.CharField(max_length=8, choices=STATUS, default='OPEN')
    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(blank=True, null=True)
    invoice_number = models.CharField(max_length=30, blank=True, null=True)  # fatura financeira gerada

    class Meta:
        db_table = 'pms_folio'
        ordering = ['-opened_at']

    def __str__(self):
        return f"Folio {self.number}"

    @property
    def charges_total(self):
        return sum((c.amount for c in self.charges.all() if c.charge_type != 'PAYMENT'), Decimal('0'))

    @property
    def payments_total(self):
        return sum((c.amount for c in self.charges.all() if c.charge_type == 'PAYMENT'), Decimal('0'))

    @property
    def balance(self):
        return self.charges_total - self.payments_total


class FolioCharge(models.Model):
    CHARGE_TYPES = [
        ('ROOM', 'Alojamento'),
        ('FNB', 'F&B (POS)'),
        ('LAUNDRY', 'Lavandaria'),
        ('MINIBAR', 'Minibar'),
        ('SPA', 'Spa'),
        ('TAX', 'Taxa'),
        ('MISC', 'Diversos'),
        ('PAYMENT', 'Pagamento'),
    ]
    folio = models.ForeignKey(Folio, on_delete=models.CASCADE, related_name='charges')
    charge_type = models.CharField(max_length=8, choices=CHARGE_TYPES, default='MISC')
    description = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    source_reference = models.CharField(max_length=60, blank=True, null=True)  # ex: ticket POS
    posted_by = models.CharField(max_length=100, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pms_folio_charge'
        ordering = ['created_at']

    def __str__(self):
        return f"{self.get_charge_type_display()}: {self.amount}"


# ==========================================================================
# Operações de Hotel — Governanta, Manutenção e Tarifas
# ==========================================================================

class HousekeepingTask(models.Model):
    """Governanta/Camareiras — tarefas de limpeza/arrumação por quarto."""
    TYPES = [('CLEANING', 'Limpeza'), ('TURNDOWN', 'Abertura de cama'),
             ('INSPECTION', 'Inspeção'), ('DEEP', 'Limpeza profunda')]
    STATUS = [('PENDING', 'Pendente'), ('IN_PROGRESS', 'Em curso'),
              ('DONE', 'Concluída'), ('INSPECTED', 'Inspecionada')]
    PRIORITY = [('LOW', 'Baixa'), ('NORMAL', 'Normal'), ('HIGH', 'Alta'), ('URGENT', 'Urgente')]
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='housekeeping_tasks')
    task_type = models.CharField(max_length=12, choices=TYPES, default='CLEANING')
    status = models.CharField(max_length=12, choices=STATUS, default='PENDING')
    priority = models.CharField(max_length=8, choices=PRIORITY, default='NORMAL')
    assigned_to = models.CharField(max_length=100, blank=True, null=True)   # camareira
    notes = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(blank=True, null=True)
    completed_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'pms_housekeeping_task'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.get_task_type_display()} · Quarto {self.room.number}"


class MaintenanceOrder(models.Model):
    """Manutenção — ordens de trabalho (avarias/pedidos) por quarto/área."""
    STATUS = [('OPEN', 'Aberta'), ('IN_PROGRESS', 'Em curso'),
              ('RESOLVED', 'Resolvida'), ('CLOSED', 'Fechada'), ('CANCELLED', 'Cancelada')]
    PRIORITY = [('LOW', 'Baixa'), ('NORMAL', 'Normal'), ('HIGH', 'Alta'), ('URGENT', 'Urgente')]
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='maintenance_orders')
    room = models.ForeignKey(Room, on_delete=models.SET_NULL, blank=True, null=True, related_name='maintenance_orders')
    area = models.CharField(max_length=100, blank=True, null=True)          # se não for quarto
    title = models.CharField(max_length=150)
    description = models.TextField(blank=True, null=True)
    priority = models.CharField(max_length=8, choices=PRIORITY, default='NORMAL')
    status = models.CharField(max_length=12, choices=STATUS, default='OPEN')
    reported_by = models.CharField(max_length=100, blank=True, null=True)
    assigned_to = models.CharField(max_length=100, blank=True, null=True)   # técnico
    set_room_ooo = models.BooleanField(default=False)                       # marca quarto fora de serviço
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'pms_maintenance_order'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} ({self.get_status_display()})"


class RatePlan(models.Model):
    """Tarifas — planos de preço por tipo de quarto (época/regime)."""
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='rate_plans')
    room_type = models.ForeignKey(RoomType, on_delete=models.CASCADE, related_name='rate_plans')
    name = models.CharField(max_length=100)                                 # ex: "Época Alta BB"
    price_per_night = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    breakfast_included = models.BooleanField(default=False)
    board = models.CharField(max_length=10, default='RO')                   # RO/BB/HB/FB/AI
    valid_from = models.DateField(blank=True, null=True)
    valid_to = models.DateField(blank=True, null=True)
    min_nights = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'pms_rate_plan'
        ordering = ['room_type', 'name']

    def __str__(self):
        return f"{self.name} · {self.room_type.code}"


class LaundryOrder(models.Model):
    """Lavandaria — pedidos por quarto/hóspede; lançados no folio ou pagos."""
    STATUS = [('RECEIVED', 'Recebida'), ('PROCESSING', 'Em lavagem'),
              ('READY', 'Pronta'), ('DELIVERED', 'Entregue')]
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='laundry_orders')
    room = models.ForeignKey(Room, on_delete=models.SET_NULL, blank=True, null=True, related_name='laundry_orders')
    guest_name = models.CharField(max_length=150, blank=True, null=True)
    description = models.CharField(max_length=255)                    # ex: "3 camisas, 2 calças"
    pieces = models.PositiveIntegerField(default=1)
    express = models.BooleanField(default=False)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=12, choices=STATUS, default='RECEIVED')
    charged = models.BooleanField(default=False)                      # já lançado no folio
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pms_laundry_order'
        ordering = ['-created_at']

    def __str__(self):
        return f"Lavandaria Q{self.room.number if self.room else '—'} · {self.total}"


class MinibarItem(models.Model):
    """Catálogo de minibar (artigo + preço)."""
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='minibar_items')
    name = models.CharField(max_length=100)
    price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'pms_minibar_item'
        ordering = ['name']

    def __str__(self):
        return self.name


class SpaAppointment(models.Model):
    """Spa — marcações de serviços; lançadas no folio ou pagas."""
    STATUS = [('BOOKED', 'Marcada'), ('DONE', 'Realizada'), ('CANCELLED', 'Cancelada')]
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='spa_appointments')
    room = models.ForeignKey(Room, on_delete=models.SET_NULL, blank=True, null=True, related_name='spa_appointments')
    guest_name = models.CharField(max_length=150, blank=True, null=True)
    service = models.CharField(max_length=120)                        # ex: "Massagem 60min"
    therapist = models.CharField(max_length=100, blank=True, null=True)
    scheduled_for = models.DateTimeField()
    price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=10, choices=STATUS, default='BOOKED')
    charged = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pms_spa_appointment'
        ordering = ['scheduled_for']

    def __str__(self):
        return f"{self.service} · {self.guest_name or ''}"


class CorporateAccount(models.Model):
    """Agências / Empresas — contas de crédito (faturação a crédito, comissões)."""
    KIND = [('COMPANY', 'Empresa'), ('AGENCY', 'Agência de viagens')]
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='corporate_accounts')
    kind = models.CharField(max_length=10, choices=KIND, default='COMPANY')
    name = models.CharField(max_length=200)
    tax_id = models.CharField(max_length=50, blank=True, null=True)
    email = models.CharField(max_length=120, blank=True, null=True)
    phone = models.CharField(max_length=40, blank=True, null=True)
    contact_person = models.CharField(max_length=120, blank=True, null=True)
    credit_limit = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    balance = models.DecimalField(max_digits=16, decimal_places=2, default=0)   # em dívida
    commission_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)  # agências
    payment_terms_days = models.PositiveIntegerField(default=30)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pms_corporate_account'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.get_kind_display()})"

    @property
    def available_credit(self):
        return self.credit_limit - self.balance


class NightAuditLog(models.Model):
    """Registo do fecho do dia (Night Audit)."""
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='night_audits')
    business_date = models.DateField()
    rooms_charged = models.PositiveIntegerField(default=0)
    room_revenue = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    arrivals = models.PositiveIntegerField(default=0)
    departures = models.PositiveIntegerField(default=0)
    in_house = models.PositiveIntegerField(default=0)
    run_by = models.CharField(max_length=100, blank=True, null=True)
    run_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pms_night_audit'
        ordering = ['-business_date']
        unique_together = ('hotel', 'business_date')

    def __str__(self):
        return f"Night Audit {self.business_date} ({self.rooms_charged} quartos)"


class BookingSetting(models.Model):
    """Configuração do Booking Engine (reservas online) por hotel — a personalização
    que aparece no motor de reservas (identidade, moeda, políticas) + chave de API segura."""
    hotel = models.OneToOneField(Hotel, on_delete=models.CASCADE, related_name='booking_setting')
    enabled = models.BooleanField(default=False)
    slug = models.CharField(max_length=60, unique=True)              # ex: hotel-atlantico -> reservas.hotelx.ao
    api_key = models.CharField(max_length=64, unique=True)           # o motor cloud usa esta chave; SQL nunca exposto
    currency = models.CharField(max_length=8, default='AOA')
    languages = models.CharField(max_length=60, default='pt')
    primary_color = models.CharField(max_length=20, default='#1e3f66')
    logo_url = models.CharField(max_length=300, blank=True, null=True)
    hero_image_url = models.CharField(max_length=300, blank=True, null=True)
    custom_domain = models.CharField(max_length=120, blank=True, null=True)  # ex: reservas.hotelx.ao (CNAME)
    welcome_text = models.CharField(max_length=255, blank=True, null=True)
    deposit_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)   # adiantamento
    payment_enabled = models.BooleanField(default=False)
    payment_provider = models.CharField(max_length=12, default='SIMULATED')  # SIMULATED/MULTICAIXA/EMIS/STRIPE/PAYPAL
    payment_key = models.CharField(max_length=200, blank=True, null=True)
    cancellation_policy = models.CharField(max_length=255, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'pms_booking_setting'

    def __str__(self):
        return f"Booking {self.slug} ({'on' if self.enabled else 'off'})"


class Channel(models.Model):
    """Canal OTA ligado (Booking.com, Expedia, Airbnb…) — Channel Manager."""
    PROVIDERS = [
        ('BOOKING', 'Booking.com'), ('EXPEDIA', 'Expedia'), ('AIRBNB', 'Airbnb'),
        ('AGODA', 'Agoda'), ('HOTELS', 'Hotels.com'), ('TRIVAGO', 'Trivago'),
        ('GOOGLE', 'Google Hotels'), ('OTHER', 'Outro'),
    ]
    STATUS = [('CONNECTED', 'Ligado'), ('ERROR', 'Erro'), ('DISABLED', 'Desativado')]
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='channels')
    provider = models.CharField(max_length=10, choices=PROVIDERS, default='BOOKING')
    name = models.CharField(max_length=100)
    property_id = models.CharField(max_length=80, blank=True, null=True)   # id da propriedade na OTA
    api_key = models.CharField(max_length=200, blank=True, null=True)      # credencial (encriptar em produção)
    currency = models.CharField(max_length=8, default='AOA')
    commission_percent = models.DecimalField(max_digits=5, decimal_places=2, default=15)
    enabled = models.BooleanField(default=True)
    status = models.CharField(max_length=10, choices=STATUS, default='DISABLED')
    last_sync_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pms_channel'
        ordering = ['provider']

    def __str__(self):
        return f"{self.get_provider_display()} · {self.name}"


class ChannelRoomMap(models.Model):
    """Mapeamento tipo de quarto local -> código do quarto/tarifa na OTA."""
    channel = models.ForeignKey(Channel, on_delete=models.CASCADE, related_name='room_maps')
    room_type = models.ForeignKey(RoomType, on_delete=models.CASCADE, related_name='channel_maps')
    remote_room_code = models.CharField(max_length=80)
    remote_rate_code = models.CharField(max_length=80, blank=True, null=True)

    class Meta:
        db_table = 'pms_channel_room_map'
        unique_together = ('channel', 'room_type')


class ChannelSyncLog(models.Model):
    """Registo de cada sincronização (push disponibilidade/tarifas, pull reservas)."""
    DIRECTION = [('PUSH', 'Enviado (disponibilidade/tarifas)'), ('PULL', 'Recebido (reservas)')]
    channel = models.ForeignKey(Channel, on_delete=models.CASCADE, related_name='sync_logs')
    direction = models.CharField(max_length=6, choices=DIRECTION)
    event = models.CharField(max_length=60)
    summary = models.CharField(max_length=300, blank=True, null=True)
    status = models.CharField(max_length=20, default='OK')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pms_channel_sync_log'
        ordering = ['-created_at']


class BookingPayment(models.Model):
    """Pagamento online (adiantamento) de uma reserva — arquitetura pronta; gateway pluggable."""
    PROVIDERS = [('SIMULATED', 'Simulado'), ('MULTICAIXA', 'Multicaixa Express'),
                 ('EMIS', 'EMIS GPO'), ('STRIPE', 'Stripe'), ('PAYPAL', 'PayPal')]
    STATUS = [('PENDING', 'Pendente'), ('PAID', 'Pago'), ('FAILED', 'Falhou'), ('REFUNDED', 'Reembolsado')]
    reservation = models.ForeignKey(Reservation, on_delete=models.CASCADE, related_name='payments')
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    provider = models.CharField(max_length=12, choices=PROVIDERS, default='SIMULATED')
    status = models.CharField(max_length=10, choices=STATUS, default='PENDING')
    reference = models.CharField(max_length=40, unique=True)       # a nossa referência
    gateway_ref = models.CharField(max_length=120, blank=True, null=True)  # id no gateway
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'pms_booking_payment'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.reference} · {self.amount} · {self.status}"
