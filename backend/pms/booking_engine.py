"""
Booking Engine — motor de reservas online.

Duas metades, deliberadamente separadas:
  1) `BookingSettingsViewSet` — ecrã de administração (autenticado, dentro do
     ERP), onde o dono liga/desliga o motor, gera a chave da API e vê o link
     do site público (BookingEngineView.tsx).
  2) As três views PÚBLICAS a seguir (`AllowAny` — sem login, é o hóspede em
     casa) que o site (BookingSite.tsx) e a área do cliente (BookingManage.tsx)
     chamam: configuração por slug, disponibilidade e criação da reserva.

A disponibilidade e o anti-overbooking reutilizam a MESMA definição de
"reserva viva" já usada em `availability.py` (`by_category`) e em
`views.room_conflict` — nunca se reimplementa essa regra de negócio aqui.
"""
from datetime import date, timedelta
from decimal import Decimal
import uuid

from django.db import transaction
from django.db.models import Q
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core.tenancy import HotelScopedMixin
from .models import BookingSettings, RoomType, Room, RatePlan, Reservation
from .serializers import BookingSettingsSerializer
from .views import HotelDefaultMixin, _next_number

# Mesma lista usada por `room_conflict` (views.py) para decidir se uma reserva
# "ocupa" o quarto/categoria — WAITLIST fica de fora de propósito (é pedido
# extra além da capacidade, não consome inventário real).
ACTIVE_STATUSES = ('OPTION', 'BOOKED', 'CHECKED_IN')


class BookingSettingsViewSet(HotelScopedMixin, HotelDefaultMixin, viewsets.ModelViewSet):
    queryset = BookingSettings.objects.select_related('hotel').all()
    serializer_class = BookingSettingsSerializer

    @action(detail=True, methods=['post'])
    def rotate_key(self, request, pk=None):
        settings_obj = self.get_object()
        settings_obj.api_key = uuid.uuid4().hex
        settings_obj.save(update_fields=['api_key'])
        return Response(self.get_serializer(settings_obj).data)


def _parse_date(d):
    try:
        return date.fromisoformat(d) if d else None
    except ValueError:
        return None


def _resolve_settings(slug=None, key=None):
    qs = BookingSettings.objects.select_related('hotel').filter(is_active=True)
    if slug:
        return qs.filter(slug=slug).first()
    if key:
        return qs.filter(api_key=key).first()
    return None


def _room_type_free_count(room_type, check_in, check_out):
    """O menor nº de quartos livres dessa categoria em qualquer noite do
    período — reservar por cima disto venderia um quarto que já não existe."""
    total = Room.objects.filter(room_type=room_type, is_active=True).count()
    if total == 0:
        return 0
    free = total
    d = check_in
    while d < check_out:
        reserved = Reservation.objects.filter(
            room_type=room_type, status__in=ACTIVE_STATUSES,
            check_in__lte=d, check_out__gt=d,
        ).count()
        free = min(free, total - reserved)
        d += timedelta(days=1)
    return max(free, 0)


def _room_type_price(room_type, check_in, check_out):
    """A tarifa mais barata com um Rate Plan válido para estas datas; sem
    nenhum, cai para a tarifa base da categoria (mesma cadeia de fallback do
    check-in em `views.py`: rate > rate_plan > room_type.base_rate)."""
    plan = (RatePlan.objects.filter(room_type=room_type, is_active=True)
            .filter(Q(valid_from__isnull=True) | Q(valid_from__lte=check_in))
            .filter(Q(valid_to__isnull=True) | Q(valid_to__gte=check_out))
            .order_by('price_per_night').first())
    if plan:
        return plan.price_per_night, plan.board, plan
    return room_type.base_rate, 'RO', None


class BookingConfigView(APIView):
    """GET pms/booking/config/?slug= — identidade pública do hotel para o
    site de reservas montar o cabeçalho/cores. 404 se o slug não existir ou
    o motor estiver desligado (nunca revela qual dos dois foi o motivo)."""
    permission_classes = [AllowAny]

    def get(self, request):
        settings_obj = _resolve_settings(slug=request.query_params.get('slug'))
        if not settings_obj:
            return Response({'detail': 'Motor de reservas indisponível.'}, status=404)
        s = settings_obj
        return Response({
            'slug': s.slug, 'hotel': s.hotel.name, 'currency': s.currency,
            'primary_color': s.primary_color, 'welcome_text': s.welcome_text,
            'cancellation_policy': s.cancellation_policy, 'deposit_percent': str(s.deposit_percent),
            'payment_enabled': s.payment_enabled, 'payment_provider': s.payment_provider,
            'logo_url': s.logo_url, 'hero_image_url': s.hero_image_url,
        })


