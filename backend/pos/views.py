from decimal import Decimal

from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import (
    Outlet, POSProductConfig, OutletPaymentMethod, CashSession, CashMovement,
    POSTable, POSTicket, POSTicketLine, POSTicketPayment,
    POSReservation, POSLineModifier, GiftCard, ServiceDestination, POSTableGroup,
)
from .serializers import (
    OutletSerializer, POSProductConfigSerializer, OutletPaymentMethodSerializer,
    CashSessionSerializer, CashMovementSerializer,
    POSTableSerializer, POSTicketSerializer, POSTicketLineSerializer,
    POSReservationSerializer, GiftCardSerializer, ServiceDestinationSerializer,
    POSTableGroupSerializer,
)
from core.tenancy import scope_qs
from .params import P          # motor de parâmetros do POS
from .audit import log_event
from .consumption import consume_ticket_stock


def _safe_consume(ticket, request):
    try:
        consume_ticket_stock(ticket, by=(request.user.username if request.user.is_authenticated else None))
    except Exception:
        pass  # o consumo de stock nunca deve quebrar o pagamento


def _safe_fiscalize(ticket, request):
    """Emite o documento fiscal (AGT) do ticket pago. Nunca quebra o pagamento."""
    try:
        from fiscal.integration import emit_for_pos_ticket
        user = request.user.username if request.user.is_authenticated else None
        ip = request.META.get('REMOTE_ADDR')
        emit_for_pos_ticket(ticket, user=user, ip=ip)
    except Exception:
        pass  # fiscalização assíncrona/tolerante: fila e reemissão tratam falhas


class OutletViewSet(viewsets.ModelViewSet):
    serializer_class = OutletSerializer

    def get_queryset(self):
        qs = scope_qs(self.request, Outlet.objects.select_related('hotel').all().order_by('name'))
        hotel = self.request.query_params.get('hotel')
        return qs.filter(hotel_id=hotel) if hotel else qs

    def perform_create(self, serializer):
        if not serializer.validated_data.get('hotel'):
            from identity.models import Hotel
            serializer.save(hotel=Hotel.objects.first())
        else:
            serializer.save()


class POSProductConfigViewSet(viewsets.ModelViewSet):
    serializer_class = POSProductConfigSerializer

    def get_queryset(self):
        qs = POSProductConfig.objects.select_related('item', 'outlet').all()
        outlet = self.request.query_params.get('outlet')
        return qs.filter(outlet_id=outlet) if outlet else qs


class OutletPaymentMethodViewSet(viewsets.ModelViewSet):
    serializer_class = OutletPaymentMethodSerializer

    def get_queryset(self):
        qs = OutletPaymentMethod.objects.select_related('payment_method', 'outlet').all()
        outlet = self.request.query_params.get('outlet')
        return qs.filter(outlet_id=outlet) if outlet else qs


