from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Guest, RoomType, Room, Reservation, Folio, FolioCharge
from .serializers import (
    GuestSerializer, RoomTypeSerializer, RoomSerializer,
    ReservationSerializer, FolioSerializer, FolioChargeSerializer,
)
from core.tenancy import HotelScopedMixin, default_hotel_id, allowed_hotel_ids, scope_qs


def _next_number(qs, field, prefix):
    """Sequência simples por prefixo (ex: RES-000001)."""
    n = qs.count() + 1
    while qs.filter(**{field: f"{prefix}-{n:06d}"}).exists():
        n += 1
    return f"{prefix}-{n:06d}"


class HotelDefaultMixin:
    """Se o hotel não for enviado, usa o hotel principal (single-hotel dev).
    Injeta o hotel ANTES da validação (senão o UniqueTogetherValidator de
    (hotel, código/número) rejeita com 'hotel obrigatório')."""
    def create(self, request, *args, **kwargs):
        if not request.data.get('hotel'):
            from identity.models import Hotel
            h = Hotel.objects.first()
            if h:
                data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
                data['hotel'] = h.id
                serializer = self.get_serializer(data=data)
                serializer.is_valid(raise_exception=True)
                self.perform_create(serializer)
                from rest_framework.response import Response
                from rest_framework import status
                return Response(serializer.data, status=status.HTTP_201_CREATED, headers=self.get_success_headers(serializer.data))
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        if not serializer.validated_data.get('hotel'):
            from identity.models import Hotel
            serializer.save(hotel=Hotel.objects.first())
        else:
            serializer.save()


class GuestViewSet(HotelScopedMixin, HotelDefaultMixin, viewsets.ModelViewSet):
    queryset = Guest.objects.all()
    serializer_class = GuestSerializer


class RoomTypeViewSet(HotelScopedMixin, HotelDefaultMixin, viewsets.ModelViewSet):
    queryset = RoomType.objects.all()
    serializer_class = RoomTypeSerializer


class RoomViewSet(HotelScopedMixin, HotelDefaultMixin, viewsets.ModelViewSet):
    queryset = Room.objects.select_related('room_type').all()
    serializer_class = RoomSerializer

    @action(detail=True, methods=['post'])
    def set_status(self, request, pk=None):
        room = self.get_object()
        new_status = request.data.get('status')
        valid = dict(Room.STATUS)
        if new_status not in valid:
            return Response({'detail': 'Estado inválido.'}, status=400)
        room.status = new_status
        room.save(update_fields=['status'])
        return Response(self.get_serializer(room).data)


def room_conflict(room, check_in, check_out, exclude_id=None):
    """Outra reserva viva ocupa este quarto nestas datas? (anti-overbooking)

    Sobreposição real de estadias: começa antes de a outra acabar E acaba depois de
    a outra começar. Reservas canceladas / com check-out feito não contam.
    """
    if not room:
        return None
    qs = (Reservation.objects
          .filter(room=room, status__in=['BOOKED', 'CHECKED_IN'])
          .filter(check_in__lt=check_out, check_out__gt=check_in))
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)
    return qs.first()


