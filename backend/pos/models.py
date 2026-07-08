from django.db import models
from identity.models import Hotel, PosOperator, Area, Workstation
from inventory.models import Item
import uuid

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
