from rest_framework import viewsets
from .models import Tax, Brand, PaymentMethod, DocumentSeries, Currency, Country, Bank, Language, Customer
from .serializers import (
    TaxSerializer, BrandSerializer, PaymentMethodSerializer, DocumentSeriesSerializer,
    CurrencySerializer, CountrySerializer, BankSerializer, LanguageSerializer, CustomerSerializer,
)


class TaxViewSet(viewsets.ModelViewSet):
    queryset = Tax.objects.all()
    serializer_class = TaxSerializer


class BrandViewSet(viewsets.ModelViewSet):
    queryset = Brand.objects.all()
    serializer_class = BrandSerializer


class PaymentMethodViewSet(viewsets.ModelViewSet):
    queryset = PaymentMethod.objects.all()
    serializer_class = PaymentMethodSerializer


class DocumentSeriesViewSet(viewsets.ModelViewSet):
    queryset = DocumentSeries.objects.all()
    serializer_class = DocumentSeriesSerializer


class CurrencyViewSet(viewsets.ModelViewSet):
    queryset = Currency.objects.all()
    serializer_class = CurrencySerializer


class CountryViewSet(viewsets.ModelViewSet):
    queryset = Country.objects.all()
    serializer_class = CountrySerializer


class BankViewSet(viewsets.ModelViewSet):
    queryset = Bank.objects.all()
    serializer_class = BankSerializer


class LanguageViewSet(viewsets.ModelViewSet):
    queryset = Language.objects.all()
    serializer_class = LanguageSerializer


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
