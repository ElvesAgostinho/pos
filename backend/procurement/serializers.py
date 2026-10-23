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
    # O NÚMERO DA ENCOMENDA é atribuído pelo sistema (OC-000001), como em todos os
    # outros documentos da casa: requisições (REQ-), devoluções (DEV-), recibos
    # (REC-), faturas (FT-). Era o único que obrigava o comprador a inventar o
    # número à mão — e, sendo único na base de dados, repetir um número sem saber
    # dava "erro" num ecrã que só queria gravar uma encomenda.
    po_number = serializers.CharField(required=False)
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

    def validate(self, attrs):
        """Uma receção VALIDADA está fechada: as suas linhas já entraram em stock.

        Uma linha acrescentada (ou alterada) depois da validação nunca entra em
        stock: o documento passa a dizer que chegaram 150 garrafas, o armazém tem
        100, e a fatura do fornecedor foi criada com o valor antigo. Para corrigir
        uma receção já validada, anula-se (botão "Anular") e faz-se outra.
        """
        grn = attrs.get('goods_receipt') or getattr(self.instance, 'goods_receipt', None)
        if grn is not None and grn.status == 'Validated':
            raise serializers.ValidationError(
                f'A receção {grn.receipt_number} já foi validada e a mercadoria já entrou em '
                f'stock — as linhas não podem ser alteradas. Anule a receção e faça outra.')
        return attrs


class GoodsReceiptSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier.commercial_name', read_only=True)
    warehouse_name = serializers.CharField(source='delivery_warehouse.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    po_number = serializers.CharField(source='purchase_order.po_number', read_only=True, default=None)
    lines = GoodsReceiptLineSerializer(many=True, read_only=True)
    # Numeração automática (GRN-000001) — ver a nota em PurchaseOrderSerializer.
    receipt_number = serializers.CharField(required=False)
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
        if not attrs.get('purchase_order') and self.instance is None:
            missing = [f for f in ('supplier', 'delivery_warehouse') if not attrs.get(f)]
            if missing:
                raise serializers.ValidationError(
                    {m: 'Obrigatório numa receção sem Ordem de Compra.' for m in missing})

        # UMA RECEÇÃO VALIDADA NÃO SE REABRE. Era o caminho por onde o stock se
        # duplicava sem ninguém notar: a mercadoria já tinha entrado, um PATCH do
        # ecrã de edição punha o estado de novo em "Em Conferência", e a validação
        # deixava de estar bloqueada — a mesma entrega entrava uma segunda vez.
        # Ficavam 200 garrafas no sistema, 100 na prateleira, e o custo médio
        # calculado sobre o dobro da quantidade.
        if self.instance is not None and self.instance.status == 'Validated':
            mexidos = [c for c in attrs if c not in ('supplier_invoice_ref',)]
            if mexidos:
                raise serializers.ValidationError(
                    f'A receção {self.instance.receipt_number} já está validada e a mercadoria '
                    f'já entrou em stock. Para a corrigir, use "Anular" — reabri-la faria a '
                    f'mesma mercadoria entrar duas vezes.')
        return attrs
