from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from core.tenancy import HotelScopedMixin, default_hotel_id, scope_qs
from .models import RoomType, Room, RatePlan, Block, BlockRoomType, Reservation, Folio, FolioCharge, MealPlanEntry
from .serializers import (
    RoomTypeSerializer, RoomSerializer, RatePlanSerializer,
    BlockSerializer, BlockRoomTypeSerializer,
    ReservationSerializer, FolioSerializer, FolioChargeSerializer, MealPlanEntrySerializer,
)


def _parse_date(d):
    from datetime import date
    try:
        return date.fromisoformat(d) if d else None
    except ValueError:
        return None


def _next_number(qs, field, prefix):
    n = qs.count() + 1
    while qs.filter(**{field: f"{prefix}-{n:06d}"}).exists():
        n += 1
    return f"{prefix}-{n:06d}"


class HotelDefaultMixin:
    """Preenche o hotel ANTES da validação do serializer — sem isto, o
    UniqueTogetherValidator de (hotel, código) rejeita por "hotel obrigatório"
    quando o cliente (instalação de hotel único) não manda o campo."""
    def create(self, request, *args, **kwargs):
        if not request.data.get('hotel'):
            hid = default_hotel_id(request)
            if hid:
                data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
                data['hotel'] = hid
                serializer = self.get_serializer(data=data)
                serializer.is_valid(raise_exception=True)
                self.perform_create(serializer)
                headers = self.get_success_headers(serializer.data)
                return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
        return super().create(request, *args, **kwargs)


class RoomTypeViewSet(HotelScopedMixin, HotelDefaultMixin, viewsets.ModelViewSet):
    queryset = RoomType.objects.all()
    serializer_class = RoomTypeSerializer


class RoomViewSet(HotelScopedMixin, HotelDefaultMixin, viewsets.ModelViewSet):
    queryset = Room.objects.select_related('room_type', 'floor').all()
    serializer_class = RoomSerializer

    @action(detail=True, methods=['post'])
    def set_status(self, request, pk=None):
        room = self.get_object()
        new_status = request.data.get('status')
        if new_status not in dict(Room.STATUS):
            return Response({'detail': 'Estado inválido.'}, status=400)
        room.status = new_status
        room.save(update_fields=['status'])
        return Response(self.get_serializer(room).data)

    @action(detail=False, methods=['get'])
    def free(self, request):
        """"Mostrar quartos livres" — usado ao criar uma reserva: por categoria e
        período, quais os quartos sem outra reserva viva a cruzar essas datas."""
        from django.utils import timezone
        p = request.query_params
        d_from = _parse_date(p.get('date_from'))
        d_to = _parse_date(p.get('date_to'))
        qs = self.filter_queryset(self.get_queryset()).filter(is_active=True)
        rt = p.get('room_type')
        if rt:
            qs = qs.filter(room_type_id=rt)
        q = p.get('q')
        if q:
            qs = qs.filter(number__icontains=q)
        today = timezone.localdate()
        rows = []
        for room in qs.order_by('number'):
            clash = room_conflict(room, d_from, d_to) if (d_from and d_to) else None
            next_res = (Reservation.objects
                        .filter(room=room, status__in=['OPTION', 'BOOKED', 'CHECKED_IN'], check_in__gte=today)
                        .order_by('check_in').first())
            rows.append({
                'id': room.id, 'number': room.number,
                'room_type': room.room_type_id, 'room_type_code': room.room_type.code,
                'status': room.status, 'status_display': room.get_status_display(),
                'is_free': clash is None,
                'next_reservation': next_res.check_in.isoformat() if next_res else None,
            })
        return Response(rows)


class RatePlanViewSet(HotelScopedMixin, HotelDefaultMixin, viewsets.ModelViewSet):
    queryset = RatePlan.objects.select_related('room_type').all()
    serializer_class = RatePlanSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        rt = self.request.query_params.get('room_type')
        return qs.filter(room_type_id=rt) if rt else qs


# ==========================================================================
# BLOCOS
# ==========================================================================

