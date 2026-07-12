from rest_framework import serializers
from .models import (
    Outlet, POSProductConfig, OutletPaymentMethod, CashSession, CashMovement,
    POSTable, POSTicket, POSTicketLine, POSTicketPayment, POSDocument, POSAuditLog, PrintJob,
    POSReservation, POSLineModifier, GiftCard, ServiceDestination,
)


class POSTableGroupSerializer(serializers.ModelSerializer):
    table_ids = serializers.SerializerMethodField()

    class Meta:
        from .models import POSTableGroup
        model = POSTableGroup
        fields = '__all__'

    def get_table_ids(self, obj):
        return list(obj.tables.values_list('id', flat=True))


class ServiceDestinationSerializer(serializers.ModelSerializer):
    dtype_display = serializers.CharField(source='get_dtype_display', read_only=True)
    outlet_name = serializers.CharField(source='outlet.name', read_only=True, default=None)
    label = serializers.CharField(read_only=True)

    class Meta:
        model = ServiceDestination
        fields = '__all__'


class OutletSerializer(serializers.ModelSerializer):
    hotel_name = serializers.CharField(source='hotel.name', read_only=True)
    outlet_type_display = serializers.CharField(source='get_outlet_type_display', read_only=True)
    # Hotel opcional -> deriva do hotel principal se não enviado (single-hotel dev).
    hotel = serializers.PrimaryKeyRelatedField(
        queryset=Outlet._meta.get_field('hotel').related_model.objects.all(), required=False)

    class Meta:
        model = Outlet
        fields = '__all__'


class POSProductConfigSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_code = serializers.CharField(source='item.code', read_only=True)
    item_category = serializers.CharField(source='item.category.name', read_only=True, default=None)
    item_sale_price = serializers.DecimalField(source='item.sale_price', max_digits=12, decimal_places=2, read_only=True)
    item_image = serializers.CharField(source='item.image_url', read_only=True, default=None)
    effective_price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    # Alergénios declarados do artigo — o operador tem de os poder ver na venda.
    allergens = serializers.SerializerMethodField()

    class Meta:
        model = POSProductConfig
        fields = '__all__'

    def get_allergens(self, obj):
        try:
            prof = getattr(obj.item, 'production_profile', None)
            return [a.name for a in prof.allergens.all()] if prof else []
        except Exception:
            return []


class OutletPaymentMethodSerializer(serializers.ModelSerializer):
    payment_method_name = serializers.CharField(source='payment_method.name', read_only=True)
    payment_method_code = serializers.CharField(source='payment_method.code', read_only=True)
    method_type = serializers.CharField(source='payment_method.get_method_type_display', read_only=True)
    method_type_code = serializers.CharField(source='payment_method.method_type', read_only=True)

    class Meta:
        model = OutletPaymentMethod
        fields = '__all__'


class CashMovementSerializer(serializers.ModelSerializer):
    movement_type_display = serializers.CharField(source='get_movement_type_display', read_only=True)

    class Meta:
        model = CashMovement
        fields = '__all__'


class CashSessionSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    outlet_name = serializers.CharField(source='outlet.name', read_only=True, default=None)
    movements = CashMovementSerializer(many=True, read_only=True)
    expected_cash = serializers.SerializerMethodField()

    class Meta:
        model = CashSession
        fields = '__all__'
        read_only_fields = ('status', 'counted_amount', 'expected_amount', 'difference', 'closed_at')

    def get_expected_cash(self, obj):
        """(8005) FECHO CEGO — enquanto a caixa está ABERTA, o operador não vê o valor
        esperado. Se o visse, escrevia-o na contagem e o desvio nunca aparecia.
        Depois de fechada, o valor mostra-se (para a reconciliação do backoffice)."""
        blind = self.context.get('blind_close', True)
        if blind and obj.status == 'OPEN':
            return None
        return str(obj.expected_cash)


