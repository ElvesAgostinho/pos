from decimal import Decimal

from django.db import models

from identity.models import Hotel
from inventory.models import Item, UnitOfMeasure


class Allergen(models.Model):
    """Catálogo de alergénios (base: os 14 de declaração obrigatória na UE)."""
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=100)
    icon = models.CharField(max_length=50, blank=True, null=True)

    class Meta:
        db_table = 'prod_allergen'
        ordering = ['name']

    def __str__(self):
        return self.name


class ProductionArea(models.Model):
    """Área/estação de produção de um hotel (Cozinha Quente, Bar, Pastelaria...)."""
    AREA_TYPES = [
        ('KITCHEN_HOT', 'Cozinha Quente'),
        ('KITCHEN_COLD', 'Cozinha Fria'),
        ('PASTRY', 'Pastelaria'),
        ('BAKERY', 'Padaria'),
        ('BAR', 'Bar'),
        ('BUTCHERY', 'Talho'),
        ('GARDE_MANGER', 'Garde Manger'),
        ('OTHER', 'Outra'),
    ]
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='production_areas')
    name = models.CharField(max_length=100)
    area_type = models.CharField(max_length=20, choices=AREA_TYPES, default='KITCHEN_HOT')
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'prod_area'
        unique_together = ('hotel', 'name')

    def __str__(self):
        return f"{self.name} ({self.get_area_type_display()})"


class KitchenEquipment(models.Model):
    """Equipamento de produção associado a uma área (Forno Rational, Fritadeira...)."""
    EQUIP_TYPES = [
        ('OVEN', 'Forno'),
        ('COMBI', 'Forno Combinado'),
        ('FRYER', 'Fritadeira'),
        ('GRILL', 'Grelhador'),
        ('STOVE', 'Fogão'),
        ('MIXER', 'Misturadora'),
        ('BLAST_CHILLER', 'Abatedor de Temperatura'),
        ('FRIDGE', 'Câmara/Frigorífico'),
        ('OTHER', 'Outro'),
    ]
    area = models.ForeignKey(ProductionArea, on_delete=models.CASCADE, related_name='equipments')
    name = models.CharField(max_length=100)
    equipment_type = models.CharField(max_length=20, choices=EQUIP_TYPES, default='OTHER')
    capacity = models.CharField(max_length=100, blank=True, null=True)  # Ex: "6 tabuleiros GN 1/1"
    notes = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'prod_equipment'

    def __str__(self):
        return f"{self.name} [{self.area.name}]"


class ItemProductionProfile(models.Model):
    """
    Extensão de produção de um Artigo: distingue semiacabado de acabado e guarda
    alergénios, informação nutricional e shelf life — sem poluir o modelo Item.
    """
    item = models.OneToOneField(Item, on_delete=models.CASCADE, related_name='production_profile')
    is_semi_finished = models.BooleanField(
        default=False,
        help_text="Semiacabado (usado como ingrediente noutras receitas) vs. produto acabado.",
    )
    allergens = models.ManyToManyField(Allergen, blank=True, related_name='items')

    # Shelf life do produto produzido
    shelf_life_hours = models.PositiveIntegerField(blank=True, null=True)
    storage_instructions = models.TextField(blank=True, null=True)

    # Informação nutricional (por dose/serving)
    serving_size_g = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True)
    energy_kcal = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True)
    fat_g = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True)
    saturated_fat_g = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True)
    carbs_g = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True)
    sugars_g = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True)
    protein_g = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True)
    salt_g = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True)
    fiber_g = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True)

    class Meta:
        db_table = 'prod_item_profile'

    def __str__(self):
        return f"Perfil de Produção: {self.item.name}"


