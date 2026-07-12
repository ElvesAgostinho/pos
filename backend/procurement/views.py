from django.db.models import Sum
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import PurchaseOrder, PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine
from .serializers import (
    PurchaseOrderSerializer, PurchaseOrderLineSerializer,
    GoodsReceiptSerializer, GoodsReceiptLineSerializer,
)


def _recompute_po_total(po_id):
    try:
        po = PurchaseOrder.objects.get(id=po_id)
    except PurchaseOrder.DoesNotExist:
        return
    po.total_amount = po.lines.aggregate(t=Sum('line_total'))['t'] or 0
    po.save(update_fields=['total_amount', 'updated_at'])


class PurchaseOrderViewSet(viewsets.ModelViewSet):
    serializer_class = PurchaseOrderSerializer

    def get_queryset(self):
        qs = (
            PurchaseOrder.objects
            .select_related('supplier', 'delivery_warehouse', 'hotel')
            .prefetch_related('lines__item', 'lines__uom')
            .order_by('-created_at')
        )
        status_param = self.request.query_params.get('status')
        supplier = self.request.query_params.get('supplier')
        if status_param:
            qs = qs.filter(status=status_param)
        if supplier:
            qs = qs.filter(supplier_id=supplier)
        return qs

    def perform_create(self, serializer):
        # Deriva o hotel do armazém de entrega se não for enviado.
        data = serializer.validated_data
        if not data.get('hotel') and data.get('delivery_warehouse'):
            serializer.save(hotel=data['delivery_warehouse'].hotel)
        else:
            serializer.save()

    @action(detail=True, methods=['post'])
    def set_status(self, request, pk=None):
        po = self.get_object()
        new_status = request.data.get('status')
        if new_status not in dict(PurchaseOrder.STATUS_CHOICES):
            return Response({'detail': 'Estado inválido.'}, status=status.HTTP_400_BAD_REQUEST)
        po.status = new_status
        po.save(update_fields=['status', 'updated_at'])
        return Response(self.get_serializer(po).data)


class PurchaseOrderLineViewSet(viewsets.ModelViewSet):
    serializer_class = PurchaseOrderLineSerializer

    def get_queryset(self):
        qs = PurchaseOrderLine.objects.select_related('item', 'uom').all()
        po = self.request.query_params.get('purchase_order')
        return qs.filter(purchase_order_id=po) if po else qs

    def perform_create(self, serializer):
        line = serializer.save()
        _recompute_po_total(line.purchase_order_id)

    def perform_update(self, serializer):
        line = serializer.save()
        _recompute_po_total(line.purchase_order_id)

    def perform_destroy(self, instance):
        po_id = instance.purchase_order_id
        instance.delete()
        _recompute_po_total(po_id)


class GoodsReceiptViewSet(viewsets.ModelViewSet):
    serializer_class = GoodsReceiptSerializer

    def get_queryset(self):
        qs = (
            GoodsReceipt.objects
            .select_related('supplier', 'delivery_warehouse', 'purchase_order')
            .prefetch_related('lines__item', 'lines__uom')
            .order_by('-created_at')
        )
        po = self.request.query_params.get('purchase_order')
        return qs.filter(purchase_order_id=po) if po else qs

    def perform_create(self, serializer):
        data = serializer.validated_data
        po = data.get('purchase_order')
        extra = {}
        if po:
            if not data.get('supplier'):
                extra['supplier'] = po.supplier
            if not data.get('delivery_warehouse'):
                extra['delivery_warehouse'] = po.delivery_warehouse
        serializer.save(**extra)

    @action(detail=True, methods=['post'])
    def validate_receipt(self, request, pk=None):
        """
        Valida a receção (estado 'Validated'): ENTRA EM STOCK cada linha no armazém de entrega
        e atualiza o CUSTO MÉDIO PONDERADO do artigo. Dispara também o signal do SRM (performance
        do fornecedor). Idempotente — só valida/entra em stock uma vez.
        """
        from inventory import stock as stock_engine
        grn = self.get_object()
        if grn.status == 'Validated':
            return Response({'detail': 'Receção já validada.'}, status=status.HTTP_400_BAD_REQUEST)
        for line in grn.lines.select_related('item').all():
            stock_engine.move_in(
                grn.delivery_warehouse, line.item, line.quantity_received, line.unit_cost,
                reference=grn.receipt_number, note=f'Receção {grn.receipt_number}',
                by=(request.user.username if request.user.is_authenticated else None), mtype='GRN')
        grn.status = 'Validated'
        grn.save()  # save completo dispara o post_save do SRM
        # Contas a Pagar: cria a fatura de fornecedor (conta corrente) a partir da receção.
        try:
            from finance.models import SupplierInvoice
            from django.utils import timezone
            from decimal import Decimal
            if not SupplierInvoice.objects.filter(grn_ref=grn.receipt_number).exists():
                total = sum((l.quantity_received * l.unit_cost for l in grn.lines.all()), Decimal('0'))
                n = SupplierInvoice.objects.count() + 1
                SupplierInvoice.objects.create(
                    number=f'FF-{n:06d}', supplier_name=grn.supplier.commercial_name,
                    supplier_id_ref=grn.supplier_id, supplier_ref=grn.supplier_invoice_ref,
                    grn_ref=grn.receipt_number, date=timezone.localdate(), amount=total, status='OPEN')
        except Exception:
            pass
        return Response(self.get_serializer(grn).data)


class GoodsReceiptLineViewSet(viewsets.ModelViewSet):
    serializer_class = GoodsReceiptLineSerializer

    def get_queryset(self):
        qs = GoodsReceiptLine.objects.select_related('item', 'uom').all()
        grn = self.request.query_params.get('goods_receipt')
        return qs.filter(goods_receipt_id=grn) if grn else qs
