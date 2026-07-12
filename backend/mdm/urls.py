from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    TaxViewSet, BrandViewSet, PaymentMethodViewSet, DocumentSeriesViewSet,
    CurrencyViewSet, CountryViewSet, BankViewSet, LanguageViewSet, CustomerViewSet,
)

router = DefaultRouter()
router.register(r'taxes', TaxViewSet, basename='mdm-tax')
router.register(r'brands', BrandViewSet, basename='mdm-brand')
router.register(r'payment-methods', PaymentMethodViewSet, basename='mdm-payment-method')
router.register(r'document-series', DocumentSeriesViewSet, basename='mdm-document-series')
router.register(r'currencies', CurrencyViewSet, basename='mdm-currency')
router.register(r'countries', CountryViewSet, basename='mdm-country')
router.register(r'banks', BankViewSet, basename='mdm-bank')
router.register(r'languages', LanguageViewSet, basename='mdm-language')
router.register(r'customers', CustomerViewSet, basename='mdm-customer')

urlpatterns = [
    path('', include(router.urls)),
]
