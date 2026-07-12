"""
Fluxo de Compras enterprise: Requisição → Aprovação → RFQ → Cotações → Comparação → OC.
Usa o catálogo do fornecedor (esm) para pré-preencher preços acordados.
"""
from decimal import Decimal
from django.utils import timezone
from rest_framework import viewsets, serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response

from inventory.models import Item, Warehouse
from esm.models import Supplier, SupplierProductCatalog
from .models import (
    PurchaseRequisition, RequisitionLine, RFQ, RFQLine, SupplierQuote, QuoteLine,
    PurchaseOrder, PurchaseOrderLine,
)


def _next(model, field, prefix):
    n = model.objects.count() + 1
    while model.objects.filter(**{field: f'{prefix}-{n:06d}'}).exists():
        n += 1
    return f'{prefix}-{n:06d}'


def _default_hotel():
    from identity.models import Hotel
    return Hotel.objects.first()


# ---------------- Requisição ----------------
class RequisitionLineSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    uom_code = serializers.CharField(source='uom.code', read_only=True)

    class Meta:
        model = RequisitionLine
        fields = ['id', 'item', 'item_name', 'quantity', 'uom', 'uom_code']


class RequisitionSerializer(serializers.ModelSerializer):
    number = serializers.CharField(required=False)
    hotel = serializers.PrimaryKeyRelatedField(queryset=PurchaseRequisition._meta.get_field('hotel').related_model.objects.all(), required=False)
    lines = RequisitionLineSerializer(many=True, required=False)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = PurchaseRequisition
        fields = '__all__'

    def create(self, validated):
        lines = validated.pop('lines', [])
        if not validated.get('number'):
            validated['number'] = _next(PurchaseRequisition, 'number', 'REQ')
        if not validated.get('hotel'):
            validated['hotel'] = _default_hotel()
        req = PurchaseRequisition.objects.create(**validated)
        for ln in lines:
            RequisitionLine.objects.create(requisition=req, **ln)
        return req

    def update(self, instance, validated):
        # Campo aninhado gravável: só substitui as linhas se forem enviadas
        # (permite editar apenas o cabeçalho sem tocar nas linhas existentes).
        lines = validated.pop('lines', None)
        for attr, value in validated.items():
            setattr(instance, attr, value)
        instance.save()
        if lines is not None:
            instance.lines.all().delete()
            for ln in lines:
                RequisitionLine.objects.create(requisition=instance, **ln)
        return instance


