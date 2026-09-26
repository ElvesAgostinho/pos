"""
PMS — Property Management System (Reserva / Front Desk / Contas).

Construído de raiz — não reaproveita nenhum ficheiro do PMS antigo (removido em
`dac3fd0`). Reaproveita, sim, o que já existe no resto do ERP em vez de duplicar:
o hóspede é `mdm.Customer` (já tem NIF/documento/VIP/bloqueio — a mesma ficha de
entidade que o POS usa); Segmento/Sub-Segmento/Canal de Distribuição são
`pos.Segment`/`pos.SubSegment`/`pos.DistributionChannel` (o `SubSegment.for_pms`
já existia, à espera); a propriedade é `identity.Hotel`/`Building`/`Floor`.

O folio (conta do hóspede) é interno ao PMS — só ao faturar/fechar é que gera um
documento fiscal a sério (`fiscal.FiscalDocument`, via `fiscal.integration.
emit_for_pms_folio`), exatamente como o POS faz com o POSTicket.
"""
from decimal import Decimal
from django.db import models
from identity.models import Hotel, Building, Floor


# ==========================================================================
# INVENTÁRIO — categorias e quartos
# ==========================================================================

class RoomType(models.Model):
    """Categoria de quarto (ex.: STANDARD DOUBLE, JUNIOR SUITE)."""
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='pms_room_types')
    code = models.CharField(max_length=20)
    name = models.CharField(max_length=100)
    capacity_adults = models.PositiveIntegerField(default=2)
    capacity_children = models.PositiveIntegerField(default=0)
    base_rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'pms_room_type'
        unique_together = ('hotel', 'code')
        ordering = ['code']

    def __str__(self):
        return f"[{self.code}] {self.name}"


class Room(models.Model):
    STATUS = [
        ('VACANT_CLEAN', 'Livre / Limpo'),
        ('VACANT_DIRTY', 'Livre / Por limpar'),
        ('OCCUPIED', 'Ocupado'),
        ('OOO', 'Fora de serviço'),
    ]
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='pms_rooms')
    room_type = models.ForeignKey(RoomType, on_delete=models.PROTECT, related_name='rooms')
    building = models.ForeignKey(Building, on_delete=models.SET_NULL, blank=True, null=True, related_name='+')
    floor = models.ForeignKey(Floor, on_delete=models.SET_NULL, blank=True, null=True, related_name='+')
    number = models.CharField(max_length=20)
    status = models.CharField(max_length=15, choices=STATUS, default='VACANT_CLEAN')
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'pms_room'
        unique_together = ('hotel', 'number')
        ordering = ['number']

    def __str__(self):
        return f"Quarto {self.number}"


class RatePlan(models.Model):
    """Rate Code — tarifa por categoria de quarto/época/regime."""
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='pms_rate_plans')
    room_type = models.ForeignKey(RoomType, on_delete=models.CASCADE, related_name='rate_plans')
    code = models.CharField(max_length=20)
    name = models.CharField(max_length=100)
    price_per_night = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    board = models.CharField(max_length=10, default='RO')   # RO/BB/HB/FB/AI
    valid_from = models.DateField(blank=True, null=True)
    valid_to = models.DateField(blank=True, null=True)
    min_nights = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'pms_rate_plan'
        unique_together = ('hotel', 'code')
        ordering = ['room_type', 'name']

    def __str__(self):
        return f"{self.code} · {self.room_type.code}"


class RateOverride(models.Model):
    """Exceção de um dia a um Rate Plan — o Calendário de Tarifas e a
    Atualização em Massa trabalham aqui, nunca no preço base do RatePlan.

    O RatePlan guarda UM preço para todo o período de validade; para "sexta e
    sábado de outubro ficam mais caros" (dias não-contíguos, dentro de um
    período contíguo) é preciso granularidade ao dia — daí este modelo, em vez
    de forçar o RatePlan a virar uma tabela de preços por dia. Linha ausente =
    herda o preço/mínimo de noites/disponibilidade do RatePlan; "Remover todas
    as exceções" (nas imagens de referência) é simplesmente apagar linhas
    daqui, nunca tocar no RatePlan.
    """
    rate_plan = models.ForeignKey(RatePlan, on_delete=models.CASCADE, related_name='overrides')
    date = models.DateField()
    price_per_night = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    min_nights = models.PositiveIntegerField(blank=True, null=True)
    is_bookable = models.BooleanField(blank=True, null=True)   # None = herda (sempre reservável)

    class Meta:
        db_table = 'pms_rate_override'
        unique_together = ('rate_plan', 'date')
        ordering = ['date']

    def __str__(self):
        return f"{self.rate_plan.code} · {self.date}"


