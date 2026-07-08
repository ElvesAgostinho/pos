from django.db import models
from identity.models import Company, Hotel
from inventory.models import Item, UnitOfMeasure, Warehouse
from esm.models import Supplier

class PurchaseOrder(models.Model):
    STATUS_CHOICES = [
        ('Draft', 'Rascunho'),
        ('Pending_Approval', 'A Aguardar Aprovação'),
        ('Approved', 'Aprovada'),
        ('Sent', 'Enviada ao Fornecedor'),
        ('Partial_Received', 'Receção Parcial'),
        ('Closed', 'Fechada (Recebida)'),
        ('Canceled', 'Cancelada'),
    ]

    po_number = models.CharField(max_length=50, unique=True)
    supplier = models.ForeignKey(Supplier, on_delete=models.RESTRICT, related_name='purchase_orders')
    
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE)
    delivery_warehouse = models.ForeignKey(Warehouse, on_delete=models.RESTRICT)
    
    issue_date = models.DateField(auto_now_add=True)
    expected_delivery_date = models.DateField(blank=True, null=True)
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Draft')
    total_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0.00)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"PO {self.po_number} - {self.supplier.commercial_name}"

class PurchaseOrderLine(models.Model):
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='lines')
    item = models.ForeignKey(Item, on_delete=models.RESTRICT)
    
    quantity_requested = models.DecimalField(max_digits=12, decimal_places=4)
    uom = models.ForeignKey(UnitOfMeasure, on_delete=models.RESTRICT)
    
    unit_price = models.DecimalField(max_digits=12, decimal_places=4)
    line_total = models.DecimalField(max_digits=15, decimal_places=2, editable=False)

    def save(self, *args, **kwargs):
        self.line_total = self.quantity_requested * self.unit_price
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.quantity_requested} {self.uom.code} de {self.item.name}"

class GoodsReceipt(models.Model):
    STATUS_CHOICES = [
        ('Draft', 'Em Conferência'),
        ('Validated', 'Validada (Stock Atualizado)'),
        ('Canceled', 'Cancelada'),
    ]

    receipt_number = models.CharField(max_length=50, unique=True)
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.SET_NULL, blank=True, null=True, related_name='receipts')
    supplier = models.ForeignKey(Supplier, on_delete=models.RESTRICT)
    
    supplier_invoice_ref = models.CharField(max_length=100, blank=True, null=True) # Fatura/Guia do Fornecedor
    delivery_warehouse = models.ForeignKey(Warehouse, on_delete=models.RESTRICT)
    
    receipt_date = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Draft')

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"GRN {self.receipt_number} - {self.supplier.commercial_name}"

class GoodsReceiptLine(models.Model):
    goods_receipt = models.ForeignKey(GoodsReceipt, on_delete=models.CASCADE, related_name='lines')
    po_line = models.ForeignKey(PurchaseOrderLine, on_delete=models.SET_NULL, blank=True, null=True)
    
    item = models.ForeignKey(Item, on_delete=models.RESTRICT)
    quantity_received = models.DecimalField(max_digits=12, decimal_places=4)
    uom = models.ForeignKey(UnitOfMeasure, on_delete=models.RESTRICT)
    
    unit_cost = models.DecimalField(max_digits=12, decimal_places=4)

    def __str__(self):
        return f"Recebido {self.quantity_received} {self.uom.code} de {self.item.name}"