class RequisitionViewSet(viewsets.ModelViewSet):
    serializer_class = RequisitionSerializer

    def get_queryset(self):
        qs = PurchaseRequisition.objects.prefetch_related('lines__item', 'lines__uom').all()
        s = self.request.query_params.get('status')
        return qs.filter(status=s) if s else qs

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        r = self.get_object(); r.status = 'SUBMITTED'; r.save(update_fields=['status']); return Response(self.get_serializer(r).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        r = self.get_object(); r.status = 'APPROVED'; r.approver = request.data.get('approver', 'gestor'); r.decided_at = timezone.now()
        r.save(update_fields=['status', 'approver', 'decided_at']); return Response(self.get_serializer(r).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        r = self.get_object(); r.status = 'REJECTED'; r.approver = request.data.get('approver', 'gestor'); r.decided_at = timezone.now()
        r.save(update_fields=['status', 'approver', 'decided_at']); return Response(self.get_serializer(r).data)

    @action(detail=True, methods=['post'])
    def create_rfq(self, request, pk=None):
        req = self.get_object()
        if req.status != 'APPROVED':
            return Response({'detail': 'A requisição tem de estar Aprovada.'}, status=400)
        rfq = RFQ.objects.create(number=_next(RFQ, 'number', 'RFQ'), requisition=req, hotel=req.hotel, status='DRAFT')
        for ln in req.lines.all():
            RFQLine.objects.create(rfq=rfq, item=ln.item, quantity=ln.quantity, uom=ln.uom)
        return Response(RFQSerializer(rfq).data, status=201)


# ---------------- RFQ ----------------
class RFQLineSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    uom_code = serializers.CharField(source='uom.code', read_only=True)

    class Meta:
        model = RFQLine
        fields = ['id', 'item', 'item_name', 'quantity', 'uom', 'uom_code']


class RFQSerializer(serializers.ModelSerializer):
    lines = RFQLineSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    quote_count = serializers.IntegerField(source='quotes.count', read_only=True)

    class Meta:
        model = RFQ
        fields = '__all__'


class RFQViewSet(viewsets.ModelViewSet):
    serializer_class = RFQSerializer

    def get_queryset(self):
        return RFQ.objects.prefetch_related('lines__item', 'quotes__lines').all()

    @action(detail=True, methods=['post'])
    def add_quote(self, request, pk=None):
        """Regista a cotação de um fornecedor. Pré-preenche preços do catálogo do fornecedor."""
        rfq = self.get_object()
        sup = Supplier.objects.filter(pk=request.data.get('supplier')).first()
        if not sup:
            return Response({'detail': 'Fornecedor inválido.'}, status=400)
        q = SupplierQuote.objects.create(rfq=rfq, supplier=sup, quote_ref=request.data.get('quote_ref'))
        overrides = {int(x['item']): x['unit_price'] for x in request.data.get('prices', []) if x.get('item')}
        for ln in rfq.lines.all():
            price = overrides.get(ln.item_id)
            if price is None:
                cat = SupplierProductCatalog.objects.filter(supplier=sup, item=ln.item, is_active=True).first()
                price = cat.agreed_price if cat else Decimal('0')
            QuoteLine.objects.create(quote=q, item=ln.item, quantity=ln.quantity, unit_price=price)
        rfq.status = 'SENT'; rfq.save(update_fields=['status'])
        return Response(SupplierQuoteSerializer(q).data, status=201)

    @action(detail=True, methods=['get'])
    def comparison(self, request, pk=None):
        """Comparação de propostas: por artigo, o preço de cada fornecedor e o melhor."""
        rfq = self.get_object()
        quotes = list(rfq.quotes.select_related('supplier').prefetch_related('lines').all())
        rows = []
        for ln in rfq.lines.select_related('item').all():
            offers = []
            for q in quotes:
                ql = next((x for x in q.lines.all() if x.item_id == ln.item_id), None)
                if ql:
                    offers.append({'quote': q.id, 'supplier': q.supplier.commercial_name, 'unit_price': ql.unit_price})
            best = min(offers, key=lambda o: o['unit_price']) if offers else None
            rows.append({'item': ln.item_id, 'item_name': ln.item.name, 'quantity': ln.quantity,
                         'offers': offers, 'best_supplier': best['supplier'] if best else None,
                         'best_price': best['unit_price'] if best else None})
        totals = [{'quote': q.id, 'supplier': q.supplier.commercial_name, 'total': q.total} for q in quotes]
        return Response({'rfq': rfq.number, 'rows': rows, 'quote_totals': totals})


# ---------------- Cotações ----------------
class QuoteLineSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)

    class Meta:
        model = QuoteLine
        fields = ['id', 'item', 'item_name', 'quantity', 'unit_price']


class SupplierQuoteSerializer(serializers.ModelSerializer):
    lines = QuoteLineSerializer(many=True, read_only=True)
    supplier_name = serializers.CharField(source='supplier.commercial_name', read_only=True)
    total = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = SupplierQuote
        fields = '__all__'


class SupplierQuoteViewSet(viewsets.ModelViewSet):
    serializer_class = SupplierQuoteSerializer

    def get_queryset(self):
        qs = SupplierQuote.objects.select_related('supplier', 'rfq').prefetch_related('lines__item').all()
        rfq = self.request.query_params.get('rfq')
        return qs.filter(rfq_id=rfq) if rfq else qs

    @action(detail=True, methods=['post'])
    def convert_to_po(self, request, pk=None):
        """Gera a Ordem de Compra a partir da cotação selecionada."""
        q = self.get_object()
        wh = (q.rfq.requisition.warehouse if q.rfq.requisition else None) or Warehouse.objects.first()
        po = PurchaseOrder.objects.create(
            po_number=_next(PurchaseOrder, 'po_number', 'OC'), supplier=q.supplier,
            hotel=q.rfq.hotel, delivery_warehouse=wh, status='Approved')
        total = Decimal('0')
        for ln in q.lines.select_related('item').all():
            lt = (ln.quantity * ln.unit_price)
            PurchaseOrderLine.objects.create(
                purchase_order=po, item=ln.item, quantity_requested=ln.quantity,
                uom=ln.item.base_uom, unit_price=ln.unit_price, line_total=lt)
            total += lt
        po.total_amount = total; po.save(update_fields=['total_amount'])
        q.status = 'SELECTED'; q.save(update_fields=['status'])
        q.rfq.status = 'CLOSED'; q.rfq.save(update_fields=['status'])
        from .serializers import PurchaseOrderSerializer
        return Response(PurchaseOrderSerializer(po).data, status=201)
