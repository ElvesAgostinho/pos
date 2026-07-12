from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    PurchaseOrderViewSet, PurchaseOrderLineViewSet,
    GoodsReceiptViewSet, GoodsReceiptLineViewSet,
)
from .flow import RequisitionViewSet, RFQViewSet, SupplierQuoteViewSet
from .proc import PurchaseReturnViewSet, ProcurementDashboardView, ProcurementPlanningView

router = DefaultRouter()
router.register(r'purchase-orders', PurchaseOrderViewSet, basename='po')
router.register(r'po-lines', PurchaseOrderLineViewSet, basename='po-line')
router.register(r'goods-receipts', GoodsReceiptViewSet, basename='grn')
router.register(r'grn-lines', GoodsReceiptLineViewSet, basename='grn-line')
router.register(r'requisitions', RequisitionViewSet, basename='requisition')
router.register(r'rfqs', RFQViewSet, basename='rfq')
router.register(r'quotes', SupplierQuoteViewSet, basename='quote')
router.register(r'returns', PurchaseReturnViewSet, basename='purchase-return')

urlpatterns = [
    path('dashboard/', ProcurementDashboardView.as_view(), name='proc-dashboard'),
    path('planning/', ProcurementPlanningView.as_view(), name='proc-planning'),
    path('', include(router.urls)),
]
