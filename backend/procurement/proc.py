"""Compras — devoluções a fornecedor, dashboard e planeamento de necessidades."""
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import (
    PurchaseOrder, GoodsReceipt, PurchaseRequisition, PurchaseReturn, PurchaseReturnLine,
)


def _next(model, field, prefix):
    n = model.objects.count() + 1
    while model.objects.filter(**{field: f'{prefix}{n:05d}'}).exists():
        n += 1
    return f'{prefix}{n:05d}'


class PurchaseReturnLineSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_code = serializers.CharField(source='item.code', read_only=True)

    class Meta:
        model = PurchaseReturnLine
        fields = ['id', 'item', 'item_name', 'item_code', 'quantity']


class PurchaseReturnSerializer(serializers.ModelSerializer):
    number = serializers.CharField(required=False)
    lines = PurchaseReturnLineSerializer(many=True, required=False)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    supplier_name = serializers.CharField(source='supplier.commercial_name', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)

    class Meta:
        model = PurchaseReturn
        fields = '__all__'

    def create(self, validated):
        lines = validated.pop('lines', [])
        if not validated.get('number'):
            validated['number'] = _next(PurchaseReturn, 'number', 'DEV')
        r = PurchaseReturn.objects.create(**validated)
        for ln in lines:
            PurchaseReturnLine.objects.create(ret=r, **ln)
        return r

    def update(self, instance, validated):
        lines = validated.pop('lines', None)
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        if lines is not None:
            instance.lines.all().delete()
            for ln in lines:
                PurchaseReturnLine.objects.create(ret=instance, **ln)
        return instance


class PurchaseReturnViewSet(viewsets.ModelViewSet):
    serializer_class = PurchaseReturnSerializer

    def get_queryset(self):
        return PurchaseReturn.objects.select_related('supplier', 'warehouse').prefetch_related('lines__item').all()

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        r = self.get_object()
        if r.status == 'CONFIRMED':
            return Response({'detail': 'Devolução já confirmada.'}, status=400)
        if not r.lines.exists():
            return Response({'detail': 'Sem linhas para devolver.'}, status=400)
        from inventory import stock as se
        with transaction.atomic():
            for ln in r.lines.select_related('item').all():
                se.move_out(r.warehouse, ln.item, ln.quantity, reference=r.number,
                            note='Devolução a fornecedor', by=request.user.get_username(), mtype='OUT')
            r.status = 'CONFIRMED'
            r.confirmed_at = timezone.now()
            r.save(update_fields=['status', 'confirmed_at'])
        return Response(self.get_serializer(r).data)


class ProcurementDashboardView(APIView):
    """GET /api/procurement/dashboard/ — visão geral das compras."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        def by_status(qs, field='status'):
            from django.db.models import Count
            return {r[field]: r['n'] for r in qs.values(field).annotate(n=Count('id'))}
        return Response({
            'requisitions': by_status(PurchaseRequisition.objects.all()),
            'purchase_orders': by_status(PurchaseOrder.objects.all()),
            'goods_receipts': GoodsReceipt.objects.count(),
            'returns': by_status(PurchaseReturn.objects.all()),
            'pending_approval': PurchaseOrder.objects.filter(status='Pending_Approval').count(),
        })


class ProcurementPlanningView(APIView):
    """GET /api/procurement/planning/ — sugestões de reposição (artigos abaixo do mínimo)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = []
        try:
            from inventory.models import StockLevel
            for lvl in StockLevel.objects.select_related('item', 'warehouse').filter(min_stock_alert__gt=0):
                on_hand = lvl.quantity_on_hand or Decimal('0')
                if on_hand < (lvl.min_stock_alert or 0):
                    suggested = (lvl.max_stock_capacity or lvl.min_stock_alert) - on_hand
                    rows.append({
                        'item': lvl.item.name, 'code': lvl.item.code, 'warehouse': lvl.warehouse.name,
                        'on_hand': float(on_hand), 'min': float(lvl.min_stock_alert or 0),
                        'suggested_qty': float(max(suggested, Decimal('0'))),
                        'est_cost': float((lvl.item.current_average_cost or 0) * max(suggested, Decimal('0'))),
                    })
        except Exception:
            pass
        rows.sort(key=lambda x: x['on_hand'])
        return Response({'suggestions': rows, 'count': len(rows),
                         'total_est_cost': round(sum(r['est_cost'] for r in rows), 2)})
