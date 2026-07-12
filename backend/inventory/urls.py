from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    UnitOfMeasureViewSet, ItemCategoryViewSet, ItemViewSet, WarehouseViewSet,
    PriceListViewSet, PriceListItemViewSet, ItemVariantViewSet, ItemUomViewSet,
    StockLevelViewSet, StockMovementViewSet,
)
from .wh import (
    StockLocationViewSet, StockLotViewSet, StockTransferViewSet, InventoryCountViewSet,
    WarehouseDashboardView, WarehouseCostingView,
)

router = DefaultRouter()
router.register(r'uoms', UnitOfMeasureViewSet, basename='inv-uom')
router.register(r'categories', ItemCategoryViewSet, basename='inv-category')
router.register(r'items', ItemViewSet, basename='inv-item')
router.register(r'warehouses', WarehouseViewSet, basename='inv-warehouse')
router.register(r'price-lists', PriceListViewSet, basename='inv-price-list')
router.register(r'price-list-items', PriceListItemViewSet, basename='inv-price-list-item')
router.register(r'item-variants', ItemVariantViewSet, basename='inv-item-variant')
router.register(r'item-uoms', ItemUomViewSet, basename='inv-item-uom')
router.register(r'stock-levels', StockLevelViewSet, basename='inv-stock-level')
router.register(r'stock-movements', StockMovementViewSet, basename='inv-stock-movement')
# Centro 09 · Armazém
router.register(r'wh/locations', StockLocationViewSet, basename='inv-location')
router.register(r'wh/lots', StockLotViewSet, basename='inv-lot')
router.register(r'wh/transfers', StockTransferViewSet, basename='inv-transfer')
router.register(r'wh/counts', InventoryCountViewSet, basename='inv-count')

urlpatterns = [
    path('wh/dashboard/', WarehouseDashboardView.as_view(), name='wh-dashboard'),
    path('wh/costing/', WarehouseCostingView.as_view(), name='wh-costing'),
    path('', include(router.urls)),
]