class ReservationViewSet(HotelScopedMixin, viewsets.ModelViewSet):
    queryset = Reservation.objects.select_related('guest', 'room_type', 'room').all()
    serializer_class = ReservationSerializer

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
                                       f'{clash.guest.full_name}). Escolha outro quarto ou outras datas.'},
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
            serializer.validated_data['confirmation'] = _next_number(
                Reservation.objects, 'confirmation', 'RES')
        # O hotel é SEMPRE o hotel ativo do utilizador — nunca o que vier do cliente.
        from identity.models import Hotel
        hid = default_hotel_id(self.request)
        serializer.save(hotel=Hotel.objects.get(pk=hid) if hid else None)

    @action(detail=True, methods=['post'])
    def check_in(self, request, pk=None):
        """Atribui quarto, marca CHECKED_IN, abre folio e lança a diária de alojamento."""
        res = self.get_object()
        if res.status not in ('BOOKED',):
            return Response({'detail': f'Só é possível check-in de reservas em estado BOOKED (atual: {res.status}).'}, status=400)

        room_id = request.data.get('room')
        with transaction.atomic():
            if room_id:
                try:
                    room = Room.objects.select_for_update().get(pk=room_id, hotel=res.hotel)
                except Room.DoesNotExist:
                    return Response({'detail': 'Quarto não encontrado.'}, status=404)
                if room.status == 'OCCUPIED':
                    return Response({'detail': 'Quarto já está ocupado.'}, status=409)
                if room.status == 'OUT_OF_ORDER':
                    return Response({'detail': f'Quarto {room.number} está fora de serviço.'}, status=409)
                clash = room_conflict(room, res.check_in, res.check_out, exclude_id=res.pk)
                if clash:
                    return Response({'detail': f'OVERBOOKING: o quarto {room.number} está reservado para '
                                               f'{clash.guest.full_name} ({clash.check_in} a {clash.check_out}).'},
                                    status=409)
                res.room = room
                room.status = 'OCCUPIED'
                room.save(update_fields=['status'])
            res.status = 'CHECKED_IN'
            res.checked_in_at = timezone.now()
            res.save()

            folio = Folio.objects.create(
                reservation=res,
                number=_next_number(Folio.objects, 'number', 'FOL'),
            )
            # ALOJAMENTO: lança-se NOITE A NOITE, nunca a estadia toda de uma vez.
            # (Antes lançava rate × noites aqui E o Night Audit voltava a lançar a diária
            #  todas as noites → o hóspede era cobrado duas vezes. Além disso, com a estadia
            #  toda pré-lançada, uma saída antecipada ou uma extensão davam contas erradas.)
            # Aqui lança-se apenas a 1ª noite, com a mesma referência que o Night Audit usa,
            # para que ele não a repita.
            rate = res.rate or (res.room_type.base_rate if res.room_type else 0)
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
        """Fecha o folio (exige saldo 0), liberta o quarto (VACANT_DIRTY)."""
        res = self.get_object()
        if res.status != 'CHECKED_IN':
            return Response({'detail': 'A reserva não está em check-in.'}, status=400)
        # Com contas divididas, TODAS têm de estar saldadas — não só a principal.
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
        if res.status in ('CHECKED_OUT',):
            return Response({'detail': 'Reserva já concluída.'}, status=400)
        res.status = 'CANCELLED'
        res.save(update_fields=['status'])
        return Response(self.get_serializer(res).data)


