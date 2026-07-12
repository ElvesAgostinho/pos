from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AccountViewSet, JournalViewSet, FiscalPeriodViewSet, JournalEntryViewSet
from .reports import (
    TrialBalanceView, LedgerView, IncomeStatementView, BalanceSheetView, AccountingDashboardView,
)
from .integration import AutoPostView, AccountMappingView
from .closing import CloseResultsView

router = DefaultRouter()
router.register(r'accounts', AccountViewSet, basename='acc-account')
router.register(r'journals', JournalViewSet, basename='acc-journal')
router.register(r'periods', FiscalPeriodViewSet, basename='acc-period')
router.register(r'entries', JournalEntryViewSet, basename='acc-entry')

urlpatterns = [
    path('dashboard/', AccountingDashboardView.as_view(), name='acc-dashboard'),
    path('trial-balance/', TrialBalanceView.as_view(), name='acc-trial-balance'),
    path('ledger/', LedgerView.as_view(), name='acc-ledger'),
    path('income-statement/', IncomeStatementView.as_view(), name='acc-income-statement'),
    path('balance-sheet/', BalanceSheetView.as_view(), name='acc-balance-sheet'),
    path('auto-post/', AutoPostView.as_view(), name='acc-auto-post'),
    path('mapping/', AccountMappingView.as_view(), name='acc-mapping'),
    path('close-results/', CloseResultsView.as_view(), name='acc-close-results'),
    path('', include(router.urls)),
]
