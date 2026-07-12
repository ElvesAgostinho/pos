from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import (
    UnitOfMeasure, ItemCategory, Item, Warehouse, PriceList, PriceListItem,
    ItemVariant, ItemUom, StockLevel, StockMovement,
)
from .serializers import (
    UnitOfMeasureSerializer, ItemCategorySerializer, ItemSerializer, WarehouseSerializer,
    PriceListSerializer, PriceListItemSerializer, ItemVariantSerializer, ItemUomSerializer,
    StockLevelSerializer, StockMovementSerializer,
)
from . import stock as stock_engine


class UnitOfMeasureViewSet(viewsets.ModelViewSet):
    queryset = UnitOfMeasure.objects.all().order_by('code')
    serializer_class = UnitOfMeasureSerializer


class ItemCategoryViewSet(viewsets.ModelViewSet):
    queryset = ItemCategory.objects.all().order_by('name')
    serializer_class = ItemCategorySerializer


class ItemViewSet(viewsets.ModelViewSet):
    serializer_class = ItemSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['code', 'name']
    ordering_fields = ['code', 'name', 'item_type']

    def get_queryset(self):
        qs = Item.objects.select_related('category', 'base_uom').all().order_by('name')
        item_type = self.request.query_params.get('item_type')
        active = self.request.query_params.get('is_active')
        if item_type:
            qs = qs.filter(item_type=item_type)
        if active is not None:
            qs = qs.filter(is_active=active.lower() in ('1', 'true', 'yes'))
        return qs


class WarehouseViewSet(viewsets.ModelViewSet):
    queryset = Warehouse.objects.select_related('hotel').all().order_by('name')
    serializer_class = WarehouseSerializer


class PriceListViewSet(viewsets.ModelViewSet):
    queryset = PriceList.objects.prefetch_related('items__item').all()
    serializer_class = PriceListSerializer

    @action(detail=True, methods=['post'])
    def set_price(self, request, pk=None):
        """Define/atualiza o preço de um artigo nesta tabela."""
        pl = self.get_object()
        item_id = request.data.get('item')
        price = request.data.get('price')
        if not item_id or price in (None, ''):
            return Response({'detail': 'item e price são obrigatórios.'}, status=400)
        pli, _ = PriceListItem.objects.update_or_create(
            price_list=pl, item_id=item_id, defaults={'price': price})
        return Response(PriceListItemSerializer(pli).data)

    @action(detail=True, methods=['post'])
    def remove_item(self, request, pk=None):
        PriceListItem.objects.filter(price_list_id=pk, item_id=request.data.get('item')).delete()
        return Response({'detail': 'Removido.'})


class PriceListItemViewSet(viewsets.ModelViewSet):
    serializer_class = PriceListItemSerializer

    def get_queryset(self):
        qs = PriceListItem.objects.select_related('item', 'price_list').all()
        pl = self.request.query_params.get('price_list')
        return qs.filter(price_list_id=pl) if pl else qs


class ItemVariantViewSet(viewsets.ModelViewSet):
    serializer_class = ItemVariantSerializer

    def get_queryset(self):
        qs = ItemVariant.objects.select_related('item').all().order_by('sort_order')
        item = self.request.query_params.get('item')
        return qs.filter(item_id=item) if item else qs


class ItemUomViewSet(viewsets.ModelViewSet):
    serializer_class = ItemUomSerializer

    def get_queryset(self):
        qs = ItemUom.objects.select_related('item', 'uom', 'item__base_uom').all()
        item = self.request.query_params.get('item')
        return qs.filter(item_id=item) if item else qs


class StockLevelViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = StockLevelSerializer

    def get_queryset(self):
        qs = StockLevel.objects.select_related('item', 'item__base_uom', 'warehouse').all().order_by('item__name')
        wh = self.request.query_params.get('warehouse')
        low = self.request.query_params.get('low')
        if wh:
            qs = qs.filter(warehouse_id=wh)
        if low in ('1', 'true'):
            from django.db.models import F
            qs = qs.filter(quantity_on_hand__lte=F('min_stock_alert'))
        return qs


class StockMovementViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = StockMovementSerializer
    search_fields = ['item__code', 'item__name', 'reference']
    ordering_fields = ['created_at', 'quantity']

    def get_queryset(self):
        qs = StockMovement.objects.select_related('item', 'warehouse').all().order_by('-created_at')
        for f in ('warehouse', 'item', 'movement_type'):
            v = self.request.query_params.get(f)
            if v:
                qs = qs.filter(**{f if f == 'movement_type' else f + '_id': v})
        # Sem ?page devolve os 500 mais recentes (retrocompat); com ?page pagina tudo.
        return qs if ('page' in self.request.query_params or 'page_size' in self.request.query_params) else qs[:500]

    def _wh_item(self, request):
        wh = Warehouse.objects.filter(pk=request.data.get('warehouse')).first()
        item = Item.objects.filter(pk=request.data.get('item')).first()
        return wh, item

    @action(detail=False, methods=['post'])
    def receive(self, request):
        """Entrada manual de stock (com custo)."""
        wh, item = self._wh_item(request)
        if not wh or not item:
            return Response({'detail': 'Armazém e artigo obrigatórios.'}, status=400)
        m = stock_engine.move_in(wh, item, request.data.get('quantity', 0), request.data.get('unit_cost', 0),
                                 reference=request.data.get('reference', 'ENTRADA'), note=request.data.get('note'),
                                 by=request.data.get('by'))
        return Response(StockMovementSerializer(m).data, status=201)

    @action(detail=False, methods=['post'])
    def issue(self, request):
        """Saída manual de stock."""
        wh, item = self._wh_item(request)
        if not wh or not item:
            return Response({'detail': 'Armazém e artigo obrigatórios.'}, status=400)
        m = stock_engine.move_out(wh, item, request.data.get('quantity', 0),
                                  reference=request.data.get('reference', 'SAIDA'), note=request.data.get('note'),
                                  by=request.data.get('by'))
        return Response(StockMovementSerializer(m).data, status=201)

    @action(detail=False, methods=['post'])
    def transfer(self, request):
        """Transferência entre armazéns."""
        src = Warehouse.objects.filter(pk=request.data.get('source')).first()
        dst = Warehouse.objects.filter(pk=request.data.get('dest')).first()
        item = Item.objects.filter(pk=request.data.get('item')).first()
        if not (src and dst and item):
            return Response({'detail': 'Origem, destino e artigo obrigatórios.'}, status=400)
        stock_engine.transfer(src, dst, item, request.data.get('quantity', 0),
                              reference=request.data.get('reference', 'TRANSF'), by=request.data.get('by'))
        return Response({'detail': 'Transferência efetuada.'}, status=201)

    @action(detail=False, methods=['post'])
    def adjust(self, request):
        """Ajuste de inventário (define a quantidade contada)."""
        wh, item = self._wh_item(request)
        if not wh or not item:
            return Response({'detail': 'Armazém e artigo obrigatórios.'}, status=400)
        m = stock_engine.adjust(wh, item, request.data.get('counted', 0),
                                reference=request.data.get('reference', 'INVENT'), by=request.data.get('by'))
        return Response(StockMovementSerializer(m).data, status=201)
