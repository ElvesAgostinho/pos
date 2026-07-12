from rest_framework import serializers
from .models import Brand, PaymentMethod, DocumentSeries, Currency, Country, Bank, Language, Customer


class CurrencySerializer(serializers.ModelSerializer):
    class Meta:
        model = Currency
        fields = '__all__'


class CountrySerializer(serializers.ModelSerializer):
    class Meta:
        model = Country
        fields = '__all__'


class BankSerializer(serializers.ModelSerializer):
    class Meta:
        model = Bank
        fields = '__all__'


class LanguageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Language
        fields = '__all__'


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = '__all__'


class TaxSerializer(serializers.ModelSerializer):
    """Alias retrocompatível: /api/mdm/taxes/ serve agora a TAXA REAL do motor fiscal
    (fiscal.TaxRate). Havia dois cadastros de imposto e só um era usado a sério —
    o outro dava a ilusão de estar configurado e não entrava em fatura nenhuma."""
    class Meta:
        from fiscal.models import TaxRate as _T
        model = _T
        fields = ('id', 'code', 'name', 'percentage', 'is_default', 'is_exempt', 'is_active')


class BrandSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brand
        fields = '__all__'


class PaymentMethodSerializer(serializers.ModelSerializer):
    method_type_display = serializers.CharField(source='get_method_type_display', read_only=True)

    class Meta:
        model = PaymentMethod
        fields = '__all__'


class DocumentSeriesSerializer(serializers.ModelSerializer):
    document_type_display = serializers.CharField(source='get_document_type_display', read_only=True)

    class Meta:
        model = DocumentSeries
        fields = '__all__'
