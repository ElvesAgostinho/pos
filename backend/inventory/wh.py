"""
Centro 09 · Armazém — viewsets e endpoints.
Transferências e Inventários confirmam através do motor de stock (inventory.stock),
garantindo ledger + saldo + custo médio coerentes (fonte única).
"""
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum, F, Count
from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import (
    Warehouse, StockLevel, StockMovement, Item,
    StockLocation, StockLot, StockTransfer, StockTransferLine,
    InventoryCount, InventoryCountLine,
)
from . import stock as stock_engine


def _next(model, field, prefix):
    n = model.objects.count() + 1
    while model.objects.filter(**{field: f'{prefix}{n:05d}'}).exists():
        n += 1
    return f'{prefix}{n:05d}'


# ------------------------- Localizações -------------------------
class StockLocationSerializer(serializers.ModelSerializer):
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    location_type_display = serializers.CharField(source='get_location_type_display', read_only=True)

    class Meta:
        model = StockLocation
        fields = '__all__'


class StockLocationViewSet(viewsets.ModelViewSet):
    serializer_class = StockLocationSerializer

    def get_queryset(self):
        qs = StockLocation.objects.select_related('warehouse').all()
        wh = self.request.query_params.get('warehouse')
        return qs.filter(warehouse_id=wh) if wh else qs


# ------------------------- Lotes / Validades -------------------------
class StockLotSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_code = serializers.CharField(source='item.code', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    days_to_expiry = serializers.SerializerMethodField()

    class Meta:
        model = StockLot
        fields = '__all__'

    def get_days_to_expiry(self, obj):
        if obj.expiry_date:
            return (obj.expiry_date - timezone.localdate()).days
        return None


class StockLotViewSet(viewsets.ModelViewSet):
    serializer_class = StockLotSerializer

    def get_queryset(self):
        qs = StockLot.objects.select_related('item', 'warehouse').all()
        wh = self.request.query_params.get('warehouse')
        expiring = self.request.query_params.get('expiring')
        if wh:
            qs = qs.filter(warehouse_id=wh)
        if expiring == '1':
            qs = qs.filter(expiry_date__isnull=False, expiry_date__lte=timezone.localdate() + timedelta(days=30))
        return qs


# ------------------------- Transferências -------------------------
class StockTransferLineSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_code = serializers.CharField(source='item.code', read_only=True)

    class Meta:
        model = StockTransferLine
        fields = ['id', 'item', 'item_name', 'item_code', 'quantity']


class StockTransferSerializer(serializers.ModelSerializer):
    number = serializers.CharField(required=False)
    lines = StockTransferLineSerializer(many=True, required=False)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    source_name = serializers.CharField(source='source.name', read_only=True)
    destination_name = serializers.CharField(source='destination.name', read_only=True)

    class Meta:
        model = StockTransfer
        fields = '__all__'

    def create(self, validated):
        lines = validated.pop('lines', [])
        if not validated.get('number'):
            validated['number'] = _next(StockTransfer, 'number', 'TRF')
        t = StockTransfer.objects.create(**validated)
        for ln in lines:
            StockTransferLine.objects.create(transfer=t, **ln)
        return t

    def update(self, instance, validated):
        lines = validated.pop('lines', None)
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        if lines is not None:
            instance.lines.all().delete()
            for ln in lines:
                StockTransferLine.objects.create(transfer=instance, **ln)
        return instance


class StockTransferViewSet(viewsets.ModelViewSet):
    serializer_class = StockTransferSerializer

    def get_queryset(self):
        return StockTransfer.objects.select_related('source', 'destination').prefetch_related('lines__item').all()

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        t = self.get_object()
        if t.status == 'CONFIRMED':
            return Response({'detail': 'Transferência já confirmada.'}, status=400)
        if not t.lines.exists():
            return Response({'detail': 'Sem linhas para transferir.'}, status=400)
        with transaction.atomic():
            for ln in t.lines.select_related('item').all():
                stock_engine.transfer(t.source, t.destination, ln.item, ln.quantity,
                                       reference=t.number, by=request.user.get_username())
            t.status = 'CONFIRMED'
            t.confirmed_at = timezone.now()
            t.save(update_fields=['status', 'confirmed_at'])
        return Response(self.get_serializer(t).data)


# ------------------------- Inventários (stocktake) -------------------------
class InventoryCountLineSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_code = serializers.CharField(source='item.code', read_only=True)
    variance = serializers.DecimalField(max_digits=15, decimal_places=4, read_only=True)

    class Meta:
        model = InventoryCountLine
        fields = ['id', 'item', 'item_name', 'item_code', 'system_qty', 'counted_qty', 'variance']


class InventoryCountSerializer(serializers.ModelSerializer):
    number = serializers.CharField(required=False)
    lines = InventoryCountLineSerializer(many=True, required=False)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)

    class Meta:
        model = InventoryCount
        fields = '__all__'

    def create(self, validated):
        lines = validated.pop('lines', [])
        if not validated.get('number'):
            validated['number'] = _next(InventoryCount, 'number', 'INV')
        cnt = InventoryCount.objects.create(**validated)
        for ln in lines:
            # snapshot do saldo do sistema no momento da criação da linha
            if not ln.get('system_qty'):
                lvl = StockLevel.objects.filter(warehouse=cnt.warehouse, item=ln['item']).first()
                ln['system_qty'] = lvl.quantity_on_hand if lvl else Decimal('0')
            InventoryCountLine.objects.create(count=cnt, **ln)
        return cnt

    def update(self, instance, validated):
        lines = validated.pop('lines', None)
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        if lines is not None:
            instance.lines.all().delete()
            for ln in lines:
                if not ln.get('system_qty'):
                    lvl = StockLevel.objects.filter(warehouse=instance.warehouse, item=ln['item']).first()
                    ln['system_qty'] = lvl.quantity_on_hand if lvl else Decimal('0')
                InventoryCountLine.objects.create(count=instance, **ln)
        return instance


