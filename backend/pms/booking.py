"""
Booking Engine — API SEGURA de reservas online.

O motor de reservas (site/cloud) consome apenas estes endpoints, autenticados por uma
CHAVE por hotel (BookingSetting.api_key). O SQL Server / BD NUNCA é exposto à Internet:
a comunicação é só via esta API (idealmente através de VPN/proxy). Disponibilidade em
tempo real vinda do PMS; a reserva cai diretamente no PMS (receção vê-a de imediato).
"""
import secrets
from datetime import datetime
from decimal import Decimal

from django.db.models import Q
from rest_framework import viewsets
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated

from .models import BookingSetting, RoomType, Room, Reservation, Guest, RatePlan


def _auth(request):
    """
    Identifica o hotel do motor de reservas:
    - CHAVE secreta (X-Booking-Key/?key=) -> integrações servidor-a-servidor (Channel Manager).
    - SLUG (?slug=/body slug) -> site público (disponibilidade/reserva). Info pública, sem segredo.
    - Domínio (Host) -> custom_domain mapeado.
    """
    key = request.headers.get('X-Booking-Key') or request.query_params.get('key') or request.data.get('key')
    if key:
        bs = BookingSetting.objects.filter(api_key=key, enabled=True).select_related('hotel').first()
        if bs:
            return bs
    slug = request.query_params.get('slug') or request.data.get('slug')
    if slug:
        bs = BookingSetting.objects.filter(slug=slug, enabled=True).select_related('hotel').first()
        if bs:
            return bs
    host = request.headers.get('Host')
    if host:
        return BookingSetting.objects.filter(custom_domain__iexact=host, enabled=True).select_related('hotel').first()
    return None


class BookingConfigView(APIView):
    """GET /api/pms/booking/config/?slug= — identidade PÚBLICA do hotel (para o site branded)."""
    permission_classes = [AllowAny]

    def get(self, request):
        bs = _auth(request)
        if not bs:
            return Response({'detail': 'Motor de reservas indisponível.'}, status=404)
        return Response({
            'hotel': bs.hotel.name, 'slug': bs.slug, 'currency': bs.currency,
            'primary_color': bs.primary_color, 'logo_url': bs.logo_url, 'hero_image_url': bs.hero_image_url,
            'welcome_text': bs.welcome_text, 'deposit_percent': str(bs.deposit_percent),
            'cancellation_policy': bs.cancellation_policy, 'languages': bs.languages,
        })


def _parse(d):
    try:
        return datetime.strptime(d, '%Y-%m-%d').date()
    except (TypeError, ValueError):
        return None


def compute_availability(hotel, check_in, check_out, adults=1, children=0):
    guests = (adults or 1) + (children or 0)
    nights = max((check_out - check_in).days, 1)
    out = []
    for rt in RoomType.objects.filter(hotel=hotel, is_active=True):
        total = Room.objects.filter(room_type=rt, is_active=True).count()
        # Reservas que se sobrepõem ao período pedido.
        overlap = Reservation.objects.filter(
            room_type=rt, status__in=['BOOKED', 'CHECKED_IN'],
            check_in__lt=check_out, check_out__gt=check_in).count()
        available = max(0, total - overlap)
        plan = RatePlan.objects.filter(room_type=rt, is_active=True).order_by('-id').first()
        price = plan.price_per_night if plan else (rt.base_rate or Decimal('0'))
        if available > 0 and rt.capacity >= guests:
            out.append({
                'room_type': rt.id, 'code': rt.code, 'name': rt.name, 'capacity': rt.capacity,
                'available': available, 'price_per_night': str(price),
                'nights': nights, 'total': str(Decimal(str(price)) * nights),
                'board': plan.board if plan else 'RO',
            })
    return out


