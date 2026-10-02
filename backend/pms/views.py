from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from core.tenancy import HotelScopedMixin, default_hotel_id, scope_qs
from .models import (
    ReservationFixedCharge, RoomAttribute,
    RoomType, Room, RatePlan, RateOverride, Block, BlockRoomType, Reservation, Folio, FolioCharge, MealPlanEntry,
    LostFoundItem, HousekeepingTask, PhoneDirectoryEntry,
)
from .serializers import (
    RoomTypeSerializer, RoomSerializer, RatePlanSerializer, RateOverrideSerializer,
    BlockSerializer, BlockRoomTypeSerializer,
    ReservationSerializer, FolioSerializer, FolioChargeSerializer, MealPlanEntrySerializer,
    LostFoundItemSerializer, HousekeepingTaskSerializer, PhoneDirectoryEntrySerializer,
    ReservationFixedChargeSerializer, RoomAttributeSerializer,
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



def lancar_depositos_no_folio(reservation, folio, posted_by='reserva online'):
    """Lança na conta do hóspede o que ele já pagou no site.

    É a ligação que faltava entre o motor de reservas e a recepção: o hóspede
    pagava o depósito online e, à chegada, era-lhe cobrada a estadia inteira
    outra vez, porque o folio nascia a zero e nada sabia do pagamento. Agora o
    depósito entra como pagamento na conta, e o saldo que a recepção vê já é o
    que falta receber.

    Só entram depósitos CONFIRMADOS (PAID) — um pedido de pagamento pendente
    não é dinheiro. `posted_to_folio` evita o lançamento em dobro se isto for
    chamado outra vez (um segundo check-in, uma confirmação repetida), e o
    `source_reference` deixa o rasto até ao pagamento de origem.
    """
    if folio is None:
        return 0
    pendentes = reservation.booking_payments.filter(status='PAID', posted_to_folio=False)
    lancados = 0
    for pagamento in pendentes:
        FolioCharge.objects.create(
            folio=folio, charge_type='PAYMENT',
            description=f'Depósito da reserva online ({pagamento.get_method_display()}'
                        + (f' · {pagamento.reference}' if pagamento.reference else '') + ')',
            amount=pagamento.amount,
            source_reference=f'BOOKING-PAY-{pagamento.id}',
            posted_by=posted_by,
        )
        pagamento.posted_to_folio = True
        pagamento.save(update_fields=['posted_to_folio'])
        lancados += 1
    return lancados


class RoomTypeViewSet(HotelScopedMixin, HotelDefaultMixin, viewsets.ModelViewSet):
    queryset = RoomType.objects.all()
    serializer_class = RoomTypeSerializer



class RoomAttributeViewSet(HotelScopedMixin, viewsets.ModelViewSet):
    """Características dos quartos (vista mar, varanda, piso alto, adaptado…).

    Tabela do hotel, não do código: cada propriedade define as suas. Os quartos
    ligam-se a elas por `Room.attributes`, e a pesquisa de quartos livres filtra
    por aqui (`?attributes=1,4`).
    """
    queryset = RoomAttribute.objects.all()
    serializer_class = RoomAttributeSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get('active') == '1':
            qs = qs.filter(is_active=True)
        return qs

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
        qs = self.filter_queryset(self.get_queryset()).prefetch_related('attributes').filter(is_active=True)
        rt = p.get('room_type')
        if rt:
            qs = qs.filter(room_type_id=rt)
        q = p.get('q')
        if q:
            qs = qs.filter(number__icontains=q)
        # ATRIBUTOS: "um com varanda e vista mar" tem de devolver os quartos que
        # têm AS DUAS coisas, não os que têm uma ou outra — daí um filtro por
        # característica de cada vez, em vez de um único `__in` (que seria OU).
        atribs = [a for a in (p.get('attributes') or '').split(',') if a.strip().isdigit()]
        for a in atribs:
            qs = qs.filter(attributes__id=a)
        qs = qs.distinct()
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
                'attributes': [a.name for a in room.attributes.all() if a.is_active],
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

    @action(detail=False, methods=['post'])
    def bulk_update(self, request):
        """Atualização em Massa (Calendário de Tarifas): aplica preço/mínimo
        de noites/disponibilidade a um conjunto de Rate Plans, só nas datas e
        dias da semana escolhidos — SEMPRE via RateOverride, nunca mexe no
        RatePlan em si (o "Remover todas as exceções" das imagens de
        referência é literalmente apagar estas linhas)."""
        d = request.data
        ids = d.get('rate_plan_ids') or []
        date_from, date_to = _parse_date(d.get('date_from')), _parse_date(d.get('date_to'))
        if not ids or not date_from or not date_to or date_to < date_from:
            return Response({'detail': 'Escolha as tarifas e um período de datas válido.'}, status=400)
        if (date_to - date_from).days > 730:
            return Response({'detail': 'Período demasiado longo (máximo 2 anos).'}, status=400)
        weekdays = d.get('weekdays')  # 0=Segunda … 6=Domingo; vazio/ausente = todos os dias
        weekdays = set(int(w) for w in weekdays) if weekdays else set(range(7))
        remove = bool(d.get('remove_overrides'))

        plans = list(scope_qs(request, RatePlan.objects.filter(id__in=ids)))
        touched = 0
        with transaction.atomic():
            for plan in plans:
                cur = date_from
                while cur <= date_to:
                    if cur.weekday() in weekdays:
                        if remove:
                            RateOverride.objects.filter(rate_plan=plan, date=cur).delete()
                        else:
                            fields = {}
                            if d.get('update_price'):
                                fields['price_per_night'] = d.get('base_price')
                            if d.get('update_min_nights'):
                                fields['min_nights'] = d.get('min_nights')
                            if d.get('update_sale_state'):
                                fields['is_bookable'] = (d.get('sale_state') == 'AVAILABLE')
                            if fields:
                                RateOverride.objects.update_or_create(rate_plan=plan, date=cur, defaults=fields)
                        touched += 1
                    cur += timedelta(days=1)
        return Response({'rate_plans': len(plans), 'days_touched': touched})


class RateOverrideViewSet(viewsets.ModelViewSet):
    queryset = RateOverride.objects.select_related('rate_plan').all()
    serializer_class = RateOverrideSerializer

    def get_queryset(self):
        qs = scope_qs(self.request, super().get_queryset(), hotel_path='rate_plan__hotel')
        rp = self.request.query_params.get('rate_plan')
        if rp:
            qs = qs.filter(rate_plan_id=rp)
        date_from, date_to = _parse_date(self.request.query_params.get('date_from')), _parse_date(self.request.query_params.get('date_to'))
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)
        return qs


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

            depositos = 0
            folio = Folio.objects.create(reservation=res, number=_next_number(Folio.objects, 'number', 'FOL'))
            rate = res.effective_rate  # única definição da regra — ver Reservation.effective_rate
            today = timezone.localdate()
            if rate and res.nights > 0:
                FolioCharge.objects.create(
                    folio=folio, charge_type='ROOM',
                    description=f"Alojamento {today.isoformat()} · Quarto {res.room.number if res.room else '?'}",
                    amount=rate, source_reference=f'ROOM-{today.isoformat()}',
                    posted_by=request.data.get('operator', 'reception'),
                )
            # Encargos fixos de uma vez só (taxa de limpeza final, por ex.):
            # os "por noite" ficam para a Auditoria da Noite, que já os lança
            # com a diária — aqui seriam lançados a dobrar.
            for enc in res.fixed_charges.filter(is_active=True, per_night=False):
                if enc.amount and enc.amount > 0:
                    FolioCharge.objects.create(
                        folio=folio, charge_type=enc.charge_type, description=enc.description,
                        amount=enc.amount, source_reference=f'FIX-{enc.id}',
                        posted_by=request.data.get('operator', 'reception'))

            # O que o hóspede já pagou no site entra agora na conta — senão
            # pagava o depósito online e a estadia inteira à chegada.
            depositos = lancar_depositos_no_folio(res, folio)

        dados = self.get_serializer(res).data
        if depositos:
            dados['deposits_posted'] = depositos
            dados['detail'] = (f'Check-in feito. {depositos} depósito(s) pago(s) online '
                               f'lançado(s) na conta.')
        return Response(dados)

    # ------------------------------------------------------------------ E-MAIL
    ASSUNTOS = {
        'PROFORMA': 'Conta da sua estadia — {conf}',
        'CONFIRMATION': 'Confirmação da sua reserva — {conf}',
        'MESSAGE': 'Mensagem do {hotel}',
    }

    @action(detail=True, methods=['post'], url_path='send-email')
    def send_email(self, request, pk=None):
        """Envia um documento/mensagem desta reserva ao hóspede.

        NÃO há motor de e-mail do PMS: é o do POS (`pos/mailer.py` +
        `EmailOutbox` + os modelos por língua de `EmailTemplate`), o mesmo que
        já manda a factura do terminal e as newsletters do Marketing. Escrever
        aqui um segundo carteiro era ter duas caixas de saída, duas listas de
        falhados e dois sítios para configurar o SMTP.

        O `body` pode vir do ecrã já composto em HTML — é o caso da pró-forma,
        que o diálogo monta para imprimir e aproveita tal e qual para o
        e-mail, de modo que o papel e o e-mail nunca mostrem contas
        diferentes. Sem `body`, escreve-se aqui um texto com os dados da
        reserva.

        Sem SMTP configurado (Parâmetros 9500-9505) o envio fica SIMULADO e
        registado — o fluxo testa-se sem mandar e-mails a clientes reais. Quem
        chama fica a saber qual dos dois aconteceu pelo `status` devolvido.
        """
        from pos import mailer
        res = self.get_object()

        tipo = (request.data.get('kind') or 'MESSAGE').upper()
        if tipo not in self.ASSUNTOS:
            return Response({'detail': f'Tipo de e-mail desconhecido: {tipo}.'}, status=400)

        destino = (request.data.get('to') or '').strip() or (
            (res.guest.email or '').strip() if res.guest_id else '')
        if not destino:
            return Response({'detail': f'{res.guest.name if res.guest_id else "O hóspede"} não tem '
                                       f'e-mail na ficha. Escreva o endereço ou preencha a ficha '
                                       f'do cliente.'}, status=400)

        hotel = res.hotel.name if res.hotel_id else ''
        assunto = (request.data.get('subject') or '').strip() or \
            self.ASSUNTOS[tipo].format(conf=res.confirmation, hotel=hotel)
        corpo = request.data.get('body') or self._corpo_por_defeito(tipo, res, hotel)

        # Modelo do Marketing, se o ecrã escolheu um: assim o hotel controla o
        # texto (e a língua do hóspede) sem passar por nós.
        modelo = None
        codigo = (request.data.get('template') or '').strip()
        if codigo:
            from pos.models import EmailTemplate
            modelo = EmailTemplate.objects.filter(code=codigo).first()
            if not modelo:
                return Response({'detail': f'Modelo de e-mail "{codigo}" não encontrado.'}, status=404)

        if modelo:
            reg = mailer.send_template(
                modelo, destino, ctx=self._contexto_email(res, hotel),
                culture=(request.data.get('culture') or 'pt-PT'),
                context_ref=res.confirmation)
        else:
            reg = mailer.send(destino, assunto, corpo, context_ref=res.confirmation)

        legenda = {'SENT': 'E-mail enviado.',
                   'SIMULATED': 'E-mail registado em modo simulado — esta instalação ainda não '
                                'tem servidor de e-mail (SMTP) configurado. Veja-o em '
                                'Marketing → Caixa de saída.',
                   'QUEUED': 'E-mail em fila de envio.',
                   'FAILED': f'Não foi possível enviar: {reg.error or "erro desconhecido"}.'}
        return Response({'id': reg.id, 'to': reg.to, 'subject': reg.subject,
                         'status': reg.status, 'detail': legenda.get(reg.status, reg.status)},
                        status=200 if reg.status != 'FAILED' else 502)

    @staticmethod
    def _contexto_email(res, hotel):
        """As variáveis que os modelos de e-mail (@Model[0].Campo) podem usar."""
        return {
            'ReservationNumber': res.confirmation, 'HotelName': hotel,
            'GuestName': res.guest.name if res.guest_id else '',
            'CheckIn': res.check_in.isoformat(), 'CheckOut': res.check_out.isoformat(),
            'Nights': res.nights, 'Adults': res.adults, 'Children': res.children,
            'RoomType': res.room_type.name if res.room_type_id else '',
            'Room': res.room.number if res.room_id else '',
            'Rate': str(res.effective_rate or 0),
            'Total': str((res.effective_rate or 0) * (res.nights or 0)),
            'Status': res.get_status_display(),
        }

    def _corpo_por_defeito(self, tipo, res, hotel):
        c = self._contexto_email(res, hotel)
        cabecalho = (f"<p>Exmo.(s) Sr.(s) <b>{c['GuestName']}</b>,</p>")
        detalhe = (
            f"<table style='border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px'>"
            f"<tr><td style='padding:3px 10px 3px 0;color:#5b6b73'>Reserva</td>"
            f"<td><b>{c['ReservationNumber']}</b></td></tr>"
            f"<tr><td style='padding:3px 10px 3px 0;color:#5b6b73'>Entrada</td><td>{c['CheckIn']}</td></tr>"
            f"<tr><td style='padding:3px 10px 3px 0;color:#5b6b73'>Saída</td><td>{c['CheckOut']}</td></tr>"
            f"<tr><td style='padding:3px 10px 3px 0;color:#5b6b73'>Noites</td><td>{c['Nights']}</td></tr>"
            f"<tr><td style='padding:3px 10px 3px 0;color:#5b6b73'>Categoria</td><td>{c['RoomType']}</td></tr>"
            f"</table>")
        if tipo == 'CONFIRMATION':
            meio = "<p>A sua reserva está confirmada. Seguem os detalhes:</p>"
            fim = "<p>Até breve!</p>"
        elif tipo == 'PROFORMA':
            meio = "<p>Segue a conta da sua estadia, para conferência:</p>"
            fim = ("<p style='color:#B0392B'><i>Este documento não é uma factura e não serve "
                   "para efeitos fiscais.</i></p>")
        else:
            meio = "<p>Seguem os dados da sua reserva:</p>"
            fim = ''
        return f"{cabecalho}{meio}{detalhe}{fim}<p style='color:#5b6b73'>{hotel}</p>"

    # ------------------------------------------- CAMPOS PERSONALIZADOS / DOCS
    @action(detail=True, methods=['get', 'post'], url_path='custom-fields')
    def custom_fields(self, request, pk=None):
        """Os campos que ESTE hotel acrescentou à reserva.

        Mesmo motor da ficha do cliente — `pos.CustomFieldDef` (a definição) e
        `pos.CustomFieldValue` (o valor), filtrados por `location='RESERVATION'`.
        Não há um segundo sistema de campos personalizados para o PMS: o hotel
        define-os todos no mesmo sítio e escolhe, campo a campo, onde aparecem.
        """
        from pos.models import CustomFieldDef, CustomFieldValue
        res = self.get_object()
        defs = list(CustomFieldDef.objects.filter(location='RESERVATION', is_active=True))

        if request.method == 'POST':
            valores = request.data.get('values') or {}
            porCodigo = {d.code: d for d in defs}
            desconhecidos = [c for c in valores if c not in porCodigo]
            if desconhecidos:
                return Response({'detail': f'Campo(s) inexistente(s) ou inactivo(s): '
                                           f'{", ".join(sorted(desconhecidos))}.'}, status=400)
            erros, limpos = {}, {}
            for codigo, bruto in valores.items():
                try:
                    limpos[codigo] = porCodigo[codigo].clean_value(bruto)
                except ValueError as e:
                    erros[codigo] = str(e)
            if erros:
                return Response(erros, status=400)
            for codigo, texto in limpos.items():
                if texto == '':
                    CustomFieldValue.objects.filter(field=porCodigo[codigo], object_id=res.pk).delete()
                else:
                    CustomFieldValue.objects.update_or_create(
                        field=porCodigo[codigo], object_id=res.pk, defaults={'value': texto})

        atuais = {v.field.code: v.value for v in CustomFieldValue.objects.select_related('field')
                  .filter(object_id=res.pk, field__location='RESERVATION')}
        return Response({
            'fields': [{'code': d.code, 'name': d.name, 'field_type': d.field_type,
                        'is_list': d.is_list, 'list_values': d.list_values or [],
                        'size': d.size, 'value': atuais.get(d.code, '')} for d in defs],
        })

    @action(detail=True, methods=['get'])
    def documents(self, request, pk=None):
        """Os documentos desta reserva, juntos num sítio só.

        Duas origens, nenhuma delas nova: as FACTURAS que o arquivo fiscal já
        guarda (`fiscal.FiscalDocument` com `source_module='pms'` e o folio como
        referência — é assim que `emit_for_pms_folio` as grava) e os DOCUMENTOS
        DA FICHA do hóspede (`mdm.CustomerRecord` com `kind='DOC'`, os anexos da
        aba Documentos da entidade, onde já se guarda o passaporte/BI).
        """
        res = self.get_object()
        folio_ids = list(res.folios.values_list('id', flat=True))

        faturas = []
        if folio_ids:
            from fiscal.models import FiscalDocument
            for d in (FiscalDocument.objects
                      .filter(source_module='pms', source_ref__in=[str(i) for i in folio_ids])
                      .select_related('doc_type').order_by('-system_entry_date')):
                faturas.append({
                    'id': d.id, 'kind': 'FISCAL', 'number': d.invoice_no,
                    'type_name': d.doc_type.name if d.doc_type_id else '',
                    'date': d.system_entry_date.strftime('%Y-%m-%d %H:%M') if d.system_entry_date else '',
                    'total': str(d.gross_total), 'status': d.get_status_display(),
                })

        ficha = []
        if res.guest_id:
            from mdm.models import CustomerRecord
            for r in CustomerRecord.objects.filter(customer_id=res.guest_id, kind='DOC').order_by('-id'):
                dados = r.data or {}
                ficha.append({
                    'id': r.id, 'kind': 'GUEST_DOC',
                    'number': dados.get('number') or dados.get('numero') or '',
                    'type_name': dados.get('type') or dados.get('tipo') or 'Documento',
                    'date': dados.get('valid_until') or dados.get('validade') or '',
                    'url': dados.get('url') or dados.get('file') or '',
                    'notes': dados.get('notes') or dados.get('notas') or '',
                })

        return Response({'invoices': faturas, 'guest_documents': ficha})

    @action(detail=True, methods=['post'], url_path='recreate-folio')
    def recreate_folio(self, request, pk=None):
        """Abre uma conta nova para esta reserva.

        Serve para o caso real em que a reserva ficou sem conta onde lançar: a
        conta foi fechada/facturada e o hóspede ainda consome, ou um check-in
        antigo não deixou folio nenhum. Nunca mexe no que já existe — abre mais
        uma e marca-a como principal só se não houver nenhuma aberta, para o
        histórico e as facturas emitidas ficarem onde estão.
        """
        res = self.get_object()
        abertas = res.folios.filter(status='OPEN')
        if abertas.exists():
            return Response({'detail': f'Esta reserva já tem uma conta aberta '
                                       f'({abertas.first().number}). Feche-a antes de abrir outra.'},
                            status=409)
        tem_principal = res.folios.filter(is_primary=True).exists()
        letra = chr(ord('A') + res.folios.count())
        folio = Folio.objects.create(
            reservation=res, number=_next_number(Folio.objects, 'number', 'FOL'),
            label=f'{letra} · Nova conta', is_primary=not tem_principal)
        lancados = lancar_depositos_no_folio(res, folio)
        return Response({'id': folio.id, 'number': folio.number, 'label': folio.label,
                         'deposits_posted': lancados,
                         'detail': f'Conta {folio.number} aberta.'}, status=201)

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


