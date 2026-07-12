from django.db import models
from identity.models import Hotel, Department
from mdm.models import Brand

class UnitOfMeasure(models.Model):
    code = models.CharField(max_length=20, unique=True) # Ex: KG, L, UN, CX
    name = models.CharField(max_length=100)
    
    def __str__(self):
        return f"{self.name} ({self.code})"

class ItemCategory(models.Model):
    name = models.CharField(max_length=100)
    parent = models.ForeignKey('self', on_delete=models.SET_NULL, blank=True, null=True, related_name='subcategories')
    
    def __str__(self):
        if self.parent:
            return f"{self.parent.name} -> {self.name}"
        return self.name

class Item(models.Model):
    ITEM_TYPES = [
        ('RawMaterial', 'Matéria-Prima'),
        ('Manufactured', 'Produto Produzido (Ficha Técnica)'),
        ('Retail', 'Produto de Revenda'),
        ('Service', 'Serviço'),
    ]

    code = models.CharField(max_length=100, unique=True)
    name = models.CharField(max_length=255)
    item_type = models.CharField(max_length=50, choices=ITEM_TYPES)
    
    category = models.ForeignKey(ItemCategory, on_delete=models.SET_NULL, blank=True, null=True)
    base_uom = models.ForeignKey(UnitOfMeasure, on_delete=models.RESTRICT)
    
    # Preços e Custos
    current_average_cost = models.DecimalField(max_digits=12, decimal_places=4, default=0.0000)
    sale_price = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    
    purchase_price = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)

    # Impostos
    tax_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)

    # Enterprise: identificação, marca, imagem, controlo de stock e flags
    barcode = models.CharField(max_length=64, blank=True, null=True, db_index=True)
    brand = models.ForeignKey(Brand, on_delete=models.SET_NULL, blank=True, null=True, related_name='items')
    image_url = models.URLField(blank=True, null=True)
    min_stock = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    max_stock = models.DecimalField(max_digits=14, decimal_places=3, blank=True, null=True)
    is_sold = models.BooleanField(default=True)          # disponível para venda
    is_purchased = models.BooleanField(default=True)     # comprável a fornecedor
    allow_fraction = models.BooleanField(default=False)  # permite quantidade fracionada (ex: peso)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def margin_percentage(self):
        if self.purchase_price and self.sale_price:
            from decimal import Decimal
            return round((self.sale_price - self.purchase_price) / self.purchase_price * Decimal('100'), 2)
        return None

    def __str__(self):
        return f"[{self.code}] {self.name}"

class Recipe(models.Model):
    # Ficha Técnica para um Produto Produzido (ex: Bitoque, Cocktail)
    final_item = models.OneToOneField(Item, on_delete=models.CASCADE, related_name='recipe')
    instructions = models.TextField(blank=True, null=True)
    
    # Custo Teórico é a soma dos custos dos ingredientes
    theoretical_cost = models.DecimalField(max_digits=12, decimal_places=4, default=0.0000)

    def __str__(self):
        return f"Ficha Técnica: {self.final_item.name}"

class RecipeIngredient(models.Model):
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name='ingredients')
    ingredient_item = models.ForeignKey(Item, on_delete=models.RESTRICT, related_name='used_in_recipes')
    quantity = models.DecimalField(max_digits=10, decimal_places=4)
    uom = models.ForeignKey(UnitOfMeasure, on_delete=models.RESTRICT)

    def __str__(self):
        return f"{self.quantity} {self.uom.code} de {self.ingredient_item.name}"

class Warehouse(models.Model):
    name = models.CharField(max_length=100)
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='warehouses')
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, blank=True, null=True)
    is_main = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.hotel.name} - {self.name}"

