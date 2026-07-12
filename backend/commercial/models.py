"""
Commercial Center — motor comercial que ALIMENTA o POS.

Promoções/Happy Hour e Combos são configurados aqui (BackOffice) e consumidos pelo POS
na venda (single source: o POS não recria regras de preço). Nunca duplica artigos —
referencia os do Master Data (inventory).
"""
from decimal import Decimal
from django.db import models
from django.utils import timezone
from inventory.models import Item, ItemCategory
from pos.models import Outlet


class Promotion(models.Model):
    SCOPE = [('ALL', 'Todos os artigos'), ('CATEGORY', 'Categoria'), ('ITEM', 'Artigo')]
    DTYPE = [('PERCENT', 'Percentagem'), ('FIXED', 'Valor fixo')]

    name = models.CharField(max_length=120)
    outlet = models.ForeignKey(Outlet, on_delete=models.CASCADE, blank=True, null=True,
                               related_name='promotions', help_text='Vazio = todos os outlets')
    scope = models.CharField(max_length=10, choices=SCOPE, default='ALL')
    category = models.ForeignKey(ItemCategory, on_delete=models.CASCADE, blank=True, null=True, related_name='promotions')
    item = models.ForeignKey(Item, on_delete=models.CASCADE, blank=True, null=True, related_name='promotions')
    discount_type = models.CharField(max_length=8, choices=DTYPE, default='PERCENT')
    value = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    # Janela de validade
    start_date = models.DateField(blank=True, null=True)
    end_date = models.DateField(blank=True, null=True)
    # Happy Hour (janela horária diária)
    happy_start = models.TimeField(blank=True, null=True)
    happy_end = models.TimeField(blank=True, null=True)
    weekdays = models.CharField(max_length=20, blank=True, null=True,
                                help_text='Dias (0=Seg … 6=Dom), separados por vírgula. Vazio = todos.')
    priority = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'com_promotion'
        ordering = ['-priority', 'name']

    def __str__(self):
        return self.name

    def active_now(self, when=None):
        if not self.is_active:
            return False
        now = when or timezone.localtime()
        d, t = now.date(), now.time()
        if self.start_date and d < self.start_date:
            return False
        if self.end_date and d > self.end_date:
            return False
        if self.weekdays:
            days = [int(x) for x in self.weekdays.split(',') if x.strip().isdigit()]
            if days and now.weekday() not in days:
                return False
        if self.happy_start and self.happy_end:
            if not (self.happy_start <= t <= self.happy_end):
                return False
        return True

    def matches(self, item):
        if self.scope == 'ALL':
            return True
        if self.scope == 'ITEM':
            return self.item_id == item.id
        if self.scope == 'CATEGORY':
            return bool(item.category_id) and self.category_id == item.category_id
        return False

    def discount_amount(self, unit_price):
        unit_price = Decimal(str(unit_price))
        if self.discount_type == 'PERCENT':
            return (unit_price * self.value / Decimal('100')).quantize(Decimal('0.01'))
        return min(Decimal(str(self.value)), unit_price)


class Combo(models.Model):
    name = models.CharField(max_length=120)
    outlet = models.ForeignKey(Outlet, on_delete=models.CASCADE, blank=True, null=True, related_name='combos')
    price = models.DecimalField(max_digits=12, decimal_places=2)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'com_combo'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.price})"


class ComboItem(models.Model):
    combo = models.ForeignKey(Combo, on_delete=models.CASCADE, related_name='items')
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name='combo_items')
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1)

    class Meta:
        db_table = 'com_combo_item'

    def __str__(self):
        return f"{self.quantity}x {self.item.name}"


# ==========================================================================
# Programa de Fidelização (Loyalty) — pontos por consumo + escalões/benefícios.
# Configurado no BackOffice; o POS acumula/resgata pontos na venda.
# ==========================================================================

class LoyaltyProgram(models.Model):
    """Programa de fidelização de clientes (pontos por consumo)."""
    name = models.CharField(max_length=120)
    points_per_currency = models.DecimalField(max_digits=8, decimal_places=4, default=1,
                                              help_text='Pontos ganhos por cada unidade monetária gasta.')
    redeem_value = models.DecimalField(max_digits=8, decimal_places=4, default=1,
                                       help_text='Valor (Kz) de cada ponto no resgate.')
    min_redeem_points = models.PositiveIntegerField(default=100)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'com_loyalty_program'
        ordering = ['name']

    def __str__(self):
        return self.name


class LoyaltyTier(models.Model):
    """Escalão do programa (Bronze/Prata/Ouro…) com benefícios acumulados."""
    program = models.ForeignKey(LoyaltyProgram, on_delete=models.CASCADE, related_name='tiers')
    name = models.CharField(max_length=60)
    min_points = models.PositiveIntegerField(default=0)
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    benefits = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        db_table = 'com_loyalty_tier'
        ordering = ['min_points']

    def __str__(self):
        return f"{self.name} ({self.program.name})"