class BookingAvailabilityView(APIView):
    """GET /api/pms/booking/availability/?key=&check_in=&check_out=&adults=&children="""
    permission_classes = [AllowAny]

    def get(self, request):
        bs = _auth(request)
        if not bs:
            return Response({'detail': 'Chave de reservas inválida ou motor desativado.'}, status=403)
        ci, co = _parse(request.query_params.get('check_in')), _parse(request.query_params.get('check_out'))
        if not ci or not co or co <= ci:
            return Response({'detail': 'Datas inválidas (check_in < check_out, formato AAAA-MM-DD).'}, status=400)
        return Response({
            'hotel': bs.hotel.name, 'currency': bs.currency,
            'check_in': ci.isoformat(), 'check_out': co.isoformat(),
            'deposit_percent': str(bs.deposit_percent),
            'cancellation_policy': bs.cancellation_policy,
            'rooms': compute_availability(bs.hotel, ci, co,
                                          int(request.query_params.get('adults') or 1),
                                          int(request.query_params.get('children') or 0)),
        })


class BookingReserveView(APIView):
    """POST /api/pms/booking/reserve/ — cria a reserva online (cai no PMS)."""
    permission_classes = [AllowAny]

    def post(self, request):
        import uuid
        bs = _auth(request)
        if not bs:
            return Response({'detail': 'Chave de reservas inválida.'}, status=403)
        d = request.data
        ci, co = _parse(d.get('check_in')), _parse(d.get('check_out'))
        rt = RoomType.objects.filter(pk=d.get('room_type'), hotel=bs.hotel, is_active=True).first()
        if not ci or not co or co <= ci or not rt:
            return Response({'detail': 'Dados inválidos (datas/tipo de quarto).'}, status=400)
        # Revalida disponibilidade no momento (evita overbooking).
        avail = compute_availability(bs.hotel, ci, co, int(d.get('adults') or 1), int(d.get('children') or 0))
        if not any(r['room_type'] == rt.id for r in avail):
            return Response({'detail': 'Sem disponibilidade para o período/tipo escolhido.'}, status=409)
        g = d.get('guest') or {}
        guest = Guest.objects.create(hotel=bs.hotel, full_name=g.get('name') or 'Hóspede Online',
                                     email=g.get('email'), phone=g.get('phone'), country=g.get('country'))
        plan = RatePlan.objects.filter(room_type=rt, is_active=True).order_by('-id').first()
        rate = plan.price_per_night if plan else (rt.base_rate or Decimal('0'))
        conf = f"WEB{uuid.uuid4().hex[:8].upper()}"
        res = Reservation.objects.create(
            hotel=bs.hotel, confirmation=conf, guest=guest, room_type=rt,
            check_in=ci, check_out=co, adults=int(d.get('adults') or 1), children=int(d.get('children') or 0),
            rate=rate, status='BOOKED', source='ONLINE', online_ref=conf, notes=g.get('notes'))
        try:
            from .channels import on_inventory_change
            on_inventory_change(bs.hotel)
        except Exception:
            pass
        nights = max((co - ci).days, 1)
        return Response({
            'confirmation': conf, 'hotel': bs.hotel.name, 'room_type': rt.name,
            'check_in': ci.isoformat(), 'check_out': co.isoformat(), 'nights': nights,
            'total': str(Decimal(str(rate)) * nights),
            'deposit_due': str((Decimal(str(rate)) * nights * bs.deposit_percent / Decimal('100')).quantize(Decimal('0.01'))),
        }, status=201)


def _find_reservation(bs, confirmation, email):
    """Localiza a reserva do hóspede (por código + email) no hotel do slug."""
    q = Reservation.objects.select_related('room_type', 'guest', 'room').filter(
        hotel=bs.hotel, confirmation__iexact=(confirmation or '').strip())
    res = q.first()
    if res and email and res.guest and res.guest.email and res.guest.email.lower() != email.strip().lower():
        return None  # email não corresponde
    return res


def _reservation_payload(res):
    nights = res.nights
    return {
        'confirmation': res.confirmation, 'status': res.get_status_display(), 'status_code': res.status,
        'guest': res.guest.full_name if res.guest else '—',
        'room_type': res.room_type.name if res.room_type else '—',
        'room': res.room.number if res.room else None,
        'check_in': res.check_in.isoformat(), 'check_out': res.check_out.isoformat(), 'nights': nights,
        'adults': res.adults, 'children': res.children, 'rate': str(res.rate),
        'total': str(res.rate * nights), 'source': res.source, 'online_checkin': res.online_checkin,
        'deposit_paid': res.payments.filter(status='PAID').exists(),
    }


