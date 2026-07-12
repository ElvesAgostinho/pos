from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import (
    CostCenterViewSet, FinanceAccountViewSet, ReceiptViewSet,
    PaymentVoucherViewSet, InvoiceViewSet, SupplierInvoiceViewSet,
)
from .reconciliation import BankReconciliationViewSet, AccountBalancesView

router = DefaultRouter()
router.register(r'cost-centers', CostCenterViewSet)
router.register(r'accounts', FinanceAccountViewSet)
router.register(r'receipts', ReceiptViewSet)
router.register(r'payments', PaymentVoucherViewSet)
router.register(r'invoices', InvoiceViewSet)
router.register(r'supplier-invoices', SupplierInvoiceViewSet)
router.register(r'reconciliations', BankReconciliationViewSet, basename='fin-reconciliation')

urlpatterns = router.urls + [
    path('account-balances/', AccountBalancesView.as_view(), name='fin-account-balances'),
]
