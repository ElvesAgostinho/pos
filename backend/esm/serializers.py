from rest_framework import serializers
from .models import (
    SupplierCategory, Supplier, SupplierContact, SupplierProductCatalog,
    SupplierContract, SupplierDocument, SupplierQualityControl, SupplierPerformanceProfile
)

class SupplierCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = SupplierCategory
        fields = '__all__'

class SupplierPerformanceProfileSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier.commercial_name', read_only=True)

    class Meta:
        model = SupplierPerformanceProfile
        fields = '__all__'

class SupplierContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupplierContact
        fields = '__all__'

class SupplierProductCatalogSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_code = serializers.CharField(source='item.code', read_only=True)

    class Meta:
        model = SupplierProductCatalog
        fields = '__all__'

class SupplierContractSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier.commercial_name', read_only=True)

    class Meta:
        model = SupplierContract
        fields = '__all__'

class SupplierDocumentSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier.commercial_name', read_only=True)
    document_type_display = serializers.CharField(source='get_document_type_display', read_only=True)

    class Meta:
        model = SupplierDocument
        fields = '__all__'

class SupplierQualityControlSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier.commercial_name', read_only=True)

    class Meta:
        model = SupplierQualityControl
        fields = '__all__'

class SupplierSerializer(serializers.ModelSerializer):
    performance_profile = SupplierPerformanceProfileSerializer(read_only=True)
    categories = SupplierCategorySerializer(many=True, read_only=True)
    category_ids = serializers.PrimaryKeyRelatedField(
        queryset=SupplierCategory.objects.all(),
        source='categories',
        many=True,
        write_only=True,
        required=False
    )
    
    contacts = SupplierContactSerializer(many=True, read_only=True)
    contracts = SupplierContractSerializer(many=True, read_only=True)
    documents = SupplierDocumentSerializer(many=True, read_only=True)
    quality_controls = SupplierQualityControlSerializer(many=True, read_only=True)
    catalog = SupplierProductCatalogSerializer(many=True, read_only=True)
    
    class Meta:
        model = Supplier
        fields = '__all__'
