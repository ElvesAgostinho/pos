from django.db import models
from identity.models import Hotel, Department

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
    
    # Impostos
    tax_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

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