class POSTableSerializer(serializers.ModelSerializer):
    outlet_name = serializers.CharField(source='outlet.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    group_name = serializers.CharField(source='group.name', read_only=True, default=None)
    group_ticket = serializers.IntegerField(source='group.ticket_id', read_only=True, default=None)

    class Meta:
        model = POSTable
        fields = '__all__'


class POSLineModifierSerializer(serializers.ModelSerializer):
    class Meta:
        model = POSLineModifier
        fields = ('id', 'name', 'price_delta')


class POSTicketLineSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_code = serializers.CharField(source='item.code', read_only=True)
    modifiers = POSLineModifierSerializer(many=True, read_only=True)
    # Estado da produção (o operador tem de saber quando está PRONTO para servir).
    kds_status_display = serializers.CharField(source='get_kds_status_display', read_only=True)
    allergens = serializers.SerializerMethodField()

    class Meta:
        model = POSTicketLine
        fields = '__all__'
        read_only_fields = ('line_total',)

    def get_allergens(self, obj):
        return _item_allergens(obj.item)


class POSTicketPaymentSerializer(serializers.ModelSerializer):
    payment_method_name = serializers.CharField(source='payment_method.name', read_only=True)

    class Meta:
        model = POSTicketPayment
        fields = '__all__'


class POSTicketSerializer(serializers.ModelSerializer):
    ticket_number = serializers.CharField(required=False)  # gerado no perform_create se ausente
    outlet_name = serializers.CharField(source='outlet.name', read_only=True)
    table_label = serializers.CharField(source='table.table_number', read_only=True, default=None)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    lines = POSTicketLineSerializer(many=True, read_only=True)
    payments = POSTicketPaymentSerializer(many=True, read_only=True)
    paid_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    balance_due = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = POSTicket
        fields = '__all__'
        read_only_fields = ('status', 'subtotal', 'tax_total', 'grand_total', 'closed_at')


def _item_allergens(item):
    """Alergénios declarados de um artigo (production.ItemProductionProfile)."""
    try:
        prof = getattr(item, 'production_profile', None)
        return [a.name for a in prof.allergens.all()] if prof else []
    except Exception:
        return []


class KDSLineSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='description', read_only=True)
    ticket_number = serializers.CharField(source='ticket.ticket_number', read_only=True)
    table_label = serializers.CharField(source='ticket.table.table_number', read_only=True, default=None)
    outlet_name = serializers.CharField(source='ticket.outlet.name', read_only=True)
    kds_status_display = serializers.CharField(source='get_kds_status_display', read_only=True)
    dest_label = serializers.CharField(source='ticket.dest_label', read_only=True, default=None)
    dest_priority = serializers.CharField(source='ticket.dest_priority', read_only=True, default=None)
    delivery_status = serializers.CharField(source='ticket.delivery_status', read_only=True, default=None)
    operator_name = serializers.CharField(source='ticket.operator_name', read_only=True, default=None)
    guests = serializers.IntegerField(source='ticket.guests', read_only=True, default=None)
    customer_name = serializers.CharField(source='ticket.customer_name', read_only=True, default=None)
    # ALERGÉNIOS — informação crítica para a cozinha/bar.
    allergens = serializers.SerializerMethodField()

    class Meta:
        model = POSTicketLine
        fields = ('id', 'ticket', 'ticket_number', 'table_label', 'outlet_name', 'item_name',
                  'description', 'quantity', 'note', 'kds_station', 'kds_status', 'kds_status_display',
                  'fired_at', 'ready_at', 'dest_label', 'dest_priority', 'delivery_status',
                  'operator_name', 'guests', 'customer_name', 'allergens',
                  'is_void', 'void_reason', 'voided_at', 'kds_ack_at')

    def get_allergens(self, obj):
        return _item_allergens(obj.item)


class POSDocumentSerializer(serializers.ModelSerializer):
    document_type_display = serializers.SerializerMethodField()
    series_name = serializers.CharField(source='series.name', read_only=True)
    ticket_number = serializers.CharField(source='ticket.ticket_number', read_only=True, default=None)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = POSDocument
        fields = '__all__'

    def get_document_type_display(self, obj):
        from mdm.models import DOCUMENT_TYPES
        return dict(DOCUMENT_TYPES).get(obj.document_type, obj.document_type)


class POSAuditLogSerializer(serializers.ModelSerializer):
    event_type_display = serializers.CharField(source='get_event_type_display', read_only=True)
    outlet_name = serializers.CharField(source='outlet.name', read_only=True, default=None)

    class Meta:
        model = POSAuditLog
        fields = '__all__'


class PrintJobSerializer(serializers.ModelSerializer):
    job_type_display = serializers.CharField(source='get_job_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = PrintJob
        fields = '__all__'


class POSReservationSerializer(serializers.ModelSerializer):
    outlet_name = serializers.CharField(source='outlet.name', read_only=True)
    table_label = serializers.CharField(source='table.table_number', read_only=True, default=None)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    preference_display = serializers.CharField(source='get_preference_display', read_only=True)

    class Meta:
        model = POSReservation
        fields = '__all__'


class GiftCardSerializer(serializers.ModelSerializer):
    class Meta:
        model = GiftCard
        fields = '__all__'
        read_only_fields = ('balance',)