# ==========================================================================
# BLOCOS — grupos/empresas com quartos reservados antecipadamente
# ==========================================================================

class Block(models.Model):
    """Bloco de quartos — um grupo/empresa/evento reserva um lote de quartos com
    antecedência; as reservas individuais vão sendo "pickup" contra este bloco.

    `release`: passada a data (ou X dias antes da chegada), os quartos não
    reservados voltam à disponibilidade geral — é o que evita segurar inventário
    para sempre por causa de um grupo que nunca confirmou tudo.
    """
    RELEASE_METHODS = [('DATE', 'Data'), ('DAYS', 'Dias antes da chegada')]

    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='pms_blocks')
    code = models.CharField(max_length=30)
    description = models.CharField(max_length=200)
    is_active = models.BooleanField(default=True)
    is_guaranteed = models.BooleanField(default=False)
    is_elastic = models.BooleanField(default=False)   # aceita mais quartos do que o inventário inicial

    # Entidades
    main_entity = models.ForeignKey('mdm.Customer', on_delete=models.SET_NULL, blank=True, null=True,
                                    related_name='pms_blocks_main')
    group_name = models.CharField(max_length=150, blank=True, null=True)
    other_entity = models.CharField(max_length=150, blank=True, null=True)
    contact_name = models.CharField(max_length=150, blank=True, null=True)

    valid_from = models.DateField()
    valid_to = models.DateField()
    color = models.CharField(max_length=20, blank=True, null=True)
    manager = models.CharField(max_length=100, blank=True, null=True)

    # Defaults da reserva — aplicados às reservas criadas dentro deste bloco
    default_prefix = models.CharField(max_length=20, blank=True, null=True)
    default_reservation_type = models.CharField(max_length=20, default='Normal')
    default_voucher = models.CharField(max_length=40, blank=True, null=True)
    default_segment = models.ForeignKey('pos.Segment', on_delete=models.SET_NULL, blank=True, null=True, related_name='+')
    default_subsegment = models.ForeignKey('pos.SubSegment', on_delete=models.SET_NULL, blank=True, null=True, related_name='+')
    default_channel = models.ForeignKey('pos.DistributionChannel', on_delete=models.SET_NULL, blank=True, null=True, related_name='+')
    default_rate_plan = models.ForeignKey(RatePlan, on_delete=models.SET_NULL, blank=True, null=True, related_name='+')
    arrival_until = models.DateField(blank=True, null=True)
    departure_until = models.DateField(blank=True, null=True)
    block_info = models.TextField(blank=True, null=True)
    reservation_info = models.TextField(blank=True, null=True)

    # Contrato
    release_method = models.CharField(max_length=6, choices=RELEASE_METHODS, default='DAYS')
    release_days = models.PositiveIntegerField(default=0)
    contract_value = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pms_block'
        unique_together = ('hotel', 'code')
        ordering = ['-valid_from']

    def __str__(self):
        return f"{self.code} · {self.description}"

    @property
    def nights(self):
        return max((self.valid_to - self.valid_from).days, 0)


class BlockRoomType(models.Model):
    """Inventário do bloco por categoria/noite — quantos quartos estão reservados
    para o grupo nessa categoria, nessa noite (o "Grid"/"Grelha" do bloco)."""
    block = models.ForeignKey(Block, on_delete=models.CASCADE, related_name='room_types')
    room_type = models.ForeignKey(RoomType, on_delete=models.CASCADE, related_name='+')
    date = models.DateField()
    rooms_blocked = models.PositiveIntegerField(default=0)
    rate_override = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)

    class Meta:
        db_table = 'pms_block_room_type'
        unique_together = ('block', 'room_type', 'date')

    @property
    def rooms_picked_up(self):
        return (Reservation.objects
                .filter(block=self.block, room_type=self.room_type,
                        check_in__lte=self.date, check_out__gt=self.date,
                        status__in=['OPTION', 'BOOKED', 'CHECKED_IN'])
                .count())