class StockLevel(models.Model):
    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name='stock_levels')
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name='stock_levels')
    
    quantity_on_hand = models.DecimalField(max_digits=15, decimal_places=4, default=0.0000)
    quantity_reserved = models.DecimalField(max_digits=15, decimal_places=4, default=0.0000)
    
    min_stock_alert = models.DecimalField(max_digits=15, decimal_places=4, default=0.0000)
    max_stock_capacity = models.DecimalField(max_digits=15, decimal_places=4, blank=True, null=True)
    
    last_updated = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('warehouse', 'item')

    @property
    def available_quantity(self):
        return self.quantity_on_hand - self.quantity_reserved

    def __str__(self):
        return f"{self.item.name} em {self.warehouse.name}: {self.quantity_on_hand} {self.item.base_uom.code}"


# ==========================================================================
# TABELAS DE PREÇO (Price Lists) — o mesmo artigo com preços diferentes por
# área/canal/época (estilo Primavera/Oracle). Cada Outlet aponta para uma lista.
# ==========================================================================

class PriceList(models.Model):
    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=120)
    currency = models.CharField(max_length=8, default='AOA')
    is_active = models.BooleanField(default=True)
    valid_from = models.DateField(blank=True, null=True)
    valid_until = models.DateField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'inv_price_list'
        ordering = ['name']

    def __str__(self):
        return f"[{self.code}] {self.name}"

    def price_of(self, item):
        pli = self.items.filter(item=item).first()
        return pli.price if pli else None


class PriceListItem(models.Model):
    price_list = models.ForeignKey(PriceList, on_delete=models.CASCADE, related_name='items')
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name='price_list_entries')
    price = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = 'inv_price_list_item'
        unique_together = ('price_list', 'item')

    def __str__(self):
        return f"{self.item.name} @ {self.price_list.code}: {self.price}"


# ==========================================================================
# VARIANTES / DOSES — o mesmo artigo vendido em formatos diferentes
# (½ dose, dose, garrafa, copo) com preço próprio e fator de consumo de stock.
# ==========================================================================

class ItemVariant(models.Model):
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name='variants')
    code = models.CharField(max_length=40, unique=True)
    name = models.CharField(max_length=100)                 # "½ Dose", "Garrafa", "Copo"
    sale_price = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    qty_factor = models.DecimalField(max_digits=10, decimal_places=4, default=1,
                                     help_text='Quantidade em unidades-base consumidas (½ dose = 0.5).')
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'inv_item_variant'
        ordering = ['item', 'sort_order']

    def __str__(self):
        return f"{self.item.code} · {self.name}"

    @property
    def effective_price(self):
        if self.sale_price is not None:
            return self.sale_price
        return (self.item.sale_price or 0) * self.qty_factor


# ==========================================================================
# UNIDADES MÚLTIPLAS COM CONVERSÃO — comprar em Caixa (24 un), vender em Unidade.
# factor = quantas unidades-base há em 1 desta unidade.
# ==========================================================================

class StockMovement(models.Model):
    """Ledger de movimentos de stock (fonte única do histórico e do saldo)."""
    TYPES = [
        ('IN', 'Entrada'), ('OUT', 'Saída'), ('ADJUST', 'Ajuste'),
        ('TRANSFER_IN', 'Transferência (Entrada)'), ('TRANSFER_OUT', 'Transferência (Saída)'),
        ('GRN', 'Receção de Compra'), ('CONSUMPTION', 'Consumo/Produção'),
    ]
    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name='movements')
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name='stock_movements')
    movement_type = models.CharField(max_length=15, choices=TYPES)
    quantity = models.DecimalField(max_digits=15, decimal_places=4)   # magnitude (positiva)
    unit_cost = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    reference = models.CharField(max_length=80, blank=True, null=True)  # doc de origem (GRN, transf…)
    note = models.CharField(max_length=255, blank=True, null=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'inv_stock_movement'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.movement_type} {self.quantity} {self.item.code} @ {self.warehouse.name}"


# ==========================================================================
# Centro 09 · Armazém — localizações (bins), transferências, inventários (stocktake)
# e lotes/validades (FEFO). Toda a movimentação passa pelo motor inventory.stock.
# ==========================================================================