class CashSessionViewSet(viewsets.ModelViewSet):
    """Motor de Caixa: abertura (create), movimentos e fecho com reconciliação."""
    serializer_class = CashSessionSerializer

    def get_queryset(self):
        qs = scope_qs(self.request, CashSession.objects.select_related('outlet').prefetch_related('movements').all(), 'outlet__hotel')
        status_param = self.request.query_params.get('status')
        return qs.filter(status=status_param) if status_param else qs

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        # (8005) FECHO CEGO: o operador conta o dinheiro SEM ver o esperado.
        # É assim que se deteta um desvio — se ele vir o valor esperado, escreve-o.
        ctx['blind_close'] = P.text(8005, 'Modo Detalhado') != 'Modo Simples'
        return ctx

    def perform_create(self, serializer):
        session = serializer.save()
        log_event(self.request, 'CASH_OPEN', f'Abertura de caixa (fundo {session.opening_float})',
                  operator_name=session.operator_name, outlet=session.outlet,
                  terminal_name=session.terminal_name, reference=f'CX-{session.id}', amount=session.opening_float)

    @action(detail=True, methods=['post'])
    def add_movement(self, request, pk=None):
        """Sangria / Reforço / Entrada / Saída na sessão aberta."""
        session = self.get_object()
        if session.status != 'OPEN':
            return Response({'detail': 'Caixa fechada — não permite movimentos.'}, status=status.HTTP_400_BAD_REQUEST)
        mtype = request.data.get('movement_type')
        if mtype not in dict(CashMovement.TYPE_CHOICES):
            return Response({'detail': 'Tipo de movimento inválido.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            amount = Decimal(str(request.data.get('amount')))
        except Exception:
            return Response({'detail': 'Valor inválido.'}, status=status.HTTP_400_BAD_REQUEST)
        if amount <= 0:
            return Response({'detail': 'O valor deve ser positivo.'}, status=status.HTTP_400_BAD_REQUEST)
        CashMovement.objects.create(
            session=session, movement_type=mtype, amount=amount,
            reason=request.data.get('reason'), created_by=request.data.get('created_by') or session.operator_name,
        )
        log_event(request, 'CASH_MOVE', f'{dict(CashMovement.TYPE_CHOICES)[mtype]} de {amount}',
                  operator_name=session.operator_name, outlet=session.outlet,
                  reference=f'CX-{session.id}', new_value=mtype, amount=amount)
        # Re-fetch para o expected_cash refletir já o movimento criado (evita prefetch obsoleto).
        session = CashSession.objects.prefetch_related('movements').get(pk=session.pk)
        return Response(self.get_serializer(session).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        """Fecho: contagem física + reconciliação (esperado vs contado = diferença)."""
        session = self.get_object()
        if session.status == 'CLOSED':
            return Response({'detail': 'Caixa já fechada.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            counted = Decimal(str(request.data.get('counted_amount')))
        except Exception:
            return Response({'detail': 'Contagem inválida.'}, status=status.HTTP_400_BAD_REQUEST)
        expected = session.expected_cash
        session.counted_amount = counted
        session.expected_amount = expected
        session.difference = counted - expected
        session.closing_notes = request.data.get('closing_notes')
        session.closed_by = request.data.get('closed_by') or session.operator_name
        session.closed_at = timezone.now()
        session.status = 'CLOSED'
        session.save()
        log_event(request, 'CASH_CLOSE', f'Fecho de caixa (diferença {session.difference})',
                  operator_name=session.operator_name, outlet=session.outlet, reference=f'CX-{session.id}',
                  old_value=str(expected), new_value=str(counted), amount=session.difference)
        return Response(self.get_serializer(session).data)


class CashMovementViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CashMovementSerializer

    def get_queryset(self):
        qs = CashMovement.objects.select_related('session').all()
        s = self.request.query_params.get('session')
        return qs.filter(session_id=s) if s else qs


class POSTableViewSet(viewsets.ModelViewSet):
    serializer_class = POSTableSerializer

    def get_queryset(self):
        qs = scope_qs(self.request, POSTable.objects.select_related('outlet').all().order_by('table_number'), 'outlet__hotel')
        outlet = self.request.query_params.get('outlet')
        return qs.filter(outlet_id=outlet) if outlet else qs

    def perform_create(self, serializer):
        """
        Auto-posiciona a mesa no mapa quando a posição não é indicada (ex.: criada em
        'Salas & Mesas' ou via API). Sem isto, todas ficavam no default (40,40) e
        sobrepunham-se no Mapa de Mesas.
        """
        data = serializer.validated_data
        outlet = data.get('outlet')
        needs_pos = data.get('pos_x') in (None, 40) and data.get('pos_y') in (None, 40)
        if outlet and needs_pos:
            idx = POSTable.objects.filter(outlet=outlet).count()
            serializer.save(pos_x=30 + (idx % 8) * 90, pos_y=30 + (idx // 8) * 110)
        else:
            serializer.save()


class POSTableGroupViewSet(viewsets.ModelViewSet):
    """Grupos de mesas (juntar/separar). Criar agrupa mesas numa conta única; ungroup dissolve."""
    serializer_class = POSTableGroupSerializer

    def get_queryset(self):
        qs = POSTableGroup.objects.filter(is_active=True).prefetch_related('tables')
        outlet = self.request.query_params.get('outlet')
        return qs.filter(outlet_id=outlet) if outlet else qs

    def create(self, request, *args, **kwargs):
        import uuid
        table_ids = request.data.get('table_ids') or []
        tables = list(POSTable.objects.filter(pk__in=table_ids))
        if len(tables) < 2:
            return Response({'detail': 'Selecione pelo menos 2 mesas para agrupar.'}, status=400)
        outlet = tables[0].outlet
        if any(t.outlet_id != outlet.id for t in tables):
            return Response({'detail': 'As mesas têm de ser do mesmo sector.'}, status=400)
        if any(t.group_id for t in tables):
            return Response({'detail': 'Alguma mesa já pertence a um grupo.'}, status=400)
        nums = '-'.join(str(t.table_number) for t in sorted(tables, key=lambda x: str(x.table_number)))
        group = POSTableGroup.objects.create(outlet=outlet, name=f'Grupo {nums}')
        primary = tables[0]
        sess = CashSession.objects.filter(outlet=outlet, status='OPEN').first()
        ticket = POSTicket.objects.create(
            ticket_number=f"TCK-{uuid.uuid4().hex[:8].upper()}", outlet=outlet, table=primary,
            cash_session=sess, operator_name=(request.user.username if request.user.is_authenticated else 'POS'),
            dest_kind='TABLE', dest_ref=str(primary.id), dest_label=group.name)
        group.ticket = ticket
        group.save(update_fields=['ticket'])
        for t in tables:
            t.group = group
            t.status = 'OCCUPIED'
            t.save(update_fields=['group', 'status'])
        log_event(request, 'TICKET_OPEN', f'Mesas agrupadas: {group.name}',
                  operator_name=ticket.operator_name, outlet=outlet, reference=ticket.ticket_number)
        data = self.get_serializer(group).data
        data['ticket_id'] = ticket.id
        return Response(data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def ungroup(self, request, pk=None):
        """Separa o grupo: a conta fica na mesa principal; as restantes ficam livres."""
        group = self.get_object()
        primary_id = group.ticket.table_id if group.ticket else None
        for t in group.tables.all():
            t.group = None
            if t.id != primary_id:
                if not t.tickets.filter(status__in=['OPEN', 'SUSPENDED']).exists():
                    t.status = 'FREE'
            t.save(update_fields=['group', 'status'])
        group.is_active = False
        group.save(update_fields=['is_active'])
        return Response({'detail': 'Grupo separado.', 'ticket_id': group.ticket_id})


class ServiceDestinationViewSet(viewsets.ModelViewSet):
    """Delivery Destination Center — destinos genéricos (Piscina, Praia, Spa, Evento...)."""
    serializer_class = ServiceDestinationSerializer

    def get_queryset(self):
        qs = ServiceDestination.objects.select_related('outlet').all()
        for f in ('dtype', 'outlet', 'hotel'):
            v = self.request.query_params.get(f)
            if v:
                qs = qs.filter(**{f: v})
        if self.request.query_params.get('active') == '1':
            qs = qs.filter(is_active=True)
        return qs


def _resolve_destination(kind, ref):
    """Devolve (label, room_number) para o destino escolhido, reutilizando Mesa/Quarto existentes."""
    if kind == 'TABLE':
        t = POSTable.objects.filter(pk=ref).first()
        return (f"Mesa {t.table_number}" if t else None), None
    if kind == 'ROOM':
        try:
            from pms.models import Room
            r = Room.objects.filter(pk=ref).first()
            return (f"Quarto {r.number}" if r else None), (r.number if r else None)
        except Exception:
            return None, None
    if kind == 'DESTINATION':
        d = ServiceDestination.objects.filter(pk=ref).first()
        return (d.label if d else None), None
    return None, None


class POSTicketViewSet(viewsets.ModelViewSet):
    serializer_class = POSTicketSerializer
    search_fields = ['ticket_number', 'operator_name', 'dest_label']
    ordering_fields = ['opened_at', 'closed_at', 'grand_total']

    def get_queryset(self):
        qs = scope_qs(self.request, (POSTicket.objects.select_related('outlet', 'table', 'cash_session')
              .prefetch_related('lines__item', 'payments__payment_method').all()), 'outlet__hotel')
        for f in ('outlet', 'status', 'cash_session'):
            v = self.request.query_params.get(f)
            if v:
                qs = qs.filter(**{f if f != 'cash_session' else 'cash_session_id': v})
        if self.request.query_params.get('delivery'):
            qs = qs.filter(delivery_status=self.request.query_params.get('delivery'))
        return qs

    @action(detail=True, methods=['post'])
    def set_destination(self, request, pk=None):
        """Define o destino do pedido (Mesa/Quarto/Destino genérico) + prioridade/observações."""
        ticket = self.get_object()
        kind = request.data.get('dest_kind', 'TABLE')
        ref = request.data.get('dest_ref')
        label, room = _resolve_destination(kind, ref)
        if ref and not label:
            return Response({'detail': 'Destino inválido.'}, status=status.HTTP_400_BAD_REQUEST)
        ticket.dest_kind = kind
        ticket.dest_ref = str(ref) if ref else None
        ticket.dest_label = label
        ticket.dest_note = request.data.get('dest_note') or None
        ticket.dest_priority = request.data.get('dest_priority', 'NORMAL')
        # Mantém a FK de Mesa para o mapa de sala quando o destino é Mesa.
        if kind == 'TABLE' and ref:
            ticket.table_id = ref
            # ... e a mesa fica mesmo OCUPADA (não só "com ticket aberto").
            from .models import POSTable
            POSTable.objects.filter(pk=ref).exclude(status='OCCUPIED').update(status='OCCUPIED')
        else:
            # Mudou de mesa para quarto/destino: a mesa anterior fica livre.
            if ticket.table and not ticket.table.tickets.filter(status__in=['OPEN', 'SUSPENDED']).exclude(pk=ticket.pk).exists():
                ticket.table.status = 'FREE'
                ticket.table.save(update_fields=['status'])
            ticket.table = None
        # Pedidos com destino != Mesa entram no fluxo de entrega.
        if kind != 'TABLE' and ticket.delivery_status == 'NONE':
            ticket.delivery_status = 'PENDING'
        ticket.save(update_fields=['dest_kind', 'dest_ref', 'dest_label', 'dest_note',
                                   'dest_priority', 'table', 'delivery_status'])
        # Mesa VIP -> aplica desconto automático (se ainda sem desconto).
        if kind == 'TABLE' and ref and not ticket.discount_percent:
            tbl = POSTable.objects.filter(pk=ref).first()
            if tbl and tbl.is_vip and tbl.vip_discount_percent:
                ticket.discount_percent = tbl.vip_discount_percent
                ticket.discount_authorized_by = 'VIP (mesa)'
                ticket.save(update_fields=['discount_percent', 'discount_authorized_by'])
                ticket.recompute(save=True)
        log_event(request, 'TICKET_DESTINATION', f'Destino: {label} ({kind})',
                  operator_name=ticket.operator_name, outlet=ticket.outlet, reference=ticket.ticket_number)
        return Response(POSTicketSerializer(ticket).data)

    @action(detail=True, methods=['post'])
    def set_discount(self, request, pk=None):
        """Aplica desconto (%) — regista quem autorizou (auditoria)."""
        ticket = self.get_object()
        from .models import PosDiscount, PosUser
        from django.utils import timezone

        disc = None
        disc_id = request.data.get('discount')
        if disc_id:
            disc = PosDiscount.objects.filter(pk=disc_id).first()
            if not disc:
                return Response({'detail': 'Desconto inválido.'}, status=400)
            # Um desconto tem PRAZO. Fora dele, não se aplica — nem por engano nem de propósito.
            if not disc.is_valid_on(timezone.localdate()):
                return Response({'detail': f'"{disc.name}" não está válido nesta data.'}, status=403)
            if not disc.for_pos:
                return Response({'detail': f'"{disc.name}" não é um desconto de POS.'}, status=403)
            # QUEM o pode dar: só os grupos autorizados na ficha do desconto.
            allowed = list(disc.user_groups.values_list('id', flat=True))
            if allowed:
                pu = PosUser.objects.filter(auth_user=request.user).first() if request.user.is_authenticated else None
                grupo = (pu.pos_group_id or pu.group_id) if pu else None
                if grupo not in allowed:
                    return Response({
                        'detail': f'O seu perfil não está autorizado a aplicar "{disc.name}". '
                                  f'É preciso a autorização de um supervisor.',
                        'requires_supervisor': True,
                    }, status=403)
            pct = disc.value if disc.base == 'PERCENT' else Decimal('0')
        else:
            try:
                pct = Decimal(str(request.data.get('percent') or 0))
            except Exception:
                return Response({'detail': 'Percentagem inválida.'}, status=400)

        if pct < 0 or pct > 100:
            return Response({'detail': 'Desconto tem de estar entre 0 e 100%.'}, status=400)

        # (8620) Desconto máximo sem supervisor: acima disto, exige-se autorização.
        # Um desconto por CÓDIGO já vem autorizado pela ficha — a regra é para o manual.
        limite = P.int(8620, 10)
        autorizado = (request.data.get('authorized_by') or '').strip()
        if not disc and pct > limite and not autorizado:
            return Response({
                'detail': f'Desconto de {pct}% excede o máximo permitido sem supervisor ({limite}%). '
                          f'É preciso a autorização de um supervisor.',
                'requires_supervisor': True, 'max_without_supervisor': limite,
            }, status=403)

        ticket.discount = disc
        ticket.discount_percent = pct
        ticket.discount_authorized_by = request.data.get('authorized_by') or (request.user.username if request.user.is_authenticated else 'POS')
        if pct == 0 and not disc:
            ticket.discount_total = Decimal('0')
        ticket.save(update_fields=['discount', 'discount_percent', 'discount_authorized_by', 'discount_total'])
        ticket.recompute(save=True)
        etiqueta = f'{disc.code} ({disc.name})' if disc else f'{pct}% (manual)'
        log_event(request, 'PAYMENT', f'Desconto {etiqueta} autorizado por {ticket.discount_authorized_by}',
                  operator_name=ticket.operator_name, outlet=ticket.outlet, reference=ticket.ticket_number,
                  new_value=etiqueta, amount=ticket.discount_total)
        return Response(POSTicketSerializer(ticket).data)

    @action(detail=True, methods=['get'])
    def audit(self, request, pk=None):
        """Histórico completo da mesa/conta: quem abriu/alterou/cancelou/pagou (quando/IP)."""
        from .models import POSAuditLog
        ticket = self.get_object()
        logs = POSAuditLog.objects.filter(reference=ticket.ticket_number).order_by('-created_at')[:200]
        return Response([{
            'event_type': l.event_type, 'event_display': l.get_event_type_display(),
            'description': l.description, 'operator': l.operator_name, 'user': l.user,
            'amount': l.amount, 'ip': l.ip_address,
            'at': l.created_at.isoformat(),
        } for l in logs])

    @action(detail=True, methods=['post'])
    def set_customer(self, request, pk=None):
        """Associa cliente/hóspede à mesa: nome, NIF, empresa, adultos/crianças."""
        ticket = self.get_object()
        d = request.data
        ticket.customer_name = d.get('customer_name') or None
        ticket.customer_tax_id = d.get('customer_tax_id') or None
        ticket.company_name = d.get('company_name') or None
        ticket.adults = int(d.get('adults') or 0)
        ticket.children = int(d.get('children') or 0)
        total = ticket.adults + ticket.children
        if total:
            ticket.guests = total
        ticket.save(update_fields=['customer_name', 'customer_tax_id', 'company_name', 'adults', 'children', 'guests'])
        # Cliente VIP do MDM -> desconto automático + info de limite de crédito.
        vip = None
        cust_id = d.get('customer_id')
        if cust_id:
            try:
                from mdm.models import Customer
                cust = Customer.objects.filter(pk=cust_id).first()
                if cust:
                    vip = {'is_vip': cust.is_vip, 'credit_limit': str(cust.credit_limit),
                           'vip_discount_percent': str(cust.vip_discount_percent)}
                    if cust.is_vip and cust.vip_discount_percent and not ticket.discount_percent:
                        ticket.discount_percent = cust.vip_discount_percent
                        ticket.discount_authorized_by = f'VIP ({cust.name})'
                        ticket.save(update_fields=['discount_percent', 'discount_authorized_by'])
                        ticket.recompute(save=True)
            except Exception:
                pass
        log_event(request, 'TICKET_OPEN', f'Cliente associado: {ticket.customer_name or "—"}',
                  operator_name=ticket.operator_name, outlet=ticket.outlet, reference=ticket.ticket_number)
        data = POSTicketSerializer(ticket).data
        data['vip'] = vip
        return Response(data)

    @action(detail=True, methods=['post'])
    def dispatch_order(self, request, pk=None):
        """Marca o pedido como despachado (a caminho do destino)."""
        ticket = self.get_object()
        ticket.delivery_status = 'DISPATCHED'
        ticket.dispatched_at = timezone.now()
        ticket.save(update_fields=['delivery_status', 'dispatched_at'])
        return Response(POSTicketSerializer(ticket).data)

    @action(detail=True, methods=['post'])
    def deliver(self, request, pk=None):
        """Confirma a entrega no destino (hora, empregado, observações)."""
        ticket = self.get_object()
        ticket.delivery_status = 'DELIVERED'
        ticket.delivered_at = timezone.now()
        ticket.delivered_by = request.data.get('delivered_by') or (
            request.user.username if request.user.is_authenticated else None)
        if request.data.get('note'):
            ticket.dest_note = request.data.get('note')
        ticket.save(update_fields=['delivery_status', 'delivered_at', 'delivered_by', 'dest_note'])
        log_event(request, 'TICKET_DELIVERED', f'Entregue em {ticket.dest_label} por {ticket.delivered_by}',
                  operator_name=ticket.operator_name, outlet=ticket.outlet, reference=ticket.ticket_number)
        return Response(POSTicketSerializer(ticket).data)

    def perform_create(self, serializer):
        import uuid
        data = serializer.validated_data
        num = data.get('ticket_number') or f"TCK-{uuid.uuid4().hex[:8].upper()}"
        ticket = serializer.save(ticket_number=num)
        # A MESA PASSA A OCUPADA. Antes só a lista de contas abertas sabia disso — o
        # estado real da mesa ficava FREE, e qualquer outro ecrã (mapa de sala, relatórios,
        # outro terminal) mostrava a mesa livre com gente sentada lá.
        if ticket.table and ticket.table.status != 'OCCUPIED':
            ticket.table.status = 'OCCUPIED'
            ticket.table.save(update_fields=['status'])
        log_event(self.request, 'TICKET_OPEN', f'Ticket aberto ({ticket.operator_name})',
                  operator_name=ticket.operator_name, outlet=ticket.outlet, reference=ticket.ticket_number)

    @action(detail=True, methods=['post'])
    def add_line(self, request, pk=None):
        """Adiciona um artigo. Preço vem do POS Product Config do outlet (ou do preço de venda)."""
        ticket = self.get_object()
        if ticket.status != 'OPEN':
            return Response({'detail': 'Ticket não está aberto.'}, status=status.HTTP_400_BAD_REQUEST)
        from inventory.models import Item
        try:
            item = Item.objects.get(pk=request.data.get('item'))
        except Item.DoesNotExist:
            return Response({'detail': 'Artigo inválido.'}, status=status.HTTP_400_BAD_REQUEST)
        # (Artigo) "Ativo" — desmarcar tira mesmo o artigo da venda. Não é decoração:
        # é assim que se retira um prato do menu sem apagar o histórico dele.
        if not item.is_active:
            return Response({'detail': f'"{item.name}" está inativo e não pode ser vendido.',
                             'inactive_item': True}, status=status.HTTP_400_BAD_REQUEST)
        try:
            qty = Decimal(str(request.data.get('quantity', '1')))
        except Exception:
            qty = Decimal('1')

        cfg = POSProductConfig.objects.filter(outlet=ticket.outlet, item=item).first()
        unit_price = request.data.get('unit_price')
        # (Artigo) "Preço manual" — artigos de preço variável (peixe ao quilo, vinho a
        # copo do dia): o terminal TEM de perguntar o preço; não se inventa um.
        if unit_price in (None, '') and getattr(item, 'manual_price', False):
            return Response({'detail': f'"{item.name}" é de preço manual — indique o preço.',
                             'requires_price': True}, status=status.HTTP_400_BAD_REQUEST)
        if unit_price in (None, ''):
            # Prioridade: override do POS Product Config → Tabela de Preço da área → preço base.
            if cfg and cfg.pos_price is not None:
                unit_price = cfg.pos_price
            else:
                unit_price = ticket.outlet.price_for(item)
        unit_price = Decimal(str(unit_price))

        # HAPPY HOUR — a grelha hora × dia manda no preço. Às 17h de quinta o gin passa
        # ao Preço 2; às 20h volta ao normal, sozinho. É o que a grelha do ecrã define.
        happy_note = None
        from django.db import models as _m
        from .models import HappyHour
        from inventory.models import ItemPrice
        hh = (HappyHour.objects.filter(is_active=True)
              .filter(_m.Q(outlet=ticket.outlet) | _m.Q(outlet__isnull=True))
              .order_by('outlet_id').first())
        if hh:
            v = hh.value_now()
            if v:
                if hh.kind == 'PRICE':
                    p = ItemPrice.objects.filter(item=item, level=int(v)).first()
                    if p and p.price:
                        unit_price = Decimal(str(p.price))
                        happy_note = f'Happy Hour: {hh.name} (Preço {v})'
                else:
                    desconto = unit_price * Decimal(str(v)) / Decimal('100')
                    unit_price = unit_price - desconto
                    happy_note = f'Happy Hour: {hh.name} (-{v}%)'

        # Commercial Center: aplica a melhor promoção/Happy Hour ativa ao artigo.
        promo_note = happy_note
        try:
            from commercial import pricing as _pricing
            discounted, promo, disc = _pricing.apply(ticket.outlet, item, unit_price)
            if promo and disc > 0:
                unit_price = discounted
                promo_note = "; ".join([n for n in (happy_note, f"Promo: {promo.name} (-{disc})") if n])
        except ImportError:
            pass
        # Motor 4: modificadores/extras -> o delta soma ao preço unitário da linha.
        modifiers = request.data.get('modifiers') or []
        mod_delta = sum((Decimal(str(m.get('price_delta', 0))) for m in modifiers), Decimal('0'))
        base_note = request.data.get('note')
        note = '; '.join([n for n in (base_note, promo_note) if n]) or None
        line = POSTicketLine.objects.create(
            ticket=ticket, item=item, description=item.name, quantity=qty,
            unit_price=unit_price + mod_delta, tax_percentage=item.tax_percentage or 0,
            note=note, kds_station=(cfg.kds_station if cfg else 'KITCHEN'),
        )
        for m in modifiers:
            POSLineModifier.objects.create(
                line=line, name=m.get('name', 'Extra'), price_delta=Decimal(str(m.get('price_delta', 0))))
        POSTicket.objects.get(pk=ticket.pk).recompute(save=True)  # instância fresca (sem prefetch obsoleto)
        log_event(request, 'LINE_ADD', f'{qty}x {item.name} @ {unit_price}',
                  operator_name=ticket.operator_name, outlet=ticket.outlet,
                  reference=ticket.ticket_number, new_value=item.name, amount=Decimal(str(unit_price)) * qty)
        ticket = self.get_queryset().get(pk=ticket.pk)
        return Response(self.get_serializer(ticket).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def add_combo(self, request, pk=None):
        """Adiciona um combo (Commercial Center): lança os componentes (para routing KDS) e
        aplica um desconto ao ticket para atingir o preço do combo."""
        ticket = self.get_object()
        if ticket.status != 'OPEN':
            return Response({'detail': 'Ticket não está aberto.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            from commercial.models import Combo
        except ImportError:
            return Response({'detail': 'Módulo Commercial não está ativo.'}, status=409)
        combo = Combo.objects.filter(pk=request.data.get('combo'), is_active=True).prefetch_related('items__item').first()
        if not combo:
            return Response({'detail': 'Combo inválido.'}, status=404)
        components_sum = Decimal('0')
        for ci in combo.items.all():
            cfg = POSProductConfig.objects.filter(outlet=ticket.outlet, item=ci.item).first()
            price = Decimal(str(cfg.effective_price if cfg else (ci.item.sale_price or 0)))
            POSTicketLine.objects.create(
                ticket=ticket, item=ci.item, description=f"{ci.item.name} · Combo {combo.name}",
                quantity=ci.quantity, unit_price=price, tax_percentage=ci.item.tax_percentage or 0,
                kds_station=(cfg.kds_station if cfg else 'KITCHEN'), note=f"Combo {combo.name}")
            components_sum += price * Decimal(str(ci.quantity))
        ticket = POSTicket.objects.get(pk=ticket.pk)
        disc = components_sum - combo.price
        if disc > 0:
            ticket.discount_total = (ticket.discount_total or Decimal('0')) + disc
            ticket.save(update_fields=['discount_total'])
        POSTicket.objects.get(pk=ticket.pk).recompute(save=True)
        log_event(request, 'LINE_ADD', f'Combo {combo.name} @ {combo.price}',
                  operator_name=ticket.operator_name, outlet=ticket.outlet,
                  reference=ticket.ticket_number, new_value=combo.name, amount=combo.price)
        return Response(self.get_serializer(self.get_queryset().get(pk=ticket.pk)).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def pay(self, request, pk=None):
        """Pagamento: exige método AUTORIZADO no outlet; calcula troco (dinheiro); fecha se saldado."""
        ticket = self.get_object()
        if ticket.status != 'OPEN':
            return Response({'detail': 'Ticket não está aberto.'}, status=status.HTTP_400_BAD_REQUEST)
        from mdm.models import PaymentMethod
        try:
            pm = PaymentMethod.objects.get(pk=request.data.get('payment_method'))
        except PaymentMethod.DoesNotExist:
            return Response({'detail': 'Método de pagamento inválido.'}, status=status.HTTP_400_BAD_REQUEST)

        # REGRA: só métodos autorizados neste outlet (consome a config do 07).
        if not OutletPaymentMethod.objects.filter(outlet=ticket.outlet, payment_method=pm, is_active=True).exists():
            return Response({'detail': f'Método "{pm.name}" não autorizado neste outlet.'}, status=status.HTTP_403_FORBIDDEN)

        # (Modo de Pagamento) "Ativo" — desligado, sai do POS. É como se suspende o
        # multibanco quando o TPA avaria, sem apagar o histórico de vendas por cartão.
        if not pm.is_active:
            return Response({'detail': f'"{pm.name}" está desativado.'}, status=status.HTTP_400_BAD_REQUEST)
        if not pm.for_pos:
            return Response({'detail': f'"{pm.name}" não é um modo de pagamento de POS.'}, status=status.HTTP_400_BAD_REQUEST)

        # (Modo de Pagamento) "Consumo interno" — o staff não paga, mas ALGUÉM tem de
        # poder lançar. Cruza-se com a caixa "Consumo interno" da ficha do utilizador:
        # quem não a tiver, não consegue usar este método.
        if pm.internal_consumption:
            from .models import PosUser
            pu = PosUser.objects.filter(auth_user=request.user).first() if request.user.is_authenticated else None
            if not (pu and pu.internal_consumption):
                return Response({
                    'detail': f'Não está autorizado a lançar consumo interno ("{pm.name}"). '
                              f'É preciso a autorização de um supervisor.',
                    'requires_supervisor': True,
                }, status=status.HTTP_403_FORBIDDEN)

        # (Modo de Pagamento) "Lançar em Quarto" — sem quarto, não há onde lançar.
        if pm.charge_to_room and not (request.data.get('room') or request.data.get('folio')
                                      or (ticket.dest_kind == 'ROOM' and ticket.dest_ref)):
            return Response({'detail': f'"{pm.name}" lança no folio: indique o quarto.',
                             'requires_room': True}, status=status.HTTP_400_BAD_REQUEST)

        # (Modo de Pagamento) "Perguntar nº de documento" — cheque e transferência sem
        # referência são dinheiro que ninguém consegue reconciliar no banco.
        if pm.ask_document_number and not (request.data.get('document_number') or '').strip():
            return Response({'detail': f'"{pm.name}" exige o nº do documento (cheque/transferência).',
                             'requires_document_number': True}, status=status.HTTP_400_BAD_REQUEST)

        try:
            tendered = Decimal(str(request.data.get('amount')))
        except Exception:
            return Response({'detail': 'Valor inválido.'}, status=status.HTTP_400_BAD_REQUEST)

        ticket = POSTicket.objects.get(pk=ticket.pk)  # fresco: saldo/pagamentos atualizados
        due = ticket.balance_due
        applied = min(tendered, due)
        # (Modo de Pagamento) "Dá troco" — o dinheiro dá; o multibanco e a transferência
        # não. Sem esta caixa, o caixa "devolvia" troco de um pagamento por cartão e a
        # gaveta ficava sempre em falta ao fecho.
        gives_change = getattr(pm, 'allows_change', pm.method_type == 'CASH')
        if not gives_change and tendered > due:
            return Response({
                'detail': f'"{pm.name}" não dá troco. Cobre no máximo {due}.',
                'no_change_allowed': True, 'max_amount': str(due),
            }, status=status.HTTP_400_BAD_REQUEST)
        change = (tendered - applied) if gives_change else Decimal('0')

        # (Modo de Pagamento) "Converter troco para gratificação" — o cliente diz
        # "fique com o troco". Sem isto, a gorjeta ficava dentro da gaveta e o fecho
        # de caixa dava sobra todos os dias sem ninguém saber porquê.
        tip = Decimal('0')
        if pm.tip_from_change and change > 0 and request.data.get('tip_change'):
            tip, change = change, Decimal('0')
            if ticket.cash_session_id:
                CashMovement.objects.create(
                    session=ticket.cash_session, movement_type='ENTRADA', amount=tip,
                    reason=f'Gratificação (troco de {ticket.ticket_number})',
                    created_by=(request.user.username if request.user.is_authenticated else 'POS'),
                )

        POSTicketPayment.objects.create(ticket=ticket, payment_method=pm, amount=applied, change_due=change)

        ticket = POSTicket.objects.get(pk=ticket.pk)  # recarrega com o novo pagamento
        if ticket.balance_due <= 0:
            ticket.status = 'PAID'
            ticket.closed_at = timezone.now()
            if ticket.table:
                ticket.table.status = 'FREE'
                ticket.table.save(update_fields=['status'])
            ticket.save(update_fields=['status', 'closed_at'])
            _safe_consume(ticket, request)   # saída de stock (ficha técnica/artigo)
            _safe_fiscalize(ticket, request)  # documento fiscal AGT

        log_event(request, 'PAYMENT', f'Pagamento {pm.name}: {applied} (troco {change})',
                  operator_name=ticket.operator_name, outlet=ticket.outlet,
                  reference=ticket.ticket_number, new_value=pm.name, amount=applied)
        ticket = self.get_queryset().get(pk=ticket.pk)
        data = self.get_serializer(ticket).data
        data['change_returned'] = str(change)
        data['tip'] = str(tip)
        # O terminal obedece a estas: abre (ou não) a gaveta, imprime (ou não) o documento.
        data['open_drawer'] = bool(pm.opens_drawer)
        data['print_document'] = bool(pm.prints_document)
        data['document_type'] = pm.document_type          # Fatura ou Talão
        return Response(data)

    @action(detail=True, methods=['post'])
    def fire_kitchen(self, request, pk=None):
        """Envia as linhas NOVAS para produção (KDS): NEW -> FIRED. Ignora itens sem produção."""
        ticket = self.get_object()
        from collections import defaultdict
        from .models import PrintJob
        new_lines = list(ticket.lines.filter(kds_status='NEW').exclude(kds_station='NONE'))
        by_station = defaultdict(list)
        for l in new_lines:
            by_station[l.kds_station].append(l)
        ticket.lines.filter(kds_status='NEW').exclude(kds_station='NONE').update(
            kds_status='FIRED', fired_at=timezone.now())
        # Motor 8: gera uma comanda de impressão por estação.
        from inventory.models import Printer
        avisos = []
        for station, lines in by_station.items():
            content = "\n".join(f"{int(l.quantity)}x {l.description}" + (f"  » {l.note}" if l.note else "") for l in lines)
            # A que IMPRESSORA vai esta estação, e a que APARELHO está ela ligada?
            prt = (Printer.objects.filter(station=station, outlet=ticket.outlet, is_active=True).first()
                   or Printer.objects.filter(station=station, is_active=True).first())
            job = PrintJob.objects.create(
                job_type=station if station in ('KITCHEN', 'BAR', 'PASTRY') else 'KITCHEN',
                target=(prt.device.name if (prt and prt.device_id) else station), outlet=ticket.outlet,
                title=f"Comanda {ticket.table.table_number if ticket.table else ticket.ticket_number}",
                content=content, reference=ticket.ticket_number)
            # (Impressora) "Emitir Aviso" — sem aparelho, a comanda fica em fila e ninguém
            # a vai buscar: o pedido NUNCA chega à cozinha. Mais vale o empregado saber já.
            if not prt or not prt.device_id:
                job.status = 'FAILED'
                job.error = 'Sem aparelho de impressão configurado para esta estação.'
                job.save(update_fields=['status', 'error'])
                if not prt or prt.warn_on_failure:
                    avisos.append(f'{station}: sem impressora configurada — a comanda não foi impressa.')
        log_event(request, 'KITCHEN_FIRE', f'{len(new_lines)} item(s) enviados para produção',
                  operator_name=ticket.operator_name, outlet=ticket.outlet, reference=ticket.ticket_number)
        if avisos:
            ticket = self.get_queryset().get(pk=ticket.pk)
            data = self.get_serializer(ticket).data
            data['print_warnings'] = avisos
            return Response(data)
        ticket = self.get_queryset().get(pk=ticket.pk)
        return Response(self.get_serializer(ticket).data)

    @action(detail=True, methods=['post'])
    def void(self, request, pk=None):
        ticket = self.get_object()
        old = ticket.status
        reason = request.data.get('reason') or 'Conta anulada no POS'

        # (8128) Emitir sempre nota de crédito ao anular fatura.
        # Se o parâmetro está ligado e a venda já tem documento fiscal, a anulação
        # TEM de passar pela emissão da NC — anular sem NC seria apagar uma fatura
        # comunicada, e isso a AGT não perdoa.
        if P.bool(8128, True) and ticket.status in ('PAID', 'CLOSED'):
            return self.credit_note(request, pk)
        # A produção em curso tem de saber: Cozinha/Bar/Pastelaria recebem a ANULAÇÃO.
        cancelled = cancel_production(request, ticket, list(ticket.lines.all()), reason)
        ticket.status = 'VOID'
        ticket.closed_at = timezone.now()
        ticket.save(update_fields=['status', 'closed_at'])
        log_event(request, 'TICKET_VOID',
                  f'Ticket anulado ({ticket.ticket_number}) · {len(cancelled)} item(s) anulados na produção · Motivo: {reason}',
                  operator_name=ticket.operator_name, outlet=ticket.outlet,
                  reference=ticket.ticket_number, old_value=old, new_value='VOID', amount=ticket.grand_total)
        return Response(self.get_serializer(ticket).data)

    @action(detail=True, methods=['post'])
    def credit_note(self, request, pk=None):
        """Anula a venda emitindo a Nota de Crédito do documento fiscal associado (se houver)."""
        ticket = self.get_object()
        reason = request.data.get('reason', 'Anulação de venda POS')
        nc_info = None
        try:
            from fiscal.models import FiscalDocument
            from fiscal import services as fsvc
            fd = (FiscalDocument.objects.filter(source_module='pos', source_ref=str(ticket.id))
                  .exclude(status='A').exclude(doc_type__is_rectifying=True).order_by('-id').first())
            if fd:
                nc = fsvc.create_credit_note(fd.id, reason=reason,
                                             user=str(getattr(request.user, 'username', '') or ''))
                nc_info = nc.invoice_no
        except Exception as e:  # noqa — a venda anula-se mesmo que o doc fiscal falhe
            nc_info = f'(NC não emitida: {str(e)[:80]})'
        cancelled = cancel_production(request, ticket, list(ticket.lines.all()), reason)
        ticket.status = 'VOID'
        ticket.closed_at = timezone.now()
        ticket.save(update_fields=['status', 'closed_at'])
        log_event(request, 'TICKET_VOID',
                  f'Venda anulada ({ticket.ticket_number}) · NC: {nc_info or "s/ doc fiscal"} · '
                  f'{len(cancelled)} item(s) anulados na produção · Motivo: {reason}',
                  operator_name=ticket.operator_name, outlet=ticket.outlet,
                  reference=ticket.ticket_number, old_value='CLOSED', new_value='VOID', amount=ticket.grand_total)
        stations = sorted({STATION_LABEL.get(l.kds_station, l.kds_station) for l in cancelled})
        return Response({**self.get_serializer(ticket).data,
                         'credit_note': nc_info,
                         'cancelled_items': len(cancelled),
                         'notified_stations': stations})

    # ------------------------------------------------------------------
    # MOTOR 3 (aprofundamento) — transferir / juntar mesas
    # ------------------------------------------------------------------
    @action(detail=True, methods=['post'])
    def transfer_table(self, request, pk=None):
        """Transfere o ticket para outra mesa (liberta a origem, ocupa o destino)."""
        ticket = self.get_object()
        if ticket.status not in ('OPEN', 'SUSPENDED'):
            return Response({'detail': 'Só tickets abertos/suspensos podem ser transferidos.'}, status=400)
        try:
            dest = POSTable.objects.get(pk=request.data.get('table'), outlet=ticket.outlet)
        except POSTable.DoesNotExist:
            return Response({'detail': 'Mesa de destino inválida.'}, status=404)
        old_table = ticket.table
        if old_table and old_table.pk != dest.pk and not old_table.tickets.filter(status__in=['OPEN', 'SUSPENDED']).exclude(pk=ticket.pk).exists():
            old_table.status = 'FREE'
            old_table.save(update_fields=['status'])
        ticket.table = dest
        ticket.save(update_fields=['table'])
        dest.status = 'OCCUPIED'
        dest.save(update_fields=['status'])
        log_event(request, 'TICKET_OPEN', f'Transferência de mesa -> {dest.table_number}',
                  operator_name=ticket.operator_name, outlet=ticket.outlet, reference=ticket.ticket_number,
                  old_value=old_table.table_number if old_table else None, new_value=dest.table_number)
        return Response(self.get_serializer(self.get_queryset().get(pk=ticket.pk)).data)

    @action(detail=True, methods=['post'])
    def merge(self, request, pk=None):
        """Junta outro ticket a este (move linhas e pagamentos; anula a origem)."""
        ticket = self.get_object()
        try:
            source = POSTicket.objects.get(pk=request.data.get('source'), outlet=ticket.outlet)
        except POSTicket.DoesNotExist:
            return Response({'detail': 'Ticket de origem inválido.'}, status=404)
        if source.pk == ticket.pk:
            return Response({'detail': 'Não é possível juntar um ticket a si próprio.'}, status=400)
        if ticket.status != 'OPEN' or source.status not in ('OPEN', 'SUSPENDED'):
            return Response({'detail': 'Ambos os tickets têm de estar abertos.'}, status=400)
        source.lines.update(ticket=ticket)
        source.payments.update(ticket=ticket)
        source.status = 'VOID'
        source.closed_at = timezone.now()
        source.save(update_fields=['status', 'closed_at'])
        if source.table and not source.table.tickets.filter(status__in=['OPEN', 'SUSPENDED']).exists():
            source.table.status = 'FREE'
            source.table.save(update_fields=['status'])
        POSTicket.objects.get(pk=ticket.pk).recompute(save=True)
        log_event(request, 'TICKET_OPEN', f'Junção do ticket {source.ticket_number}',
                  operator_name=ticket.operator_name, outlet=ticket.outlet, reference=ticket.ticket_number,
                  new_value=source.ticket_number)
        return Response(self.get_serializer(self.get_queryset().get(pk=ticket.pk)).data)

    # ------------------------------------------------------------------
    # MOTOR 4 (aprofundamento) — suspender / reabrir / dividir conta
    # ------------------------------------------------------------------
    @action(detail=True, methods=['post'])
    def suspend(self, request, pk=None):
        ticket = self.get_object()
        if ticket.status != 'OPEN':
            return Response({'detail': 'Só tickets abertos podem ser suspensos.'}, status=400)
        ticket.status = 'SUSPENDED'
        ticket.save(update_fields=['status'])
        log_event(request, 'TICKET_OPEN', 'Ticket suspenso', operator_name=ticket.operator_name,
                  outlet=ticket.outlet, reference=ticket.ticket_number, new_value='SUSPENDED')
        return Response(self.get_serializer(self.get_queryset().get(pk=ticket.pk)).data)

    @action(detail=True, methods=['post'])
    def reopen(self, request, pk=None):
        ticket = self.get_object()
        if ticket.status != 'SUSPENDED':
            return Response({'detail': 'Só tickets suspensos podem ser reabertos.'}, status=400)
        ticket.status = 'OPEN'
        ticket.save(update_fields=['status'])
        return Response(self.get_serializer(self.get_queryset().get(pk=ticket.pk)).data)

    @action(detail=True, methods=['post'])
    def split(self, request, pk=None):
        """Divide a conta: move as linhas indicadas para um novo ticket aberto."""
        import uuid
        ticket = self.get_object()
        if ticket.status != 'OPEN':
            return Response({'detail': 'Só tickets abertos podem ser divididos.'}, status=400)
        line_ids = request.data.get('line_ids') or []
        lines = ticket.lines.filter(pk__in=line_ids)
        if not lines.exists():
            return Response({'detail': 'Indique as linhas a mover (line_ids).'}, status=400)
        if lines.count() >= ticket.lines.count():
            return Response({'detail': 'Não é possível mover todas as linhas — deixe pelo menos uma.'}, status=400)
        new_ticket = POSTicket.objects.create(
            ticket_number=f"TCK-{uuid.uuid4().hex[:8].upper()}", outlet=ticket.outlet,
            table=ticket.table, cash_session=ticket.cash_session, operator_name=ticket.operator_name)
        lines.update(ticket=new_ticket)
        POSTicket.objects.get(pk=ticket.pk).recompute(save=True)
        POSTicket.objects.get(pk=new_ticket.pk).recompute(save=True)
        log_event(request, 'TICKET_OPEN', f'Conta dividida -> {new_ticket.ticket_number}',
                  operator_name=ticket.operator_name, outlet=ticket.outlet, reference=ticket.ticket_number,
                  new_value=new_ticket.ticket_number)
        return Response({
            'source': self.get_serializer(self.get_queryset().get(pk=ticket.pk)).data,
            'new_ticket': self.get_serializer(self.get_queryset().get(pk=new_ticket.pk)).data,
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def transfer_lines(self, request, pk=None):
        """Transferência PARCIAL: move as linhas indicadas para o ticket aberto de outra mesa."""
        import uuid
        ticket = self.get_object()
        if ticket.status != 'OPEN':
            return Response({'detail': 'Só tickets abertos.'}, status=400)
        line_ids = request.data.get('line_ids') or []
        lines = ticket.lines.filter(pk__in=line_ids)
        if not lines.exists():
            return Response({'detail': 'Indique as linhas a transferir (line_ids).'}, status=400)
        tbl = POSTable.objects.filter(pk=request.data.get('table'), outlet=ticket.outlet).first()
        if not tbl:
            return Response({'detail': 'Mesa de destino inválida.'}, status=400)
        dest = POSTicket.objects.filter(table=tbl, status='OPEN').first()
        if not dest:
            dest = POSTicket.objects.create(
                ticket_number=f"TCK-{uuid.uuid4().hex[:8].upper()}", outlet=ticket.outlet,
                table=tbl, cash_session=ticket.cash_session, operator_name=ticket.operator_name,
                dest_kind='TABLE', dest_ref=str(tbl.id), dest_label=f'Mesa {tbl.table_number}')
            tbl.status = 'OCCUPIED'
            tbl.save(update_fields=['status'])
        lines.update(ticket=dest)
        POSTicket.objects.get(pk=ticket.pk).recompute(save=True)
        POSTicket.objects.get(pk=dest.pk).recompute(save=True)
        # Se a origem ficou sem linhas e sem pagamentos, liberta a mesa.
        src = POSTicket.objects.get(pk=ticket.pk)
        if not src.lines.exists() and not src.payments.exists():
            src.status = 'VOID'
            src.closed_at = timezone.now()
            src.save(update_fields=['status', 'closed_at'])
            if src.table and not src.table.tickets.filter(status__in=['OPEN', 'SUSPENDED']).exists():
                src.table.status = 'FREE'
                src.table.save(update_fields=['status'])
        log_event(request, 'TICKET_OPEN', f'Transferência parcial -> Mesa {tbl.table_number}',
                  operator_name=ticket.operator_name, outlet=ticket.outlet, reference=ticket.ticket_number,
                  new_value=dest.ticket_number)
        return Response({
            'source': self.get_serializer(self.get_queryset().get(pk=ticket.pk)).data,
            'target': self.get_serializer(self.get_queryset().get(pk=dest.pk)).data,
        })

    # ------------------------------------------------------------------
    # MOTOR 6 (aprofundamento) — estorno, cobrança no quarto (PMS), gift card
    # ------------------------------------------------------------------
    @action(detail=True, methods=['post'])
    def refund(self, request, pk=None):
        """Estorno: emite a NOTA DE CRÉDITO no motor fiscal — assinada e encadeada.

        Antes, isto numerava a NC numa série PARALELA (mdm.DocumentSeries): saía um
        documento com número, mas sem assinatura, sem encadeamento de hash e fora do
        SAF-T. Ou seja: um documento que a AGT não reconhece. Agora passa pelo mesmo
        ponto único de emissão das faturas.
        """
        from fiscal.services import create_credit_note
        from fiscal.integration import existing_for
        ticket = self.get_object()
        if ticket.status != 'PAID':
            return Response({'detail': 'Só tickets pagos podem ser estornados.'}, status=400)

        original = existing_for('pos', ticket.id)
        if not original:
            return Response({'detail': 'Este ticket não tem documento fiscal — não há o que estornar. '
                                       'Verifique a configuração da série no Centro Fiscal.'}, status=400)
        motivo = request.data.get('reason', 'Estorno')
        try:
            nc = create_credit_note(
                original.id, reason=motivo,
                user=(request.user.username if request.user.is_authenticated else None),
                ip=request.META.get('REMOTE_ADDR'))
        except ValueError as e:
            return Response({'detail': str(e)}, status=400)

        ticket.status = 'REFUNDED'
        ticket.save(update_fields=['status'])
        log_event(request, 'DOC_ISSUE', f'Estorno / Nota de crédito {nc.invoice_no}. Motivo: {motivo}',
                  operator_name=ticket.operator_name, outlet=ticket.outlet, reference=nc.invoice_no,
                  old_value='PAID', new_value='REFUNDED', amount=-ticket.grand_total)
        return Response({'invoice_no': nc.invoice_no, 'hash': nc.doc_hash,
                         'grand_total': str(nc.grand_total), 'ticket_status': 'REFUNDED'},
                        status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def charge_to_room(self, request, pk=None):
        """Cobra o saldo do ticket num folio PMS aberto (integração Motor 8 com o PMS)."""
        ticket = self.get_object()
        if ticket.status != 'OPEN':
            return Response({'detail': 'Ticket não está aberto.'}, status=400)
        try:
            from pms.models import Room, Folio, FolioCharge
        except ImportError:
            return Response({'detail': 'Módulo PMS não está ativo nesta licença.'}, status=409)
        room_number = request.data.get('room')
        room = Room.objects.filter(number=room_number).first()
        folio = None
        if room:
            folio = Folio.objects.filter(reservation__room=room, status='OPEN').first()
        if not folio:
            return Response({'detail': f'Sem folio aberto para o quarto {room_number}.'}, status=404)
        ticket = POSTicket.objects.get(pk=ticket.pk)
        amount = ticket.balance_due
        FolioCharge.objects.create(
            folio=folio, charge_type='FNB', description=f"POS {ticket.ticket_number} ({ticket.outlet.name})",
            amount=amount, source_reference=ticket.ticket_number, posted_by=ticket.operator_name)
        ticket.status = 'PAID'
        ticket.closed_at = timezone.now()
        if ticket.table:
            ticket.table.status = 'FREE'
            ticket.table.save(update_fields=['status'])
        ticket.save(update_fields=['status', 'closed_at'])
        _safe_consume(ticket, request)
        # NÃO fiscaliza aqui: o documento fiscal é emitido no CHECK-OUT (fatura do folio).
        log_event(request, 'PAYMENT', f'Cobrança no quarto {room_number} (folio {folio.number}): {amount}',
                  operator_name=ticket.operator_name, outlet=ticket.outlet, reference=ticket.ticket_number,
                  new_value=f'ROOM {room_number}', amount=amount)
        return Response(self.get_serializer(self.get_queryset().get(pk=ticket.pk)).data)

    @action(detail=True, methods=['post'])
    def redeem_gift(self, request, pk=None):
        """Aplica o saldo de um gift card como pagamento do ticket."""
        from mdm.models import PaymentMethod
        ticket = self.get_object()
        if ticket.status != 'OPEN':
            return Response({'detail': 'Ticket não está aberto.'}, status=400)
        card = GiftCard.objects.filter(code=request.data.get('code'), is_active=True).first()
        if not card:
            return Response({'detail': 'Gift card inválido ou inativo.'}, status=404)
        if card.balance <= 0:
            return Response({'detail': 'Gift card sem saldo.'}, status=409)
        ticket = POSTicket.objects.get(pk=ticket.pk)
        applied = min(card.balance, ticket.balance_due)
        pm = (PaymentMethod.objects.filter(name__icontains='gift').first()
              or PaymentMethod.objects.filter(method_type='VOUCHER').first()
              or PaymentMethod.objects.first())
        if not pm:
            return Response({'detail': 'Sem método de pagamento configurado.'}, status=400)
        POSTicketPayment.objects.create(ticket=ticket, payment_method=pm, amount=applied)
        card.balance -= applied
        card.save(update_fields=['balance'])
        ticket = POSTicket.objects.get(pk=ticket.pk)
        if ticket.balance_due <= 0:
            ticket.status = 'PAID'
            ticket.closed_at = timezone.now()
            if ticket.table:
                ticket.table.status = 'FREE'
                ticket.table.save(update_fields=['status'])
            ticket.save(update_fields=['status', 'closed_at'])
            _safe_consume(ticket, request)
            _safe_fiscalize(ticket, request)
        log_event(request, 'PAYMENT', f'Gift card {card.code}: {applied} (saldo restante {card.balance})',
                  operator_name=ticket.operator_name, outlet=ticket.outlet, reference=ticket.ticket_number,
                  new_value=f'GIFT {card.code}', amount=applied)
        return Response(self.get_serializer(self.get_queryset().get(pk=ticket.pk)).data)

    @action(detail=True, methods=['post'])
    def issue_document(self, request, pk=None):
        """Emite um documento (Pré-conta/Fatura/...) com numeração sequencial atómica da série."""
        from django.db import transaction
        from mdm.models import DocumentSeries
        from .models import POSDocument
        from .serializers import POSDocumentSerializer
        ticket = self.get_object()
        doc_type = request.data.get('document_type', 'INVOICE')
        series_id = request.data.get('series')
        with transaction.atomic():
            if series_id:
                series = DocumentSeries.objects.select_for_update().filter(pk=series_id).first()
            else:
                series = DocumentSeries.objects.select_for_update().filter(document_type=doc_type, is_active=True).first()
            if not series:
                return Response({'detail': f'Sem série ativa para "{doc_type}". Crie em Master Data → Séries.'},
                                status=status.HTTP_400_BAD_REQUEST)
            series.current_number += 1
            series.save(update_fields=['current_number'])
            full = f"{series.prefix}{series.year}/{series.current_number:04d}"
            doc = POSDocument.objects.create(
                document_type=series.document_type, series=series, number=series.current_number, full_number=full,
                ticket=ticket, customer_name=request.data.get('customer_name'),
                customer_tax_id=request.data.get('customer_tax_id'),
                subtotal=ticket.subtotal, tax_total=ticket.tax_total, grand_total=ticket.grand_total,
            )
        # Motor 8: coloca o documento na fila de impressão.
        from .models import PrintJob
        PrintJob.objects.create(
            job_type='INVOICE' if doc.document_type in ('INVOICE', 'SIMPLIFIED') else 'RECEIPT',
            outlet=ticket.outlet, title=f"{doc.document_type} {doc.full_number}",
            content=f"{doc.full_number}\nCliente: {doc.customer_name or 'Consumidor Final'}\nTotal: {doc.grand_total}",
            reference=doc.full_number)
        log_event(request, 'DOC_ISSUE', f'{doc.document_type}: {doc.full_number}',
                  operator_name=ticket.operator_name, outlet=ticket.outlet,
                  reference=doc.full_number, new_value=doc.document_type, amount=doc.grand_total)
        return Response(POSDocumentSerializer(doc).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Resumo operacional (dashboard POS + supervisão): vendas do dia, mesas ocupadas,
        desempenho por operador e produtos mais vendidos. Filtra por ?outlet= (opcional)."""
        outlet = request.query_params.get('outlet')
        today = timezone.localdate()
        tq = POSTicket.objects.all()
        if outlet:
            tq = tq.filter(outlet_id=outlet)
        paid = list(tq.filter(status='PAID', closed_at__date=today).prefetch_related('lines'))
        open_t = list(tq.filter(status='OPEN'))
        total = sum((t.grand_total for t in paid), Decimal('0'))
        count = len(paid)
        avg = (total / count) if count else Decimal('0')
        occupied = len({t.table_id for t in open_t if t.table_id})

        ops = {}
        for t in paid:
            o = ops.setdefault(t.operator_name, {'operator': t.operator_name, 'sales': Decimal('0'), 'tickets': 0, 'open': 0})
            o['sales'] += t.grand_total; o['tickets'] += 1
        for t in open_t:
            o = ops.setdefault(t.operator_name, {'operator': t.operator_name, 'sales': Decimal('0'), 'tickets': 0, 'open': 0})
            o['open'] += 1

        prod = {}
        for t in paid:
            for l in t.lines.all():
                p = prod.setdefault(l.description, {'name': l.description, 'qty': Decimal('0'), 'total': Decimal('0')})
                p['qty'] += l.quantity; p['total'] += l.line_total
        top = sorted(prod.values(), key=lambda x: x['qty'], reverse=True)[:8]

        from .models import CashSession
        cq = CashSession.objects.filter(status='OPEN')
        if outlet:
            cq = cq.filter(outlet_id=outlet)
        cash = cq.first()

        return Response({
            'date': str(today),
            'sales_total': total, 'sales_count': count, 'avg_ticket': avg,
            'open_tickets': len(open_t), 'occupied_tables': occupied,
            'by_operator': sorted(ops.values(), key=lambda x: x['sales'], reverse=True),
            'top_products': top,
            'cash_open': bool(cash), 'cash_expected': (cash.expected_cash if cash else 0),
            'open_ticket_list': [
                {'ticket_number': t.ticket_number, 'operator': t.operator_name,
                 'table': (t.table.table_number if t.table else None), 'total': t.grand_total,
                 'opened_at': t.opened_at} for t in open_t],
        })

    @action(detail=False, methods=['post'])
    def sync(self, request):
        """
        Motor 9 (offline): recebe um lote de tickets criados offline e insere-os de forma
        IDEMPOTENTE (dedup por client_uuid). Devolve o mapeamento client_uuid -> id do servidor.
        Cada ticket: {client_uuid, outlet, operator_name, lines:[{item, quantity, unit_price}], payments:[{payment_method, amount}]}
        """
        from django.db import transaction
        from inventory.models import Item
        from mdm.models import PaymentMethod
        import uuid as _uuid
        results = []
        for tk in request.data.get('tickets', []):
            cuid = tk.get('client_uuid')
            existing = POSTicket.objects.filter(client_uuid=cuid).first() if cuid else None
            if existing:
                results.append({'client_uuid': cuid, 'id': existing.id, 'status': 'exists'})
                continue
            try:
                with transaction.atomic():
                    ticket = POSTicket.objects.create(
                        ticket_number=tk.get('ticket_number') or f"TCK-{_uuid.uuid4().hex[:8].upper()}",
                        client_uuid=cuid, outlet_id=tk['outlet'], operator_name=tk.get('operator_name', 'offline'),
                    )
                    for ln in tk.get('lines', []):
                        item = Item.objects.get(pk=ln['item'])
                        POSTicketLine.objects.create(
                            ticket=ticket, item=item, description=item.name,
                            quantity=Decimal(str(ln.get('quantity', 1))),
                            unit_price=Decimal(str(ln.get('unit_price', item.sale_price or 0))),
                            tax_percentage=item.tax_percentage or 0)
                    POSTicket.objects.get(pk=ticket.pk).recompute(save=True)
                    for pm in tk.get('payments', []):
                        POSTicketPayment.objects.create(
                            ticket=ticket, payment_method=PaymentMethod.objects.get(pk=pm['payment_method']),
                            amount=Decimal(str(pm['amount'])))
                    ticket = POSTicket.objects.get(pk=ticket.pk)
                    if ticket.balance_due <= 0 and ticket.payments.exists():
                        ticket.status = 'PAID'
                        ticket.closed_at = timezone.now()
                        ticket.save(update_fields=['status', 'closed_at'])
                log_event(request, 'TICKET_OPEN', f'Ticket sincronizado (offline) {ticket.ticket_number}',
                          operator_name=ticket.operator_name, outlet=ticket.outlet, reference=ticket.ticket_number)
                results.append({'client_uuid': cuid, 'id': ticket.id, 'status': 'created'})
            except Exception as e:
                results.append({'client_uuid': cuid, 'error': str(e), 'status': 'failed'})
        return Response({'synced': results})


STATION_LABEL = {'KITCHEN': 'COZINHA', 'BAR': 'BAR', 'PASTRY': 'PASTELARIA'}


def cancel_production(request, ticket, lines, reason='Anulado no POS'):
    """Anula linhas JÁ ENVIADAS à produção.

    Regras (nunca se apaga histórico):
      1. a linha fica kds_status=CANCELLED + is_void (deixa de somar ao total);
      2. cada estação afetada (Cozinha/Bar/Pastelaria) recebe uma comanda de ANULAÇÃO
         e o item passa a aparecer a vermelho no seu ecrã até ser confirmado;
      3. tudo fica registado na auditoria do POS.
    """
    from collections import defaultdict
    from .models import PrintJob
    targets = [l for l in lines if l.kds_station != 'NONE' and l.kds_status in ('FIRED', 'PREPARING', 'READY')]
    if not targets:
        return []
    now = timezone.now()
    by_station = defaultdict(list)
    for l in targets:
        l.kds_status = 'CANCELLED'
        l.is_void = True
        l.void_reason = reason
        l.voided_at = now
        l.kds_ack_at = None
        l.save(update_fields=['kds_status', 'is_void', 'void_reason', 'voided_at', 'kds_ack_at'])
        by_station[l.kds_station].append(l)

    where = ticket.dest_label or (ticket.table.table_number if ticket.table else ticket.ticket_number)
    for station, sl in by_station.items():
        content = ("*** ANULAÇÃO — NÃO PREPARAR ***\n"
                   + "\n".join(f"{int(l.quantity)}x {l.description}" for l in sl)
                   + f"\nMotivo: {reason}")
        PrintJob.objects.create(
            job_type=station if station in ('KITCHEN', 'BAR', 'PASTRY') else 'KITCHEN',
            target=station, outlet=ticket.outlet,
            title=f"ANULAÇÃO — {where}", content=content, reference=ticket.ticket_number)
        log_event(request, 'LINE_VOID',
                  f'ANULAÇÃO enviada a {STATION_LABEL.get(station, station)}: '
                  + ", ".join(f"{int(l.quantity)}x {l.description}" for l in sl),
                  operator_name=ticket.operator_name, outlet=ticket.outlet,
                  reference=ticket.ticket_number, old_value=station, new_value=reason,
                  amount=sum((l.line_total for l in sl), Decimal('0')))
    return targets


class POSTicketLineViewSet(viewsets.ModelViewSet):
    serializer_class = POSTicketLineSerializer
    queryset = POSTicketLine.objects.all()

    def destroy(self, request, *a, **kw):
        # MOTIVO DE ANULAÇÃO — anular um artigo JÁ EM PRODUÇÃO sem dizer porquê é como
        # deitar comida fora sem registo. Exige-se o motivo (da lista configurada).
        from .models import VoidReason
        instance = self.get_object()
        motivo = request.query_params.get('reason') or request.data.get('reason')
        if instance.kds_status in ('FIRED', 'PREPARING', 'READY') and not motivo:
            return Response({
                'detail': 'Este artigo já foi para a produção. Indique o motivo da anulação.',
                'requires_reason': True,
                'reasons': [{'code': r.code, 'label': r.key_label}
                            for r in VoidReason.objects.filter(is_active=True)],
            }, status=status.HTTP_400_BAD_REQUEST)
        return super().destroy(request, *a, **kw)

    def perform_destroy(self, instance):
        ticket = instance.ticket
        desc = f'{instance.quantity}x {instance.description} @ {instance.unit_price}'
        reason = (self.request.query_params.get('reason')
                  or self.request.data.get('reason') or 'Anulado no POS')
        # O talão que vai para a estação leva o texto de IMPRESSÃO do motivo (não o da tecla).
        from .models import VoidReason
        vr = VoidReason.objects.filter(key_label=reason).first() or VoidReason.objects.filter(code=reason).first()
        if vr:
            reason = vr.print_label
        if instance.kds_status in ('FIRED', 'PREPARING', 'READY'):
            # Já está em produção: NÃO se apaga. Anula-se, avisa-se a estação e fica no registo.
            cancel_production(self.request, ticket, [instance], reason)
            ticket.recompute(save=True)
            return
        instance.delete()
        ticket.recompute(save=True)
        log_event(self.request, 'LINE_VOID', f'Artigo removido: {desc}',
                  operator_name=ticket.operator_name, outlet=ticket.outlet,
                  reference=ticket.ticket_number, old_value=desc, new_value=reason)


class KDSViewSet(viewsets.ReadOnlyModelViewSet):
    """Kitchen Display System — fila de produção. Avança estados dos itens enviados."""
    from .serializers import KDSLineSerializer as _KDSSerializer
    serializer_class = _KDSSerializer

    def get_queryset(self):
        qs = (POSTicketLine.objects
              .select_related('ticket', 'ticket__table', 'ticket__outlet')
              # CANCELLED entra na fila (a vermelho) até a estação confirmar que viu a anulação.
              .filter(kds_status__in=['FIRED', 'PREPARING', 'READY', 'CANCELLED'])
              .exclude(kds_status='CANCELLED', kds_ack_at__isnull=False)
              .order_by('fired_at'))
        station = self.request.query_params.get('station')
        return qs.filter(kds_station=station) if station else qs

    @action(detail=True, methods=['post'])
    def advance(self, request, pk=None):
        line = self.get_object()
        old = line.kds_status
        if old == 'CANCELLED':      # estação confirma que viu a anulação → sai da fila
            line.kds_ack_at = timezone.now()
            line.save(update_fields=['kds_ack_at'])
            log_event(request, 'KDS_ADVANCE',
                      f'{STATION_LABEL.get(line.kds_station, line.kds_station)} confirmou a ANULAÇÃO de {line.description}',
                      operator_name=line.ticket.operator_name, outlet=line.ticket.outlet,
                      reference=line.ticket.ticket_number, old_value='CANCELLED', new_value='ACK')
            return Response(self.get_serializer(line).data)
        flow = {'FIRED': 'PREPARING', 'PREPARING': 'READY', 'READY': 'SERVED'}
        nxt = flow.get(old)
        if not nxt:
            return Response({'detail': 'Sem próximo estado.'}, status=status.HTTP_400_BAD_REQUEST)
        line.kds_status = nxt
        if nxt == 'READY':
            line.ready_at = timezone.now()
        line.save(update_fields=['kds_status', 'ready_at'])
        # Regista TODAS as passagens de estado (quem preparou, quando ficou pronto, quando serviu).
        log_event(request, 'KDS_ADVANCE',
                  f'{STATION_LABEL.get(line.kds_station, line.kds_station)}: {line.description} → {line.get_kds_status_display()}',
                  operator_name=line.ticket.operator_name, outlet=line.ticket.outlet,
                  reference=line.ticket.ticket_number, old_value=old, new_value=nxt)
        return Response(self.get_serializer(line).data)


class POSDocumentViewSet(viewsets.ReadOnlyModelViewSet):
    """Documentos emitidos (Motor 7). Emissão via ação do ticket; aqui listagem, 2ª via e anulação."""
    from .serializers import POSDocumentSerializer as _DocSerializer
    serializer_class = _DocSerializer

    def get_queryset(self):
        from .models import POSDocument
        qs = POSDocument.objects.select_related('series', 'ticket').all()
        for f in ('ticket', 'document_type', 'status'):
            v = self.request.query_params.get(f)
            if v:
                qs = qs.filter(**{f if f != 'ticket' else 'ticket_id': v})
        return qs

    @action(detail=True, methods=['post'])
    def void(self, request, pk=None):
        doc = self.get_object()
        doc.status = 'VOID'
        doc.save(update_fields=['status'])
        return Response(self.get_serializer(doc).data)


class POSAuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Motor 10 — auditoria de operação (só leitura; registada automaticamente pelas ações)."""
    from .serializers import POSAuditLogSerializer as _AuditSerializer
    serializer_class = _AuditSerializer

    def get_queryset(self):
        from .models import POSAuditLog
        qs = POSAuditLog.objects.select_related('outlet').all()
        for f in ('event_type', 'reference', 'outlet'):
            v = self.request.query_params.get(f)
            if v:
                qs = qs.filter(**{f if f != 'outlet' else 'outlet_id': v})
        return qs[:500]


class PrintJobViewSet(viewsets.ModelViewSet):
    """Motor 8 — spooler de impressão. Um agente local consome os jobs QUEUED e marca impressos."""
    from .serializers import PrintJobSerializer as _PJSerializer
    serializer_class = _PJSerializer

    def get_queryset(self):
        from .models import PrintJob
        qs = PrintJob.objects.select_related('outlet').all()
        for f in ('status', 'job_type', 'target'):
            v = self.request.query_params.get(f)
            if v:
                qs = qs.filter(**{f: v})
        return qs

    @action(detail=True, methods=['post'])
    def mark_printed(self, request, pk=None):
        job = self.get_object()
        job.status = 'PRINTED'
        job.printed_at = timezone.now()
        job.save(update_fields=['status', 'printed_at'])
        return Response(self.get_serializer(job).data)

    @action(detail=True, methods=['post'])
    def retry(self, request, pk=None):
        """Reimpressão / reenvio para a fila."""
        job = self.get_object()
        job.status = 'QUEUED'
        job.printed_at = None
        job.save(update_fields=['status', 'printed_at'])
        return Response(self.get_serializer(job).data)


class POSReservationViewSet(viewsets.ModelViewSet):
    """Motor 3 — reservas de mesa. Sentar liga a reserva a uma mesa (OCCUPIED)."""
    serializer_class = POSReservationSerializer

    def get_queryset(self):
        qs = POSReservation.objects.select_related('outlet', 'table').all()
        for f in ('outlet', 'status'):
            v = self.request.query_params.get(f)
            if v:
                qs = qs.filter(**{f: v})
        return qs

    def perform_create(self, serializer):
        # Reserva com mesa atribuída -> a mesa fica RESERVADA no mapa (ciclo livre->reservada).
        res = serializer.save()
        if res.table and res.table.status == 'FREE':
            res.table.status = 'RESERVED'
            res.table.save(update_fields=['status'])

    @action(detail=True, methods=['post'])
    def arrive(self, request, pk=None):
        """O cliente chegou (aguarda para ser sentado)."""
        res = self.get_object()
        if res.status not in ('BOOKED',):
            return Response({'detail': 'Só reservas confirmadas podem marcar chegada.'}, status=400)
        res.status = 'ARRIVED'
        res.save(update_fields=['status'])
        return Response(self.get_serializer(res).data)

    @action(detail=True, methods=['post'])
    def seat(self, request, pk=None):
        """Senta a reserva: ocupa a mesa e ABRE o pedido (ticket) com o nº de pessoas."""
        import uuid
        res = self.get_object()
        if res.status not in ('BOOKED', 'ARRIVED'):
            return Response({'detail': 'Reserva não está em estado reservável.'}, status=400)
        table_id = request.data.get('table') or res.table_id
        ticket = None
        table = None
        if table_id:
            try:
                table = POSTable.objects.get(pk=table_id, outlet=res.outlet)
            except POSTable.DoesNotExist:
                return Response({'detail': 'Mesa inválida.'}, status=404)
            res.table = table
            table.status = 'OCCUPIED'
            table.save(update_fields=['status'])
            # Abre o pedido na mesa (ou reutiliza um já aberto).
            ticket = POSTicket.objects.filter(table=table, status='OPEN').first()
            if not ticket:
                sess = CashSession.objects.filter(outlet=res.outlet, status='OPEN').first()
                ticket = POSTicket.objects.create(
                    ticket_number=f"TCK-{uuid.uuid4().hex[:8].upper()}", outlet=res.outlet, table=table,
                    cash_session=sess, operator_name=(request.user.username if request.user.is_authenticated else 'POS'),
                    guests=res.party_size, dest_kind='TABLE', dest_ref=str(table.id),
                    dest_label=f'Mesa {table.table_number}')
        res.status = 'SEATED'
        res.save(update_fields=['status', 'table'])
        data = self.get_serializer(res).data
        data['ticket_id'] = ticket.id if ticket else None
        return Response(data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        res = self.get_object()
        res.status = request.data.get('no_show') and 'NO_SHOW' or 'CANCELLED'
        res.save(update_fields=['status'])
        # Liberta a mesa se estava só reservada e não tem pedido aberto.
        if res.table and res.table.status == 'RESERVED' and not res.table.tickets.filter(status__in=['OPEN', 'SUSPENDED']).exists():
            res.table.status = 'FREE'
            res.table.save(update_fields=['status'])
        return Response(self.get_serializer(res).data)


class GiftCardViewSet(viewsets.ModelViewSet):
    """Motor 6 — gift cards / vouchers com saldo. Redeem via ação do ticket."""
    serializer_class = GiftCardSerializer
    queryset = GiftCard.objects.all()

    def perform_create(self, serializer):
        # Ao emitir, o saldo arranca igual ao valor inicial.
        card = serializer.save()
        if not card.balance:
            card.balance = card.initial_balance
            card.save(update_fields=['balance'])
