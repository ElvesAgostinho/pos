from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    OutletViewSet, POSProductConfigViewSet, OutletPaymentMethodViewSet,
    CashSessionViewSet, CashMovementViewSet,
    POSTableViewSet, POSTicketViewSet, POSTicketLineViewSet, KDSViewSet, POSDocumentViewSet, POSAuditLogViewSet, PrintJobViewSet,
    POSReservationViewSet, GiftCardViewSet, ServiceDestinationViewSet, POSTableGroupViewSet,
)

router = DefaultRouter()
router.register(r'outlets', OutletViewSet, basename='pos-outlet')
router.register(r'product-configs', POSProductConfigViewSet, basename='pos-product-config')
router.register(r'outlet-payment-methods', OutletPaymentMethodViewSet, basename='pos-outlet-payment')
router.register(r'cash-sessions', CashSessionViewSet, basename='pos-cash-session')
router.register(r'cash-movements', CashMovementViewSet, basename='pos-cash-movement')
router.register(r'tables', POSTableViewSet, basename='pos-table')
router.register(r'tickets', POSTicketViewSet, basename='pos-ticket')
router.register(r'ticket-lines', POSTicketLineViewSet, basename='pos-ticket-line')
router.register(r'kds', KDSViewSet, basename='pos-kds')
router.register(r'documents', POSDocumentViewSet, basename='pos-document')
router.register(r'audit', POSAuditLogViewSet, basename='pos-audit')
router.register(r'print-jobs', PrintJobViewSet, basename='pos-print-job')
router.register(r'reservations', POSReservationViewSet, basename='pos-reservation')
router.register(r'gift-cards', GiftCardViewSet, basename='pos-gift-card')
router.register(r'service-destinations', ServiceDestinationViewSet, basename='pos-service-destination')
router.register(r'table-groups', POSTableGroupViewSet, basename='pos-table-group')

urlpatterns = [
    path('', include(router.urls)),
]
