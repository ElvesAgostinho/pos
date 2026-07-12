"""
Financeiro & Tesouraria.

Contas de tesouraria (caixa/banco), recebimentos (AR) e pagamentos (AP), centros de
custo e faturação (contas a receber). Consome Hotel/PaymentMethod do Master Data.
O saldo da conta é recalculado a partir dos movimentos confirmados (fonte de verdade).
"""
from decimal import Decimal
from django.db import models
from identity.models import Hotel


class CostCenter(models.Model):
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='cost_centers')
    code = models.CharField(max_length=20)
    name = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'fin_cost_center'
        unique_together = ('hotel', 'code')

    def __str__(self):
        return f"[{self.code}] {self.name}"


class FinanceAccount(models.Model):
    """Conta de tesouraria: caixa físico ou conta bancária."""
    TYPES = [('CASH', 'Caixa'), ('BANK', 'Banco')]
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='finance_accounts')
    code = models.CharField(max_length=20)
    name = models.CharField(max_length=120)
    account_type = models.CharField(max_length=6, choices=TYPES, default='CASH')
    currency = models.CharField(max_length=8, default='AOA')
    opening_balance = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'fin_account'
        unique_together = ('hotel', 'code')

    def __str__(self):
        return f"[{self.code}] {self.name}"

    @property
    def balance(self):
        received = sum((r.amount for r in self.receipts.filter(status='CONFIRMED')), Decimal('0'))
        paid = sum((p.amount for p in self.payments.filter(status='CONFIRMED')), Decimal('0'))
        return Decimal(self.opening_balance) + received - paid


class Receipt(models.Model):
    """Recebimento (dinheiro a entrar na conta)."""
    STATUS = [('DRAFT', 'Rascunho'), ('CONFIRMED', 'Confirmado'), ('CANCELLED', 'Anulado')]
    number = models.CharField(max_length=30, unique=True)
    account = models.ForeignKey(FinanceAccount, on_delete=models.PROTECT, related_name='receipts')
    cost_center = models.ForeignKey(CostCenter, on_delete=models.SET_NULL, blank=True, null=True, related_name='receipts')
    party_name = models.CharField(max_length=200)  # cliente/pagador
    description = models.CharField(max_length=255, blank=True, null=True)
    amount = models.DecimalField(max_digits=16, decimal_places=2)
    method = models.CharField(max_length=30, default='CASH')
    reference = models.CharField(max_length=60, blank=True, null=True)
    date = models.DateField()
    status = models.CharField(max_length=10, choices=STATUS, default='DRAFT')
    # Liga o recebimento a uma fatura de cliente (liquida a conta corrente do cliente).
    invoice = models.ForeignKey('Invoice', on_delete=models.SET_NULL, blank=True, null=True, related_name='receipts')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'fin_receipt'
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.number} · {self.amount}"


class PaymentVoucher(models.Model):
    """Pagamento (dinheiro a sair da conta)."""
    STATUS = [('DRAFT', 'Rascunho'), ('CONFIRMED', 'Confirmado'), ('CANCELLED', 'Anulado')]
    number = models.CharField(max_length=30, unique=True)
    account = models.ForeignKey(FinanceAccount, on_delete=models.PROTECT, related_name='payments')
    cost_center = models.ForeignKey(CostCenter, on_delete=models.SET_NULL, blank=True, null=True, related_name='payments')
    party_name = models.CharField(max_length=200)  # fornecedor/beneficiário
    description = models.CharField(max_length=255, blank=True, null=True)
    amount = models.DecimalField(max_digits=16, decimal_places=2)
    method = models.CharField(max_length=30, default='CASH')
    reference = models.CharField(max_length=60, blank=True, null=True)
    date = models.DateField()
    status = models.CharField(max_length=10, choices=STATUS, default='DRAFT')
    # Liga o pagamento a uma fatura de fornecedor (liquida a conta corrente).
    supplier_invoice = models.ForeignKey('SupplierInvoice', on_delete=models.SET_NULL, blank=True, null=True, related_name='payments')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'fin_payment'
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.number} · {self.amount}"