class Recipe(models.Model):
    """
    Ficha técnica / receita de um artigo produzido. Motor base (Fase A):
    área, equipamentos, rendimento (yield) e custo teórico calculado.
    Campos de versão/estado já presentes para o workflow de governança (Fase B).
    """
    STATUS_CHOICES = [
        ('DRAFT', 'Rascunho'),
        ('IN_REVIEW', 'Em Revisão'),
        ('APPROVED', 'Aprovada'),
        ('PRODUCTION', 'Em Produção'),
        ('DISCONTINUED', 'Descontinuada'),
    ]

    final_item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name='production_recipes')
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255)
    area = models.ForeignKey(ProductionArea, on_delete=models.SET_NULL, blank=True, null=True, related_name='recipes')
    equipments = models.ManyToManyField(KitchenEquipment, blank=True, related_name='recipes')

    version = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='DRAFT')

    yield_quantity = models.DecimalField(max_digits=12, decimal_places=4, default=1)
    yield_uom = models.ForeignKey(UnitOfMeasure, on_delete=models.RESTRICT, related_name='recipe_yields')

    prep_time_mins = models.PositiveIntegerField(blank=True, null=True)
    cook_time_mins = models.PositiveIntegerField(blank=True, null=True)
    instructions = models.TextField(blank=True, null=True)

    # Custo teórico calculado a partir das linhas (por lote de produção = yield_quantity)
    theoretical_cost = models.DecimalField(max_digits=14, decimal_places=4, default=0, editable=False)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'prod_recipe'

    def __str__(self):
        return f"[{self.code}] {self.name} v{self.version}"

    def compute_cost(self, save=True, propagate=True):
        """Recalcula o custo teórico do lote e empurra o custo real por unidade produzida
        para o artigo final (Ficha Técnica → custo real do artigo)."""
        total = sum((line.line_cost for line in self.lines.all()), Decimal('0'))
        self.theoretical_cost = total
        if save:
            super().save(update_fields=['theoretical_cost', 'updated_at'])
        if propagate and self.yield_quantity and self.yield_quantity > 0:
            unit_cost = (total / self.yield_quantity).quantize(Decimal('0.0001'))
            item = self.final_item
            if item.current_average_cost != unit_cost:
                item.current_average_cost = unit_cost
                item.save(update_fields=['current_average_cost', 'updated_at'])
        return total

    @property
    def cost_per_yield_unit(self):
        """Custo por unidade de rendimento (ex: custo por dose)."""
        if self.yield_quantity and self.yield_quantity > 0:
            return (self.theoretical_cost / self.yield_quantity).quantize(Decimal('0.0001'))
        return Decimal('0')


class RecipeLine(models.Model):
    """
    Componente de uma receita. O componente pode ser matéria-prima OU um semiacabado
    (outro Item com perfil is_semi_finished), permitindo receitas em cascata.
    """
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name='lines')
    component_item = models.ForeignKey(Item, on_delete=models.RESTRICT, related_name='used_in_recipe_lines')
    quantity = models.DecimalField(max_digits=12, decimal_places=4)
    uom = models.ForeignKey(UnitOfMeasure, on_delete=models.RESTRICT)
    wastage_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    is_optional = models.BooleanField(default=False)
    note = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        db_table = 'prod_recipe_line'

    def __str__(self):
        return f"{self.quantity} {self.uom.code} de {self.component_item.name}"

    @property
    def effective_quantity(self):
        """Quantidade incluindo desperdício (o que sai realmente do stock)."""
        factor = Decimal('1') + (self.wastage_percentage / Decimal('100'))
        return (self.quantity * factor).quantize(Decimal('0.0001'))

    @property
    def line_cost(self):
        """Custo da linha = custo médio atual do componente × quantidade efetiva."""
        cost = self.component_item.current_average_cost or Decimal('0')
        return (Decimal(cost) * self.effective_quantity).quantize(Decimal('0.0001'))


# ==========================================================================
# F&B Operations Center (Centro 10) — operação de restauração:
# cartas/menus, eventos/banquetes, HACCP, desperdícios e controlo de qualidade.
# App auto-contido (não importa `pos`): usa `outlet_type` por texto para não
# criar dependência forte de um módulo licenciado à parte.
# ==========================================================================

# Tipos de outlet F&B (espelham pos.Outlet.OUTLET_TYPES, mas sem acoplar o app).
FNB_OUTLET_TYPES = [
    ('RESTAURANT', 'Restaurante'),
    ('BAR', 'Bar'),
    ('POOL_BAR', 'Pool Bar / Rooftop'),
    ('COFFEE', 'Coffee Shop'),
    ('ROOM_SERVICE', 'Room Service'),
    ('BANQUET', 'Buffet / Banquete'),
]


