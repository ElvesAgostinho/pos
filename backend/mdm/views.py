from rest_framework import viewsets
from .models import Brand, PaymentMethod, DocumentSeries, Currency, Country, Bank, Language, Customer
from .serializers import (
    TaxSerializer, BrandSerializer, PaymentMethodSerializer, DocumentSeriesSerializer,
    CurrencySerializer, CountrySerializer, BankSerializer, LanguageSerializer, CustomerSerializer,
)


class TaxViewSet(viewsets.ModelViewSet):
    """Ver TaxSerializer: uma só fonte de imposto (fiscal.TaxRate)."""
    from fiscal.models import TaxRate as _T
    queryset = _T.objects.all()
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
    """Clientes/hóspedes — o cadastro único (o mesmo que o POS vê por
    `pos/marketing/entities/`).

    `search_fields` NÃO É UM EXTRA. O `SearchFilter` está ligado para toda a API
    (ver DEFAULT_FILTER_BACKENDS), mas um ViewSet que não declara campos ignora
    o `?search=` em silêncio — responde com a lista inteira como se nada tivesse
    sido pedido. Quem chama fica convencido de que procurou.

    Era o caso de quem precisa de encontrar UM hóspede: o Leitor de Documentos e
    a verificação de duplicados descarregavam o cadastro todo e procuravam no
    browser. Com sete fichas ninguém nota; com as de um hotel ao fim de dois anos,
    são megabytes a cada letra escrita, e a recepção fica à espera com o hóspede
    à frente.

    Os campos são os que uma pessoa tem à mão ao balcão: o nome, o número do
    documento que acabou de receber, o e-mail da reserva, o telefone, o NIF da
    empresa que paga, e o código da ficha.
    """
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    search_fields = ['name', 'code', 'id_number', 'email', 'phone', 'tax_id']
    ordering_fields = ['name', 'code', 'created_at']