# ==========================================================================
# RESERVAS
# ==========================================================================

class Reservation(models.Model):
    STATUS = [
        ('OPTION', 'Opção'),
        ('BOOKED', 'Reservada'),
        ('CHECKED_IN', 'Check-in'),
        ('CHECKED_OUT', 'Check-out'),
        ('CANCELLED', 'Cancelada'),
        ('NO_SHOW', 'No-show'),
        ('WAITLIST', 'Lista de Espera'),
    ]
    SOURCE = [('DIRECT', 'Direto (receção)'), ('ONLINE', 'Online'), ('BLOCK', 'Bloco/Grupo')]

    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='pms_reservations')
    confirmation = models.CharField(max_length=30, unique=True)
    guest = models.ForeignKey('mdm.Customer', on_delete=models.PROTECT, related_name='pms_reservations')
    room_type = models.ForeignKey(RoomType, on_delete=models.PROTECT, related_name='reservations')
    room = models.ForeignKey(Room, on_delete=models.SET_NULL, blank=True, null=True, related_name='reservations')
    block = models.ForeignKey(Block, on_delete=models.SET_NULL, blank=True, null=True, related_name='reservations')

    check_in = models.DateField()
    check_out = models.DateField()
    adults = models.PositiveIntegerField(default=1)
    children = models.PositiveIntegerField(default=0)

    rate_plan = models.ForeignKey(RatePlan, on_delete=models.SET_NULL, blank=True, null=True, related_name='+')
    rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)   # override do rate_plan

    segment = models.ForeignKey('pos.Segment', on_delete=models.SET_NULL, blank=True, null=True, related_name='+')
    sub_segment = models.ForeignKey('pos.SubSegment', on_delete=models.SET_NULL, blank=True, null=True, related_name='+')
    channel = models.ForeignKey('pos.DistributionChannel', on_delete=models.SET_NULL, blank=True, null=True, related_name='+')

    is_guaranteed = models.BooleanField(default=False)
    status = models.CharField(max_length=12, choices=STATUS, default='BOOKED')
    source = models.CharField(max_length=10, choices=SOURCE, default='DIRECT')
    voucher = models.CharField(max_length=40, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)

    # Hora prevista de chegada/saída — só informativo (para a receção preparar
    # o quarto/transporte), não altera check_in/check_out (que são datas).
    eta = models.TimeField(blank=True, null=True, verbose_name='Hora de chegada prevista')
    etd = models.TimeField(blank=True, null=True, verbose_name='Hora de saída prevista')
    # Cor manual para destacar esta reserva no Planning (Gantt) — se vazio,
    # usa-se a cor do estado (ver reservationStatus.ts no frontend).
    color_tag = models.CharField(max_length=7, blank=True, null=True, verbose_name='Cor')
    # Impede que "Atribuição rápida"/"Mudança de Quartos em Massa" movam esta
    # reserva de quarto sem o utilizador destravar primeiro (ver
    # PmsBulkRoomChangeDialog.tsx, que já respeita este campo).
    lock_room = models.BooleanField(default=False, verbose_name='Não mudar de quarto')

    created_at = models.DateTimeField(auto_now_add=True)
    checked_in_at = models.DateTimeField(blank=True, null=True)
    checked_out_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'pms_reservation'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.confirmation} · {self.guest.name}"

    @property
    def nights(self):
        return max((self.check_out - self.check_in).days, 0)

    @property
    def folio(self):
        return self.folios.filter(is_primary=True).first() or self.folios.first()

    @property
    def effective_rate(self):
        """A tarifa realmente cobrada por noite desta reserva: `rate` (override
        manual) se preenchido e positivo, senão o preço do `rate_plan`, senão a
        tarifa base da categoria de quarto. ÚNICA definição desta regra em todo
        o sistema — `ReservationViewSet.check_in` (views.py), os relatórios
        (`reports.py`) e a Auditoria da Noite (`night_audit.py`) reutilizam
        esta property em vez de recalcular cada um a sua conta (o que já
        aconteceu — três cópias do mesmo `if`/`else` — e é exatamente o tipo de
        lógica repetida que se quer evitar: um dia alguém muda uma cópia e
        esquece as outras, e o relatório deixa de bater com o que foi lançado)."""
        if self.rate and self.rate > 0:
            return self.rate
        if self.rate_plan_id and self.rate_plan and self.rate_plan.price_per_night:
            return self.rate_plan.price_per_night
        if self.room_type_id and self.room_type:
            return self.room_type.base_rate
        return Decimal('0')


