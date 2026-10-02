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
from django.utils import timezone
from django.db.models import Q
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core.tenancy import HotelScopedMixin
from .models import BookingSettings, RoomType, Room, RatePlan, Reservation, BookingPayment
from .serializers import BookingSettingsSerializer, BookingPaymentSerializer
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
        # Arredondado aos cêntimos: uma divisão por 100 dá quatro casas, e
        # "18000.0000 Kz" num site de reservas é um valor que ninguém escreve.
        deposit_due = ((total * settings_obj.deposit_percent / Decimal('100')).quantize(Decimal('0.01'))
                       if settings_obj.deposit_percent else Decimal('0.00'))

        # O DEPÓSITO DEIXA DE SER UM NÚMERO NA RESPOSTA. Antes calculava-se o
        # valor, mandava-se para o ecrã e mais nada: ninguém no hotel ficava a
        # saber que aquela reserva tinha um depósito a receber, e se o hóspede
        # pagasse, o pagamento não existia em lado nenhum — no check-in cobrava-se
        # a estadia toda outra vez. Agora fica um registo a PENDENTE, que a
        # recepção vê, confirma quando o dinheiro entra, e que o check-in lança
        # na conta do hóspede.
        pagamento = None
        if deposit_due > 0:
            pagamento = BookingPayment.objects.create(
                reservation=res, provider=settings_obj.payment_provider,
                amount=deposit_due, currency=settings_obj.currency,
                status='PENDING', method='GATEWAY',
                message=f'Depósito de {settings_obj.deposit_percent}% da reserva online.',
            )

        return Response({
            'confirmation': res.confirmation, 'room_type': rt.name,
            'check_in': check_in.isoformat(), 'check_out': check_out.isoformat(),
            'total': str(total), 'deposit_due': str(deposit_due),
            'payment_id': pagamento.id if pagamento else None,
            'payment_status': pagamento.status if pagamento else None,
            'payment_enabled': settings_obj.payment_enabled,
        }, status=201)


class BookingPayView(APIView):
    """POST pms/booking/pay/ {slug, confirmation, reference?} — o hóspede diz
    que pagou, a partir do site público.

    Só há um caso em que isto marca PAGO: o provedor SIMULATED, que se chama
    "Simulado (testes)" exactamente por isso. Com Multicaixa Express, EMIS,
    Stripe ou PayPal, quem confirma um pagamento é o gateway, por uma chamada
    que esta instalação ainda não tem credenciada — e dar "pago" porque o
    browser do cliente disse que sim é como dar a chave do quarto a quem diz
    que pagou na recepção. Nesse caso o registo fica PENDENTE, com a razão
    escrita, à espera de confirmação humana ou do conector real (mesma
    disciplina do Channel Manager e do `fiscal/agt_client.py`).
    """
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        d = request.data
        settings_obj = _resolve_settings(slug=d.get('slug'), key=d.get('key'))
        if not settings_obj:
            return Response({'detail': 'Motor de reservas indisponível.'}, status=404)

        res = Reservation.objects.filter(
            confirmation=(d.get('confirmation') or '').strip(),
            hotel=settings_obj.hotel).first()
        if not res:
            return Response({'detail': 'Reserva não encontrada.'}, status=404)

        pagamento = (BookingPayment.objects.select_for_update()
                     .filter(reservation=res, status='PENDING').order_by('created_at').first())
        if not pagamento:
            ja_pago = BookingPayment.objects.filter(reservation=res, status='PAID').exists()
            return Response({'detail': 'Esta reserva já está paga.' if ja_pago
                             else 'Esta reserva não tem depósito a pagar.'}, status=400)

        referencia = (d.get('reference') or '').strip() or None
        if (settings_obj.payment_provider or 'SIMULATED').upper() != 'SIMULATED':
            pagamento.reference = referencia or pagamento.reference
            pagamento.message = (
                f'Pagamento de {pagamento.amount} {pagamento.currency} comunicado pelo hóspede. '
                f'O conector de {settings_obj.get_payment_provider_display()} ainda não está '
                f'credenciado nesta instalação — nenhuma cobrança foi feita. A recepção tem '
                f'de confirmar a entrada do dinheiro.')
            pagamento.save(update_fields=['reference', 'message'])
            return Response({
                'status': pagamento.status, 'payment_id': pagamento.id,
                'detail': 'Pedido registado. O hotel vai confirmar a recepção do depósito e '
                          'enviar-lhe a confirmação.',
            }, status=202)

        pagamento.status = 'PAID'
        pagamento.method = 'GATEWAY'
        pagamento.reference = referencia or f'SIM-{uuid.uuid4().hex[:10].upper()}'
        pagamento.paid_at = timezone.now()
        pagamento.message = 'Pago no provedor SIMULADO (ambiente de testes).'
        pagamento.save(update_fields=['status', 'method', 'reference', 'paid_at', 'message'])
        return Response({'status': pagamento.status, 'payment_id': pagamento.id,
                         'reference': pagamento.reference,
                         'detail': 'Depósito registado. Até já!'})