class BlockViewSet(HotelScopedMixin, HotelDefaultMixin, viewsets.ModelViewSet):
    queryset = Block.objects.select_related('main_entity').prefetch_related('room_types').all()
    serializer_class = BlockSerializer

    def get_queryset(self):
        from django.db.models import Q, Sum
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get('q'):
            t = p['q']
            qs = qs.filter(Q(code__icontains=t) | Q(description__icontains=t)
                          | Q(group_name__icontains=t) | Q(main_entity__name__icontains=t))
        if p.get('check_in_from'):
            qs = qs.filter(valid_from__gte=p['check_in_from'])
        if p.get('check_in_to'):
            qs = qs.filter(valid_from__lte=p['check_in_to'])
        if p.get('check_out_from'):
            qs = qs.filter(valid_to__gte=p['check_out_from'])
        if p.get('check_out_to'):
            qs = qs.filter(valid_to__lte=p['check_out_to'])
        if p.get('room_type'):
            qs = qs.filter(room_types__room_type_id=p['room_type']).distinct()
        if p.get('segment'):
            qs = qs.filter(default_segment_id=p['segment'])
        if p.get('sub_segment'):
            qs = qs.filter(default_subsegment_id=p['sub_segment'])
        if p.get('channel'):
            qs = qs.filter(default_channel_id=p['channel'])
        if p.get('rate_plan'):
            qs = qs.filter(default_rate_plan_id=p['rate_plan'])
        if p.get('is_guaranteed') in ('1', 'true', 'True'):
            qs = qs.filter(is_guaranteed=True)
        if p.get('voucher'):
            qs = qs.filter(default_voucher__icontains=p['voucher'])
        if p.get('reservation_type'):
            qs = qs.filter(default_reservation_type=p['reservation_type'])
        if p.get('min_rooms'):
            qs = (qs.annotate(total_rooms=Sum('room_types__rooms_blocked'))
                    .filter(total_rooms__gte=int(p['min_rooms'])))
        return qs

    @action(detail=True, methods=['post'], url_path='room-types')
    def set_room_type(self, request, pk=None):
        """Grelha do bloco — define/atualiza quantos quartos de uma categoria
        ficam reservados para o grupo, numa data."""
        block = self.get_object()
        room_type_id = request.data.get('room_type')
        date = request.data.get('date')
        rooms = request.data.get('rooms_blocked')
        if not (room_type_id and date and rooms is not None):
            return Response({'detail': 'room_type, date e rooms_blocked são obrigatórios.'}, status=400)
        row, _ = BlockRoomType.objects.update_or_create(
            block=block, room_type_id=room_type_id, date=date,
            defaults={'rooms_blocked': rooms, 'rate_override': request.data.get('rate_override')},
        )
        return Response(BlockRoomTypeSerializer(row).data, status=201)

    @action(detail=True, methods=['get'])
    def pickup(self, request, pk=None):
        """As reservas (Pickup) já feitas contra este bloco."""
        block = self.get_object()
        res = block.reservations.select_related('guest', 'room_type', 'room').order_by('check_in')
        return Response(ReservationSerializer(res, many=True).data)


# ==========================================================================
# RESERVAS
# ==========================================================================

def room_conflict(room, check_in, check_out, exclude_id=None):
    """Outra reserva viva ocupa este quarto nestas datas? (anti-overbooking)."""
    if not room:
        return None
    qs = (Reservation.objects
          .filter(room=room, status__in=['OPTION', 'BOOKED', 'CHECKED_IN'])
          .filter(check_in__lt=check_out, check_out__gt=check_in))
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)
    return qs.first()