# ==========================================================================
# FOLIO — a conta do hóspede
# ==========================================================================

class Folio(models.Model):
    """Conta do hóspede. Uma reserva pode ter mais do que uma (ex.: A = empresa
    paga o alojamento, B = extras que o hóspede paga do próprio bolso)."""
    STATUS = [('OPEN', 'Aberto'), ('CLOSED', 'Fechado')]
    PAYER = [('GUEST', 'Hóspede'), ('COMPANY', 'Empresa'), ('AGENCY', 'Agência'), ('HOUSE', 'Cortesia (casa)')]

    reservation = models.ForeignKey(Reservation, on_delete=models.CASCADE, related_name='folios')
    number = models.CharField(max_length=30, unique=True)
    label = models.CharField(max_length=60, default='A · Principal')
    payer_type = models.CharField(max_length=8, choices=PAYER, default='GUEST')
    payer_name = models.CharField(max_length=200, blank=True, null=True)
    payer_nif = models.CharField(max_length=30, blank=True, null=True)
    is_primary = models.BooleanField(default=True)
    status = models.CharField(max_length=8, choices=STATUS, default='OPEN')
    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(blank=True, null=True)
    fiscal_document_number = models.CharField(max_length=40, blank=True, null=True)

    class Meta:
        db_table = 'pms_folio'
        ordering = ['-is_primary', 'opened_at']

    def __str__(self):
        return f"Folio {self.number} ({self.label})"

    def _live(self):
        return [c for c in self.charges.all() if not c.is_void]

    @property
    def charges_total(self):
        return sum((c.amount for c in self._live() if c.charge_type != 'PAYMENT'), Decimal('0'))

    @property
    def payments_total(self):
        return sum((c.amount for c in self._live() if c.charge_type == 'PAYMENT'), Decimal('0'))

    @property
    def balance(self):
        return self.charges_total - self.payments_total