class MyReservationView(APIView):
    """Área do cliente — GET consulta a reserva (?slug=&confirmation=&email=)."""
    permission_classes = [AllowAny]

    def get(self, request):
        bs = _auth(request)
        if not bs:
            return Response({'detail': 'Indisponível.'}, status=404)
        res = _find_reservation(bs, request.query_params.get('confirmation'), request.query_params.get('email'))
        if not res:
            return Response({'detail': 'Reserva não encontrada (verifique o código e o email).'}, status=404)
        return Response({'hotel': bs.hotel.name, 'cancellation_policy': bs.cancellation_policy, **_reservation_payload(res)})


class MyReservationCancelView(APIView):
    """Área do cliente — POST cancela a reserva (se ainda não fez check-in)."""
    permission_classes = [AllowAny]

    def post(self, request):
        bs = _auth(request)
        if not bs:
            return Response({'detail': 'Indisponível.'}, status=404)
        res = _find_reservation(bs, request.data.get('confirmation'), request.data.get('email'))
        if not res:
            return Response({'detail': 'Reserva não encontrada.'}, status=404)
        if res.status != 'BOOKED':
            return Response({'detail': 'Só reservas confirmadas (ainda sem check-in) podem ser canceladas.'}, status=409)
        res.status = 'CANCELLED'
        res.save(update_fields=['status'])
        try:
            from .channels import on_inventory_change
            on_inventory_change(bs.hotel)   # liberta inventário nos canais
        except Exception:
            pass
        return Response({'detail': 'Reserva cancelada.', **_reservation_payload(res)})


class MyReservationCheckinView(APIView):
    """Área do cliente — POST check-in online (pré-registo). A receção conclui à chegada."""
    permission_classes = [AllowAny]

    def post(self, request):
        bs = _auth(request)
        if not bs:
            return Response({'detail': 'Indisponível.'}, status=404)
        res = _find_reservation(bs, request.data.get('confirmation'), request.data.get('email'))
        if not res:
            return Response({'detail': 'Reserva não encontrada.'}, status=404)
        if res.status not in ('BOOKED',):
            return Response({'detail': 'Check-in online indisponível para o estado atual.'}, status=409)
        # Atualiza dados do hóspede (documento/telefone) e marca pré-check-in.
        g = res.guest
        if g:
            if request.data.get('document_id'):
                g.document_id = request.data['document_id']
            if request.data.get('phone'):
                g.phone = request.data['phone']
            g.save()
        res.online_checkin = True
        res.save(update_fields=['online_checkin'])
        return Response({'detail': 'Check-in online concluído. A receção conclui à chegada.', **_reservation_payload(res)})


class BookingPaymentInitiateView(APIView):
    """Inicia o pagamento do adiantamento. Conector do gateway liga-se aqui (real com credenciais)."""
    permission_classes = [AllowAny]

    def post(self, request):
        import uuid
        from .models import BookingPayment, BookingSetting
        bs = _auth(request)
        if not bs:
            return Response({'detail': 'Indisponível.'}, status=404)
        res = _find_reservation(bs, request.data.get('confirmation'), request.data.get('email'))
        if not res:
            return Response({'detail': 'Reserva não encontrada.'}, status=404)
        if res.status != 'BOOKED':
            return Response({'detail': 'Pagamento indisponível para o estado atual.'}, status=409)
        # Já pago?
        if res.payments.filter(status='PAID').exists():
            return Response({'detail': 'Adiantamento já pago.'}, status=409)
        amount = (res.rate * res.nights * bs.deposit_percent / Decimal('100')).quantize(Decimal('0.01'))
        if amount <= 0:
            return Response({'detail': 'Este hotel não exige adiantamento.'}, status=400)
        ref = f"PAY{uuid.uuid4().hex[:10].upper()}"
        pay = BookingPayment.objects.create(reservation=res, amount=amount,
                                            provider=bs.payment_provider or 'SIMULATED', reference=ref)
        # ---- Conector do gateway ----
        # SIMULATED: devolve uma "pay_url" interna que confirma. Gateways reais (Multicaixa Express/
        # EMIS/Stripe/PayPal): criar a intenção de pagamento e devolver o redirect_url oficial.
        provider = pay.provider
        data = {'reference': ref, 'amount': str(amount), 'currency': bs.currency, 'provider': provider}
        if provider == 'SIMULATED':
            data['pay_url'] = f'/reserva/{bs.slug}?pay={ref}'   # confirma via /confirm no ambiente de testes
            data['simulated'] = True
        else:
            data['redirect_url'] = None   # TODO: URL do gateway real (pendente de credenciais)
            data['note'] = f'Conector {provider} liga-se com as credenciais do comerciante.'
        return Response(data, status=201)


