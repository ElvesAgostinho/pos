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


# ==========================================================================
# PRÉ-CICLO ENTERPRISE: Requisição → Aprovação → RFQ → Cotações → Comparação → OC
# ==========================================================================

class PurchaseRequisition(models.Model):
    STATUS = [('DRAFT', 'Rascunho'), ('SUBMITTED', 'Submetida'), ('APPROVED', 'Aprovada'), ('REJECTED', 'Rejeitada')]
    number = models.CharField(max_length=40, unique=True)
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='requisitions')
    warehouse = models.ForeignKey(Warehouse, on_delete=models.SET_NULL, blank=True, null=True)
    requester = models.CharField(max_length=120, blank=True, null=True)
    status = models.CharField(max_length=12, choices=STATUS, default='DRAFT')
    notes = models.TextField(blank=True, null=True)
    approver = models.CharField(max_length=120, blank=True, null=True)
    decided_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'proc_requisition'
        ordering = ['-created_at']

    def __str__(self):
        return self.number


class RequisitionLine(models.Model):
    requisition = models.ForeignKey(PurchaseRequisition, on_delete=models.CASCADE, related_name='lines')
    item = models.ForeignKey(Item, on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=12, decimal_places=4)
    uom = models.ForeignKey(UnitOfMeasure, on_delete=models.PROTECT)

    class Meta:
        db_table = 'proc_requisition_line'


class RFQ(models.Model):
    STATUS = [('DRAFT', 'Rascunho'), ('SENT', 'Enviada'), ('CLOSED', 'Fechada')]
    number = models.CharField(max_length=40, unique=True)
    requisition = models.ForeignKey(PurchaseRequisition, on_delete=models.SET_NULL, blank=True, null=True, related_name='rfqs')
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='rfqs')
    status = models.CharField(max_length=8, choices=STATUS, default='DRAFT')
    due_date = models.DateField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'proc_rfq'
        ordering = ['-created_at']

    def __str__(self):
        return self.number


class RFQLine(models.Model):
    rfq = models.ForeignKey(RFQ, on_delete=models.CASCADE, related_name='lines')
    item = models.ForeignKey(Item, on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=12, decimal_places=4)
    uom = models.ForeignKey(UnitOfMeasure, on_delete=models.PROTECT)

    class Meta:
        db_table = 'proc_rfq_line'


class SupplierQuote(models.Model):
    STATUS = [('RECEIVED', 'Recebida'), ('SELECTED', 'Selecionada'), ('REJECTED', 'Rejeitada')]
    rfq = models.ForeignKey(RFQ, on_delete=models.CASCADE, related_name='quotes')
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name='quotes')
    quote_ref = models.CharField(max_length=60, blank=True, null=True)
    status = models.CharField(max_length=10, choices=STATUS, default='RECEIVED')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'proc_supplier_quote'

    @property
    def total(self):
        from decimal import Decimal
        return sum((l.quantity * l.unit_price for l in self.lines.all()), Decimal('0'))


class QuoteLine(models.Model):
    quote = models.ForeignKey(SupplierQuote, on_delete=models.CASCADE, related_name='lines')
    item = models.ForeignKey(Item, on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=12, decimal_places=4)
    unit_price = models.DecimalField(max_digits=12, decimal_places=4)

    class Meta:
        db_table = 'proc_quote_line'


class PurchaseReturn(models.Model):
    """Devolução a fornecedor (documento). Ao confirmar, dá saída de stock."""
    STATUS = [('DRAFT', 'Rascunho'), ('CONFIRMED', 'Confirmada'), ('CANCELLED', 'Cancelada')]
    number = models.CharField(max_length=30, unique=True)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name='returns')
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name='purchase_returns')
    reason = models.CharField(max_length=200, blank=True, null=True)
    status = models.CharField(max_length=10, choices=STATUS, default='DRAFT')
    created_by = models.CharField(max_length=100, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    confirmed_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'proc_return'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.number} · {self.supplier.commercial_name}"


class PurchaseReturnLine(models.Model):
    ret = models.ForeignKey(PurchaseReturn, on_delete=models.CASCADE, related_name='lines')
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name='return_lines')
    quantity = models.DecimalField(max_digits=15, decimal_places=4)

    class Meta:
        db_table = 'proc_return_line'