class FolioCharge(models.Model):
    CHARGE_TYPES = [
        ('ROOM', 'Alojamento'), ('FNB', 'F&B (POS)'), ('LAUNDRY', 'Lavandaria'),
        ('MINIBAR', 'Minibar'), ('SPA', 'Spa'), ('TAX', 'Taxa'),
        ('MISC', 'Diversos'), ('PAYMENT', 'Pagamento'),
    ]
    folio = models.ForeignKey(Folio, on_delete=models.CASCADE, related_name='charges')
    charge_type = models.CharField(max_length=8, choices=CHARGE_TYPES, default='MISC')
    description = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    source_reference = models.CharField(max_length=60, blank=True, null=True)
    posted_by = models.CharField(max_length=100, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    # Estorno — nunca se apaga um lançamento, anula-se com um de sinal contrário.
    is_void = models.BooleanField(default=False)
    void_reason = models.CharField(max_length=255, blank=True, null=True)
    voided_at = models.DateTimeField(blank=True, null=True)
    voided_by = models.CharField(max_length=100, blank=True, null=True)
    reversal_of = models.ForeignKey('self', on_delete=models.SET_NULL, blank=True, null=True, related_name='reversals')

    # Transferência entre contas da mesma reserva
    transferred_from = models.CharField(max_length=30, blank=True, null=True)
    transferred_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'pms_folio_charge'
        ordering = ['created_at']

    def __str__(self):
        return f"{self.get_charge_type_display()}: {self.amount}"


# ==========================================================================
# FRONT DESK — Perdidos e Achados / Tarefas / Lista Telefónica
# ==========================================================================

class LostFoundItem(models.Model):
    """Perdidos e Achados — um objeto encontrado nas instalações, à espera de
    ser reclamado (ou descartado, se ninguém aparecer)."""
    STATUS = [('FOUND', 'Encontrado'), ('CLAIMED', 'Reclamado'), ('DISPOSED', 'Descartado')]

    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='pms_lost_found_items')
    description = models.CharField(max_length=255)
    found_location = models.CharField(max_length=150, blank=True, null=True)
    found_date = models.DateField()
    room = models.ForeignKey(Room, on_delete=models.SET_NULL, blank=True, null=True, related_name='+')
    guest = models.ForeignKey('mdm.Customer', on_delete=models.SET_NULL, blank=True, null=True, related_name='+')
    status = models.CharField(max_length=10, choices=STATUS, default='FOUND')
    claimed_by = models.CharField(max_length=150, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pms_lost_found_item'
        ordering = ['-found_date', '-created_at']

    def __str__(self):
        return f"{self.description} ({self.get_status_display()})"


class HousekeepingTask(models.Model):
    """Tarefas do Front Desk/Governanta — não há modelo de funcionário/RH no
    PMS (é texto livre em `assigned_to`, como o resto do sistema faz noutros
    sítios onde ainda não existe um cadastro de colaboradores)."""
    PRIORITY = [('LOW', 'Baixa'), ('NORMAL', 'Normal'), ('HIGH', 'Alta')]
    STATUS = [('PENDING', 'Pendente'), ('IN_PROGRESS', 'Em curso'), ('DONE', 'Concluída')]

    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='pms_tasks')
    title = models.CharField(max_length=200)
    room = models.ForeignKey(Room, on_delete=models.SET_NULL, blank=True, null=True, related_name='+')
    assigned_to = models.CharField(max_length=150, blank=True, null=True)
    priority = models.CharField(max_length=6, choices=PRIORITY, default='NORMAL')
    status = models.CharField(max_length=11, choices=STATUS, default='PENDING')
    due_at = models.DateTimeField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'pms_housekeeping_task'
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class PhoneDirectoryEntry(models.Model):
    """Lista telefónica interna — ramais/departamentos, para a receção
    transferir uma chamada sem ter de perguntar a ninguém."""
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='pms_phone_directory')
    name = models.CharField(max_length=150)
    department = models.CharField(max_length=100, blank=True, null=True)
    extension = models.CharField(max_length=20, blank=True, null=True)
    phone = models.CharField(max_length=30, blank=True, null=True)
    notes = models.CharField(max_length=255, blank=True, null=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'pms_phone_directory_entry'
        ordering = ['name']

    def __str__(self):
        return self.name


# ==========================================================================
# BOOKING ENGINE — motor de reservas online (site público multi-tenant por slug)
# ==========================================================================

def _rand_key():
    import uuid
    return uuid.uuid4().hex


class BookingSettings(models.Model):
    """Configuração do motor de reservas online de UM hotel. `slug` identifica
    o hotel no site público (/book/<slug>) sem expor o ID interno; `api_key` é
    a chave que o site/app usa para chamar `pms/booking/*` (também aceite via
    `?key=` nos endpoints públicos, para testar sem publicar o slug).

    NOTA de nomenclatura: o campo `is_active` (documentado) é o mesmo que o
    ecrã de administração chama de "enabled" — o serializer expõe-no com esse
    nome (`source='is_active'`) porque é o que `BookingEngineView.tsx` já
    manda/lê; o modelo mantém o nome descritivo internamente.
    """
    PAYMENT_PROVIDERS = [
        ('SIMULATED', 'Simulado (testes)'), ('MULTICAIXA', 'Multicaixa Express'),
        ('EMIS', 'EMIS GPO'), ('STRIPE', 'Stripe'), ('PAYPAL', 'PayPal'),
    ]
    hotel = models.OneToOneField(Hotel, on_delete=models.CASCADE, related_name='booking_settings')
    slug = models.SlugField(max_length=80, unique=True, blank=True)
    api_key = models.CharField(max_length=64, unique=True, default=_rand_key)
    is_active = models.BooleanField(default=True)

    currency = models.CharField(max_length=10, default='AOA')
    deposit_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    payment_enabled = models.BooleanField(default=False)
    payment_provider = models.CharField(max_length=20, choices=PAYMENT_PROVIDERS, default='SIMULATED')
    primary_color = models.CharField(max_length=10, default='#5C8891')
    welcome_text = models.CharField(max_length=255, blank=True, default='')
    cancellation_policy = models.CharField(max_length=500, blank=True, default='')
    custom_domain = models.CharField(max_length=150, blank=True, null=True)
    logo_url = models.CharField(max_length=300, blank=True, null=True)
    hero_image_url = models.CharField(max_length=300, blank=True, null=True)

    min_advance_days = models.PositiveIntegerField(blank=True, null=True)
    max_advance_days = models.PositiveIntegerField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pms_booking_settings'

    def __str__(self):
        return f"Booking Engine · {self.hotel.name}"

    def save(self, *args, **kwargs):
        if not self.slug:
            from django.utils.text import slugify
            base = slugify(self.hotel.name) or 'hotel'
            slug = base
            n = 1
            while BookingSettings.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                n += 1
                slug = f"{base}-{n}"
            self.slug = slug
        super().save(*args, **kwargs)


# ==========================================================================
# CHANNEL MANAGER — sincronização com OTAs (Booking.com, Expedia, Airbnb…)
# ==========================================================================

class Channel(models.Model):
    """Uma ligação a uma OTA. A estrutura (mapeamento, push/pull, anti-
    overbooking) está pronta; o ENVIO REAL às APIs de cada OTA só liga quando
    o dono tiver a credenciação comercial dessa plataforma (Booking
    Connectivity Partner, Expedia EPS Rapid, etc. — ver ChannelSyncLog e
    `channel_manager.py`, que nunca fingem uma sincronização bem-sucedida)."""
    OTA_TYPES = [
        ('BOOKING', 'Booking.com'), ('EXPEDIA', 'Expedia'), ('AIRBNB', 'Airbnb'),
        ('AGODA', 'Agoda'), ('HOTELS', 'Hotels.com'), ('TRIVAGO', 'Trivago'),
        ('GOOGLE', 'Google Hotels'), ('OTHER', 'Outro'),
    ]
    STATUS = [('DISCONNECTED', 'Desligado'), ('PENDING', 'Credenciais pendentes'), ('CONNECTED', 'Ligado')]

    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='pms_channels')
    name = models.CharField(max_length=120)
    ota_type = models.CharField(max_length=10, choices=OTA_TYPES, default='OTHER')
    property_id = models.CharField(max_length=80, blank=True, null=True)
    api_key = models.CharField(max_length=255, blank=True, null=True)
    commission_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    status = models.CharField(max_length=15, choices=STATUS, default='PENDING')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pms_channel'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.get_ota_type_display()} · {self.name}"