class BookingPaymentViewSet(viewsets.ModelViewSet):
    """Os depósitos, vistos de dentro do hotel: quem deve, quem pagou, e o
    botão para a recepção confirmar a transferência que caiu na conta."""
    queryset = BookingPayment.objects.select_related('reservation', 'reservation__guest').all()
    serializer_class = BookingPaymentSerializer

    def get_queryset(self):
        from core.tenancy import scope_qs
        qs = scope_qs(self.request, super().get_queryset(), hotel_path='reservation__hotel')
        p = self.request.query_params
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        if p.get('reservation'):
            qs = qs.filter(reservation_id=p['reservation'])
        return qs

    @action(detail=True, methods=['post'], url_path='mark-paid')
    @transaction.atomic
    def mark_paid(self, request, pk=None):
        """A recepção confirma que o dinheiro entrou. Fica registado QUEM
        confirmou — é dinheiro, e alguém responde por esta afirmação."""
        pagamento = self.get_object()
        if pagamento.status == 'PAID':
            return Response({'detail': 'Este depósito já estava confirmado.'}, status=409)
        pagamento.status = 'PAID'
        pagamento.method = request.data.get('method') or 'TRANSFER'
        pagamento.reference = (request.data.get('reference') or '').strip() or pagamento.reference
        pagamento.paid_at = timezone.now()
        pagamento.confirmed_by = getattr(request.user, 'username', '') or 'recepção'
        pagamento.message = f'Entrada confirmada por {pagamento.confirmed_by}.'
        pagamento.save(update_fields=['status', 'method', 'reference', 'paid_at',
                                      'confirmed_by', 'message'])

        # Se o hóspede já estiver dentro do hotel, o depósito entra já na conta.
        from .views import lancar_depositos_no_folio
        folio = pagamento.reservation.folios.filter(status='OPEN', is_primary=True).first()
        lancado = lancar_depositos_no_folio(pagamento.reservation, folio) if folio else 0

        dados = self.get_serializer(pagamento).data
        dados['posted_now'] = lancado
        dados['detail'] = ('Depósito confirmado e lançado na conta do hóspede.' if lancado
                           else 'Depósito confirmado. Será lançado na conta no check-in.')
        return Response(dados)

    @action(detail=True, methods=['post'], url_path='mark-failed')
    def mark_failed(self, request, pk=None):
        pagamento = self.get_object()
        if pagamento.status == 'PAID':
            return Response({'detail': 'Um depósito já pago não se marca como falhado — '
                                       'use a devolução.'}, status=409)
        pagamento.status = 'FAILED'
        pagamento.message = (request.data.get('reason') or '').strip() or 'Pagamento não concretizado.'
        pagamento.save(update_fields=['status', 'message'])
        return Response(self.get_serializer(pagamento).data)