class Invoice(models.Model):
    """Fatura de cliente (contas a receber)."""
    STATUS = [('DRAFT', 'Rascunho'), ('ISSUED', 'Emitida'), ('PARTIAL', 'Parcial'), ('PAID', 'Paga'), ('CANCELLED', 'Anulada')]
    number = models.CharField(max_length=30, unique=True)
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='invoices')
    customer_name = models.CharField(max_length=200)
    customer_tax_id = models.CharField(max_length=50, blank=True, null=True)
    date = models.DateField()
    due_date = models.DateField(blank=True, null=True)
    subtotal = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    status = models.CharField(max_length=10, choices=STATUS, default='DRAFT')
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'fin_invoice'
        ordering = ['-date', '-created_at']

    def __str__(self):
        return self.number

    def recompute(self, save=True):
        sub = sum((l.line_total for l in self.lines.all()), Decimal('0'))
        tax = sum((l.line_total * l.tax_percentage / Decimal('100') for l in self.lines.all()), Decimal('0'))
        self.subtotal = sub
        self.tax_total = tax
        self.total = sub + tax
        if save:
            self.save(update_fields=['subtotal', 'tax_total', 'total'])

    @property
    def paid_amount(self):
        return sum((r.amount for r in self.receipts.filter(status='CONFIRMED')), Decimal('0'))

    @property
    def balance(self):
        return self.total - self.paid_amount

    def refresh_status(self):
        if self.status in ('DRAFT', 'CANCELLED'):
            return
        paid = self.paid_amount
        self.status = 'PAID' if paid >= self.total else ('PARTIAL' if paid > 0 else 'ISSUED')
        self.save(update_fields=['status'])


class InvoiceLine(models.Model):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='lines')
    description = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=1)
    unit_price = models.DecimalField(max_digits=14, decimal_places=2)
    tax_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    line_total = models.DecimalField(max_digits=16, decimal_places=2, editable=False, default=0)

    class Meta:
        db_table = 'fin_invoice_line'

    def save(self, *args, **kwargs):
        self.line_total = self.quantity * self.unit_price
        super().save(*args, **kwargs)


class SupplierInvoice(models.Model):
    """Fatura de fornecedor (Contas a Pagar) — conta corrente do fornecedor.
    Pode nascer automaticamente da Receção de Mercadorias (GRN)."""
    STATUS = [('OPEN', 'Em aberto'), ('PARTIAL', 'Parcial'), ('PAID', 'Paga'), ('CANCELLED', 'Anulada')]
    number = models.CharField(max_length=30, unique=True)
    supplier_name = models.CharField(max_length=200)
    supplier_id_ref = models.IntegerField(blank=True, null=True)      # id do esm.Supplier
    supplier_ref = models.CharField(max_length=80, blank=True, null=True)  # nº fatura do fornecedor
    grn_ref = models.CharField(max_length=60, blank=True, null=True)  # nº da receção que a originou
    date = models.DateField()
    due_date = models.DateField(blank=True, null=True)
    amount = models.DecimalField(max_digits=16, decimal_places=2)                    # total (c/ IVA)
    tax_amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)     # IVA dedutível
    status = models.CharField(max_length=10, choices=STATUS, default='OPEN')
    notes = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def net_amount(self):
        return (self.amount or 0) - (self.tax_amount or 0)

    class Meta:
        db_table = 'fin_supplier_invoice'
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.number} · {self.supplier_name} · {self.amount}"

    @property
    def paid_amount(self):
        return sum((p.amount for p in self.payments.filter(status='CONFIRMED')), Decimal('0'))

    @property
    def balance(self):
        return self.amount - self.paid_amount

    def refresh_status(self):
        paid = self.paid_amount
        self.status = 'PAID' if paid >= self.amount else ('PARTIAL' if paid > 0 else 'OPEN')
        self.save(update_fields=['status'])


class BankReconciliation(models.Model):
    """Reconciliação bancária — compara o saldo do sistema com o extrato do banco."""
    STATUS = [('DRAFT', 'Em curso'), ('CLOSED', 'Fechada')]
    account = models.ForeignKey(FinanceAccount, on_delete=models.CASCADE, related_name='reconciliations')
    statement_date = models.DateField()
    statement_balance = models.DecimalField(max_digits=16, decimal_places=2, default=0)   # saldo do extrato
    system_balance = models.DecimalField(max_digits=16, decimal_places=2, default=0)      # saldo do sistema (snapshot)
    note = models.CharField(max_length=255, blank=True, null=True)
    status = models.CharField(max_length=8, choices=STATUS, default='DRAFT')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'fin_reconciliation'
        ordering = ['-statement_date']

    @property
    def difference(self):
        return (self.statement_balance or 0) - (self.system_balance or 0)

    def __str__(self):
        return f"Reconciliação {self.account.code} · {self.statement_date}"
