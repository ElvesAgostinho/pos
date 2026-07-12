from rest_framework import serializers
from .models import PurchaseOrder, PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine


class PurchaseOrderLineSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_code = serializers.CharField(source='item.code', read_only=True)
    uom_code = serializers.CharField(source='uom.code', read_only=True)

    class Meta:
        model = PurchaseOrderLine
        fields = '__all__'
        read_only_fields = ('line_total',)


class PurchaseOrderSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier.commercial_name', read_only=True)
    warehouse_name = serializers.CharField(source='delivery_warehouse.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    lines = PurchaseOrderLineSerializer(many=True, read_only=True)
    # Hotel derivado do armazém de entrega quando não enviado (single-hotel dev).
    hotel = serializers.PrimaryKeyRelatedField(
        queryset=PurchaseOrder._meta.get_field('hotel').related_model.objects.all(), required=False
    )

    class Meta:
        model = PurchaseOrder
        fields = '__all__'
        read_only_fields = ('total_amount',)


class GoodsReceiptLineSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_code = serializers.CharField(source='item.code', read_only=True)
    uom_code = serializers.CharField(source='uom.code', read_only=True)

    class Meta:
        model = GoodsReceiptLine
        fields = '__all__'


class GoodsReceiptSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier.commercial_name', read_only=True)
    warehouse_name = serializers.CharField(source='delivery_warehouse.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    po_number = serializers.CharField(source='purchase_order.po_number', read_only=True, default=None)
    lines = GoodsReceiptLineSerializer(many=True, read_only=True)
    # Herdados da PO em perform_create quando a receção é feita contra uma ordem.
    supplier = serializers.PrimaryKeyRelatedField(
        queryset=GoodsReceipt._meta.get_field('supplier').related_model.objects.all(), required=False)
    delivery_warehouse = serializers.PrimaryKeyRelatedField(
        queryset=GoodsReceipt._meta.get_field('delivery_warehouse').related_model.objects.all(), required=False)

    class Meta:
        model = GoodsReceipt
        fields = '__all__'

    def validate(self, attrs):
        # Sem PO, fornecedor e armazém passam a ser obrigatórios (receção direta).
        if not attrs.get('purchase_order'):
            missing = [f for f in ('supplier', 'delivery_warehouse') if not attrs.get(f)]
            if missing:
                raise serializers.ValidationError(
                    {m: 'Obrigatório numa receção sem Ordem de Compra.' for m in missing})
        return attrs