class ReservationFixedChargeViewSet(HotelScopedMixin, viewsets.ModelViewSet):
    """Encargos fixos de uma reserva (estacionamento, cama extra, taxa de resort).

    Quem os lança na conta é a Auditoria da Noite, noite a noite (`per_night`),
    ou o check-in, uma vez só — ver `night_audit.py` e `check_in`.
    """
    queryset = ReservationFixedCharge.objects.select_related('reservation').all()
    serializer_class = ReservationFixedChargeSerializer
    hotel_path = 'reservation__hotel'

    def get_queryset(self):
        qs = scope_qs(self.request, super().get_queryset(), hotel_path='reservation__hotel')
        reserva = self.request.query_params.get('reservation')
        return qs.filter(reservation_id=reserva) if reserva else qs

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
        from fiscal.signing import ChaveFiscalEmFalta
        try:
            doc = emit_for_pms_folio(folio, charges, user=getattr(request, 'user', None))
        except ChaveFiscalEmFalta as e:
            # Falta a chave certificada: não é um erro interno, é uma
            # configuração por concluir — e o utilizador tem de saber qual.
            return Response({'detail': str(e)}, status=409)
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


# ==========================================================================
# FRONT DESK — Perdidos e Achados / Tarefas / Lista Telefónica
# ==========================================================================

