from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    SupplierCategoryViewSet, SupplierViewSet, SupplierContactViewSet,
    SupplierProductCatalogViewSet, SupplierContractViewSet, SupplierDocumentViewSet,
    SupplierQualityControlViewSet, SupplierPerformanceProfileViewSet
)

router = DefaultRouter()
router.register(r'suppliers', SupplierViewSet, basename='esm-supplier')
router.register(r'categories', SupplierCategoryViewSet, basename='esm-category')
router.register(r'contacts', SupplierContactViewSet, basename='esm-contact')
router.register(r'catalog', SupplierProductCatalogViewSet, basename='esm-catalog')
router.register(r'contracts', SupplierContractViewSet, basename='esm-contract')
router.register(r'documents', SupplierDocumentViewSet, basename='esm-document')
router.register(r'quality-controls', SupplierQualityControlViewSet, basename='esm-quality')
router.register(r'performance', SupplierPerformanceProfileViewSet, basename='esm-performance')

urlpatterns = [
    path('', include(router.urls)),
]