class ReservationViewSet(HotelScopedMixin, viewsets.ModelViewSet):
    queryset = Reservation.objects.select_related('guest', 'room_type', 'room', 'block').all()
    serializer_class = ReservationSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        if p.get('source'):
            qs = qs.filter(source=p['source'])
        if p.get('block'):
            qs = qs.filter(block_id=p['block'])
        if p.get('guest'):
            qs = qs.filter(guest_id=p['guest'])
        if p.get('check_in_from'):
            qs = qs.filter(check_in__gte=p['check_in_from'])
        if p.get('check_in_to'):
            qs = qs.filter(check_in__lte=p['check_in_to'])
        if p.get('check_out_from'):
            qs = qs.filter(check_out__gte=p['check_out_from'])
        if p.get('check_out_to'):
            qs = qs.filter(check_out__lte=p['check_out_to'])
        if p.get('created_from'):
            qs = qs.filter(created_at__date__gte=p['created_from'])
        if p.get('created_to'):
            qs = qs.filter(created_at__date__lte=p['created_to'])
        if p.get('voucher'):
            qs = qs.filter(voucher__icontains=p['voucher'])
        if p.get('room_type'):
            qs = qs.filter(room_type_id=p['room_type'])
        if p.get('room'):
            qs = qs.filter(room__number__icontains=p['room'])
        if p.get('no_room') in ('1', 'true', 'True'):
            qs = qs.filter(room__isnull=True)
        if p.get('rate_plan'):
            qs = qs.filter(rate_plan_id=p['rate_plan'])
        if p.get('segment'):
            qs = qs.filter(segment_id=p['segment'])
        if p.get('sub_segment'):
            qs = qs.filter(sub_segment_id=p['sub_segment'])
        if p.get('channel'):
            qs = qs.filter(channel_id=p['channel'])
        if p.get('is_guaranteed') in ('1', 'true', 'True'):
            qs = qs.filter(is_guaranteed=True)
        if p.get('confirmation'):
            qs = qs.filter(confirmation__icontains=p['confirmation'])
        if p.get('q'):
            from django.db.models import Q
            qs = qs.filter(Q(confirmation__icontains=p['q']) | Q(guest__name__icontains=p['q'])
                          | Q(guest__tax_id__icontains=p['q']))
        return qs

    def _guard_overbooking(self, data, instance=None):
        room = data.get('room') or (instance.room if instance else None)
        ci = data.get('check_in') or (instance.check_in if instance else None)
        co = data.get('check_out') or (instance.check_out if instance else None)
        if not (room and ci and co):
            return None
        clash = room_conflict(room, ci, co, exclude_id=instance.pk if instance else None)
        if clash:
            return Response({'detail': f'OVERBOOKING: o quarto {room.number} já está reservado de '
                                       f'{clash.check_in} a {clash.check_out} ({clash.confirmation} · '
                                       f'{clash.guest.name}). Escolha outro quarto ou outras datas.'},
                            status=status.HTTP_409_CONFLICT)
        return None

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        err = self._guard_overbooking(ser.validated_data)
        if err:
            return err
        self.perform_create(ser)
        return Response(ser.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        ser = self.get_serializer(instance, data=request.data, partial=kwargs.pop('partial', False))
        ser.is_valid(raise_exception=True)
        err = self._guard_overbooking(ser.validated_data, instance)
        if err:
            return err
        self.perform_update(ser)
        return Response(ser.data)

    def perform_create(self, serializer):
        if not serializer.validated_data.get('confirmation'):
            serializer.validated_data['confirmation'] = _next_number(Reservation.objects, 'confirmation', 'RES')
        from identity.models import Hotel
        hid = default_hotel_id(self.request)
        serializer.save(hotel=Hotel.objects.get(pk=hid) if hid else None)

    @action(detail=True, methods=['post'])
    def check_in(self, request, pk=None):
        """Atribui quarto (se ainda não tiver), marca CHECKED_IN, abre folio e
        lança a 1ª diária. As noites seguintes entram pelo Night Audit (Fase 2)."""
        res = self.get_object()
        if res.status not in ('OPTION', 'BOOKED'):
            return Response({'detail': f'Só é possível check-in de reservas em Opção/Reservada (atual: '
                                       f'{res.get_status_display()}).'}, status=400)
        room_id = request.data.get('room')
        with transaction.atomic():
            if room_id:
                try:
                    room = Room.objects.select_for_update().get(pk=room_id, hotel=res.hotel)
                except Room.DoesNotExist:
                    return Response({'detail': 'Quarto não encontrado.'}, status=404)
                if room.status == 'OCCUPIED':
                    return Response({'detail': 'Quarto já está ocupado.'}, status=409)
                if room.status == 'OOO':
                    return Response({'detail': f'Quarto {room.number} está fora de serviço.'}, status=409)
                if room.status == 'VACANT_DIRTY' and not request.data.get('allow_dirty'):
                    return Response({'detail': f'Quarto {room.number} está por limpar. Marque "Permitir mesmo '
                                               f'se quarto estiver sujo" para continuar.'}, status=409)
                clash = room_conflict(room, res.check_in, res.check_out, exclude_id=res.pk)
                if clash:
                    return Response({'detail': f'OVERBOOKING: o quarto {room.number} está reservado para '
                                               f'{clash.guest.name} ({clash.check_in} a {clash.check_out}).'},
                                    status=409)
                res.room = room
                room.status = 'OCCUPIED'
                room.save(update_fields=['status'])
            elif not res.room:
                return Response({'detail': 'Atribua um quarto antes do check-in.'}, status=400)
            else:
                res.room.status = 'OCCUPIED'
                res.room.save(update_fields=['status'])

            res.status = 'CHECKED_IN'
            res.checked_in_at = timezone.now()
            res.save()

            folio = Folio.objects.create(reservation=res, number=_next_number(Folio.objects, 'number', 'FOL'))
            rate = res.rate or (res.rate_plan.price_per_night if res.rate_plan else res.room_type.base_rate)
            today = timezone.localdate()
            if rate and res.nights > 0:
                FolioCharge.objects.create(
                    folio=folio, charge_type='ROOM',
                    description=f"Alojamento {today.isoformat()} · Quarto {res.room.number if res.room else '?'}",
                    amount=rate, source_reference=f'ROOM-{today.isoformat()}',
                    posted_by=request.data.get('operator', 'reception'),
                )
        return Response(self.get_serializer(res).data)

    @action(detail=True, methods=['post'])
    def check_out(self, request, pk=None):
        res = self.get_object()
        if res.status != 'CHECKED_IN':
            return Response({'detail': 'A reserva não está em check-in.'}, status=400)
        open_folios = list(res.folios.filter(status='OPEN'))
        devedoras = [f for f in open_folios if f.balance != 0]
        if devedoras:
            det = ' · '.join(f'{f.label}: {f.balance}' for f in devedoras)
            return Response({'detail': f'Contas por liquidar antes do check-out — {det}'}, status=409)
        with transaction.atomic():
            for folio in open_folios:
                folio.status = 'CLOSED'
                folio.closed_at = timezone.now()
                folio.save(update_fields=['status', 'closed_at'])
            if res.room:
                res.room.status = 'VACANT_DIRTY'
                res.room.save(update_fields=['status'])
            res.status = 'CHECKED_OUT'
            res.checked_out_at = timezone.now()
            res.save()
        return Response(self.get_serializer(res).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        res = self.get_object()
        if res.status == 'CHECKED_OUT':
            return Response({'detail': 'Reserva já concluída.'}, status=400)
        res.status = 'CANCELLED'
        res.save(update_fields=['status'])
        return Response(self.get_serializer(res).data)

    @action(detail=False, methods=['post'], url_path='quick-assign')
    def quick_assign(self, request):
        """Atribuição Rápida de Quartos — associa um quarto livre a uma reserva
        sem quarto ainda (não faz check-in, só atribui)."""
        res_id = request.data.get('reservation')
        room_id = request.data.get('room')
        try:
            res = Reservation.objects.select_for_update().get(pk=res_id)
            room = Room.objects.select_for_update().get(pk=room_id, hotel=res.hotel)
        except (Reservation.DoesNotExist, Room.DoesNotExist):
            return Response({'detail': 'Reserva ou quarto não encontrado.'}, status=404)
        if room.room_type_id != res.room_type_id:
            return Response({'detail': f'"{room.number}" não é da categoria reservada '
                                       f'({res.room_type.name}).'}, status=400)
        clash = room_conflict(room, res.check_in, res.check_out, exclude_id=res.pk)
        if clash:
            return Response({'detail': f'"{room.number}" já está reservado nessas datas.'}, status=409)
        res.room = room
        res.save(update_fields=['room'])
        return Response(self.get_serializer(res).data)

    @action(detail=False, methods=['post'], url_path='change-room')
    def change_room(self, request):
        """Mudança de Quarto — troca o quarto de uma reserva já em check-in
        (ou por atribuir), sem mexer no folio."""
        res_id = request.data.get('reservation')
        new_room_id = request.data.get('room')
        try:
            res = Reservation.objects.select_for_update().get(pk=res_id)
            new_room = Room.objects.select_for_update().get(pk=new_room_id, hotel=res.hotel)
        except (Reservation.DoesNotExist, Room.DoesNotExist):
            return Response({'detail': 'Reserva ou quarto não encontrado.'}, status=404)
        if new_room.status == 'OCCUPIED':
            return Response({'detail': f'"{new_room.number}" já está ocupado.'}, status=409)
        clash = room_conflict(new_room, res.check_in, res.check_out, exclude_id=res.pk)
        if clash:
            return Response({'detail': f'"{new_room.number}" já está reservado nessas datas.'}, status=409)
        with transaction.atomic():
            old_room = res.room
            res.room = new_room
            res.save(update_fields=['room'])
            if res.status == 'CHECKED_IN':
                new_room.status = 'OCCUPIED'
                new_room.save(update_fields=['status'])
                if old_room:
                    old_room.status = 'VACANT_DIRTY'
                    old_room.save(update_fields=['status'])
        return Response(self.get_serializer(res).data)


# ==========================================================================
# FOLIO — a conta do hóspede
# ==========================================================================

class FolioViewSet(HotelScopedMixin, viewsets.ModelViewSet):
    hotel_path = 'reservation__hotel'
    hotel_write_field = None
    queryset = Folio.objects.select_related('reservation__guest', 'reservation__room').prefetch_related('charges').all()
    serializer_class = FolioSerializer

    @action(detail=True, methods=['post'])
    def post_charge(self, request, pk=None):
        """Lança um encargo no folio — usado também pela integração POS
        (dest_kind='ROOM' / charge_to_room)."""
        folio = self.get_object()
        if folio.status != 'OPEN':
            return Response({'detail': 'Folio fechado.'}, status=400)
        try:
            amount = request.data['amount']
        except KeyError:
            return Response({'detail': 'amount é obrigatório.'}, status=400)
        # Sem isto, um valor negativo (ou zero) passava direto para o lançamento: reduzia
        # o total da conta sem deixar rasto de estorno (o estorno tem o SEU próprio botão,
        # `reverse-charge`, que preserva o original) e, se a conta chegasse a ser faturada
        # assim, ia uma linha negativa para dentro de um documento fiscal assinado.
        try:
            amount = Decimal(str(amount))
        except (InvalidOperation, TypeError, ValueError):
            return Response({'detail': 'amount inválido.'}, status=400)
        if amount <= 0:
            return Response({'detail': 'amount tem de ser positivo — para estornar um '
                             'lançamento use "reverse-charge".'}, status=400)
        charge = FolioCharge.objects.create(
            folio=folio, charge_type=request.data.get('charge_type', 'MISC'),
            description=request.data.get('description', 'Encargo'), amount=amount,
            source_reference=request.data.get('source_reference'),
            posted_by=request.data.get('posted_by', 'reception'),
        )
        return Response(FolioChargeSerializer(charge).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def settle(self, request, pk=None):
        folio = self.get_object()
        amount = request.data.get('amount', folio.balance)
        FolioCharge.objects.create(
            folio=folio, charge_type='PAYMENT',
            description=request.data.get('description', 'Pagamento'),
            amount=amount, posted_by=request.data.get('posted_by', 'reception'),
        )
        return Response(self.get_serializer(folio).data)

    @action(detail=True, methods=['post'])
    def split(self, request, pk=None):
        folio = self.get_object()
        res = folio.reservation
        n = res.folios.count()
        letter = chr(ord('A') + n)
        new = Folio.objects.create(
            reservation=res, number=_next_number(Folio.objects, 'number', 'FOL'),
            label=request.data.get('label') or f'{letter} · Extras',
            payer_type=request.data.get('payer_type', 'GUEST'),
            payer_name=request.data.get('payer_name') or res.guest.name,
            payer_nif=request.data.get('payer_nif'), is_primary=False,
        )
        return Response(self.get_serializer(new).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='transfer-charge')
    def transfer_charge(self, request, pk=None):
        folio = self.get_object()
        charge = folio.charges.filter(pk=request.data.get('charge'), is_void=False).first()
        if not charge:
            return Response({'detail': 'Lançamento não encontrado nesta conta.'}, status=404)
        target = Folio.objects.filter(pk=request.data.get('target_folio'), reservation=folio.reservation).first()
        if not target:
            return Response({'detail': 'A conta de destino tem de pertencer à mesma reserva.'}, status=400)
        if target.status != 'OPEN' or folio.status != 'OPEN':
            return Response({'detail': 'Só se transferem lançamentos entre contas abertas.'}, status=400)
        origin = folio.number
        charge.folio = target
        charge.transferred_from = origin
        charge.transferred_at = timezone.now()
        charge.save(update_fields=['folio', 'transferred_from', 'transferred_at'])
        return Response({'detail': f'"{charge.description}" transferido de {origin} para '
                                   f'{target.number} ({target.label}).',
                         'charge': FolioChargeSerializer(charge).data})

    @action(detail=True, methods=['post'], url_path='reverse-charge')
    def reverse_charge(self, request, pk=None):
        folio = self.get_object()
        charge = folio.charges.filter(pk=request.data.get('charge')).first()
        if not charge:
            return Response({'detail': 'Lançamento não encontrado.'}, status=404)
        if charge.is_void:
            return Response({'detail': 'Este lançamento já foi estornado.'}, status=400)
        if folio.status != 'OPEN':
            return Response({'detail': 'A conta está fechada.'}, status=400)
        reason = request.data.get('reason') or 'Estorno'
        user = str(getattr(request.user, 'username', '') or 'reception')
        now = timezone.now()
        with transaction.atomic():
            charge.is_void = True
            charge.void_reason = reason
            charge.voided_at = now
            charge.voided_by = user
            charge.save(update_fields=['is_void', 'void_reason', 'voided_at', 'voided_by'])
            rev = FolioCharge.objects.create(
                folio=folio, charge_type=charge.charge_type,
                description=f'ESTORNO — {charge.description} ({reason})',
                amount=-charge.amount, source_reference=charge.source_reference,
                posted_by=user, is_void=True, reversal_of=charge,
                void_reason=reason, voided_at=now, voided_by=user,
            )
        return Response({'detail': f'Lançamento estornado ({charge.amount}). O original fica no histórico.',
                         'reversal': FolioChargeSerializer(rev).data, 'balance': folio.balance})

    @action(detail=True, methods=['post'], url_path='generate-invoice')
    @transaction.atomic
    def generate_invoice(self, request, pk=None):
        """Gera a Factura fiscal (AGT) do folio. Idempotente.

        @transaction.atomic: `emit_for_pms_folio` bloqueia a linha do folio
        (select_for_update) para fechar a corrida do duplo-clique — exige estar dentro
        de uma transação, senão o Django levanta erro.
        """
        folio = self.get_object()
        if folio.fiscal_document_number:
            return Response({'detail': f'Folio já faturado ({folio.fiscal_document_number}).'}, status=400)
        charges = [c for c in folio.charges.all() if c.charge_type != 'PAYMENT' and not c.is_void]
        if not charges:
            return Response({'detail': 'Folio sem consumos a faturar.'}, status=400)
        from fiscal.integration import emit_for_pms_folio
        doc = emit_for_pms_folio(folio, charges, user=getattr(request, 'user', None))
        if not doc:
            return Response({'detail': 'Não foi possível emitir o documento fiscal (verifique a série/config).'}, status=409)
        folio.fiscal_document_number = doc.invoice_no
        folio.save(update_fields=['fiscal_document_number'])
        return Response({'invoice_number': doc.invoice_no, 'total': str(doc.gross_total),
                         'customer': doc.customer_name, 'folio': folio.label}, status=201)


# ==========================================================================
# MAPA DE REFEIÇÕES
# ==========================================================================

class MealPlanEntryViewSet(viewsets.ModelViewSet):
    queryset = MealPlanEntry.objects.all()
    serializer_class = MealPlanEntrySerializer

    def get_queryset(self):
        qs = super().get_queryset()
        reservation = self.request.query_params.get('reservation')
        if reservation:
            qs = qs.filter(reservation_id=reservation)
        return qs

    @action(detail=False, methods=['post'], url_path='apply-range')
    def apply_range(self, request):
        """Grava (upsert) a mesma refeição para todas as datas De→Até de uma
        vez — é o que o popup "Editar" do Mapa de Refeições faz."""
        p = request.data
        try:
            reservation = Reservation.objects.get(pk=p['reservation'])
        except (Reservation.DoesNotExist, KeyError):
            return Response({'detail': 'Reserva não encontrada.'}, status=404)
        meal_code = p.get('meal_code')
        if meal_code not in dict(MealPlanEntry.MEALS):
            return Response({'detail': 'Refeição inválida.'}, status=400)
        from datetime import date, timedelta
        d_from = date.fromisoformat(p['date_from'])
        d_to = date.fromisoformat(p['date_to'])
        if d_to < d_from:
            d_from, d_to = d_to, d_from
        defaults = {
            'adults': int(p.get('adults') or 0), 'children_1': int(p.get('children_1') or 0),
            'children_2': int(p.get('children_2') or 0), 'children_3': int(p.get('children_3') or 0),
            'info': p.get('info') or None,
        }
        criados = []
        d = d_from
        while d <= d_to:
            row, _ = MealPlanEntry.objects.update_or_create(
                reservation=reservation, meal_code=meal_code, date=d, defaults=defaults)
            criados.append(row.id)
            d += timedelta(days=1)
        return Response({'detail': f'{len(criados)} dia(s) atualizado(s).', 'ids': criados}, status=200)
