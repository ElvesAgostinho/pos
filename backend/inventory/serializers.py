from rest_framework import serializers
from .models import (
    UnitOfMeasure, ItemCategory, Item, Warehouse, PriceList, PriceListItem,
    ItemVariant, ItemUom, StockLevel, StockMovement,
)


class UnitOfMeasureSerializer(serializers.ModelSerializer):
    class Meta:
        model = UnitOfMeasure
        fields = '__all__'


class ItemCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ItemCategory
        fields = '__all__'


class ItemSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True, default=None)
    base_uom_code = serializers.CharField(source='base_uom.code', read_only=True)
    item_type_display = serializers.CharField(source='get_item_type_display', read_only=True)
    brand_name = serializers.CharField(source='brand.name', read_only=True, default=None)
    margin_percentage = serializers.DecimalField(max_digits=8, decimal_places=2, read_only=True)

    class Meta:
        model = Item
        fields = '__all__'


class PriceListItemSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_code = serializers.CharField(source='item.code', read_only=True)

    class Meta:
        model = PriceListItem
        fields = ['id', 'price_list', 'item', 'item_name', 'item_code', 'price']


class PriceListSerializer(serializers.ModelSerializer):
    items = PriceListItemSerializer(many=True, read_only=True)
    item_count = serializers.IntegerField(source='items.count', read_only=True)

    class Meta:
        model = PriceList
        fields = '__all__'


class ItemVariantSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    effective_price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = ItemVariant
        fields = '__all__'


class ItemUomSerializer(serializers.ModelSerializer):
    uom_code = serializers.CharField(source='uom.code', read_only=True)
    base_uom_code = serializers.CharField(source='item.base_uom.code', read_only=True)
    role_display = serializers.CharField(source='get_role_display', read_only=True)

    class Meta:
        model = ItemUom
        fields = '__all__'


class StockLevelSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_code = serializers.CharField(source='item.code', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    uom_code = serializers.CharField(source='item.base_uom.code', read_only=True)
    available_quantity = serializers.DecimalField(max_digits=15, decimal_places=4, read_only=True)
    unit_cost = serializers.DecimalField(source='item.current_average_cost', max_digits=14, decimal_places=4, read_only=True)

    class Meta:
        model = StockLevel
        fields = ['id', 'warehouse', 'warehouse_name', 'item', 'item_code', 'item_name', 'uom_code',
                  'quantity_on_hand', 'quantity_reserved', 'available_quantity', 'unit_cost',
                  'min_stock_alert', 'max_stock_capacity', 'last_updated']


class StockMovementSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_code = serializers.CharField(source='item.code', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    movement_type_display = serializers.CharField(source='get_movement_type_display', read_only=True)

    class Meta:
        model = StockMovement
        fields = '__all__'


class WarehouseSerializer(serializers.ModelSerializer):
    hotel_name = serializers.CharField(source='hotel.name', read_only=True)

    class Meta:
        model = Warehouse
        fields = '__all__'
