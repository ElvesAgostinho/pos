from decimal import Decimal

from django.db import transaction
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


def _print_document(ticket, doc, copia=False):
    """Põe o documento fiscal na fila de impressão (1ª via ou 2ª via).

    O talão que sai TEM de ser uma fatura aceite pela AGT. Faltavam-lhe quatro coisas
    sem as quais o documento não é válido em Angola:
      · o NIF da empresa e o do cliente (senão não é fatura, é papel);
      · o RESUMO DE IVA por taxa (incidência e imposto liquidado);
      · o VALOR POR EXTENSO (obrigatório — já era calculado e não era impresso);
      · a MENÇÃO legal com o nº de certificação e os 4 caracteres da assinatura.
    """
    from .models import PrintJob
    from .params import P
    from fiscal.models import FiscalConfig
    from fiscal.services import summarize_by_rate
    from decimal import Decimal

    cfg = FiscalConfig.get()
    # (8364) casas decimais nos valores do talão; (8149) artigos a 0 não se imprimem
    # (couvert incluído, oferta do pacote) — o papel fica mais curto e mais claro.
    casas = max(0, min(4, P.int(8364, 2)))
    def fmt(v):
        return f"{Decimal(str(v)):.{casas}f}"
    linhas_doc = doc.lines.all()
    if P.bool(8149, False):
        linhas_doc = [l for l in linhas_doc if (l.line_total + l.tax_amount) != 0]
    linhas = "\n".join(
        f"{l.quantity.normalize():f}x {l.description} .... {fmt(l.line_total + l.tax_amount)}"
        for l in linhas_doc)

    # Resumo de IVA por taxa (é o que a AGT confere).
    resumo = summarize_by_rate([(Decimal(str(l.tax_percentage or 0)),
                                 Decimal(str(l.line_total)) + Decimal(str(l.tax_amount)))
                                for l in doc.lines.all()])
    iva = "\n".join(f"IVA {r['rate']:g}%  base {fmt(r['base'])}  imposto {fmt(r['tax'])}" for r in resumo)

    # Menção legal: nº de certificação + 4 caracteres da assinatura (posições 1,11,21,31).
    h = doc.doc_hash or ''
    quatro = ''.join(h[i] for i in (0, 10, 20, 30) if len(h) > i)
    # (Tipo de documento) "Imprime menção" — um documento de conferência não a leva;
    # uma fatura leva sempre. É a caixa do Rules Engine a mandar no papel.
    # (O nº já vem "147/AGT/2026" — não se lhe cola outro "/AGT".)
    mencao = ''
    if h and h != '0' and getattr(doc.doc_type, 'prints_mention', True):
        mencao = (f"{quatro}-Processado por programa validado n.º "
                  f"{cfg.certificate_number or 'S/N'}")

    # (8148) o nome por defeito do "sem contribuinte" é parametrizável (há casas que
    # imprimem "Cliente Final"); (8256) a mensagem de despedida é da casa, não do código;
    # (8207) linhas em branco antes da guilhotina — sem elas o corte leva o total.
    sem_nif = P.text(8148, 'Consumidor Final')
    rodape = P.text(8256, 'Obrigado pela sua visita.')
    corte = '\n' * max(0, min(10, P.int(8207, 2)))

    def _corpo(texto_via):
        return (f"{cfg.company_name or ''}\n"
                f"NIF: {cfg.company_nif or ''}\n"
                f"*** {texto_via.upper()} ***\n"
                f"{doc.invoice_no}   {doc.doc_date:%d/%m/%Y}\n"
                f"Cliente: {doc.customer_name or sem_nif}\n"
                f"NIF cliente: {doc.customer_tax_id or sem_nif}\n"
                f"{'-' * 34}\n{linhas}\n{'-' * 34}\n"
                f"{iva}\n"
                f"TOTAL: {fmt(doc.gross_total)} Kz\n"
                f"Valor por extenso: {doc.amount_in_words or ''}\n"
                f"{'-' * 34}\n{mencao}\n{rodape}{corte}")

    # AS VIAS DA SÉRIE (caixa "Textos das cópias" do backoffice): a 1ª via é o
    # ORIGINAL (a do cliente); as outras saem com o texto delas — arquivo,
    # contabilidade. Cada via é um trabalho próprio na fila, com o texto impresso.
    vias = [v for v in (getattr(doc.series, 'copy_texts', None) or []) if str(v).strip()] \
        or ['Original']
    if copia:
        # REIMPRESSÃO: não é uma via nova — é a 2ª via do Original, e diz-lo.
        return PrintJob.objects.create(
            job_type='INVOICE', outlet=ticket.outlet,
            title=f'2ª VIA · {doc.invoice_no}',
            content=_corpo(f'2ª VIA · {vias[0]}'),
            reference=doc.invoice_no, copies=1)
    primeiro = None
    for via in vias:
        job = PrintJob.objects.create(
            job_type='INVOICE', outlet=ticket.outlet,
            title=f'{doc.invoice_no} · {via}',
            content=_corpo(via),
            reference=doc.invoice_no, copies=1)
        primeiro = primeiro or job
    return primeiro

