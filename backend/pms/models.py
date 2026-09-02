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
# MAPA DE REFEIÇÕES — quantas pessoas usam cada refeição, por dia
# ==========================================================================

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