class InventoryCountViewSet(viewsets.ModelViewSet):
    serializer_class = InventoryCountSerializer

    def get_queryset(self):
        return InventoryCount.objects.select_related('warehouse').prefetch_related('lines__item').all()

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        cnt = self.get_object()
        if cnt.status == 'CONFIRMED':
            return Response({'detail': 'Inventário já confirmado.'}, status=400)
        adjusted = 0
        with transaction.atomic():
            for ln in cnt.lines.select_related('item').all():
                if ln.variance != 0:
                    stock_engine.adjust(cnt.warehouse, ln.item, ln.counted_qty,
                                        reference=cnt.number, by=request.user.get_username())
                    adjusted += 1
            cnt.status = 'CONFIRMED'
            cnt.confirmed_at = timezone.now()
            cnt.save(update_fields=['status', 'confirmed_at'])
        return Response({**self.get_serializer(cnt).data, 'adjusted_lines': adjusted})


# ------------------------- Dashboard / Valorização -------------------------
class WarehouseDashboardView(APIView):
    """GET /api/inventory/wh/dashboard/ — visão geral do armazém."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        levels = StockLevel.objects.select_related('item', 'warehouse')
        total_value = Decimal('0')
        low_stock = 0
        for lvl in levels:
            cost = lvl.item.current_average_cost or Decimal('0')
            total_value += (lvl.quantity_on_hand or Decimal('0')) * cost
            if lvl.min_stock_alert and lvl.quantity_on_hand is not None and lvl.quantity_on_hand < lvl.min_stock_alert:
                low_stock += 1
        expiring = StockLot.objects.filter(expiry_date__isnull=False,
                                            expiry_date__lte=today + timedelta(days=30), is_active=True).count()
        expired = StockLot.objects.filter(expiry_date__isnull=False, expiry_date__lt=today, is_active=True).count()
        return Response({
            'warehouses': Warehouse.objects.count(),
            'locations': StockLocation.objects.filter(is_active=True).count(),
            'stock_value': float(total_value.quantize(Decimal('0.01'))),
            'skus_in_stock': levels.filter(quantity_on_hand__gt=0).count(),
            'low_stock_alerts': low_stock,
            'movements_today': StockMovement.objects.filter(created_at__date=today).count(),
            'open_transfers': StockTransfer.objects.filter(status='DRAFT').count(),
            'open_counts': InventoryCount.objects.filter(status='DRAFT').count(),
            'lots_expiring_30d': expiring,
            'lots_expired': expired,
        })


class WarehouseCostingView(APIView):
    """GET /api/inventory/wh/costing/ — valorização de stock por armazém (custo médio ponderado)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = []
        for wh in Warehouse.objects.all():
            value = Decimal('0'); qty = Decimal('0'); skus = 0
            for lvl in StockLevel.objects.select_related('item').filter(warehouse=wh):
                on_hand = lvl.quantity_on_hand or Decimal('0')
                if on_hand:
                    skus += 1
                    qty += on_hand
                    value += on_hand * (lvl.item.current_average_cost or Decimal('0'))
            rows.append({'warehouse': wh.name, 'skus': skus, 'total_qty': float(qty),
                         'stock_value': float(value.quantize(Decimal('0.01')))})
        # Top artigos por valor imobilizado
        top = []
        for lvl in StockLevel.objects.select_related('item', 'warehouse').filter(quantity_on_hand__gt=0):
            v = (lvl.quantity_on_hand or Decimal('0')) * (lvl.item.current_average_cost or Decimal('0'))
            top.append({'item': lvl.item.name, 'warehouse': lvl.warehouse.name,
                        'qty': float(lvl.quantity_on_hand or 0), 'value': float(v.quantize(Decimal('0.01')))})
        top.sort(key=lambda x: x['value'], reverse=True)
        return Response({
            'method': 'Custo Médio Ponderado Móvel (FEFO na saída física por validade)',
            'by_warehouse': rows,
            'total_value': round(sum(r['stock_value'] for r in rows), 2),
            'top_items': top[:15],
        })