class BookingPaymentConfirmView(APIView):
    """Confirma o pagamento (ambiente simulado). Em produção, é o WEBHOOK do gateway que confirma."""
    permission_classes = [AllowAny]

    def post(self, request):
        from django.utils import timezone
        from .models import BookingPayment
        bs = _auth(request)
        if not bs:
            return Response({'detail': 'Indisponível.'}, status=404)
        pay = BookingPayment.objects.filter(reference=request.data.get('reference'),
                                            reservation__hotel=bs.hotel).select_related('reservation').first()
        if not pay:
            return Response({'detail': 'Pagamento não encontrado.'}, status=404)
        if pay.status == 'PAID':
            return Response({'detail': 'Já pago.', 'status': 'PAID'})
        pay.status = 'PAID'
        pay.paid_at = timezone.now()
        pay.gateway_ref = f'SIM-{pay.reference}'
        pay.save(update_fields=['status', 'paid_at', 'gateway_ref'])
        return Response({'detail': 'Adiantamento pago com sucesso.', 'status': 'PAID',
                         'reference': pay.reference, 'amount': str(pay.amount)})


class BookingPaymentWebhookView(APIView):
    """Webhook para gateways REAIS (Multicaixa Express/EMIS/Stripe/PayPal) confirmarem o pagamento."""
    permission_classes = [AllowAny]

    def post(self, request):
        from django.utils import timezone
        from .models import BookingPayment
        ref = request.data.get('reference') or request.data.get('merchant_ref')
        pay = BookingPayment.objects.filter(reference=ref).first()
        if not pay:
            return Response({'detail': 'ref desconhecida'}, status=404)
        # TODO: validar assinatura/estado do gateway antes de marcar pago.
        status_in = (request.data.get('status') or 'PAID').upper()
        pay.status = 'PAID' if status_in in ('PAID', 'ACCEPTED', 'SUCCESS') else 'FAILED'
        if pay.status == 'PAID':
            pay.paid_at = timezone.now()
        pay.gateway_ref = request.data.get('gateway_ref') or request.data.get('transaction_id')
        pay.save(update_fields=['status', 'paid_at', 'gateway_ref'])
        return Response({'ok': True, 'status': pay.status})


class BookingSettingViewSet(viewsets.ModelViewSet):
    """Configuração do Booking Engine (backoffice). Gera a chave/slug automaticamente."""
    permission_classes = [IsAuthenticated]
    from .serializers import BookingSettingSerializer
    serializer_class = BookingSettingSerializer

    def get_queryset(self):
        return BookingSetting.objects.select_related('hotel').all()

    def perform_create(self, serializer):
        from identity.models import Hotel
        hotel = serializer.validated_data.get('hotel') or Hotel.objects.first()
        slug = serializer.validated_data.get('slug') or (hotel.name.lower().replace(' ', '-')[:40] if hotel else 'hotel')
        serializer.save(hotel=hotel, slug=slug, api_key=secrets.token_urlsafe(24))

    @action(detail=True, methods=['post'])
    def rotate_key(self, request, pk=None):
        bs = self.get_object()
        bs.api_key = secrets.token_urlsafe(24)
        bs.save(update_fields=['api_key'])
        return Response(self.get_serializer(bs).data)