def _safe_fiscalize(ticket, request, credito=False, customer=None):
    """Emite o documento fiscal (AGT) do ticket pago. Nunca quebra o pagamento.

    `credito` = pago em CONTA CORRENTE: o documento nasce POR RECEBER (fatura), não
    fatura-recibo. Dizer à AGT que se recebeu dinheiro que não entrou é declarar falso.
    """
    try:
        from fiscal.integration import emit_for_pos_ticket
        user = request.user.username if request.user.is_authenticated else None
        ip = request.META.get('REMOTE_ADDR')
        emit_for_pos_ticket(ticket, user=user, ip=ip, credito=credito, customer=customer)
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
        # O terminal pede as mesas DO SETOR — exatamente as que o backoffice desenhou na
        # planta desse setor (Configuração POS › Setores). Sem fallbacks: uma mesa que o
        # backoffice não vê não pode aparecer no terminal.
        sector = self.request.query_params.get('sector')
        if sector:
            return qs.filter(sector_id=sector)
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
            if not v:
                continue
            # VÁRIOS ESTADOS de uma vez: ?status=OPEN,SUSPENDED
            # O mapa de mesas precisa das ABERTAS **e** das SUSPENSAS: uma conta
            # suspensa mantém a mesa ocupada (o grupo saiu e volta). Pedindo só OPEN, a
            # conta suspensa não vinha na lista, o mapa não a encontrava — e a mesa
            # ficava vermelha a pedir outra vez o tipo de cliente, como se estivesse
            # livre. A conta estava lá o tempo todo; era a pergunta que estava mal feita.
            if f == 'status' and ',' in v:
                qs = qs.filter(status__in=[x.strip() for x in v.split(',') if x.strip()])
            else:
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
                    # (8075-8081) DESCONTO POR TIPO DE ENTIDADE: Hóspede, Empresa,
                    # Agência, Grupo, Proprietário — cada tipo tem o seu desconto de
                    # casa nos parâmetros. O VIP (da ficha) tem prioridade.
                    elif not ticket.discount_percent and cust.entity_type_id:
                        POR_TIPO = {'HÓSPEDE': 8075, 'HOSPEDE': 8075, 'EMPRESA': 8076,
                                    'AGÊNCIA': 8077, 'AGENCIA': 8077, 'GRUPO': 8079,
                                    'PROPRIETÁRIO': 8081, 'PROPRIETARIO': 8081}
                        num = POR_TIPO.get((cust.entity_type.name or '').strip().upper())
                        if num:
                            try:
                                pct = Decimal(str(P.text(num, '') or '0').replace('%', '').replace(',', '.'))
                            except Exception:
                                pct = Decimal('0')
                            if 0 < pct <= 100:
                                ticket.discount_percent = pct
                                ticket.discount_authorized_by = f'Tipo {cust.entity_type.name} (parâmetro {num})'
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
        # (8333) "Tipo de Hóspede é obrigatório": sem saber se é passante, hóspede ou
        # consumo interno, a receita mistura-se com o custo do staff e o mapa mente.
        if P.bool(8333, True) and not data.get('guest_type'):
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'guest_type': ['O tipo de cliente é obrigatório (parâmetro '
                                                  '8333): Passante, Hotel ou Consumo Interno.']})
        num = data.get('ticket_number') or f"TCK-{uuid.uuid4().hex[:8].upper()}"
        # A CONTA PERTENCE À CAIXA ABERTA. Sem esta ligação, o fecho de caixa não sabe
        # que contas são do turno, e o terminal não consegue distinguir a venda de balcão
        # de hoje da que ficou esquecida ontem — ao tocar em Venda Direta aparecia o
        # consumo de outra pessoa lá dentro, e vendia-se por cima da conta alheia.
        if not data.get('cash_session') and data.get('outlet'):
            sess = (CashSession.objects.filter(outlet=data['outlet'], status='OPEN')
                    .order_by('-opened_at').first())
            if sess:
                ticket = serializer.save(ticket_number=num, cash_session=sess)
                self._depois_de_abrir(ticket)
                return
        ticket = serializer.save(ticket_number=num)
        self._depois_de_abrir(ticket)

    def _depois_de_abrir(self, ticket):
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
        # (Artigo) "Pergunta sempre a quantidade" — o cliente pede "três cafés", não "um
        # café" três vezes. Sem esta caixa, o empregado carrega três vezes na tecla e
        # engana-se numa; com ela, o terminal PERGUNTA e só aceita com resposta.
        crua = request.data.get('quantity')
        if getattr(item, 'always_ask_quantity', False) and crua in (None, ''):
            return Response({'detail': f'"{item.name}" exige que se indique a quantidade.',
                             'requires_quantity': True}, status=status.HTTP_400_BAD_REQUEST)

        # (Artigo) "Interface de balança" — o peixe ao quilo não se conta, pesa-se. A
        # quantidade tem de vir da balança (ou ser escrita à mão, se ela avariou), e é
        # sempre fracionada.
        if getattr(item, 'scale_interface', False) and crua in (None, ''):
            return Response({'detail': f'"{item.name}" é pesado na balança: falta o peso.',
                             'requires_weight': True}, status=status.HTTP_400_BAD_REQUEST)

        try:
            qty = Decimal(str(crua if crua not in (None, '') else '1'))
        except Exception:
            qty = Decimal('1')

        # (Artigo) "Permite fração" — meia dose, 0,350 kg de picanha. Um artigo que NÃO
        # a permite não se vende às metades: 1,5 cervejas não existe, e uma quantidade
        # partida numa cerveja é sempre um erro de dedo no teclado.
        if qty != qty.to_integral_value():
            if not (getattr(item, 'allow_fraction', False)
                    or getattr(item, 'scale_interface', False)):
                return Response({'detail': f'"{item.name}" não se vende em frações. '
                                           f'Indique uma quantidade inteira.',
                                 'no_fraction': True}, status=status.HTTP_400_BAD_REQUEST)

        # (Artigo) "Texto livre" — o artigo genérico ("Diversos", "Prato do dia"). O que sai
        # na conta e na fatura é o que o empregado escreve; sem isso, o cliente recebe uma
        # fatura a dizer "Diversos" e não sabe o que pagou.
        descricao = (request.data.get('description') or '').strip()
        if getattr(item, 'free_text', False) and not descricao:
            return Response({'detail': f'"{item.name}" é de texto livre: escreva o que está a vender.',
                             'requires_description': True}, status=status.HTTP_400_BAD_REQUEST)

        # (POS Product Config) "Disponível" — o artigo existe no catálogo mas hoje acabou.
        # É como se risca um prato do menu ao almoço sem o apagar do sistema.
        cfg = POSProductConfig.objects.filter(outlet=ticket.outlet, item=item).first()
        if cfg and not cfg.is_available:
            return Response({'detail': f'"{item.name}" está indisponível neste ponto de venda '
                                       f'(esgotado ou fora do menu de hoje).',
                             'unavailable': True}, status=status.HTTP_400_BAD_REQUEST)
        unit_price = request.data.get('unit_price')
        # O PREÇO É DO SERVIDOR. Só os artigos marcados como "Preço manual" (peixe ao
        # quilo, vinho a copo do dia) aceitam um preço vindo do terminal. Nos outros, um
        # preço enviado pelo cliente é IGNORADO — senão bastava forjar um pedido para
        # vender o whisky a 1 Kz, e a fatura saía assinada com esse valor.
        if not getattr(item, 'manual_price', False):
            unit_price = None
        # (Artigo) "Preço manual" — o terminal TEM de perguntar o preço; não se inventa um.
        elif unit_price in (None, ''):
            return Response({'detail': f'"{item.name}" é de preço manual — indique o preço.',
                             'requires_price': True}, status=status.HTTP_400_BAD_REQUEST)
        if unit_price in (None, ''):
            # Prioridade: override do POS Product Config → NÍVEL DE PREÇO do setor
            # (8592) → Tabela de Preço da área → preço base.
            #
            # O nível do setor faltava aqui e o resultado era o pior possível: a TECLA
            # mostrava o Preço 3 (o teclado respeita o 8592) e a CONTA cobrava o base —
            # o cliente via 999 no ecrã e pagava 400. O que se mostra e o que se cobra
            # têm de sair da mesma regra.
            if cfg and cfg.pos_price is not None:
                unit_price = cfg.pos_price
            else:
                nivel_setor = None
                try:
                    from .models import PosSector
                    _s = PosSector.objects.filter(outlet=ticket.outlet).first()
                    p8592 = ((_s.params or {}).get('8592')
                             or (_s.params or {}).get(8592)) if _s else None
                    if p8592:
                        import re as _re
                        _m = _re.search(r'(\d+)', str(p8592))
                        if _m:
                            nivel_setor = int(_m.group(1))
                    elif _s and _s.price_level and _s.price_level > 1:
                        nivel_setor = _s.price_level
                except Exception:
                    nivel_setor = None
                if nivel_setor and nivel_setor > 1:
                    from inventory.models import ItemPrice
                    _ip = ItemPrice.objects.filter(item=item, level=nivel_setor).first()
                    unit_price = _ip.price if _ip else ticket.outlet.price_for(item)
                else:
                    unit_price = ticket.outlet.price_for(item)
        unit_price = Decimal(str(unit_price))

        # (Utilizador POS) "Usa preço de custo" — a caixa da FICHA DO OPERADOR (backoffice)
        # decide: quem a tem lança ao CUSTO médio (staff, consumo interno), não ao preço
        # de venda. O terminal manda o operador; a regra vive na ficha dele.
        op_id = request.data.get('operator')
        if op_id:
            from .models import PosUser
            op = PosUser.objects.filter(pk=op_id).first()
            if op and op.use_cost_price:
                unit_price = Decimal(str(item.current_average_cost or 0))
            # (Utilizador POS) "Consumo interno" — sem a caixa, o operador não lança
            # numa conta de CONSUMO INTERNO. É custo da casa: não é para qualquer caixa.
            if (getattr(ticket, 'guest_type', '') == 'INTERNO'
                    and op and not op.internal_consumption):
                return Response({'detail': 'Não está autorizado a lançar consumo interno '
                                           '(caixa "Consumo interno" na ficha do utilizador).',
                                 'requires_supervisor': True}, status=status.HTTP_403_FORBIDDEN)

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
            ticket=ticket, item=item,
            # "Texto livre": o que sai na conta é o que o empregado escreveu.
            description=(descricao if (getattr(item, 'free_text', False) and descricao)
                         else item.name),
            quantity=qty,
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
    @transaction.atomic
    def pay(self, request, pk=None):
        """Pagamento: exige método AUTORIZADO no outlet; calcula troco (dinheiro); fecha se saldado.

        TRANCA O TICKET (select_for_update) e corre tudo numa só transação.

        Sem isto, dois pagamentos ao mesmo tempo — dois terminais, ou o empregado a
        carregar duas vezes porque o ecrã demorou — liam ambos "falta pagar 1000",
        e ambos cobravam 1000. O cliente pagava a dobrar e a caixa fechava com uma
        sobra que ninguém sabia explicar. O segundo pagamento espera aqui pelo
        primeiro e vê a conta já saldada.
        """
        # A tranca é sobre a LINHA do ticket na base de dados, não sobre o objeto.
        ticket = (POSTicket.objects.select_for_update()
                  .select_related('outlet', 'table', 'cash_session').get(pk=pk))
        if ticket.status != 'OPEN':
            return Response({'detail': 'Esta conta já não está aberta (pode ter sido paga noutro terminal).'},
                            status=status.HTTP_400_BAD_REQUEST)
        from mdm.models import PaymentMethod
        try:
            pm = PaymentMethod.objects.get(pk=request.data.get('payment_method'))
        except PaymentMethod.DoesNotExist:
            return Response({'detail': 'Método de pagamento inválido.'}, status=status.HTTP_400_BAD_REQUEST)

        # REGRA: só métodos autorizados neste outlet (consome a config do 07).
        if not OutletPaymentMethod.objects.filter(outlet=ticket.outlet, payment_method=pm, is_active=True).exists():
            return Response({'detail': f'Método "{pm.name}" não autorizado neste outlet.'}, status=status.HTTP_403_FORBIDDEN)

        # REGRA: "Conta Quarto" é para HÓSPEDES. O tipo de cliente perguntou-se ao abrir
        # (parâmetro 8175): um PASSANTE não tem quarto onde a conta caia, e o consumo
        # INTERNO é custo da casa — deixá-los "pagar" no quarto era criar dívida a um
        # quarto que não existe, e o Night Audit nunca mais batia.
        if pm.method_type == 'ROOM' and getattr(ticket, 'guest_type', 'PASSANTE') != 'HOTEL':
            tipo = {'PASSANTE': 'um passante', 'INTERNO': 'consumo interno'}.get(
                getattr(ticket, 'guest_type', ''), 'este tipo de cliente')
            return Response({'detail': f'"{pm.name}" só está disponível para hóspedes do hotel — '
                                       f'esta conta é de {tipo}.'}, status=status.HTTP_400_BAD_REQUEST)

        # A CONTA TEM DE ESTAR NUMA CAIXA ABERTA. Sem isto, uma venda entrava numa
        # sessão já fechada — o dinheiro existia mas não aparecia em fecho nenhum, e
        # a diferença só se descobria no cofre.
        if ticket.cash_session_id and ticket.cash_session.status != 'OPEN':
            return Response({'detail': 'A caixa desta conta já foi fechada. '
                                       'Abra uma nova sessão de caixa para cobrar.',
                             'cash_session_closed': True}, status=status.HTTP_400_BAD_REQUEST)

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

        # (Modo de Pagamento) "Permite parcial" — DESLIGADA, este meio só serve para
        # SALDAR a conta: um vale de refeição não paga metade de um jantar. Um valor
        # abaixo do que falta é recusado — a alternativa era o vale entrar como parcela
        # e o resto ficar pendurado num meio que o emissor não reembolsa parcialmente.
        try:
            _pedido = Decimal(str(request.data.get('amount') or ticket.balance_due))
        except Exception:
            _pedido = ticket.balance_due
        if not pm.allows_partial and _pedido < ticket.balance_due:
            return Response({'detail': f'"{pm.name}" não permite pagamento parcial: tem de '
                                       f'saldar a conta ({ticket.balance_due} Kz) de uma vez. '
                                       f'A caixa está na ficha do meio de pagamento.'},
                            status=status.HTTP_400_BAD_REQUEST)

        # (Modo de Pagamento) "Permite misto" — DESLIGADA, este meio não se combina com
        # outros na mesma conta. É a regra dos meios que liquidam por fora (voucher de
        # agência, cortesia): juntá-los a dinheiro parte a conta em duas contabilidades.
        if not pm.allows_mixed and ticket.payments.exists():
            return Response({'detail': f'"{pm.name}" não permite pagamento misto: esta conta '
                                       f'já tem outros pagamentos registados.'},
                            status=status.HTTP_400_BAD_REQUEST)

        # (Modo de Pagamento) "Perguntar nº de documento" — cheque e transferência sem
        # referência são dinheiro que ninguém consegue reconciliar no banco.
        if pm.ask_document_number and not (request.data.get('document_number') or '').strip():
            return Response({'detail': f'"{pm.name}" exige o nº do documento (cheque/transferência).',
                             'requires_document_number': True}, status=status.HTTP_400_BAD_REQUEST)

        # (Modo de Pagamento) "F&B" — há métodos que só servem para pagar FORNECEDORES
        # (transferência do economato). Deixá-los no ecrã da caixa é convidar o empregado
        # a cobrar um jantar por um meio que a tesouraria não reconhece.
        if pm.for_fnb and not pm.for_pos:
            return Response({'detail': f'"{pm.name}" é um meio de pagamento a fornecedores, '
                                       f'não de cobrança ao cliente.'},
                            status=status.HTTP_400_BAD_REQUEST)

        # (Modo de Pagamento) "Transferência bancária" — sem o banco e a referência, o
        # dinheiro entra na conta e ninguém sabe de que venda é. A reconciliação bancária
        # faz-se com estes dois campos ou não se faz.
        if pm.bank_transfer and not (request.data.get('bank_reference')
                                     or request.data.get('document_number')):
            return Response({'detail': f'"{pm.name}" é uma transferência: indique a referência bancária.',
                             'requires_bank_reference': True}, status=status.HTTP_400_BAD_REQUEST)

        # (Modo de Pagamento) "Interface externa" (TPA) — o terminal de cartões TEM de
        # devolver o código de autorização. Sem ele, não há prova de que o banco aceitou:
        # o cliente sai, o pagamento é recusado à noite, e a casa perde a refeição.
        if pm.external_interface and not (request.data.get('auth_code')
                                          or request.data.get('external_ref')):
            return Response({'detail': f'"{pm.name}" usa o TPA "{pm.external_device or "externo"}": '
                                       f'falta o código de autorização do terminal.',
                             'requires_auth_code': True,
                             'device': pm.external_device}, status=status.HTTP_400_BAD_REQUEST)

        # (Modo de Pagamento) "Conta corrente" — a conta fica em nome de uma ENTIDADE e
        # o dinheiro só entra depois. Sem entidade, é uma dívida de ninguém.
        entidade = None
        if pm.current_account:
            from mdm.models import Customer as _Cust
            cid = request.data.get('customer') or getattr(ticket, 'customer_id', None)
            entidade = _Cust.objects.filter(pk=cid).first() if cid else None
            if not entidade:
                return Response({'detail': f'"{pm.name}" lança em conta corrente: indique a entidade.',
                                 'requires_entity': True}, status=status.HTTP_400_BAD_REQUEST)
            # Entidade BLOQUEADA não leva mais fiado — foi para isso que se bloqueou.
            if entidade.is_blocked:
                return Response({'detail': f'"{entidade.name}" está bloqueada'
                                           f'{" — " + entidade.block_reason if entidade.block_reason else ""}. '
                                           f'Não se vende a crédito; cobre a conta.',
                                 'entity_blocked': True}, status=status.HTTP_400_BAD_REQUEST)
            # LIMITE DE CRÉDITO — deixar passar é como emprestar dinheiro sem o decidir.
            if entidade.credit_limit:
                from fiscal.models import FiscalDocument as _FD
                em_divida = sum((d.gross_total for d in _FD.objects.filter(
                    customer=entidade, settled=False).select_related('doc_type')
                    if not d.doc_type.is_rectifying), Decimal('0'))
                try:
                    pedido = Decimal(str(request.data.get('amount') or '0'))
                except Exception:
                    pedido = Decimal('0')
                if em_divida + pedido > entidade.credit_limit:
                    return Response({
                        'detail': f'"{entidade.name}" ultrapassa o limite de crédito '
                                  f'({entidade.credit_limit} Kz). Já deve {em_divida} Kz.',
                        'credit_limit_exceeded': True}, status=status.HTTP_400_BAD_REQUEST)

        # ── CARTÃO DE MEMBRO ─────────────────────────────────────────────────────
        # As três caixas do cartão decidem o que ele pode fazer. Um cartão que só dá
        # desconto não paga; um pré-pago (all-inclusive) paga com o saldo que tem; um de
        # sócio acumula dívida; um de fidelização paga com pontos.
        from .models import MemberCard, MemberCardMovement
        cartao = None
        cartao_dono = None
        modo_cartao = (request.data.get('card_mode') or '').upper()   # CREDIT | DEBIT | POINTS
        if modo_cartao:
            from mdm.models import Customer as _C
            cid = request.data.get('customer') or getattr(ticket, 'customer_id', None)
            cartao_dono = _C.objects.filter(pk=cid).select_related('member_card').first() if cid else None
            if not cartao_dono or not cartao_dono.member_card_id:
                return Response({'detail': 'Indique o titular do cartão de membro.',
                                 'requires_entity': True}, status=status.HTTP_400_BAD_REQUEST)
            cartao = cartao_dono.member_card
            if not cartao.is_active:
                return Response({'detail': f'O cartão "{cartao.name}" está inativo.'},
                                status=status.HTTP_400_BAD_REQUEST)
            capaz = {'CREDIT': cartao.has_credit, 'DEBIT': cartao.has_debit,
                     'POINTS': cartao.has_points}.get(modo_cartao)
            if not capaz:
                return Response({
                    'detail': f'O cartão "{cartao.name}" não permite pagar por '
                              f'{"crédito" if modo_cartao == "CREDIT" else "débito" if modo_cartao == "DEBIT" else "pontos"}.',
                    'card_not_capable': True}, status=status.HTTP_400_BAD_REQUEST)

        try:
            tendered = Decimal(str(request.data.get('amount')))
        except Exception:
            return Response({'detail': 'Valor inválido.'}, status=status.HTTP_400_BAD_REQUEST)

        ticket = POSTicket.objects.get(pk=ticket.pk)  # fresco: saldo/pagamentos atualizados
        due = ticket.balance_due

        # (Modo de Pagamento) "Permite multi-moeda" — o turista paga em euros. O valor
        # entregue vem NA MOEDA DO MÉTODO e converte-se pela taxa da tabela de moedas.
        # Sem isto, 100 € entravam como 100 Kz e a caixa fechava com um buraco.
        moeda = (request.data.get('currency') or '').strip().upper()
        taxa = Decimal('1')
        if moeda and moeda != 'AOA':
            if not pm.allows_multicurrency:
                return Response({'detail': f'"{pm.name}" só aceita kwanzas.',
                                 'no_multicurrency': True}, status=status.HTTP_400_BAD_REQUEST)
            from mdm.models import Currency as _Cur
            cur = _Cur.objects.filter(code=moeda, is_active=True).first()
            if not cur:
                return Response({'detail': f'Moeda "{moeda}" não existe ou está inativa.'},
                                status=status.HTTP_400_BAD_REQUEST)
            # (Moeda) "Excluída do balcão de câmbio" — há divisas que o hotel não aceita.
            if cur.excluded:
                return Response({'detail': f'A casa não aceita {cur.name} ao balcão.'},
                                status=status.HTTP_400_BAD_REQUEST)
            # A taxa de COMPRA é a que se usa a receber: o hotel COMPRA a divisa ao cliente.
            # (A de venda é mais alta — a diferença é a margem do câmbio.)
            taxa = Decimal(str(cur.buy_rate or cur.rate_to_base or 0))
            if taxa <= 0:
                return Response({'detail': f'Moeda "{moeda}" sem taxa de câmbio definida. '
                                           f'Defina a taxa de compra em Financeiro › Moedas.'},
                                status=status.HTTP_400_BAD_REQUEST)
            tendered = (tendered * taxa).quantize(Decimal('0.01'))

        # (Modo de Pagamento) "Permite pagamento misto" — dois meios na mesma conta
        # (metade em dinheiro, metade no cartão). Um método que NÃO o permite tem de ser
        # o único da conta: senão o fecho de caixa nunca bate com o talão.
        ja_pago = ticket.payments.exclude(payment_method=pm).exists()
        if ja_pago and not pm.allows_mixed:
            return Response({'detail': f'"{pm.name}" não pode ser misturado com outros meios '
                                       f'de pagamento nesta conta.',
                             'no_mixed': True}, status=status.HTTP_400_BAD_REQUEST)

        applied = min(tendered, due)

        # (Modo de Pagamento) "Permite pagamento parcial" — pagar uma parte e deixar o
        # resto para depois. Se a caixa está desligada, ou paga tudo, ou não paga nada:
        # é o que evita a conta que fica meia paga e ninguém sabe quanto falta.
        if not pm.allows_partial and applied < due:
            return Response({'detail': f'"{pm.name}" não aceita pagamentos parciais. '
                                       f'Faltam {due} Kz.',
                             'no_partial': True, 'due': str(due)},
                            status=status.HTTP_400_BAD_REQUEST)
        # (Modo de Pagamento) "Dá troco" — o dinheiro dá; o multibanco e a transferência
        # não. Sem esta caixa, o caixa "devolvia" troco de um pagamento por cartão e a
        # gaveta ficava sempre em falta ao fecho.
        # (Modo de Pagamento) "Pagamento direto" — o valor entra exato, sem troco e sem
        # gaveta (transferência, MB Way, voucher). É o oposto do dinheiro.
        gives_change = getattr(pm, 'allows_change', pm.method_type == 'CASH')
        if pm.direct_payment:
            gives_change = False
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

        # (Cartão) "Crédito" — o pré-pago paga com o que tem. Deixar passar sem saldo é
        # oferecer o jantar: o cartão fica negativo e ninguém o vai cobrar.
        if modo_cartao == 'CREDIT':
            saldo = MemberCardMovement.credit_of(cartao_dono)
            if saldo < applied:
                return Response({'detail': f'O cartão de {cartao_dono.name} tem {saldo} Kz — '
                                           f'não chega para {applied} Kz.',
                                 'card_balance': str(saldo)}, status=status.HTTP_400_BAD_REQUEST)

        # (Cartão) "Débito" — o sócio leva fiado, mas até um teto. Sem teto, um cartão de
        # débito é crédito ilimitado a quem nunca mais aparece.
        if modo_cartao == 'DEBIT' and cartao.credit_limit:
            divida = MemberCardMovement.debt_of(cartao_dono)
            if divida + applied > cartao.credit_limit:
                return Response({'detail': f'{cartao_dono.name} já deve {divida} Kz e o cartão '
                                           f'"{cartao.name}" só permite {cartao.credit_limit} Kz.',
                                 'card_limit_exceeded': True}, status=status.HTTP_400_BAD_REQUEST)

        # (Cartão) "Pontos" — os pontos valem dinheiro (1 ponto = X Kz, definido no cartão).
        if modo_cartao == 'POINTS':
            valor_ponto = cartao.point_value or Decimal('1')
            pontos = MemberCardMovement.points_of(cartao_dono)
            precisa = (applied / valor_ponto) if valor_ponto else Decimal('0')
            if pontos < precisa:
                return Response({'detail': f'{cartao_dono.name} tem {pontos} pontos '
                                           f'({pontos * valor_ponto} Kz) — precisa de {precisa:.2f}.',
                                 'card_points': str(pontos)}, status=status.HTTP_400_BAD_REQUEST)

        # (Modo de Pagamento) "Lançar em Quarto" — pagar em CONTA QUARTO é lançar o
        # consumo no FOLIO do hóspede. Antes, o pay validava o quarto mas não lançava
        # nada: o POS fechava a conta e o hotel perdia o dinheiro no check-out.
        # O encargo entra ANTES do pagamento se gravar — sem folio aberto, não se cobra.
        if pm.charge_to_room or pm.method_type == 'ROOM':
            try:
                from pms.models import Room, Folio, FolioCharge
            except Exception:
                return Response({'detail': 'Módulo PMS não está ativo nesta licença.'}, status=409)
            room_number = (request.data.get('room') or '').strip()
            room = Room.objects.filter(number=room_number).first()
            folio = (Folio.objects.filter(reservation__room=room, status='OPEN').first()
                     if room else None)
            if not folio:
                return Response({'detail': f'Sem folio aberto para o quarto "{room_number}" — '
                                           f'não se lança consumo num quarto sem conta.',
                                 'requires_room': True}, status=status.HTTP_400_BAD_REQUEST)
            FolioCharge.objects.create(
                folio=folio, charge_type='FNB',
                description=f'POS {ticket.ticket_number} ({ticket.outlet.name})',
                amount=applied, source_reference=ticket.ticket_number,
                posted_by=ticket.operator_name)

        # GUARDAR O COMPROVATIVO. Estes dados foram exigidos ao empregado com o cliente
        # à frente (a ficha do meio de pagamento é que manda); guardá-los é o mínimo.
        # São eles que, no fim do mês, ligam a entrada no banco a esta venda.
        POSTicketPayment.objects.create(
            ticket=ticket, payment_method=pm, amount=applied, change_due=change,
            bank_reference=(request.data.get('bank_reference') or None),
            auth_code=(request.data.get('auth_code') or request.data.get('external_ref') or None),
            document_number=(request.data.get('document_number') or None),
            room_ref=(request.data.get('room') or None))

        # O movimento do cartão fica escrito. O saldo é sempre a soma do livro.
        if modo_cartao:
            quem = request.user.username if request.user.is_authenticated else 'POS'
            if modo_cartao == 'CREDIT':
                MemberCardMovement.objects.create(
                    customer=cartao_dono, card=cartao, kind='SPEND', amount=applied,
                    ticket=ticket, created_by=quem, reason=f'Consumo {ticket.ticket_number}')
            elif modo_cartao == 'DEBIT':
                MemberCardMovement.objects.create(
                    customer=cartao_dono, card=cartao, kind='DEBIT', amount=applied,
                    ticket=ticket, created_by=quem, reason=f'Conta {ticket.ticket_number}')
            elif modo_cartao == 'POINTS':
                valor_ponto = cartao.point_value or Decimal('1')
                MemberCardMovement.objects.create(
                    customer=cartao_dono, card=cartao, kind='REDEEM',
                    points=(applied / valor_ponto), amount=applied,
                    ticket=ticket, created_by=quem, reason=f'Pontos usados em {ticket.ticket_number}')

        # (Modo de Pagamento) "Conta corrente" — a conta fica em nome da entidade e o
        # documento nasce POR RECEBER (fatura, não fatura-recibo). É o crédito a sério.
        if pm.current_account and entidade:
            ticket.customer_name = entidade.name
            ticket.customer_tax_id = entidade.tax_id
            ticket.save(update_fields=['customer_name', 'customer_tax_id'])

        # (Modo de Pagamento) "Permite levantamento" (sangria no ato) — acima de um valor,
        # o dinheiro não fica na gaveta: avisa-se quem tem de o vir buscar. Uma gaveta com
        # 2 milhões ao balcão é um convite.
        pickup = None
        if pm.allow_pickup and pm.pickup_alert_amount:
            from django.db.models import Sum as _S
            # Conta o que está acumulado NESTA caixa; se a conta não tem sessão (venda
            # avulsa), conta o que se cobrou hoje neste ponto de venda por este meio.
            base = POSTicketPayment.objects.filter(payment_method=pm)
            if ticket.cash_session_id:
                base = base.filter(ticket__cash_session=ticket.cash_session)
            else:
                base = base.filter(ticket__outlet=ticket.outlet,
                                   ticket__opened_at__date=timezone.localdate())
            em_caixa = base.aggregate(t=_S('amount'))['t'] or Decimal('0')
            if em_caixa >= pm.pickup_alert_amount:
                pickup = (f'A caixa já tem {em_caixa} Kz em {pm.name} — acima do limite de '
                          f'{pm.pickup_alert_amount}. Faça uma sangria.')
                # (8222) o talão da sangria sai em N VIAS: uma vai com o dinheiro,
                # outra fica na gaveta — é assim que as duas pontas se conferem.
                from .models import PrintJob
                PrintJob.objects.create(
                    job_type='RECEIPT', outlet=ticket.outlet,
                    title=f'CASH PICKUP · {pm.name}',
                    content=(f'CASH PICKUP (sangria)\n{pm.name}\n'
                             f'Em caixa: {em_caixa} Kz\nLimite: {pm.pickup_alert_amount} Kz\n'
                             f'Operador: {ticket.operator_name}\n'),
                    reference=ticket.ticket_number, copies=max(1, P.int(8222, 2)))

        ticket = POSTicket.objects.get(pk=ticket.pk)  # recarrega com o novo pagamento

        # (Modo de Pagamento) "Só fecha com saldo zero" — não deixa a conta fechar com um
        # cêntimo por pagar. Sem isto, ficavam contas "quase pagas" que nunca mais fechavam.
        if pm.close_only_zero_balance and ticket.balance_due > 0:
            return Response({'detail': f'"{pm.name}" só fecha a conta com saldo zero. '
                                       f'Faltam {ticket.balance_due} Kz.',
                             'balance_due': str(ticket.balance_due),
                             'requires_zero_balance': True},
                            status=status.HTTP_400_BAD_REQUEST)

        if ticket.balance_due <= 0:
            ticket.status = 'PAID'
            ticket.closed_at = timezone.now()
            if ticket.table:
                ticket.table.status = 'FREE'
                ticket.table.save(update_fields=['status'])
            ticket.save(update_fields=['status', 'closed_at'])
            # (Cartão) "Pontos" — ganham-se a CADA venda ao titular, não só quando ele
            # paga com o cartão. É a fidelização: consome, acumula, volta.
            try:
                from mdm.models import Customer as _C3
                titular = cartao_dono
                if not titular:
                    # O titular pode vir do pedido (o empregado encostou o cartão ao leitor)
                    # ou da conta (o cliente já estava associado à mesa).
                    cid3 = request.data.get('customer') or getattr(ticket, 'customer_id', None)
                    if cid3:
                        titular = _C3.objects.filter(pk=cid3).select_related('member_card').first()
                    elif ticket.customer_name:
                        titular = _C3.objects.filter(name=ticket.customer_name).select_related('member_card').first()
                if (titular and titular.member_card_id and titular.member_card.has_points
                        and titular.member_card.is_active and modo_cartao != 'POINTS'):
                    c = titular.member_card
                    ganhos = (ticket.grand_total / Decimal('100')) * (c.points_per_100 or Decimal('0'))
                    if ganhos > 0:
                        MemberCardMovement.objects.create(
                            customer=titular, card=c, kind='EARN', points=ganhos,
                            amount=ticket.grand_total, ticket=ticket,
                            reason=f'Pontos de {ticket.ticket_number}')
            except Exception:
                pass   # a fidelização NUNCA pode partir uma venda

            _safe_consume(ticket, request)   # saída de stock (ficha técnica/artigo)
            # Conta corrente: o documento é uma FATURA (por receber), não uma fatura-recibo.
            _safe_fiscalize(ticket, request, credito=bool(pm.current_account),
                            customer=entidade)
            # O TALÃO SAI AO COBRAR — todas as VIAS da série (Original p/ o cliente,
            # as outras p/ arquivo e contabilidade) entram na fila; o print_agent
            # despacha-as para a térmica. Antes só saía pelo botão manual.
            try:
                from fiscal.integration import existing_for
                doc = existing_for('pos', ticket.id)
                if doc:
                    _print_document(ticket, doc)
            except Exception:
                pass   # a impressora nunca trava a cobrança (fila + reimprimir tratam)

        log_event(request, 'PAYMENT', f'Pagamento {pm.name}: {applied} (troco {change})',
                  operator_name=ticket.operator_name, outlet=ticket.outlet,
                  reference=ticket.ticket_number, new_value=pm.name, amount=applied)
        ticket = self.get_queryset().get(pk=ticket.pk)
        data = self.get_serializer(ticket).data
        data['change_returned'] = str(change)
        data['tip'] = str(tip)
        # O terminal obedece a estas: abre (ou não) a gaveta, imprime (ou não) o documento.
        # "Pagamento direto" não abre gaveta: não entra dinheiro físico nenhum.
        data['open_drawer'] = bool(pm.opens_drawer) and not pm.direct_payment
        data['print_document'] = bool(pm.prints_document)
        data['document_type'] = pm.document_type          # Fatura ou Talão
        if cartao_dono:
            data['card'] = {
                'name': cartao.name,
                'credit': str(MemberCardMovement.credit_of(cartao_dono)),
                'debt': str(MemberCardMovement.debt_of(cartao_dono)),
                'points': str(MemberCardMovement.points_of(cartao_dono)),
            }
        data['currency'] = moeda or 'AOA'
        data['exchange_rate'] = str(taxa)
        # (Moeda) "Imprimir contravalor no talão" — o cliente que paga em dólares quer ver
        # no papel quanto é que aquilo deu em kwanzas, e a que câmbio.
        if moeda and moeda != 'AOA':
            from mdm.models import Currency as _C2
            c2 = _C2.objects.filter(code=moeda).first()
            if c2 and c2.print_on_pos_docs:
                data['print_counter_value'] = (f'{request.data.get("amount")} {moeda} '
                                               f'@ {taxa} = {applied} AOA')
        if pickup:
            data['pickup_alert'] = pickup
        # (Modo de Pagamento) "Cross-selling" — é o momento em que o cliente ainda está à
        # frente do caixa e com a carteira na mão. Sugerir aqui é a venda mais barata que
        # existe; sugerir depois é perseguir o cliente à porta.
        if pm.cross_selling:
            from inventory.models import Item as _It
            vendidos = set(ticket.lines.values_list('item_id', flat=True))
            sug = (_It.objects.filter(is_active=True, cross_sell=True)
                   .exclude(id__in=vendidos)[:4]
                   if hasattr(_It, 'cross_sell') else
                   _It.objects.filter(is_active=True).exclude(id__in=vendidos)
                   .order_by('-sale_price')[:4])
            data['cross_sell'] = [{'id': i.id, 'name': i.name, 'price': str(i.sale_price or 0)}
                                  for i in sug]
        return Response(data)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def split(self, request, pk=None):
        """FUNÇÕES PARCIAIS — dividir a conta.

        Quatro amigos jantam e um deles paga só o que comeu. Sem isto, o empregado faz
        contas de cabeça no guardanapo, cobra a mais a um e a menos a outro, e o fecho de
        caixa nunca bate.

        Move-se a QUANTIDADE, não a linha: metade de uma garrafa de vinho vai para uma
        conta e metade para a outra. A linha de origem fica com o que sobrou; se ficar a
        zero, desaparece.

        `lines`: [{'line': <id>, 'quantity': <qtd a mover>}]
        `to`:    id da conta de destino (opcional — sem ela, cria-se uma nova na mesma mesa)
        """
        origem = POSTicket.objects.select_for_update().get(pk=pk)
        if origem.status != 'OPEN':
            return Response({'detail': 'Só se divide uma conta aberta.'},
                            status=status.HTTP_400_BAD_REQUEST)

        pedidas = request.data.get('lines') or []
        if not pedidas:
            return Response({'detail': 'Escolha o que passa para a outra conta.'},
                            status=status.HTTP_400_BAD_REQUEST)

        destino = None
        if request.data.get('to'):
            destino = POSTicket.objects.select_for_update().filter(
                pk=request.data['to'], status='OPEN').first()
            if not destino:
                return Response({'detail': 'Conta de destino inválida.'},
                                status=status.HTTP_400_BAD_REQUEST)
        if not destino:
            # A subconta nasce na MESMA mesa: continua a ser a mesma mesa a ser servida.
            import uuid
            destino = POSTicket.objects.create(
                ticket_number=f"TCK-{uuid.uuid4().hex[:8].upper()}",
                outlet=origem.outlet, table=origem.table,
                cash_session=origem.cash_session,
                operator_name=origem.operator_name,
                guests=max(1, request.data.get('guests') or 1),
                guest_type=origem.guest_type,
                dest_kind=origem.dest_kind, dest_ref=origem.dest_ref,
                dest_label=origem.dest_label,
            )

        movidas = 0
        for p in pedidas:
            linha = origem.lines.filter(pk=p.get('line'), is_void=False).first()
            if not linha:
                continue
            try:
                qtd = Decimal(str(p.get('quantity') or linha.quantity))
            except Exception:
                qtd = linha.quantity
            qtd = min(qtd, linha.quantity)
            if qtd <= 0:
                continue

            # A linha nova nasce na conta de destino com o MESMO preço e o mesmo estado de
            # produção: um prato que já está na cozinha não volta a ser pedido só porque
            # mudou de conta.
            POSTicketLine.objects.create(
                ticket=destino, item=linha.item, description=linha.description,
                quantity=qtd, unit_price=linha.unit_price,
                tax_percentage=linha.tax_percentage, note=linha.note,
                kds_station=linha.kds_station, kds_status=linha.kds_status,
                fired_at=linha.fired_at,
            )
            resto = linha.quantity - qtd
            if resto > 0:
                linha.quantity = resto
                # save() COMPLETO: o line_total recalcula-se no save do modelo — com
                # update_fields=['quantity'] ficava o total antigo numa linha mais pequena,
                # e a conta de origem não descia depois de separar.
                linha.save()
            else:
                linha.delete()
            movidas += 1

        POSTicket.objects.get(pk=origem.pk).recompute(save=True)
        POSTicket.objects.get(pk=destino.pk).recompute(save=True)

        # A mesa continua ocupada — agora com duas contas.
        log_event(request, 'TICKET_OPEN',
                  f'Conta dividida: {movidas} artigo(s) para {destino.ticket_number}',
                  operator_name=origem.operator_name, outlet=origem.outlet,
                  reference=origem.ticket_number, new_value=destino.ticket_number)

        origem = self.get_queryset().get(pk=origem.pk)
        destino = self.get_queryset().get(pk=destino.pk)
        return Response({
            'moved': movidas,
            'source': self.get_serializer(origem).data,
            'target': self.get_serializer(destino).data,
        })

    @action(detail=True, methods=['get'])
    def siblings(self, request, pk=None):
        """As OUTRAS contas abertas da mesma mesa (as subcontas que já se dividiram)."""
        t = self.get_object()
        if not t.table_id:
            return Response([])
        outras = (self.get_queryset().filter(table=t.table, status='OPEN')
                  .exclude(pk=t.pk))
        return Response(self.get_serializer(outras, many=True).data)

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
        # A MESA LIBERTA-SE — se não houver OUTRA conta aberta nela (subcontas!). Sem
        # isto, a mesa anulada ficava OCUPADA no mapa até alguém reparar.
        self._liberta_mesa(ticket)
        log_event(request, 'TICKET_VOID',
                  f'Ticket anulado ({ticket.ticket_number}) · {len(cancelled)} item(s) anulados na produção · Motivo: {reason}',
                  operator_name=ticket.operator_name, outlet=ticket.outlet,
                  reference=ticket.ticket_number, old_value=old, new_value='VOID', amount=ticket.grand_total)
        return Response(self.get_serializer(ticket).data)

    @staticmethod
    def _liberta_mesa(ticket):
        """Mesa sem mais contas abertas: volta ao estado que o SETOR mandar.

        (8596 "Estado da mesa após fechar") — há casas onde a mesa fica em LIMPEZA
        até alguém a arrumar, e só depois é que pode ser vendida outra vez. É a
        ficha do setor a decidir, não o código.
        """
        if not (ticket.table_id and not ticket.table.tickets.filter(
                status__in=['OPEN', 'SUSPENDED']).exists()):
            return
        estado = 'FREE'
        try:
            from .models import PosSector
            sec = PosSector.objects.filter(outlet=ticket.outlet).first()
            p = (sec.params or {}) if sec else {}
            escolhido = p.get('8596') or p.get(8596)
            estado = {'Disponível': 'FREE', 'Limpeza': 'DIRTY',
                      'Reservada': 'RESERVED'}.get(escolhido, 'FREE')
        except Exception:
            pass
        ticket.table.status = estado
        ticket.table.save(update_fields=['status'])

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
        self._liberta_mesa(ticket)
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
    @transaction.atomic
    def transfer_table(self, request, pk=None):
        """Transfere a conta para outra mesa (liberta a origem, ocupa o destino).

        A conta é a mesma: mesmo número, mesmos artigos, mesma comanda já na cozinha.
        Só muda o sítio onde o cliente está sentado.

        Três coisas que faltavam aqui:
          · TRANCA a conta — duas transferências ao mesmo tempo deixavam a mesa antiga
            ocupada e a nova livre (ou as duas ocupadas);
          · RECUSA uma mesa que já tem conta aberta — senão ficavam duas contas na
            mesma mesa e o empregado cobrava a errada;
          · ATUALIZA O DESTINO — sem isso, a comanda da cozinha e a fatura continuavam
            a dizer "Mesa 4" depois de o cliente se mudar para a 9.
        """
        ticket = POSTicket.objects.select_for_update().select_related('table', 'outlet').get(pk=pk)
        if ticket.status not in ('OPEN', 'SUSPENDED'):
            return Response({'detail': 'Só contas abertas ou suspensas podem mudar de mesa.'}, status=400)
        try:
            dest = POSTable.objects.select_for_update().get(
                pk=request.data.get('table'), outlet=ticket.outlet)
        except POSTable.DoesNotExist:
            return Response({'detail': 'Mesa de destino inválida.'}, status=404)

        ocupada = (POSTicket.objects.filter(table=dest, status__in=['OPEN', 'SUSPENDED'])
                   .exclude(pk=ticket.pk).exists())
        if ocupada:
            return Response({'detail': f'A mesa {dest.table_number} já tem uma conta aberta. '
                                       f'Junte as contas (merge) em vez de transferir.',
                             'table_busy': True}, status=409)

        old_table = ticket.table
        if old_table and old_table.pk != dest.pk and not old_table.tickets.filter(
                status__in=['OPEN', 'SUSPENDED']).exclude(pk=ticket.pk).exists():
            old_table.status = 'FREE'
            old_table.save(update_fields=['status'])

        ticket.table = dest
        # O DESTINO é o que sai na comanda e na fatura — tem de mudar com a mesa.
        ticket.dest_kind = 'TABLE'
        ticket.dest_ref = str(dest.id)
        ticket.dest_label = f'Mesa {dest.table_number}'
        ticket.save(update_fields=['table', 'dest_kind', 'dest_ref', 'dest_label'])

        dest.status = 'OCCUPIED'
        dest.save(update_fields=['status'])

        log_event(request, 'TABLE_CHANGE',
                  f'Conta transferida da mesa {old_table.table_number if old_table else "—"} '
                  f'para a {dest.table_number}',
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

    # NOTA: havia aqui um SEGUNDO `split` (por line_ids, linha inteira) que, por vir
    # depois no corpo da classe, ESCONDIA o split verdadeiro das Funções Parciais
    # (por quantidades, com destino opcional — definido mais acima). Removido: era
    # um duplicado a fazer o motor dizer uma coisa e o terminal receber outra.

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
    @transaction.atomic
    def refund(self, request, pk=None):
        """(Modo de pagamento) "Permite estorno" verificada cá dentro."""
        """Estorno: emite a NOTA DE CRÉDITO no motor fiscal — assinada e encadeada.

        Antes, isto numerava a NC numa série PARALELA (mdm.DocumentSeries): saía um
        documento com número, mas sem assinatura, sem encadeamento de hash e fora do
        SAF-T. Ou seja: um documento que a AGT não reconhece. Agora passa pelo mesmo
        ponto único de emissão das faturas.

        TRANCA o ticket e corre numa transação: se alguma coisa falhar a meio, NADA
        fica gravado. Antes, um erro depois de emitir a NC deixava-a criada e o ticket
        já estornado — o caixa via um erro, carregava outra vez, e saía uma SEGUNDA
        nota de crédito da mesma venda.
        """
        from fiscal.services import create_credit_note
        from fiscal.integration import existing_for
        ticket = POSTicket.objects.select_for_update().get(pk=pk)
        # (Modo de pagamento) "Permite estorno" — um voucher não se devolve em dinheiro.
        # Se ALGUM pagamento da conta foi feito num método que não permite estorno,
        # a devolução é recusada e resolve-se ao balcão (troca, crédito em conta).
        bloqueados = [p.payment_method.name for p in ticket.payments.select_related('payment_method')
                      if p.payment_method and not getattr(p.payment_method, 'allows_refund', True)]
        if bloqueados:
            return Response({'detail': f'Não se estorna: {", ".join(set(bloqueados))} não '
                                       f'permite devolução (caixa "Permite estorno").',
                             'no_refund': True}, status=400)

        # (8174) TALÃO DE QUARTO: só se anula enquanto a conta PMS (folio) estiver
        # ABERTA. Depois do check-out, o hóspede já pagou o folio — devolver aqui era
        # devolver dinheiro que o hotel já recebeu e conferiu.
        if P.bool(8174, True):
            de_quarto = [p for p in ticket.payments.select_related('payment_method')
                         if p.payment_method and p.payment_method.method_type == 'ROOM']
            if de_quarto:
                try:
                    from pms.models import Folio
                    folio_aberto = Folio.objects.filter(
                        charges__description__icontains=ticket.ticket_number,
                        status='OPEN').exists()
                    if not folio_aberto:
                        return Response({'detail': 'Este talão foi lançado no quarto e a conta '
                                                   'PMS já está fechada — não se anula '
                                                   '(parâmetro 8174). Resolva no PMS.'}, status=400)
                except Exception:
                    pass

        if ticket.status != 'PAID':
            return Response({'detail': 'Só contas pagas podem ser estornadas '
                                       '(esta pode já ter sido estornada noutro terminal).'}, status=400)

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
                         'grand_total': str(nc.gross_total), 'ticket_status': 'REFUNDED'},
                        status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def charge_to_room(self, request, pk=None):
        """Cobra o saldo do ticket num folio PMS aberto (integração Motor 8 com o PMS)."""
        ticket = self.get_object()
        if ticket.status != 'OPEN':
            return Response({'detail': 'Ticket não está aberto.'}, status=400)
        # (8035) Interface com PMS desligada: NADA se lança no quarto — nem por engano.
        if not P.bool(8035, True):
            return Response({'detail': 'A interface com o PMS está desligada nos parâmetros (8035).'},
                            status=403)
        try:
            from pms.models import Room, Folio, FolioCharge
        except Exception:
            return Response({'detail': 'Módulo PMS não está ativo nesta licença.'}, status=409)

        # (Interface PMS) "Fidedigno" — só se lança no folio de um hotel LIGADO E
        # MARCADO como fidedigno. Um link de testes desmarcado não pode pôr consumos
        # nas contas dos hóspedes a sério.
        from .models import PmsHotelLink
        links = PmsHotelLink.objects.filter(is_active=True) if hasattr(PmsHotelLink, 'is_active') \
            else PmsHotelLink.objects.all()
        if links.exists() and not links.filter(trusted=True).exists():
            return Response({'detail': 'A ligação ao PMS não está marcada como fidedigna '
                                       '(Interface PMS › caixa "Fidedigno"). Não se lança '
                                       'no folio por uma ligação de testes.'}, status=409)
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
    @transaction.atomic
    def issue_document(self, request, pk=None):
        """Emite um documento pelo MOTOR FISCAL — o único que numera nesta casa.

        Antes, isto numerava numa série PARALELA (mdm.DocumentSeries) e criava um
        POSDocument: um papel com número, mas SEM assinatura, SEM encadeamento de
        hash e FORA do SAF-T. Ou seja, um documento que a AGT não reconhece — e um
        segundo motor de faturação a correr ao lado do verdadeiro.

        Agora há um só caminho: fiscal.services.issue_document. O mesmo que assina,
        encadeia e exporta.
        """
        from fiscal.services import issue_document as fiscal_issue
        from fiscal.models import FiscalDocType, FiscalSeries
        from fiscal.integration import existing_for

        ticket = POSTicket.objects.select_for_update().get(pk=pk)
        if not ticket.lines.filter(is_void=False).exists():
            return Response({'detail': 'Conta sem artigos — não há o que faturar.'},
                            status=status.HTTP_400_BAD_REQUEST)

        # Já foi faturada? Devolve-se a MESMA fatura (idempotente): carregar duas
        # vezes no botão não pode dar dois documentos fiscais da mesma venda.
        ja = existing_for('pos', ticket.id)
        if ja:
            return Response({'invoice_no': ja.invoice_no, 'hash': ja.doc_hash,
                             'grand_total': str(ja.gross_total), 'reissued': True,
                             'detail': 'Esta conta já tinha fatura — é esta.'},
                            status=status.HTTP_200_OK)

        codigo = request.data.get('doc_type') or 'FR'      # FR = Fatura-Recibo
        # UMA FATURA-RECIBO DIZ QUE O DINHEIRO ENTROU. Emiti-la numa conta que ainda
        # não foi cobrada é declarar à AGT um recebimento que não existe — e a conta
        # fica paga no papel e aberta na caixa. Quem quer faturar para receber depois
        # (empresas, contas correntes) emite FATURA (FT), não fatura-recibo.
        if codigo == 'FR' and ticket.status != 'PAID':
            return Response({'detail': 'Esta conta ainda não foi cobrada. Cobre-a primeiro, ou emita '
                                       'uma Fatura (FT) se o cliente vai pagar mais tarde.',
                             'requires_payment': True}, status=status.HTTP_400_BAD_REQUEST)
        tipo = FiscalDocType.objects.filter(code=codigo, is_active=True).first()
        if not tipo:
            return Response({'detail': f'Tipo de documento "{codigo}" não está configurado no Centro Fiscal.'},
                            status=status.HTTP_400_BAD_REQUEST)
        # SÉRIE ESCOLHIDA À MÃO (botão "escolher série" do painel de pagamentos): a
        # exceção. Por norma a série vem do tipo de documento — mas quem tem duas séries
        # do mesmo tipo (uma por estabelecimento, por exemplo) precisa de dizer qual, sem
        # ir ao backoffice trocar a configuração da sala toda. Ignorar o pedido em
        # silêncio, como estava, era o pior dos dois mundos: o ecrã deixava escolher e o
        # documento saía na outra série na mesma.
        serie = None
        pedida = request.data.get('series')
        if pedida:
            serie = FiscalSeries.objects.filter(pk=pedida, is_active=True, is_closed=False).first()
            if not serie:
                return Response({'detail': 'A série escolhida não existe, está fechada ou inativa.'},
                                status=status.HTTP_400_BAD_REQUEST)
            if serie.doc_type_id != tipo.id:
                return Response({'detail': f'A série escolhida não é de "{codigo}". '
                                           f'Uma série numera um só tipo de documento.'},
                                status=status.HTTP_400_BAD_REQUEST)
        # A SÉRIE DA FICHA DO SETOR (parâmetros 8553-8589). É para isto que aquelas
        # nove linhas existem: o Restaurante emite FR na série A, a Esplanada na série B.
        # Estavam a ser gravadas e IGNORADAS — a emissão apanhava a primeira série ativa
        # do tipo, e a ficha do setor era decorativa. Com uma só série por tipo o
        # resultado coincidia por sorte; com duas, saía na errada.
        if not serie:
            MAPA_8553 = {'FR': '8557', 'NC': '8556', 'CM': '8555', 'FS': '8553',
                         'VD': '8553', 'RC': '8558', 'FT': '8562',
                         'GR': '8588', 'GT': '8588'}
            num = MAPA_8553.get(codigo)
            if num:
                try:
                    from .models import PosSector
                    setor = PosSector.objects.filter(outlet=ticket.outlet).first()
                    escolhida = ((setor.params or {}).get(num)
                                 or (setor.params or {}).get(int(num))) if setor else None
                    if escolhida:
                        serie = FiscalSeries.objects.filter(
                            pk=escolhida, doc_type=tipo,
                            is_active=True, is_closed=False).first()
                except Exception:
                    serie = None
        if not serie:
            serie = (FiscalSeries.objects.filter(doc_type=tipo, is_active=True, is_closed=False)
                     .order_by('-year').first())
        if not serie:
            return Response({'detail': f'Sem série ativa para "{codigo}". '
                                       f'Crie-a em Configuração POS → Financeiro → Documentos.'},
                            status=status.HTTP_400_BAD_REQUEST)

        # O desconto do ticket reduz proporcionalmente as linhas (como na fatura automática).
        fator = Decimal('1')
        if ticket.discount_total and ticket.grand_total:
            bruto = ticket.grand_total + ticket.discount_total
            if bruto > 0:
                fator = ticket.grand_total / bruto
        linhas = [{
            'description': l.description,
            'quantity': l.quantity,
            'unit_price': Decimal(str(l.unit_price)) * fator,
            'tax_percentage': l.tax_percentage,
        } for l in ticket.lines.filter(is_void=False).select_related('item')]

        # A ENTIDADE — quem leva a fatura. Vem do pedido ou da conta. Sem a LIGAÇÃO ao
        # cadastro (e não só o nome escrito à mão), a fatura de uma empresa nunca
        # aparecia na conta corrente dela.
        from mdm.models import Customer
        cliente = None
        cid = request.data.get('customer') or getattr(ticket, 'customer_id', None)
        if cid:
            cliente = Customer.objects.filter(pk=cid).first()
        nome = request.data.get('customer_name') or (cliente.name if cliente else None) \
            or ticket.customer_name
        nif = request.data.get('customer_tax_id') or (cliente.tax_id if cliente else None) \
            or ticket.customer_tax_id
        # BLOQUEIO da entidade: quem não pagou da última vez não volta a levar fiado.
        if cliente and cliente.is_blocked and codigo == 'FT':
            return Response({'detail': f'"{cliente.name}" está bloqueada'
                                       f'{" — " + cliente.block_reason if cliente.block_reason else ""}. '
                                       f'Não se emite fatura a crédito; cobre a conta.',
                             'entity_blocked': True}, status=status.HTTP_400_BAD_REQUEST)

        try:
            doc = fiscal_issue(
                serie.id,
                customer=cliente,
                customer_name=nome,
                customer_tax_id=nif,
                lines=linhas,
                user=(request.user.username if request.user.is_authenticated else None),
                ip=request.META.get('REMOTE_ADDR'),
                source_module='pos', source_ref=str(ticket.id),
                operator_name=ticket.operator_name,
                place_ref=getattr(ticket, 'dest_label', None),
            )
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        _print_document(ticket, doc)
        log_event(request, 'DOC_ISSUE', f'{tipo.code}: {doc.invoice_no}',
                  operator_name=ticket.operator_name, outlet=ticket.outlet,
                  reference=doc.invoice_no, new_value=tipo.code, amount=doc.gross_total)
        return Response({'invoice_no': doc.invoice_no, 'hash': doc.doc_hash,
                         'grand_total': str(doc.gross_total), 'doc_type': tipo.code},
                        status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def consult(self, request, pk=None):
        """CONSULTA DE MESA — o talão de conferência, SEM fechar a conta.

        Não é o ecrã da venda nem é a fatura: emite o documento CM da AGT (Rules
        Engine — WorkingDocument, assinado, numerado, vai no SAF-T), põe o talão na
        fila de impressão e devolve o MESMO texto ao terminal para mostrar no ecrã.
        Um único renderizador (_print_document): o que o cliente vê no ecrã é
        exatamente o papel que sai da térmica.
        """
        from fiscal.integration import emit_table_consult
        ticket = self.get_object()
        if not ticket.lines.filter(is_void=False).exists():
            return Response({'detail': 'A conta ainda não tem consumo para consultar.'}, status=400)
        # UM 500 NÃO DIZ NADA A QUEM ESTÁ AO BALCÃO. A emissão passa por assinatura,
        # numeração de série e renderização do talão — se alguma falhar, o empregado
        # merece saber ONDE, e quem assiste à distância merece o rasto no log. Sem isto,
        # o ecrã dizia "erro 500" e não havia por onde pegar.
        try:
            doc = emit_table_consult(ticket,
                                     user=request.user.username if request.user.is_authenticated else None,
                                     ip=request.META.get('REMOTE_ADDR'))
        except Exception as e:
            import logging, traceback
            logging.getLogger('pos').error('CONSULTA falhou no ticket %s: %s\n%s',
                                           ticket.ticket_number, e, traceback.format_exc())
            return Response({'detail': f'Não foi possível emitir a Consulta de Mesa: {e}'}, status=400)
        if not doc:
            return Response({'detail': 'Não há série de Consulta de Mesa (CM) ativa — '
                                       'configure-a em Fiscal › Séries.'}, status=400)
        try:
            job = _print_document(ticket, doc)
        except Exception as e:
            import logging, traceback
            logging.getLogger('pos').error('IMPRESSAO da consulta falhou (%s): %s\n%s',
                                           doc.invoice_no, e, traceback.format_exc())
            # o documento SAIU — não se esconde isso só porque o papel não saiu
            return Response({'invoice_no': doc.invoice_no, 'print_job': None, 'content': None,
                             'grand_total': str(doc.gross_total),
                             'detail': f'Documento {doc.invoice_no} emitido, mas a impressão '
                                       f'falhou: {e}'})
        log_event(request, 'DOC_ISSUE', f'Consulta de Mesa {doc.invoice_no}',
                  operator_name=ticket.operator_name, outlet=ticket.outlet, reference=doc.invoice_no)
        return Response({'invoice_no': doc.invoice_no, 'print_job': job.id if job else None,
                         'content': job.content if job else None,
                         'grand_total': str(doc.gross_total)})

    @action(detail=True, methods=['post'])
    def reprint(self, request, pk=None):
        """REIMPRIMIR — volta a pôr o documento JÁ EMITIDO na fila de impressão.

        Reimprimir não é reemitir: o número, o hash e a assinatura são os mesmos.
        Sem este botão, o empregado a quem falha a impressora carrega outra vez em
        "faturar" — e é assim que saem duas faturas da mesma venda.
        """
        from fiscal.integration import existing_for
        ticket = self.get_object()
        doc = existing_for('pos', ticket.id)
        if not doc:
            return Response({'detail': 'Esta conta ainda não tem documento fiscal.'}, status=400)
        job = _print_document(ticket, doc, copia=True)
        log_event(request, 'DOC_ISSUE', f'Reimpressão de {doc.invoice_no}',
                  operator_name=ticket.operator_name, outlet=ticket.outlet, reference=doc.invoice_no)
        return Response({'invoice_no': doc.invoice_no, 'print_job': job.id if job else None,
                         'detail': 'Documento reenviado para a impressora (2ª via — o número é o mesmo).'})

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

    def get_queryset(self):
        # ISOLAMENTO POR HOTEL: só as linhas das contas DESTE hotel. Sem isto, o
        # Hotel A conseguia ler — e apagar — as linhas das contas do Hotel B.
        return scope_qs(self.request,
                        POSTicketLine.objects.select_related('ticket', 'item').all(),
                        'ticket__outlet__hotel')

    def create(self, request, *a, **kw):
        """LANÇAR UM ARTIGO — passa SEMPRE pelo motor de preços do POS.

        Este caminho aceitava o `unit_price` que o cliente enviasse: bastava um pedido
        forjado para vender um whisky a 1 Kz e a fatura sair assinada com esse valor.
        Agora há UM só sítio onde o preço se decide (POS Product Config → tabela de
        preços do sector → preço base, com Happy Hour e promoções por cima) — o mesmo
        que o terminal usa. Preço manual só nos artigos marcados como tal.
        """
        ticket_id = request.data.get('ticket')
        ticket = self.get_queryset().model.ticket.field.related_model.objects.filter(pk=ticket_id).first()
        if not ticket:
            return Response({'detail': 'Conta inválida.'}, status=status.HTTP_400_BAD_REQUEST)
        motor = POSTicketViewSet()
        motor.request = request
        motor.kwargs = {'pk': ticket.pk}
        motor.format_kwarg = None
        return motor.add_line(request, pk=ticket.pk)

    def perform_update(self, serializer):
        """ALTERAR UMA LINHA (preço, quantidade, desconto do artigo, nota).

        Faltavam aqui as DUAS regras que o lançamento já tinha:

        1. O TOTAL DA CONTA não era recalculado. Mudar a quantidade de 1 para 3 mudava
           a linha e deixava o total da conta no valor antigo — o cliente pagava o que
           o ecrã dizia, que não era o que tinha consumido.
        2. O PREÇO passava sem controlo. O lançamento só aceita preço do terminal nos
           artigos de "preço manual"; por aqui, um PATCH punha o whisky a 1 Kz e a
           fatura saía assinada com esse valor. A porta das traseiras da mesma casa.
        """
        from rest_framework.exceptions import ValidationError
        linha = self.get_object()
        novo_preco = serializer.validated_data.get('unit_price')
        if (novo_preco is not None and novo_preco != linha.unit_price
                and not getattr(linha.item, 'manual_price', False)):
            raise ValidationError({
                'detail': f'"{linha.description}" não é de preço manual — o preço é o da '
                          f'tabela. Para baixar o valor, use um desconto (fica registado).',
                'manual_price': False,
            })
        obj = serializer.save()
        obj.ticket.recompute(save=True)

    @action(detail=True, methods=['post'])
    def messages(self, request, pk=None):
        """AS MENSAGENS DA LINHA — "SEM GELO", "PITAYA", uma por baixo da outra.

        São MODIFICADORES da linha, não um campo de texto: uma linha leva várias, cada
        uma sai na sua linha na comanda da cozinha, e cada uma pode ter preço (o "extra
        queijo" que se paga). Enfiadas todas num só campo de texto, a cozinha recebia
        "SEM GELO PITAYA" numa linha só e o extra nunca chegava à conta.

        Envia-se a LISTA COMPLETA: o que vier substitui o que lá estava. É assim que
        "tirar uma mensagem" funciona sem precisar de um segundo endpoint.
        """
        from .models import POSLineModifier
        linha = self.get_object()
        textos = [str(t).strip() for t in (request.data.get('texts') or []) if str(t).strip()]
        linha.modifiers.all().delete()
        for t in textos:
            POSLineModifier.objects.create(line=linha, name=t[:100])
        log_event(request, 'LINE_MESSAGES', f'Mensagens de {linha.description}: {" | ".join(textos) or "(nenhuma)"}',
                  operator_name=linha.ticket.operator_name, outlet=linha.ticket.outlet,
                  reference=linha.ticket.ticket_number)
        return Response(self.get_serializer(linha).data)

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

    @action(detail=False, methods=['get'])
    def monitor(self, request):
        """O SINO DO EMPREGADO — a produção de HOJE, do lado da sala.

        A cozinha tem o KDS; o empregado tem ISTO: o que está Iniciado (ao lume), o
        que está Concluído (PRONTO no passe — ir buscar!) e o que já foi Entregue,
        com os carimbos (fired/ready/served) para o terminal calcular os tempos.
        """
        from django.utils import timezone as _tz
        hoje = _tz.localdate()
        qs = (POSTicketLine.objects
              .select_related('ticket', 'ticket__table', 'ticket__outlet')
              .filter(kds_status__in=['PREPARING', 'READY', 'SERVED'],
                      fired_at__date=hoje)
              .exclude(kds_station='NONE')
              .order_by('-fired_at')[:120])
        return Response(self.get_serializer(qs, many=True).data)

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
        if nxt == 'SERVED':
            line.served_at = timezone.now()
        line.save(update_fields=['kds_status', 'ready_at', 'served_at'])
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
        # (isolamento por hotel abaixo)
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
        qs = scope_qs(self.request, POSAuditLog.objects.select_related('outlet').all(), 'outlet__hotel')
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
        qs = scope_qs(self.request, PrintJob.objects.select_related('outlet').all(), 'outlet__hotel')
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


    @action(detail=False, methods=['post'])
    def retry_failed(self, request):
        """REPROCESSAR as comandas que falharam.

        Uma comanda em FAILED é um pedido que a cozinha NUNCA viu: ficava na fila
        para sempre e o cliente esperava por um prato que ninguém estava a fazer.
        Aqui voltam para a fila.
        """
        from .models import PrintJob
        falhadas = scope_qs(self.request, PrintJob.objects.filter(status='FAILED'), 'outlet__hotel')
        n = falhadas.count()
        falhadas.update(status='QUEUED', error=None)
        return Response({'requeued': n,
                         'detail': f'{n} comanda(s) voltaram para a fila de impressão.'})

class POSReservationViewSet(viewsets.ModelViewSet):
    """Motor 3 — reservas de mesa. Sentar liga a reserva a uma mesa (OCCUPIED)."""
    serializer_class = POSReservationSerializer

    def get_queryset(self):
        qs = scope_qs(self.request,
                      POSReservation.objects.select_related('outlet', 'table').all(),
                      'outlet__hotel')
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