class FnbMenu(models.Model):
    """Carta/Menu de um serviço F&B (à la carte, buffet, banquete, bebidas...)."""
    MENU_TYPES = [
        ('ALACARTE', 'À la carte'),
        ('BUFFET', 'Buffet'),
        ('BANQUET', 'Banquete'),
        ('DRINKS', 'Carta de Bebidas'),
        ('ROOMSERVICE', 'Room Service'),
        ('KIDS', 'Menu Infantil'),
        ('SEASONAL', 'Sazonal / Especial'),
    ]
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='fnb_menus')
    name = models.CharField(max_length=120)
    menu_type = models.CharField(max_length=16, choices=MENU_TYPES, default='ALACARTE')
    outlet_type = models.CharField(max_length=16, choices=FNB_OUTLET_TYPES, blank=True, null=True)
    valid_from = models.DateField(blank=True, null=True)
    valid_to = models.DateField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'fnb_menu'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.get_menu_type_display()})"


class FnbMenuItem(models.Model):
    """Artigo de uma carta. Liga-se ao Artigo (custo/margem reais) ou texto livre."""
    menu = models.ForeignKey(FnbMenu, on_delete=models.CASCADE, related_name='items')
    item = models.ForeignKey(Item, on_delete=models.SET_NULL, blank=True, null=True, related_name='menu_lines')
    section = models.CharField(max_length=80, blank=True, null=True)   # Entradas, Pratos, Sobremesas...
    name = models.CharField(max_length=160)                            # snapshot / texto livre
    description = models.CharField(max_length=255, blank=True, null=True)
    price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    sort_order = models.PositiveIntegerField(default=0)
    is_available = models.BooleanField(default=True)
    is_signature = models.BooleanField(default=False)                  # prato de assinatura/destaque

    class Meta:
        db_table = 'fnb_menu_item'
        ordering = ['section', 'sort_order', 'name']

    def __str__(self):
        return self.name

    @property
    def cost(self):
        return Decimal(self.item.current_average_cost or 0) if self.item_id else Decimal('0')

    @property
    def margin(self):
        """Margem bruta (%) do prato face ao custo médio do artigo ligado."""
        p = Decimal(self.price or 0)
        c = self.cost
        if p > 0 and c > 0:
            return ((p - c) / p * Decimal('100')).quantize(Decimal('0.1'))
        return None


class FnbEvent(models.Model):
    """Evento / banquete / catering (BEO simplificado)."""
    EVENT_TYPES = [
        ('BANQUET', 'Banquete'),
        ('WEDDING', 'Casamento'),
        ('CONFERENCE', 'Conferência'),
        ('COFFEE_BREAK', 'Coffee Break'),
        ('COCKTAIL', 'Cocktail'),
        ('BUFFET', 'Buffet'),
        ('OTHER', 'Outro'),
    ]
    STATUS = [
        ('INQUIRY', 'Pedido'),
        ('CONFIRMED', 'Confirmado'),
        ('IN_PROGRESS', 'Em curso'),
        ('DONE', 'Concluído'),
        ('CANCELLED', 'Cancelado'),
    ]
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='fnb_events')
    name = models.CharField(max_length=160)
    event_type = models.CharField(max_length=16, choices=EVENT_TYPES, default='BANQUET')
    event_date = models.DateField()
    start_time = models.TimeField(blank=True, null=True)
    end_time = models.TimeField(blank=True, null=True)
    pax = models.PositiveIntegerField(default=0)                       # nº de pessoas
    location = models.CharField(max_length=120, blank=True, null=True)  # Salão Nobre, Jardim...
    menu = models.ForeignKey(FnbMenu, on_delete=models.SET_NULL, blank=True, null=True, related_name='events')
    status = models.CharField(max_length=12, choices=STATUS, default='INQUIRY')
    contact_name = models.CharField(max_length=120, blank=True, null=True)
    contact_phone = models.CharField(max_length=40, blank=True, null=True)
    estimated_value = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'fnb_event'
        ordering = ['event_date', 'start_time']

    def __str__(self):
        return f"{self.name} · {self.event_date}"