class BookingAvailabilityView(APIView):
    """GET pms/booking/availability/?slug=|key=&check_in=&check_out=&adults=&children=
    Usado por dois clientes diferentes com o MESMO contrato: o site público
    (por slug) e o testador dentro do ecrã de administração (por key — o
    admin não sabe o slug de cor, mas tem a chave à vista)."""
    permission_classes = [AllowAny]

    def get(self, request):
        p = request.query_params
        settings_obj = _resolve_settings(slug=p.get('slug'), key=p.get('key'))
        if not settings_obj:
            return Response({'detail': 'Motor de reservas indisponível.'}, status=404)
        check_in, check_out = _parse_date(p.get('check_in')), _parse_date(p.get('check_out'))
        if not check_in or not check_out or check_out <= check_in:
            return Response({'detail': 'Datas de entrada/saída inválidas.'}, status=400)
        nights = (check_out - check_in).days
        try:
            adults = int(p.get('adults') or 1)
        except (TypeError, ValueError):
            adults = 1

        rooms = []
        room_types = RoomType.objects.filter(hotel=settings_obj.hotel, is_active=True)
        if adults:
            room_types = room_types.filter(capacity_adults__gte=adults)
        for rt in room_types:
            available = _room_type_free_count(rt, check_in, check_out)
            if available <= 0:
                continue
            price, board, _plan = _room_type_price(rt, check_in, check_out)
            rooms.append({
                'room_type': rt.id, 'name': rt.name, 'board': board,
                'capacity': rt.capacity_adults + rt.capacity_children,
                'available': available, 'nights': nights,
                'price_per_night': str(price), 'total': str(price * nights),
            })
        return Response({'check_in': check_in.isoformat(), 'check_out': check_out.isoformat(), 'rooms': rooms})


class BookingReserveView(APIView):
    """POST pms/booking/reserve/ — cria a reserva a sério (ONLINE/BOOKED),
    reutilizando a mesma noção de "quarto/categoria já ocupado" da
    disponibilidade acima. Nunca atribui um QUARTO concreto (isso é o mesmo
    fluxo de sempre — atribuição na receção/check-in); por isso o anti-
    overbooking aqui é ao nível da CATEGORIA (contagem de quartos livres),
    não `room_conflict` (que exige um Room já escolhido)."""
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        d = request.data
        settings_obj = _resolve_settings(slug=d.get('slug'))
        if not settings_obj:
            return Response({'detail': 'Motor de reservas indisponível.'}, status=404)

        check_in, check_out = _parse_date(d.get('check_in')), _parse_date(d.get('check_out'))
        if not check_in or not check_out or check_out <= check_in:
            return Response({'detail': 'Datas de entrada/saída inválidas.'}, status=400)

        today = date.today()
        if settings_obj.min_advance_days and (check_in - today).days < settings_obj.min_advance_days:
            return Response({'detail': f'É preciso reservar com pelo menos {settings_obj.min_advance_days} dia(s) de antecedência.'}, status=400)
        if settings_obj.max_advance_days and (check_in - today).days > settings_obj.max_advance_days:
            return Response({'detail': f'Não é possível reservar com mais de {settings_obj.max_advance_days} dia(s) de antecedência.'}, status=400)

        try:
            rt = RoomType.objects.get(pk=d.get('room_type'), hotel=settings_obj.hotel, is_active=True)
        except (RoomType.DoesNotExist, ValueError, TypeError):
            return Response({'detail': 'Categoria de quarto inválida.'}, status=400)

        guest = d.get('guest') or {}
        name, email = (guest.get('name') or '').strip(), (guest.get('email') or '').strip()
        if not name or not email:
            return Response({'detail': 'Nome e email são obrigatórios.'}, status=400)

        if _room_type_free_count(rt, check_in, check_out) <= 0:
            return Response({'detail': 'Sem disponibilidade para essas datas — escolha outra categoria ou outras datas.'}, status=409)

        price, board, plan = _room_type_price(rt, check_in, check_out)
        nights = (check_out - check_in).days
        total = price * nights

        from mdm.models import Customer
        customer = Customer.objects.filter(email__iexact=email).first()
        if not customer:
            customer = Customer.objects.create(
                code=f"WEB-{uuid.uuid4().hex[:10].upper()}", name=name, email=email,
                phone=(guest.get('phone') or '').strip() or None,
            )

        try:
            adults = int(d.get('adults') or 1)
        except (TypeError, ValueError):
            adults = 1
        try:
            children = int(d.get('children') or 0)
        except (TypeError, ValueError):
            children = 0

        res = Reservation.objects.create(
            hotel=settings_obj.hotel, confirmation=_next_number(Reservation.objects, 'confirmation', 'WEB'),
            guest=customer, room_type=rt, rate_plan=plan, rate=price,
            check_in=check_in, check_out=check_out, adults=adults, children=children,
            status='BOOKED', source='ONLINE',
        )
        deposit_due = (total * settings_obj.deposit_percent / Decimal('100')) if settings_obj.deposit_percent else Decimal('0')
        return Response({
            'confirmation': res.confirmation, 'room_type': rt.name,
            'check_in': check_in.isoformat(), 'check_out': check_out.isoformat(),
            'total': str(total), 'deposit_due': str(deposit_due),
        }, status=201)