class FolioViewSet(HotelScopedMixin, viewsets.ModelViewSet):
    hotel_path = 'reservation__hotel'
    hotel_write_field = None
    queryset = Folio.objects.select_related('reservation__guest', 'reservation__room').prefetch_related('charges').all()
    serializer_class = FolioSerializer

    @action(detail=True, methods=['post'])
    def post_charge(self, request, pk=None):
        """Lança um charge/pagamento no folio (usado também pela integração POS room-charge)."""
        folio = self.get_object()
        if folio.status != 'OPEN':
            return Response({'detail': 'Folio fechado.'}, status=400)
        data = request.data
        try:
            amount = data['amount']
        except KeyError:
            return Response({'detail': 'amount é obrigatório.'}, status=400)
        charge = FolioCharge.objects.create(
            folio=folio,
            charge_type=data.get('charge_type', 'MISC'),
            description=data.get('description', 'Charge'),
            amount=amount,
            source_reference=data.get('source_reference'),
            posted_by=data.get('posted_by', 'reception'),
        )
        return Response(FolioChargeSerializer(charge).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def settle(self, request, pk=None):
        """Regista um pagamento que liquida o saldo do folio."""
        folio = self.get_object()
        amount = request.data.get('amount', folio.balance)
        FolioCharge.objects.create(
            folio=folio, charge_type='PAYMENT',
            description=request.data.get('description', 'Pagamento'),
            amount=amount, posted_by=request.data.get('posted_by', 'reception'),
        )
        return Response(self.get_serializer(folio).data)

    # ------------------------------------------------------------------
    # FOLIO PROFISSIONAL — dividir, transferir, estornar.
    # É aqui que se distingue um PMS de hotel de uma folha de cálculo.
    # ------------------------------------------------------------------
    @action(detail=True, methods=['post'])
    def split(self, request, pk=None):
        """Abre uma SEGUNDA conta na mesma reserva (ex.: A = empresa, B = extras do hóspede).

        Caso típico: a empresa paga o alojamento; o hóspede paga o bar e o minibar.
        No check-out, cada conta é faturada a quem deve pagar.
        """
        folio = self.get_object()
        res = folio.reservation
        n = res.folios.count()
        letter = chr(ord('A') + n)
        new = Folio.objects.create(
            reservation=res,
            number=_next_number(Folio.objects, 'number', 'FOL'),
            label=request.data.get('label') or f'{letter} · Extras',
            payer_type=request.data.get('payer_type', 'GUEST'),
            payer_name=request.data.get('payer_name') or res.guest.full_name,
            payer_nif=request.data.get('payer_nif'),
            is_primary=False,
        )
        return Response(self.get_serializer(new).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def transfer_charge(self, request, pk=None):
        """Move um lançamento para outra conta da MESMA reserva.

        O bar foi lançado na conta da empresa quando devia ir para a do hóspede?
        Transfere-se — e fica registado de onde veio (não se falsifica o histórico).
        """
        folio = self.get_object()
        charge_id = request.data.get('charge')
        target_id = request.data.get('target_folio')
        charge = folio.charges.filter(pk=charge_id, is_void=False).first()
        if not charge:
            return Response({'detail': 'Lançamento não encontrado nesta conta.'}, status=404)
        target = Folio.objects.filter(pk=target_id, reservation=folio.reservation).first()
        if not target:
            return Response({'detail': 'A conta de destino tem de pertencer à mesma reserva.'}, status=400)
        if target.status != 'OPEN' or folio.status != 'OPEN':
            return Response({'detail': 'Só se transferem lançamentos entre contas abertas.'}, status=400)

        origin = folio.number
        charge.folio = target
        charge.transferred_from = origin
        charge.transferred_at = timezone.now()
        charge.save(update_fields=['folio', 'transferred_from', 'transferred_at'])
        return Response({
            'detail': f'"{charge.description}" transferido de {origin} para {target.number} ({target.label}).',
            'charge': FolioChargeSerializer(charge).data,
        })

    @action(detail=True, methods=['post'])
    def reverse_charge(self, request, pk=None):
        """ESTORNO — anula um lançamento errado SEM o apagar.

        Contabilisticamente não se apaga nada: marca-se o original como anulado e
        cria-se um lançamento de sinal contrário. Os dois ficam visíveis na conta —
        é isto que um auditor espera ver.
        """
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
            # Lançamento de sinal contrário (o estorno propriamente dito).
            rev = FolioCharge.objects.create(
                folio=folio, charge_type=charge.charge_type,
                description=f'ESTORNO — {charge.description} ({reason})',
                amount=-charge.amount, source_reference=charge.source_reference,
                posted_by=user, is_void=True, reversal_of=charge,
                void_reason=reason, voided_at=now, voided_by=user,
            )
        return Response({
            'detail': f'Lançamento estornado ({charge.amount}). O original fica no histórico.',
            'reversal': FolioChargeSerializer(rev).data,
            'balance': folio.balance,
        })

    @action(detail=True, methods=['post'])
    def generate_invoice(self, request, pk=None):
        """Gera a FATURA financeira do folio (Contas a Receber do hóspede). Idempotente."""
        folio = self.get_object()
        if folio.invoice_number:
            return Response({'detail': f'Folio já faturado ({folio.invoice_number}).'}, status=400)
        try:
            from finance.models import Invoice, InvoiceLine, FinanceAccount
            from identity.models import Hotel
        except ImportError:
            return Response({'detail': 'Módulo Financeiro não ativo.'}, status=409)
        from django.utils import timezone
        guest = folio.reservation.guest
        # Só entra o que está vivo: os lançamentos estornados não se faturam.
        charges = [c for c in folio.charges.all() if c.charge_type != 'PAYMENT' and not c.is_void]
        if not charges:
            return Response({'detail': 'Folio sem consumos a faturar.'}, status=400)
        n = Invoice.objects.count() + 1
        number = f'FT-{n:06d}'
        while Invoice.objects.filter(number=number).exists():
            n += 1; number = f'FT-{n:06d}'
        inv = Invoice.objects.create(
            number=number, hotel=folio.reservation.hotel,
            customer_name=folio.payer_name or guest.full_name,
            customer_tax_id=folio.payer_nif or getattr(guest, 'tax_id', None),
            date=timezone.localdate(), status='DRAFT',
            notes=f'Folio {folio.number} · {folio.label}')
        for c in charges:
            InvoiceLine.objects.create(invoice=inv, description=c.description, quantity=1,
                                       unit_price=c.amount, tax_percentage=0)
        inv.recompute(); inv.status = 'ISSUED'; inv.save(update_fields=['status'])
        folio.invoice_number = inv.number; folio.save(update_fields=['invoice_number'])
        return Response({'invoice_number': inv.number, 'total': inv.total,
                         'customer': inv.customer_name, 'folio': folio.label}, status=201)


from .models import HousekeepingTask, MaintenanceOrder, RatePlan
from .serializers import HousekeepingTaskSerializer, MaintenanceOrderSerializer, RatePlanSerializer


def _first_hotel():
    from identity.models import Hotel
    return Hotel.objects.first()


class HousekeepingTaskViewSet(viewsets.ModelViewSet):
    """Governanta — tarefas de limpeza; concluir marca o quarto limpo."""
    serializer_class = HousekeepingTaskSerializer

    def get_queryset(self):
        qs = scope_qs(self.request, HousekeepingTask.objects.select_related('room').all(), 'room__hotel')
        for f in ('status', 'room', 'assigned_to'):
            v = self.request.query_params.get(f)
            if v:
                qs = qs.filter(**{f: v})
        return qs

    @action(detail=True, methods=['post'])
    def assign(self, request, pk=None):
        task = self.get_object()
        task.assigned_to = request.data.get('assigned_to') or task.assigned_to
        task.save(update_fields=['assigned_to'])
        return Response(self.get_serializer(task).data)

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        task = self.get_object()
        task.status = 'IN_PROGRESS'
        task.started_at = timezone.now()
        task.save(update_fields=['status', 'started_at'])
        return Response(self.get_serializer(task).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Conclui a limpeza — o quarto passa a Livre/Limpo (se não estiver ocupado/OOO)."""
        task = self.get_object()
        task.status = 'DONE'
        task.completed_at = timezone.now()
        task.save(update_fields=['status', 'completed_at'])
        room = task.room
        if room.status == 'VACANT_DIRTY':
            room.status = 'VACANT_CLEAN'
            room.save(update_fields=['status'])
        return Response(self.get_serializer(task).data)


class MaintenanceOrderViewSet(viewsets.ModelViewSet):
    """Manutenção — ordens de trabalho; alta prioridade pode pôr quarto fora de serviço."""
    serializer_class = MaintenanceOrderSerializer
    search_fields = ['title', 'description', 'area']

    def get_queryset(self):
        qs = scope_qs(self.request, MaintenanceOrder.objects.select_related('room').all())
        for f in ('status', 'priority', 'room'):
            v = self.request.query_params.get(f)
            if v:
                qs = qs.filter(**{f: v})
        return qs

    def perform_create(self, serializer):
        order = serializer.save(hotel=serializer.validated_data.get('hotel') or _first_hotel())
        if order.set_room_ooo and order.room:
            order.room.status = 'OOO'
            order.room.save(update_fields=['status'])

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        order = self.get_object()
        order.status = 'RESOLVED'
        order.resolved_at = timezone.now()
        order.save(update_fields=['status', 'resolved_at'])
        # Devolve o quarto a serviço (por limpar) se estava fora de serviço por esta ordem.
        if order.room and order.room.status == 'OOO':
            order.room.status = 'VACANT_DIRTY'
            order.room.save(update_fields=['status'])
        return Response(self.get_serializer(order).data)


class RatePlanViewSet(viewsets.ModelViewSet):
    """Tarifas — planos de preço por tipo de quarto."""
    serializer_class = RatePlanSerializer

    def get_queryset(self):
        qs = scope_qs(self.request, RatePlan.objects.select_related('room_type').all())
        rt = self.request.query_params.get('room_type')
        return qs.filter(room_type_id=rt) if rt else qs

    def perform_create(self, serializer):
        serializer.save(hotel=serializer.validated_data.get('hotel') or _first_hotel())


from .models import LaundryOrder, MinibarItem, SpaAppointment, Folio, FolioCharge
from .serializers import LaundryOrderSerializer, MinibarItemSerializer, SpaAppointmentSerializer


def _room_open_folio(room):
    """Folio aberto do quarto (via reserva em check-in)."""
    if not room:
        return None
    res = room.reservations.filter(status='CHECKED_IN').order_by('-checked_in_at').first()
    if res and hasattr(res, 'folio') and res.folio and res.folio.status == 'OPEN':
        return res.folio
    return None


def _post_charge(room, charge_type, description, amount, by=None, ref=None):
    """Lança um consumo no folio aberto do quarto. Devolve (ok, msg)."""
    folio = _room_open_folio(room)
    if not folio:
        return False, 'Sem folio aberto para o quarto (o hóspede tem de estar em check-in).'
    FolioCharge.objects.create(folio=folio, charge_type=charge_type, description=description,
                               amount=amount, posted_by=by, source_reference=ref)
    return True, folio.number


class LaundryOrderViewSet(viewsets.ModelViewSet):
    """Lavandaria — pedidos por quarto; lança no folio."""
    serializer_class = LaundryOrderSerializer
    search_fields = ['guest_name', 'description']

    def get_queryset(self):
        qs = scope_qs(self.request, LaundryOrder.objects.select_related('room').all())
        v = self.request.query_params.get('status')
        return qs.filter(status=v) if v else qs

    def perform_create(self, serializer):
        serializer.save(hotel=serializer.validated_data.get('hotel') or _first_hotel())

    @action(detail=True, methods=['post'])
    def charge_folio(self, request, pk=None):
        order = self.get_object()
        if order.charged:
            return Response({'detail': 'Já lançado no folio.'}, status=400)
        ok, msg = _post_charge(order.room, 'LAUNDRY', f'Lavandaria: {order.description}', order.total,
                               by=str(getattr(request.user, 'username', '')), ref=f'LAU-{order.id}')
        if not ok:
            return Response({'detail': msg}, status=400)
        order.charged = True
        order.save(update_fields=['charged'])
        return Response({'detail': f'Lançado no folio {msg}', **self.get_serializer(order).data})


class MinibarItemViewSet(viewsets.ModelViewSet):
    """Catálogo de minibar + lançamento de consumo no folio (ação post_consumption)."""
    serializer_class = MinibarItemSerializer

    def get_queryset(self):
        return MinibarItem.objects.all()

    def perform_create(self, serializer):
        serializer.save(hotel=serializer.validated_data.get('hotel') or _first_hotel())

    @action(detail=False, methods=['post'])
    def post_consumption(self, request):
        """Lança consumos de minibar num quarto: {room, items:[{name, price, qty}]}."""
        from decimal import Decimal
        room = Room.objects.filter(pk=request.data.get('room')).first()
        if not room:
            return Response({'detail': 'Quarto inválido.'}, status=400)
        items = request.data.get('items') or []
        total = Decimal('0')
        desc = []
        for it in items:
            qty = int(it.get('qty') or 1)
            price = Decimal(str(it.get('price') or 0))
            total += price * qty
            desc.append(f"{qty}x {it.get('name')}")
        if total <= 0:
            return Response({'detail': 'Sem consumos.'}, status=400)
        ok, msg = _post_charge(room, 'MINIBAR', 'Minibar: ' + ', '.join(desc), total,
                               by=str(getattr(request.user, 'username', '')))
        if not ok:
            return Response({'detail': msg}, status=400)
        return Response({'detail': f'Lançado no folio {msg}', 'total': str(total)})


class SpaAppointmentViewSet(viewsets.ModelViewSet):
    """Spa — marcações; lança no folio."""
    serializer_class = SpaAppointmentSerializer
    search_fields = ['guest_name', 'service', 'therapist']

    def get_queryset(self):
        qs = scope_qs(self.request, SpaAppointment.objects.select_related('room').all())
        v = self.request.query_params.get('status')
        return qs.filter(status=v) if v else qs

    def perform_create(self, serializer):
        serializer.save(hotel=serializer.validated_data.get('hotel') or _first_hotel())

    @action(detail=True, methods=['post'])
    def charge_folio(self, request, pk=None):
        appt = self.get_object()
        if appt.charged:
            return Response({'detail': 'Já lançado no folio.'}, status=400)
        ok, msg = _post_charge(appt.room, 'SPA', f'Spa: {appt.service}', appt.price,
                               by=str(getattr(request.user, 'username', '')), ref=f'SPA-{appt.id}')
        if not ok:
            return Response({'detail': msg}, status=400)
        appt.charged = True
        appt.status = 'DONE'
        appt.save(update_fields=['charged', 'status'])
        return Response({'detail': f'Lançado no folio {msg}', **self.get_serializer(appt).data})


from rest_framework.views import APIView
from .models import CorporateAccount, NightAuditLog
from .serializers import CorporateAccountSerializer, NightAuditLogSerializer


class CorporateAccountViewSet(viewsets.ModelViewSet):
    """Agências / Empresas — contas de crédito."""
    serializer_class = CorporateAccountSerializer
    search_fields = ['name', 'tax_id', 'contact_person']

    def get_queryset(self):
        qs = scope_qs(self.request, CorporateAccount.objects.all())
        k = self.request.query_params.get('kind')
        return qs.filter(kind=k) if k else qs

    def perform_create(self, serializer):
        serializer.save(hotel=serializer.validated_data.get('hotel') or _first_hotel())


class PmsDashboardView(APIView):
    """Dashboard PMS — ocupação, chegadas/saídas, receita, housekeeping, manutenção."""

    def get(self, request):
        from django.utils import timezone
        from decimal import Decimal
        today = timezone.localdate()
        rooms = Room.objects.all()
        total = rooms.count()
        by_status = {}
        for r in rooms.values('status'):
            by_status[r['status']] = by_status.get(r['status'], 0) + 1
        occupied = by_status.get('OCCUPIED', 0)
        in_house = Reservation.objects.filter(status='CHECKED_IN')
        arrivals = Reservation.objects.filter(status='BOOKED', check_in=today).count()
        departures = in_house.filter(check_out=today).count()
        # Receita: alojamento (folios abertos) + consumos
        folios = Folio.objects.filter(status='OPEN')
        room_rev = sum((c.amount for f in folios for c in f.charges.all() if c.charge_type == 'ROOM'), Decimal('0'))
        fnb_rev = sum((c.amount for f in folios for c in f.charges.all() if c.charge_type in ('FNB', 'MINIBAR', 'LAUNDRY', 'SPA')), Decimal('0'))
        return Response({
            'date': today.isoformat(),
            'rooms_total': total,
            'occupied': occupied,
            'occupancy_pct': round(100 * occupied / total) if total else 0,
            'rooms_by_status': by_status,
            'in_house': in_house.count(),
            'arrivals_today': arrivals,
            'departures_today': departures,
            'open_folios': folios.count(),
            'room_revenue': str(room_rev),
            'ancillary_revenue': str(fnb_rev),
            'housekeeping_pending': HousekeepingTask.objects.filter(status__in=['PENDING', 'IN_PROGRESS']).count(),
            'maintenance_open': MaintenanceOrder.objects.filter(status__in=['OPEN', 'IN_PROGRESS']).count(),
            'dirty_rooms': by_status.get('VACANT_DIRTY', 0),
            'ooo_rooms': by_status.get('OOO', 0),
        })


class NightAuditView(APIView):
    """Night Audit — fecho do dia: lança alojamento nas contas em check-in."""

    def get(self, request):
        # Prévia + histórico.
        logs = NightAuditLog.objects.all()[:30]
        pending = Reservation.objects.filter(status='CHECKED_IN').count()
        return Response({
            'in_house': pending,
            'last': NightAuditLogSerializer(logs.first()).data if logs.exists() else None,
            'history': NightAuditLogSerializer(logs, many=True).data,
        })

    def post(self, request):
        from django.utils import timezone
        from decimal import Decimal
        hotel = _first_hotel()
        biz = timezone.localdate()
        if NightAuditLog.objects.filter(hotel=hotel, business_date=biz).exists():
            return Response({'detail': f'Night Audit de {biz} já foi executado.'}, status=400)
        in_house = Reservation.objects.filter(status='CHECKED_IN').select_related('room')
        charged = 0
        revenue = Decimal('0')
        ref = f'ROOM-{biz.isoformat()}'
        for res in in_house:
            folio = getattr(res, 'folio', None)
            if not folio or folio.status != 'OPEN':
                continue
            if folio.charges.filter(source_reference=ref).exists():
                continue
            rate = res.rate or (res.room_type.base_rate if res.room_type else Decimal('0'))
            FolioCharge.objects.create(folio=folio, charge_type='ROOM',
                                       description=f'Alojamento {biz.isoformat()} · Quarto {res.room.number if res.room else "?"}',
                                       amount=rate, source_reference=ref,
                                       posted_by=str(getattr(request.user, 'username', '') or 'night-audit'))
            charged += 1
            revenue += rate
        log = NightAuditLog.objects.create(
            hotel=hotel, business_date=biz, rooms_charged=charged, room_revenue=revenue,
            arrivals=Reservation.objects.filter(status='BOOKED', check_in=biz).count(),
            departures=in_house.filter(check_out=biz).count(), in_house=in_house.count(),
            run_by=str(getattr(request.user, 'username', '') or ''))
        return Response(NightAuditLogSerializer(log).data, status=201)