class HaccpCheck(models.Model):
    """Registo HACCP — temperaturas, receção, higiene e limpeza (rastreável)."""
    CHECK_TYPES = [
        ('TEMP_FRIDGE', 'Temperatura — Frio'),
        ('TEMP_FREEZER', 'Temperatura — Congelação'),
        ('TEMP_COOKING', 'Temperatura — Confeção'),
        ('TEMP_HOLDING', 'Temperatura — Manutenção a quente'),
        ('RECEIVING', 'Receção de mercadoria'),
        ('CLEANING', 'Limpeza / Sanitização'),
        ('HYGIENE', 'Higiene pessoal'),
    ]
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='haccp_checks')
    area = models.ForeignKey(ProductionArea, on_delete=models.SET_NULL, blank=True, null=True, related_name='haccp_checks')
    check_type = models.CharField(max_length=16, choices=CHECK_TYPES, default='TEMP_FRIDGE')
    location_label = models.CharField(max_length=120, blank=True, null=True)  # "Câmara 2", "Banho-maria"
    measured_value = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True)
    unit = models.CharField(max_length=10, default='°C')
    limit_min = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True)
    limit_max = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True)
    compliant = models.BooleanField(default=True)
    corrective_action = models.CharField(max_length=255, blank=True, null=True)
    checked_by = models.CharField(max_length=120, blank=True, null=True)
    checked_at = models.DateTimeField(auto_now_add=True)
    notes = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        db_table = 'fnb_haccp_check'
        ordering = ['-checked_at']

    def __str__(self):
        return f"{self.get_check_type_display()} · {'OK' if self.compliant else 'NÃO CONFORME'}"


class WasteRecord(models.Model):
    """Registo de desperdício / quebra de produção (com custo estimado)."""
    REASONS = [
        ('SPOILAGE', 'Deterioração'),
        ('OVERPRODUCTION', 'Sobreprodução'),
        ('PREPARATION', 'Preparação / Aparas'),
        ('EXPIRED', 'Validade expirada'),
        ('RETURN', 'Devolução de cliente'),
        ('BREAKAGE', 'Quebra / Acidente'),
        ('OTHER', 'Outro'),
    ]
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='waste_records')
    area = models.ForeignKey(ProductionArea, on_delete=models.SET_NULL, blank=True, null=True, related_name='waste_records')
    item = models.ForeignKey(Item, on_delete=models.SET_NULL, blank=True, null=True, related_name='waste_records')
    description = models.CharField(max_length=160)
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    uom = models.ForeignKey(UnitOfMeasure, on_delete=models.SET_NULL, blank=True, null=True, related_name='waste_records')
    reason = models.CharField(max_length=16, choices=REASONS, default='SPOILAGE')
    estimated_cost = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    recorded_by = models.CharField(max_length=120, blank=True, null=True)
    recorded_at = models.DateTimeField(auto_now_add=True)
    notes = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        db_table = 'fnb_waste'
        ordering = ['-recorded_at']

    def __str__(self):
        return f"{self.description} ({self.quantity})"

    def save(self, *args, **kwargs):
        # Custo estimado automático a partir do custo médio do artigo, se não indicado.
        if not self.estimated_cost and self.item_id and self.quantity:
            self.estimated_cost = (Decimal(self.item.current_average_cost or 0) * Decimal(self.quantity)).quantize(Decimal('0.01'))
        super().save(*args, **kwargs)


class QualityCheck(models.Model):
    """Controlo de qualidade F&B — inspeção de serviço/produto (1–5)."""
    RESULTS = [('PASS', 'Conforme'), ('WARN', 'A melhorar'), ('FAIL', 'Não conforme')]
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='quality_checks')
    area = models.ForeignKey(ProductionArea, on_delete=models.SET_NULL, blank=True, null=True, related_name='quality_checks')
    outlet_type = models.CharField(max_length=16, choices=FNB_OUTLET_TYPES, blank=True, null=True)
    subject = models.CharField(max_length=160)                         # "Empratamento do jantar"
    score = models.PositiveSmallIntegerField(default=5)                # 1..5
    result = models.CharField(max_length=6, choices=RESULTS, default='PASS')
    inspector = models.CharField(max_length=120, blank=True, null=True)
    checked_at = models.DateTimeField(auto_now_add=True)
    notes = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        db_table = 'fnb_quality_check'
        ordering = ['-checked_at']

    def __str__(self):
        return f"{self.subject} · {self.get_result_display()}"
