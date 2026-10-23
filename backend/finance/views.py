from django.db import transaction
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


def _valor_a_liquidar(pedido, em_divida):
    """O valor a receber/pagar de um documento — nunca mais do que o que falta.

    Sem este limite, dois pagamentos parciais «cada um dentro do saldo da conta»
    somavam MAIS do que a fatura vale: o fornecedor ficava com o excesso, a conta
    corrente ia a saldo negativo e o estado passava a PAGA de qualquer maneira,
    sem nada assinalar. Do lado do cliente o efeito é o mesmo ao contrário —
    entra dinheiro na caixa que não pertence a documento nenhum e ninguém sabe
    se é adiantamento ou erro de contagem.

    Devolve (valor, erro). `erro` já é a resposta pronta a devolver.
    """
    from decimal import Decimal, InvalidOperation
    bruto = pedido.data.get('amount')
    if bruto in (None, ''):
        return em_divida, None          # omitir o valor = liquidar tudo o que falta
    try:
        valor = Decimal(str(bruto))
    except (InvalidOperation, TypeError, ValueError):
        return None, Response({'detail': 'Valor inválido.'}, status=400)
    if valor <= 0:
        return None, Response({'detail': 'O valor tem de ser maior que zero.'}, status=400)
    if valor > em_divida:
        return None, Response({'detail':
            f'O valor ({valor}) é superior ao que falta liquidar neste documento '
            f'({em_divida}). Corrija o valor ou trate o excesso como adiantamento.'},
            status=400)
    return valor, None


class HotelDefaultMixin:
    """Preenche o hotel ao criar — e diz o que falta quando não há nenhum.

    Era `Hotel.objects.first()`, que numa instalação nova devolve None e faz a
    gravação rebentar com um 500 sem explicação. Ver `hotel_obrigatorio`.
    """
    def perform_create(self, serializer):
        if serializer.validated_data.get('hotel'):
            serializer.save()
            return
        from core.tenancy import hotel_obrigatorio
        serializer.save(hotel_id=hotel_obrigatorio(self.request))


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
        amount, erro = _valor_a_liquidar(request, inv.balance)
        if erro:
            return erro
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
            from core.tenancy import hotel_obrigatorio
            serializer.validated_data['hotel_id'] = hotel_obrigatorio(self.request)
        serializer.save()

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def issue(self, request, pk=None):
        # TRANCA a fatura antes de decidir se ainda é rascunho: sem isto, dois cliques
        # em "Emitir" quase ao mesmo tempo liam ambos status=DRAFT antes de qualquer um
        # escrever, e cada um emitia o SEU próprio documento fiscal — duas facturas reais
        # e irreversíveis para a mesma fatura. emit_for_finance_invoice() já tranca a
        # fatura outra vez lá dentro (idempotente, mesma transação) como segunda rede.
        inv = Invoice.objects.select_for_update().get(pk=pk)
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
        from django.utils import timezone
        amount, erro = _valor_a_liquidar(request, inv.balance)
        if erro:
            return erro
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
        """Anula a fatura — mas não por cima de dinheiro já recebido.

        A conta corrente do cliente (`customers`) ignora as faturas anuladas. Se
        a fatura fosse anulada com os recebimentos confirmados por baixo, o
        dinheiro continuava na caixa mas deixava de estar ligado a cliente nenhum:
        a caixa fecha com dinheiro a mais, e o cliente volta a aparecer a dever o
        que já pagou. Primeiro anula-se o recebimento, depois a fatura.
        """
        inv = self.get_object()
        recebidos = inv.receipts.filter(status='CONFIRMED')
        if recebidos.exists():
            numeros = ', '.join(recebidos.values_list('number', flat=True))
            return Response({'detail':
                f'Esta fatura já tem dinheiro recebido ({inv.paid_amount}) nos recibos '
                f'{numeros}. Anule primeiro o(s) recebimento(s) — senão o dinheiro fica '
                f'na caixa sem fatura que o explique.'}, status=400)
        inv.status = 'CANCELLED'
        inv.save(update_fields=['status'])
        return Response(self.get_serializer(inv).data)
