from rest_framework import serializers
from .models import CostCenter, FinanceAccount, Receipt, PaymentVoucher, Invoice, InvoiceLine, SupplierInvoice


class CostCenterSerializer(serializers.ModelSerializer):
    hotel = serializers.PrimaryKeyRelatedField(queryset=CostCenter._meta.get_field('hotel').related_model.objects.all(), required=False)

    class Meta:
        model = CostCenter
        fields = '__all__'
        validators = []  # evita exigir 'hotel' (default no viewset)


class FinanceAccountSerializer(serializers.ModelSerializer):
    hotel = serializers.PrimaryKeyRelatedField(queryset=FinanceAccount._meta.get_field('hotel').related_model.objects.all(), required=False)
    balance = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    account_type_display = serializers.CharField(source='get_account_type_display', read_only=True)

    class Meta:
        model = FinanceAccount
        fields = '__all__'
        validators = []  # evita o UniqueTogetherValidator que exigiria 'hotel' (default no viewset)


def _valor_tem_de_ser_positivo(valor):
    """Um movimento de tesouraria é dinheiro a mexer — zero ou negativo não é.

    O ZERO é um documento sem conteúdo: suja o extrato e a conta corrente do
    cliente sem mexer num kwanza.

    O NEGATIVO é pior, e foi encontrado a passar: um RECEBIMENTO de −50.000
    TIRAVA dinheiro da caixa (o saldo é «fundo + recebido − pago»), mas entrava
    pela porta dos recebimentos, que não tem controlo de saldo nenhum. Era a
    maneira de fazer sair dinheiro da caixa sem deixar um pagamento no extrato.
    Do outro lado, um PAGAMENTO negativo criava dinheiro do nada e passava ao
    lado do controlo de saldo — «−50.000 > saldo» nunca é verdade.
    """
    if valor is None:
        return
    if valor <= 0:
        raise serializers.ValidationError(
            'O valor tem de ser maior que zero. Para corrigir um movimento errado, '
            'anule-o (botão "Anular") em vez de lançar um valor negativo.')


class ReceiptSerializer(serializers.ModelSerializer):
    number = serializers.CharField(required=False)
    account_name = serializers.CharField(source='account.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Receipt
        fields = '__all__'

    def validate_amount(self, value):
        _valor_tem_de_ser_positivo(value)
        return value


class PaymentVoucherSerializer(serializers.ModelSerializer):
    number = serializers.CharField(required=False)
    account_name = serializers.CharField(source='account.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = PaymentVoucher
        fields = '__all__'

    def validate_amount(self, value):
        _valor_tem_de_ser_positivo(value)
        return value


class SupplierInvoiceSerializer(serializers.ModelSerializer):
    number = serializers.CharField(required=False)
    paid_amount = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    balance = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    net_amount = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = SupplierInvoice
        fields = '__all__'


class InvoiceLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceLine
        fields = ['id', 'description', 'quantity', 'unit_price', 'tax_percentage', 'line_total']
        read_only_fields = ['line_total']


class InvoiceSerializer(serializers.ModelSerializer):
    number = serializers.CharField(required=False)
    hotel = serializers.PrimaryKeyRelatedField(queryset=Invoice._meta.get_field('hotel').related_model.objects.all(), required=False)
    lines = InvoiceLineSerializer(many=True, required=False)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    paid_amount = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    balance = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)

    class Meta:
        model = Invoice
        fields = '__all__'

    def create(self, validated_data):
        lines = validated_data.pop('lines', [])
        invoice = Invoice.objects.create(**validated_data)
        for l in lines:
            InvoiceLine.objects.create(invoice=invoice, **l)
        invoice.recompute()
        return invoice

    def update(self, instance, validated_data):
        lines = validated_data.pop('lines', None)
        for k, v in validated_data.items():
            setattr(instance, k, v)
        instance.save()
        if lines is not None:
            instance.lines.all().delete()
            for l in lines:
                InvoiceLine.objects.create(invoice=instance, **l)
        instance.recompute()
        return instance