class ChannelSyncLog(models.Model):
    """Uma tentativa de sincronização (envio de disponibilidade/tarifas ou
    receção de reservas). `status='SKIPPED'` — sem credenciais, nem tentou;
    `status='ERROR'` — tentou mas o conector real desta OTA ainda não está
    homologado; nunca há um 'OK' fabricado sem uma chamada real ter sido feita."""
    STATUS = [('OK', 'Sucesso'), ('ERROR', 'Erro'), ('SKIPPED', 'Sem credenciais')]
    DIRECTIONS = [('PUSH', 'Enviado'), ('PULL', 'Recebido')]

    channel = models.ForeignKey(Channel, on_delete=models.CASCADE, related_name='sync_logs')
    direction = models.CharField(max_length=4, choices=DIRECTIONS, default='PUSH')
    event = models.CharField(max_length=40, default='availability')
    status = models.CharField(max_length=8, choices=STATUS, default='SKIPPED')
    message = models.CharField(max_length=500, blank=True, null=True)
    synced_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pms_channel_sync_log'
        ordering = ['-synced_at']

    def __str__(self):
        return f"{self.channel.name} · {self.status}"


# ==========================================================================
# CHATBOT — assistente WhatsApp (configuração + simulador com dados reais)
# ==========================================================================

class ChatbotSettings(models.Model):
    """Configuração do assistente de reservas por WhatsApp. O `access_token`
    fica guardado tal como introduzido — é um campo de configuração; nada
    neste projeto ainda o usa para chamar a Meta Business API a sério (ver
    `chatbot.py`: falta a credenciação/homologação da conta Business do
    dono). O "Simular Conversa" no ecrã usa dados REAIS (disponibilidade) sem
    nunca enviar uma mensagem WhatsApp verdadeira."""
    hotel = models.OneToOneField(Hotel, on_delete=models.CASCADE, related_name='chatbot_settings')
    whatsapp_phone_number = models.CharField(max_length=30, blank=True, null=True)
    whatsapp_business_account_id = models.CharField(max_length=60, blank=True, null=True)
    access_token = models.CharField(max_length=500, blank=True, null=True)
    is_active = models.BooleanField(default=False)
    welcome_message = models.TextField(default='Olá! Posso ajudar a verificar disponibilidade e criar uma reserva. Como posso ajudar?')

    class Meta:
        db_table = 'pms_chatbot_settings'

    def __str__(self):
        return f"Chatbot · {self.hotel.name}"


