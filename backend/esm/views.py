from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import (
    SupplierCategory, Supplier, SupplierContact, SupplierProductCatalog,
    SupplierContract, SupplierDocument, SupplierQualityControl, SupplierPerformanceProfile
)
from .serializers import (
    SupplierCategorySerializer, SupplierSerializer, SupplierContactSerializer,
    SupplierProductCatalogSerializer, SupplierContractSerializer,
    SupplierDocumentSerializer, SupplierQualityControlSerializer,
    SupplierPerformanceProfileSerializer
)

class SupplierCategoryViewSet(viewsets.ModelViewSet):
    queryset = SupplierCategory.objects.all()
    serializer_class = SupplierCategorySerializer
    # permission_classes = [IsAuthenticated] # To be enabled in prod

class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer

class SupplierContactViewSet(viewsets.ModelViewSet):
    queryset = SupplierContact.objects.all()
    serializer_class = SupplierContactSerializer

class SupplierProductCatalogViewSet(viewsets.ModelViewSet):
    queryset = SupplierProductCatalog.objects.all()
    serializer_class = SupplierProductCatalogSerializer

class SupplierContractViewSet(viewsets.ModelViewSet):
    queryset = SupplierContract.objects.all()
    serializer_class = SupplierContractSerializer

class SupplierDocumentViewSet(viewsets.ModelViewSet):
    queryset = SupplierDocument.objects.all()
    serializer_class = SupplierDocumentSerializer

class SupplierQualityControlViewSet(viewsets.ModelViewSet):
    queryset = SupplierQualityControl.objects.all()
    serializer_class = SupplierQualityControlSerializer

class SupplierPerformanceProfileViewSet(viewsets.ModelViewSet):
    queryset = SupplierPerformanceProfile.objects.all()
    serializer_class = SupplierPerformanceProfileSerializer