class StockLocation(models.Model):
    """Localização física (corredor/prateleira/bin) dentro de um armazém."""
    LOC_TYPES = [('BIN', 'Bin/Prateleira'), ('AISLE', 'Corredor'), ('ZONE', 'Zona'),
                 ('COLD', 'Câmara Fria'), ('FREEZER', 'Congelação'), ('DOCK', 'Cais'), ('OTHER', 'Outro')]
    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name='locations')
    code = models.CharField(max_length=30)                 # A-01-03
    name = models.CharField(max_length=100, blank=True, null=True)
    location_type = models.CharField(max_length=10, choices=LOC_TYPES, default='BIN')
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'inv_location'
        unique_together = ('warehouse', 'code')
        ordering = ['warehouse', 'code']

    def __str__(self):
        return f"{self.code} @ {self.warehouse.name}"


class StockLot(models.Model):
    """Lote/validade de um artigo num armazém (base para FEFO)."""
    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name='lots')
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name='lots')
    lot_number = models.CharField(max_length=60)
    quantity = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    expiry_date = models.DateField(blank=True, null=True)
    received_at = models.DateField(blank=True, null=True)
    location = models.ForeignKey(StockLocation, on_delete=models.SET_NULL, blank=True, null=True, related_name='lots')
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'inv_lot'
        ordering = ['expiry_date', 'received_at']   # FEFO: valida primeiro

    def __str__(self):
        return f"{self.item.code} · Lote {self.lot_number}"


class StockTransfer(models.Model):
    """Transferência entre armazéns (documento). Ao confirmar, gera movimentos no ledger."""
    STATUS = [('DRAFT', 'Rascunho'), ('CONFIRMED', 'Confirmada'), ('CANCELLED', 'Cancelada')]
    number = models.CharField(max_length=30, unique=True)
    source = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name='transfers_out')
    destination = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name='transfers_in')
    status = models.CharField(max_length=10, choices=STATUS, default='DRAFT')
    note = models.CharField(max_length=255, blank=True, null=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    confirmed_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'inv_transfer'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.number} · {self.source} → {self.destination}"


class StockTransferLine(models.Model):
    transfer = models.ForeignKey(StockTransfer, on_delete=models.CASCADE, related_name='lines')
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name='transfer_lines')
    quantity = models.DecimalField(max_digits=15, decimal_places=4)

    class Meta:
        db_table = 'inv_transfer_line'


class InventoryCount(models.Model):
    """Inventário físico (stocktake) de um armazém. Ao confirmar, ajusta o stock (delta)."""
    STATUS = [('DRAFT', 'Em contagem'), ('CONFIRMED', 'Confirmado'), ('CANCELLED', 'Cancelado')]
    number = models.CharField(max_length=30, unique=True)
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name='counts')
    status = models.CharField(max_length=10, choices=STATUS, default='DRAFT')
    note = models.CharField(max_length=255, blank=True, null=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    confirmed_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'inv_count'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.number} · {self.warehouse.name} ({self.get_status_display()})"


class InventoryCountLine(models.Model):
    count = models.ForeignKey(InventoryCount, on_delete=models.CASCADE, related_name='lines')
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name='count_lines')
    system_qty = models.DecimalField(max_digits=15, decimal_places=4, default=0)   # saldo no momento da contagem
    counted_qty = models.DecimalField(max_digits=15, decimal_places=4, default=0)

    class Meta:
        db_table = 'inv_count_line'

    @property
    def variance(self):
        return (self.counted_qty or 0) - (self.system_qty or 0)


class ItemUom(models.Model):
    ROLES = [('PURCHASE', 'Compra'), ('SALE', 'Venda'), ('BOTH', 'Ambas')]
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name='uoms')
    uom = models.ForeignKey(UnitOfMeasure, on_delete=models.RESTRICT, related_name='item_uoms')
    factor = models.DecimalField(max_digits=14, decimal_places=6, default=1,
                                 help_text='Unidades-base por 1 desta unidade (Caixa de 24 → 24).')
    role = models.CharField(max_length=10, choices=ROLES, default='BOTH')

    class Meta:
        db_table = 'inv_item_uom'
        unique_together = ('item', 'uom')

    def __str__(self):
        return f"{self.item.code}: 1 {self.uom.code} = {self.factor} {self.item.base_uom.code}"
