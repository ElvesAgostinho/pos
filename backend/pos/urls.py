from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    OutletViewSet, POSProductConfigViewSet, OutletPaymentMethodViewSet,
    CashSessionViewSet, CashMovementViewSet,
    POSTableViewSet, POSTicketViewSet, POSTicketLineViewSet, KDSViewSet, POSDocumentViewSet, POSAuditLogViewSet, PrintJobViewSet,
    POSReservationViewSet, GiftCardViewSet, ServiceDestinationViewSet, POSTableGroupViewSet,
)

from .config_api import (PosModuleViewSet, PosTerminalViewSet, PosParameterViewSet,
                         PosSectorViewSet, GlobalParamsView, PosKeyboardViewSet,
                         TimeBandViewSet, PosScheduleViewSet, PosUserGroupViewSet,
                         PosUserViewSet, HRTypeViewSet, HumanResourceViewSet,
                         PosCurrencyViewSet, PosDiscountViewSet, PosTaxViewSet,
                         ExemptionViewSet, PosPaymentMethodViewSet, DocumentSeriesViewSet,
                         AnalyticAccountViewSet, PmsHotelLinkViewSet,
                         PmsExternalLinkViewSet, PmsMappingView,
                         StockErpLinkViewSet, UomViewSet, HappyHourViewSet, VoidReasonViewSet,
                         PosHardwareViewSet, KdsMonitorViewSet, SmartCashViewSet,
                         CustomerTypeViewSet, CustomFieldViewSet, CardTypeViewSet,
                         MemberCardViewSet)

router = DefaultRouter()
router.register(r'config/modules', PosModuleViewSet, basename='pos-cfg-module')
router.register(r'config/terminals', PosTerminalViewSet, basename='pos-cfg-terminal')
router.register(r'config/parameters', PosParameterViewSet, basename='pos-cfg-param')
router.register(r'config/sectors', PosSectorViewSet, basename='pos-cfg-sector')
router.register(r'config/keyboards', PosKeyboardViewSet, basename='pos-cfg-keyboard')
router.register(r'config/time-bands', TimeBandViewSet, basename='pos-cfg-band')
router.register(r'config/schedules', PosScheduleViewSet, basename='pos-cfg-schedule')
router.register(r'config/user-groups', PosUserGroupViewSet, basename='pos-cfg-usergroup')
router.register(r'config/users', PosUserViewSet, basename='pos-cfg-user')
router.register(r'config/hr-types', HRTypeViewSet, basename='pos-cfg-hrtype')
router.register(r'config/human-resources', HumanResourceViewSet, basename='pos-cfg-hr')
router.register(r'config/currencies', PosCurrencyViewSet, basename='pos-cfg-currency')
router.register(r'config/discounts', PosDiscountViewSet, basename='pos-cfg-discount')
router.register(r'config/taxes', PosTaxViewSet, basename='pos-cfg-tax')
router.register(r'config/exemptions', ExemptionViewSet, basename='pos-cfg-exemption')
router.register(r'config/payment-methods', PosPaymentMethodViewSet, basename='pos-cfg-paymethod')
router.register(r'config/documents', DocumentSeriesViewSet, basename='pos-cfg-document')
router.register(r'config/analytic-accounts', AnalyticAccountViewSet, basename='pos-cfg-analytic')
router.register(r'config/pms-hotels', PmsHotelLinkViewSet, basename='pos-cfg-pmshotel')
router.register(r'config/pms-external', PmsExternalLinkViewSet, basename='pos-cfg-pmsext')
router.register(r'config/stock-erp', StockErpLinkViewSet, basename='pos-cfg-stockerp')
router.register(r'config/uoms', UomViewSet, basename='pos-cfg-uom')
router.register(r'config/happy-hours', HappyHourViewSet, basename='pos-cfg-happy')
router.register(r'config/void-reasons', VoidReasonViewSet, basename='pos-cfg-voidreason')
router.register(r'config/hardware', PosHardwareViewSet, basename='pos-cfg-hardware')
router.register(r'config/kds-monitors', KdsMonitorViewSet, basename='pos-cfg-kds')
router.register(r'config/smart-cash', SmartCashViewSet, basename='pos-cfg-smartcash')
router.register(r'config/customer-types', CustomerTypeViewSet, basename='pos-cfg-custtype')
router.register(r'config/custom-fields', CustomFieldViewSet, basename='pos-cfg-customfield')
router.register(r'config/card-types', CardTypeViewSet, basename='pos-cfg-cardtype')
router.register(r'config/member-cards', MemberCardViewSet, basename='pos-cfg-membercard')
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
    path('config/params/', GlobalParamsView.as_view()),
    path('config/pms-mappings/', PmsMappingView.as_view()),
    path('', include(router.urls)),
]
