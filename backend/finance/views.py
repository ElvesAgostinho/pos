from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import CostCenter, FinanceAccount, Receipt, PaymentVoucher, Invoice, SupplierInvoice
from .serializers import (
    CostCenterSerializer, FinanceAccountSerializer, ReceiptSerializer,
    PaymentVoucherSerializer, InvoiceSerializer, SupplierInvoiceSerializer,
)


def _next_number(model, field, prefix):
    n = model.objects.count() + 1
    while model.objects.filter(**{field: f"{prefix}-{n:06d}"}).exists():
        n += 1
    return f"{prefix}-{n:06d}"


class HotelDefaultMixin:
    def perform_create(self, serializer):
        if not serializer.validated_data.get('hotel'):
            from identity.models import Hotel
            serializer.save(hotel=Hotel.objects.first())
        else:
            serializer.save()


class CostCenterViewSet(HotelDefaultMixin, viewsets.ModelViewSet):
    queryset = CostCenter.objects.all()
    serializer_class = CostCenterSerializer


class FinanceAccountViewSet(HotelDefaultMixin, viewsets.ModelViewSet):
    queryset = FinanceAccount.objects.all()
    serializer_class = FinanceAccountSerializer


class ReceiptViewSet(viewsets.ModelViewSet):
    queryset = Receipt.objects.select_related('account').all()
    serializer_class = ReceiptSerializer

    def perform_create(self, serializer):
        if not serializer.validated_data.get('number'):
            serializer.validated_data['number'] = _next_number(Receipt, 'number', 'REC')
        serializer.save()

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        r = self.get_object()
        if r.status == 'CONFIRMED':
            return Response({'detail': 'Já confirmado.'}, status=400)
        r.status = 'CONFIRMED'
        r.save(update_fields=['status'])
        if r.invoice_id:
            r.invoice.refresh_status()
        return Response(self.get_serializer(r).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        r = self.get_object()
        r.status = 'CANCELLED'
        r.save(update_fields=['status'])
        if r.invoice_id:
            r.invoice.refresh_status()
        return Response(self.get_serializer(r).data)


class PaymentVoucherViewSet(viewsets.ModelViewSet):
    queryset = PaymentVoucher.objects.select_related('account').all()
    serializer_class = PaymentVoucherSerializer

    def perform_create(self, serializer):
        if not serializer.validated_data.get('number'):
            serializer.validated_data['number'] = _next_number(PaymentVoucher, 'number', 'PAG')
        serializer.save()

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        p = self.get_object()
        if p.status == 'CONFIRMED':
            return Response({'detail': 'Já confirmado.'}, status=400)
        if p.amount > p.account.balance:
            return Response({'detail': f'Saldo insuficiente na conta ({p.account.balance}).'}, status=409)
        p.status = 'CONFIRMED'
        p.save(update_fields=['status'])
        if p.supplier_invoice_id:                       # liquida a conta corrente do fornecedor
            p.supplier_invoice.refresh_status()
        return Response(self.get_serializer(p).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        p = self.get_object()
        p.status = 'CANCELLED'
        p.save(update_fields=['status'])
        if p.supplier_invoice_id:
            p.supplier_invoice.refresh_status()
        return Response(self.get_serializer(p).data)


class SupplierInvoiceViewSet(viewsets.ModelViewSet):
    """Contas a Pagar — faturas de fornecedor (conta corrente). Podem nascer do GRN."""
    queryset = SupplierInvoice.objects.all()
    serializer_class = SupplierInvoiceSerializer

    def get_queryset(self):
        qs = SupplierInvoice.objects.all()
        for f in ('status',):
            v = self.request.query_params.get(f)
            if v:
                qs = qs.filter(status=v)
        sup = self.request.query_params.get('supplier')
        return qs.filter(supplier_id_ref=sup) if sup else qs

    def perform_create(self, serializer):
        if not serializer.validated_data.get('number'):
            serializer.validated_data['number'] = _next_number(SupplierInvoice, 'number', 'FF')
        serializer.save()

    @action(detail=True, methods=['post'])
    def pay(self, request, pk=None):
        """Paga (parcial ou total) a fatura, criando um pagamento confirmado na conta indicada."""
        inv = self.get_object()
        if inv.status == 'PAID':
            return Response({'detail': 'Fatura já paga.'}, status=400)
        account = FinanceAccount.objects.filter(pk=request.data.get('account')).first()
        if not account:
            return Response({'detail': 'Conta de tesouraria obrigatória.'}, status=400)
        from decimal import Decimal
        amount = Decimal(str(request.data.get('amount') or inv.balance))
        if amount > account.balance:
            return Response({'detail': f'Saldo insuficiente na conta ({account.balance}).'}, status=409)
        from django.utils import timezone
        pay = PaymentVoucher.objects.create(
            number=_next_number(PaymentVoucher, 'number', 'PAG'), account=account,
            party_name=inv.supplier_name, description=f'Pagamento fatura {inv.number}',
            amount=amount, date=timezone.localdate(), status='CONFIRMED',
            reference=inv.number, supplier_invoice=inv)
        inv.refresh_status()
        return Response({'payment': PaymentVoucherSerializer(pay).data, 'invoice': self.get_serializer(inv).data}, status=201)

    @action(detail=True, methods=['get'])
    def statement(self, request, pk=None):
        """Extrato da fatura: valor, pagamentos e saldo."""
        inv = self.get_object()
        pays = [{'number': p.number, 'date': p.date, 'amount': p.amount, 'account': p.account.name}
                for p in inv.payments.filter(status='CONFIRMED')]
        return Response({'invoice': self.get_serializer(inv).data, 'payments': pays,
                         'paid_amount': inv.paid_amount, 'balance': inv.balance})


class InvoiceViewSet(viewsets.ModelViewSet):
    queryset = Invoice.objects.prefetch_related('lines').all()
    serializer_class = InvoiceSerializer
    search_fields = ['number', 'customer_name']
    ordering_fields = ['date', 'total', 'number']

    def perform_create(self, serializer):
        if not serializer.validated_data.get('number'):
            serializer.validated_data['number'] = _next_number(Invoice, 'number', 'FT')
        if not serializer.validated_data.get('hotel'):
            from identity.models import Hotel
            serializer.validated_data['hotel'] = Hotel.objects.first()
        serializer.save()

    @action(detail=True, methods=['post'])
    def issue(self, request, pk=None):
        inv = self.get_object()
        if inv.status != 'DRAFT':
            return Response({'detail': 'Só rascunhos podem ser emitidos.'}, status=400)
        inv.recompute()
        inv.status = 'ISSUED'
        inv.save(update_fields=['status'])
        # Emissão do documento fiscal (AGT) associado — tolerante a falhas.
        fiscal_no = None
        try:
            from fiscal.integration import emit_for_finance_invoice
            fdoc = emit_for_finance_invoice(
                inv, user=(request.user.username if request.user.is_authenticated else None),
                ip=request.META.get('REMOTE_ADDR'))
            fiscal_no = getattr(fdoc, 'invoice_no', None)
        except Exception:
            pass
        data = self.get_serializer(inv).data
        data['fiscal_invoice_no'] = fiscal_no
        return Response(data)

    @action(detail=True, methods=['post'])
    def mark_paid(self, request, pk=None):
        inv = self.get_object()
        if inv.status not in ('ISSUED', 'PARTIAL'):
            return Response({'detail': 'Só faturas emitidas podem ser marcadas pagas.'}, status=400)
        inv.status = 'PAID'
        inv.save(update_fields=['status'])
        return Response(self.get_serializer(inv).data)

    @action(detail=True, methods=['post'])
    def receive(self, request, pk=None):
        """Recebe (parcial/total) a fatura, criando um recebimento confirmado na conta indicada."""
        inv = self.get_object()
        if inv.status in ('DRAFT', 'CANCELLED'):
            return Response({'detail': 'A fatura tem de estar emitida.'}, status=400)
        account = FinanceAccount.objects.filter(pk=request.data.get('account')).first()
        if not account:
            return Response({'detail': 'Conta de tesouraria obrigatória.'}, status=400)
        from decimal import Decimal
        from django.utils import timezone
        amount = Decimal(str(request.data.get('amount') or inv.balance))
        rec = Receipt.objects.create(
            number=_next_number(Receipt, 'number', 'REC'), account=account,
            party_name=inv.customer_name, description=f'Recebimento fatura {inv.number}',
            amount=amount, date=timezone.localdate(), status='CONFIRMED',
            reference=inv.number, invoice=inv)
        inv.refresh_status()
        return Response({'receipt': ReceiptSerializer(rec).data, 'invoice': self.get_serializer(inv).data}, status=201)

    @action(detail=False, methods=['get'])
    def customers(self, request):
        """Conta corrente por cliente: total faturado, recebido e saldo em dívida."""
        from collections import defaultdict
        from decimal import Decimal
        acc = defaultdict(lambda: {'invoiced': Decimal('0'), 'received': Decimal('0')})
        for inv in Invoice.objects.exclude(status__in=['DRAFT', 'CANCELLED']).prefetch_related('receipts'):
            a = acc[inv.customer_name]
            a['invoiced'] += inv.total
            a['received'] += inv.paid_amount
        rows = [{'customer': k, 'invoiced': v['invoiced'], 'received': v['received'],
                 'balance': v['invoiced'] - v['received']} for k, v in acc.items()]
        rows.sort(key=lambda r: r['balance'], reverse=True)
        return Response(rows)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        inv = self.get_object()
        inv.status = 'CANCELLED'
        inv.save(update_fields=['status'])
        return Response(self.get_serializer(inv).data)