class LostFoundItemViewSet(HotelScopedMixin, HotelDefaultMixin, viewsets.ModelViewSet):
    queryset = LostFoundItem.objects.select_related('room', 'guest').all()
    serializer_class = LostFoundItemSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        if p.get('q'):
            from django.db.models import Q
            qs = qs.filter(Q(description__icontains=p['q']) | Q(found_location__icontains=p['q']))
        return qs


class HousekeepingTaskViewSet(HotelScopedMixin, HotelDefaultMixin, viewsets.ModelViewSet):
    queryset = HousekeepingTask.objects.select_related('room').all()
    serializer_class = HousekeepingTaskSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        if p.get('priority'):
            qs = qs.filter(priority=p['priority'])
        if p.get('room'):
            qs = qs.filter(room_id=p['room'])
        return qs

    @action(detail=True, methods=['post'], url_path='mark-done')
    @transaction.atomic
    def mark_done(self, request, pk=None):
        """Dá a tarefa por concluída — e, se for LIMPEZA, liberta o quarto.

        Sem isto, a governanta limpava o quarto, marcava a tarefa como feita, e o
        quarto continuava "Por limpar" no mapa da receção para sempre: o único
        sítio que alguma vez punha um quarto em VACANT_CLEAN era o ecrã de
        Quartos, à mão. A tarefa e o estado do quarto eram dois mundos separados.

        Só a limpeza muda o estado, e só a partir de "Por limpar":
        - OCCUPIED (limpeza com hóspede dentro) não se toca — o quarto continua ocupado;
        - OOO (fora de serviço) não se toca — sair de fora-de-serviço é decisão de
          quem o pôs lá, não efeito lateral de uma limpeza.
        """
        task = self.get_object()
        task.status = 'DONE'
        task.completed_at = timezone.now()
        task.save(update_fields=['status', 'completed_at'])

        quarto_liberto = None
        room = task.room
        if room and task.task_type == 'CLEANING' and room.status == 'VACANT_DIRTY':
            room.status = 'VACANT_CLEAN'
            room.save(update_fields=['status'])
            quarto_liberto = room.number

        data = self.get_serializer(task).data
        data['room_released'] = quarto_liberto
        data['detail'] = (f'Tarefa concluída — quarto {quarto_liberto} passou a Livre/Limpo.'
                          if quarto_liberto else 'Tarefa concluída.')
        return Response(data)


class PhoneDirectoryEntryViewSet(HotelScopedMixin, HotelDefaultMixin, viewsets.ModelViewSet):
    queryset = PhoneDirectoryEntry.objects.all()
    serializer_class = PhoneDirectoryEntrySerializer

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get('q'):
            from django.db.models import Q
            qs = qs.filter(Q(name__icontains=p['q']) | Q(department__icontains=p['q']) | Q(extension__icontains=p['q']))
        return qs