# ==========================================================================
# EMS — Events Management (MVP)
# ==========================================================================

class Event(models.Model):
    """Um evento/reserva de espaço (casamento, conferência, festa…). MVP:
    sem modelo de inventário de salas (não existe nenhum "venue"/sala de
    eventos no sistema ainda) — `venue` é texto livre até isso existir."""
    STATUS = [('INQUIRY', 'Pedido'), ('CONFIRMED', 'Confirmado'), ('CANCELLED', 'Cancelado'), ('COMPLETED', 'Concluído')]

    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='pms_events')
    name = models.CharField(max_length=200)
    event_date = models.DateField()
    start_time = models.TimeField(blank=True, null=True)
    end_time = models.TimeField(blank=True, null=True)
    venue = models.CharField(max_length=150, blank=True, null=True)
    client = models.ForeignKey('mdm.Customer', on_delete=models.SET_NULL, blank=True, null=True, related_name='pms_events')
    expected_guests = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=10, choices=STATUS, default='INQUIRY')
    estimated_revenue = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pms_event'
        ordering = ['event_date']

    def __str__(self):
        return f"{self.name} · {self.event_date}"


# ==========================================================================
# MAPA DE REFEIÇÕES — quantas pessoas usam cada refeição, por dia
# ==========================================================================

class NightAuditRun(models.Model):
    """Registo de uma execução da Auditoria da Noite: fecha o dia `audit_date`
    lançando a diária (ROOM) das reservas em CHECKED_IN cujo folio ainda não
    tem o lançamento dessa noite (a 1ª noite já foi lançada no check-in — ver
    `ReservationViewSet.check_in`; esta é a peça que faltava para as noites
    seguintes de uma estadia de várias noites).

    `unique_together` é a trava contra duplo-lançamento: uma vez corrida a
    auditoria de uma data, para este hotel, não corre outra vez — mesmo que o
    endpoint seja chamado duas vezes (duplo-clique, retry de rede, etc.)."""
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='pms_night_audit_runs')
    audit_date = models.DateField()
    run_at = models.DateTimeField(auto_now_add=True)
    run_by = models.CharField(max_length=100, blank=True, null=True)
    rooms_charged = models.PositiveIntegerField(default=0)
    total_posted = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    class Meta:
        db_table = 'pms_night_audit_run'
        unique_together = ('hotel', 'audit_date')
        ordering = ['-audit_date']

    def __str__(self):
        return f"Auditoria {self.audit_date} · {self.hotel}"


class MealPlanEntry(models.Model):
    """Uma linha do Mapa de Refeições: nesta reserva, neste dia, nesta
    refeição, quantos adultos/crianças a usam. Alimenta o mapa de cozinha —
    não é o mesmo que o Package (que só diz o regime contratado, ex. BB)."""
    MEALS = [
        ('BREAKFAST', 'Pequeno Almoço'), ('COFFEE_AM', 'Coffee Break Manhã'),
        ('LUNCH', 'Almoço'), ('COFFEE_PM', 'Coffee Break Tarde'), ('SNACK', 'Lanche'),
        ('DINNER', 'Jantar'), ('SUPPER', 'Ceia'),
        ('COCKTAIL_AM', 'COCKTAIL MANHÃ'), ('COCKTAIL_PM', 'COCKTAIL TARDE'),
    ]
    reservation = models.ForeignKey(Reservation, on_delete=models.CASCADE, related_name='meal_plan_entries')
    meal_code = models.CharField(max_length=15, choices=MEALS)
    date = models.DateField()
    adults = models.PositiveIntegerField(default=0)
    children_1 = models.PositiveIntegerField(default=0)
    children_2 = models.PositiveIntegerField(default=0)
    children_3 = models.PositiveIntegerField(default=0)
    info = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        db_table = 'pms_meal_plan_entry'
        unique_together = ('reservation', 'meal_code', 'date')
        ordering = ['date', 'meal_code']
