"""
FICHA DO HOTEL — o formulário onde se preenche tudo o que identifica a propriedade.

Junta num só sítio o que estava disperso (e sem interface nenhuma):
  - identificação e contactos da propriedade  → identity.Hotel
  - dados legais/fiscais que saem na fatura   → fiscal.FiscalConfig (fonte única)
  - estado da certificação AGT                → só leitura (pertence ao software)

E — o mais importante num sistema enterprise — diz ao utilizador **o que falta e porquê
isso lhe faz falta**: "sem NIF, as suas faturas saem sem contribuinte". Um formulário
que só mostra campos vazios não ajuda ninguém.
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from core.tenancy import default_hotel_id
from .models import Hotel

HOTEL_FIELDS = [
    'name', 'location', 'stars', 'hotel_type', 'opened_year',
    'address', 'city', 'province', 'country', 'phone', 'email', 'website',
    'check_in_time', 'check_out_time', 'currency', 'timezone',
]
FISCAL_FIELDS = [
    'company_name', 'trade_name', 'company_nif', 'tax_regime', 'vat_regime', 'tax_office',
    'address_line', 'city', 'province', 'phone', 'fax', 'email',
    'share_capital', 'crc_number', 'logo_url', 'generic_customer_nif', 'qr_enabled',
]

# O que é obrigatório, e a consequência REAL de estar em falta.
REQUIRED = [
    ('fiscal', 'company_nif', 'NIF da empresa', 'As faturas saem sem contribuinte — a AGT não as aceita.'),
    ('fiscal', 'company_name', 'Nome legal da empresa', 'É o nome que sai no cabeçalho da fatura.'),
    ('fiscal', 'address_line', 'Morada fiscal', 'Obrigatória na fatura e no SAF-T.'),
    ('hotel', 'name', 'Nome do hotel', 'Aparece em todo o sistema e nas reservas.'),
    ('hotel', 'phone', 'Telefone', 'Sai na fatura e na confirmação de reserva do hóspede.'),
    ('hotel', 'email', 'Email', 'Usado para enviar reservas e faturas ao hóspede.'),
]


def _fiscal():
    from fiscal.models import FiscalConfig
    return FiscalConfig.get()


class HotelProfileView(APIView):
    """GET/PATCH /api/org/hotel-profile/ — a ficha completa da propriedade."""
    permission_classes = [IsAuthenticated]

    def _hotel(self, request):
        hid = default_hotel_id(request)
        return Hotel.objects.filter(pk=hid).first() if hid else Hotel.objects.first()

    def get(self, request):
        h = self._hotel(request)
        cfg = _fiscal()
        if not h:
            return Response({'detail': 'Nenhuma propriedade registada.'}, status=404)

        hotel = {f: getattr(h, f) for f in HOTEL_FIELDS}
        hotel['id'] = h.id
        fiscal = {f: getattr(cfg, f) for f in FISCAL_FIELDS}

        # O que falta preencher — e porquê.
        missing = []
        for scope, field, label, why in REQUIRED:
            val = hotel.get(field) if scope == 'hotel' else fiscal.get(field)
            if val in (None, '', '0000'):
                missing.append({'scope': scope, 'field': field, 'label': label, 'why': why})

        total = len(REQUIRED)
        return Response({
            'hotel': hotel,
            'fiscal': fiscal,
            'certification': {
                'certificate_number': cfg.certificate_number,
                'certified': bool(cfg.certificate_number and cfg.certificate_number != '0000'),
                'environment': cfg.environment,
                'key_version': cfg.key_version,
                'read_only': True,   # pertence ao software, não ao contribuinte
            },
            'completeness': {
                'done': total - len(missing),
                'total': total,
                'percent': round((total - len(missing)) * 100 / total),
                'missing': missing,
            },
        })

    def patch(self, request):
        h = self._hotel(request)
        cfg = _fiscal()
        if not h:
            return Response({'detail': 'Nenhuma propriedade registada.'}, status=404)

        hdata = request.data.get('hotel') or {}
        fdata = request.data.get('fiscal') or {}

        for f in HOTEL_FIELDS:
            if f in hdata:
                setattr(h, f, hdata[f] or None if f not in ('stars',) else (hdata[f] or 0))
        h.save()

        for f in FISCAL_FIELDS:
            if f in fdata:
                setattr(cfg, f, fdata[f])
        # certificate_number / key_version / environment NÃO entram aqui: são do fabricante.
        cfg.save()

        return self.get(request)
