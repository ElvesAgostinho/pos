"""
Auditoria da Noite (Night Audit) — fecha a lacuna deixada de propósito no
check-in (ver `ReservationViewSet.check_in`): só a 1ª diária é lançada na
entrada do hóspede; as noites seguintes de uma estadia de várias noites
entram aqui, uma execução por dia.

Convenção reaproveitada do check-in, ao pé da letra, para nunca duplicar um
lançamento: `FolioCharge.source_reference = f'ROOM-{data_iso}'`. Antes de
lançar a diária de uma noite, verifica-se sempre se já existe uma linha com
essa referência no folio — se existir (foi o check-in que já a lançou, ou uma
corrida anterior da auditoria), salta-se essa reserva.

`NightAuditRun` (unique_together hotel+audit_date) é a trava contra correr a
mesma data duas vezes para o mesmo hotel.
"""
from datetime import date as date_cls
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.views import APIView
from rest_framework.response import Response

from core.tenancy import HotelScopedMixin, default_hotel_id, scope_qs
from .models import Reservation, FolioCharge, NightAuditRun
from .serializers import NightAuditRunSerializer


def _parse_date(d):
    try:
        return date_cls.fromisoformat(d) if d else None
    except (ValueError, TypeError):
        return None


def _effective_rate(r):
    """A MESMA regra usada em `ReservationViewSet.check_in` e em
    `reports.py` — ver `Reservation.effective_rate` (models.py), a ÚNICA
    definição desta conta em todo o sistema. A auditoria nunca pode lançar um
    valor diferente do que o check-in lançaria."""
    return r.effective_rate


class NightAuditRunViewSet(HotelScopedMixin, viewsets.ReadOnlyModelViewSet):
    """Histórico de execuções — só leitura (a execução em si é o endpoint
    `run` abaixo, nunca um POST direto a este viewset)."""
    queryset = NightAuditRun.objects.select_related('hotel').all()
    serializer_class = NightAuditRunSerializer

    def get_queryset(self):
        return super().get_queryset().order_by('-audit_date')


class NightAuditRunView(APIView):
    """POST pms/night-audit/run/ {audit_date?: 'YYYY-MM-DD'}"""

    def post(self, request):
        audit_date = _parse_date(request.data.get('audit_date')) or timezone.localdate()
        # A AUDITORIA FECHA UM DIA QUE JÁ ACONTECEU. Com uma data futura (um
        # engano no calendário do ecrã) lançavam-se diárias de noites que
        # ninguém dormiu ainda e, pior, QUEIMAVA-SE essa data: o
        # `unique_together` não deixa correr a mesma data duas vezes, por isso
        # quando o dia chegasse a sério a auditoria era recusada e as diárias
        # dessa noite nunca entravam na conta de ninguém.
        if audit_date > timezone.localdate():
            return Response({'detail': f'{audit_date.isoformat()} ainda não aconteceu. A '
                                       f'Auditoria da Noite fecha o dia que terminou, não o '
                                       f'futuro — se correr agora, essa data fica gasta e as '
                                       f'diárias dessa noite nunca serão lançadas.'}, status=400)
        hid = default_hotel_id(request)
        if not hid:
            return Response({'detail': 'Hotel não identificado.'}, status=400)
        from identity.models import Hotel
        try:
            hotel = Hotel.objects.get(pk=hid)
        except Hotel.DoesNotExist:
            return Response({'detail': 'Hotel não encontrado.'}, status=404)

        if NightAuditRun.objects.filter(hotel=hotel, audit_date=audit_date).exists():
            return Response({'detail': f'A Auditoria da Noite de {audit_date.isoformat()} já foi '
                                       f'executada para este hotel.'}, status=409)

        ref = f'ROOM-{audit_date.isoformat()}'
        rooms_charged = 0
        extras_charged = 0
        sem_conta = []
        no_shows = []
        saidas_em_atraso = []
        total_posted = Decimal('0')
        try:
            with transaction.atomic():
                reservations = (scope_qs(request, Reservation.objects
                                          .select_related('room_type', 'rate_plan', 'room')
                                          .prefetch_related('folios__charges'))
                                 .filter(status='CHECKED_IN', check_in__lte=audit_date, check_out__gt=audit_date))
                operador = str(getattr(request.user, 'username', '') or 'night-audit')
                for res in reservations:
                    folio = res.folio
                    if not folio or folio.status != 'OPEN':
                        # SALTAR UMA RESERVA EM SILÊNCIO É PERDER AS NOITES
                        # DELA. Acontece a sério: a empresa pede a factura ao
                        # 2º dia de uma estadia de cinco, a conta fecha, e as
                        # noites seguintes deixam de ser lançadas sem que
                        # ninguém dê por nada — o hotel dorme o hóspede de
                        # graça. A auditoria não pode decidir abrir contas por
                        # sua conta (a factura emitida tem de ficar onde está),
                        # mas tem de DIZER quais saltou, para alguém abrir uma
                        # conta nova ("Recriar conta") e lançar o que falta.
                        sem_conta.append({
                            'reservation': res.id, 'confirmation': res.confirmation,
                            'guest': res.guest.name if res.guest_id else '',
                            'room': res.room.number if res.room_id else '',
                            'reason': ('Sem conta aberta nesta reserva.' if not folio
                                       else f'A conta {folio.number} está fechada'
                                            + (f' (facturada em {folio.fiscal_document_number})'
                                               if folio.fiscal_document_number else '') + '.'),
                        })
                        continue
                    if folio.charges.filter(charge_type='ROOM', source_reference=ref).exists():
                        continue
                    rate = _effective_rate(res)
                    if not rate or rate <= 0:
                        continue
                    FolioCharge.objects.create(
                        folio=folio, charge_type='ROOM',
                        description=f"Alojamento {audit_date.isoformat()} · Quarto "
                                    f"{res.room.number if res.room_id else '?'}",
                        amount=rate, source_reference=ref,
                        posted_by=operador,
                    )
                    rooms_charged += 1
                    total_posted += rate

                    # ENCARGOS FIXOS da reserva (estacionamento, cama extra, taxa
                    # de resort): mesma passagem, mesma trava contra duplicados.
                    # Esquecer de os lançar à mão numa noite é dinheiro que o
                    # hotel não cobra e de que ninguém dá por falta.
                    for enc in res.fixed_charges.filter(is_active=True, per_night=True):
                        ref_enc = f'FIX-{enc.id}-{audit_date.isoformat()}'
                        if folio.charges.filter(source_reference=ref_enc).exists():
                            continue
                        if not enc.amount or enc.amount <= 0:
                            continue
                        FolioCharge.objects.create(
                            folio=folio, charge_type=enc.charge_type,
                            description=f'{enc.description} · {audit_date.isoformat()}',
                            amount=enc.amount, source_reference=ref_enc, posted_by=operador)
                        extras_charged += 1
                        total_posted += enc.amount

                # ================= O NO-SHOW =================================
                #
                # Uma reserva para ONTEM que nunca chegou a check-in continua
                # "Reservada" para sempre: aparece nas chegadas de todos os
                # dias, conta na ocupação, e o quarto fica preso a alguém que
                # não veio. Alguém tinha de a arrumar à mão, todos os dias — e
                # quem o fizesse teria de se lembrar de cobrar as garantidas.
                #
                # A auditoria fecha o dia: é ela que o diz. Marca No-show as
                # reservas cuja ENTRADA já passou e que nunca entraram.
                nao_vieram = (scope_qs(request, Reservation.objects
                                       .select_related('guest', 'room', 'room_type'))
                              .filter(status__in=('BOOKED', 'OPTION'),
                                      check_in__lte=audit_date))
                for res in nao_vieram:
                    res.status = 'NO_SHOW'
                    res.save(update_fields=['status'])

                    # UMA RESERVA GARANTIDA COBRA-SE. Foi esse o acordo: o
                    # hóspede deu garantia para o quarto ficar à espera dele, e
                    # o hotel deixou de o vender. Não cobrar um no-show
                    # garantido é oferecer a noite a quem não apareceu — e é a
                    # receita que o revenue manager conta para aceitar o risco.
                    cobrado = None
                    if res.is_guaranteed:
                        valor = _effective_rate(res)
                        ref_ns = f'NOSHOW-{res.id}'
                        # A CONTA ABRE-SE AQUI, e é a única vez em que a auditoria o faz.
                        #
                        # O folio nasce no CHECK-IN — e um no-show, por definição, nunca
                        # entrou: nunca teve conta. Sem abrir uma, um no-show garantido
                        # nunca poderia ser cobrado, e a garantia não valeria nada.
                        #
                        # É diferente do caso lá em cima, em que a conta EXISTE e está
                        # fechada porque alguém já facturou: aí a auditoria não abre nada,
                        # porque abrir seria desfazer a decisão de quem emitiu a factura.
                        # Aqui não há decisão nenhuma para desfazer.
                        folio = res.folio
                        if folio is None and valor and valor > 0:
                            from .models import Folio
                            from .views import _next_number
                            folio = Folio.objects.create(
                                reservation=res,
                                number=_next_number(Folio.objects, 'number', 'FOL'))
                        if folio and folio.status == 'OPEN' and valor and valor > 0 \
                                and not folio.charges.filter(source_reference=ref_ns).exists():
                            FolioCharge.objects.create(
                                folio=folio, charge_type='ROOM',
                                description=f'No-show {audit_date.isoformat()} · reserva '
                                            f'{res.confirmation}',
                                amount=valor, source_reference=ref_ns, posted_by=operador)
                            cobrado = valor
                            total_posted += valor

                    no_shows.append({
                        'reservation': res.id, 'confirmation': res.confirmation,
                        'guest': res.guest.name if res.guest_id else '',
                        'guaranteed': bool(res.is_guaranteed),
                        'charged': str(cobrado) if cobrado else None,
                        # O MOTIVO TEM DE SER O VERDADEIRO. Dizer "sem conta
                        # aberta" quando o que falta é a tarifa manda quem lê
                        # procurar no sítio errado — e a noite continua por
                        # cobrar enquanto ele procura.
                        'reason': (None if (cobrado or not res.is_guaranteed) else (
                            'Garantida, mas sem tarifa definida — nada para lançar.'
                            if not (_effective_rate(res) or 0) > 0 else
                            'Garantida, mas a conta já está fechada (facturada) — '
                            'a noite do no-show tem de ser cobrada à parte.')),
                    })

                # ============ AS SAÍDAS QUE NÃO ACONTECERAM =================
                #
                # Um hóspede com saída marcada para ontem e ainda em check-in: ou
                # ficou mais uma noite (e a diária tem de ser lançada) ou saiu e
                # ninguém fez o check-out (e o quarto está por limpar e por
                # vender). Nos dois casos há dinheiro ou um quarto parado.
                #
                # A auditoria NÃO decide qual dos dois é — isso só a recepção
                # sabe. Mas tem de os pôr à frente de alguém, em vez de os deixar
                # a envelhecer no mapa de quartos.
                atrasados = (scope_qs(request, Reservation.objects
                                      .select_related('guest', 'room'))
                             .filter(status='CHECKED_IN', check_out__lte=audit_date))
                for res in atrasados:
                    saidas_em_atraso.append({
                        'reservation': res.id, 'confirmation': res.confirmation,
                        'guest': res.guest.name if res.guest_id else '',
                        'room': res.room.number if res.room_id else '',
                        'check_out': res.check_out.isoformat() if res.check_out else None,
                    })

                run = NightAuditRun.objects.create(
                    hotel=hotel, audit_date=audit_date,
                    run_by=str(getattr(request.user, 'username', '') or 'night-audit'),
                    rooms_charged=rooms_charged, total_posted=total_posted,
                )
        except IntegrityError:
            return Response({'detail': f'A Auditoria da Noite de {audit_date.isoformat()} já foi '
                                       f'executada para este hotel.'}, status=409)
        dados = NightAuditRunSerializer(run).data
        dados['extras_charged'] = extras_charged
        dados['skipped_no_folio'] = sem_conta
        dados['no_shows'] = no_shows
        dados['late_departures'] = saidas_em_atraso

        # O RESULTADO TEM DE DIZER O QUE FICOU POR RESOLVER, e por ordem de
        # dinheiro: primeiro o que não foi cobrado, depois o que está parado.
        avisos = []
        if sem_conta:
            avisos.append(f'{len(sem_conta)} reserva(s) em check-in ficaram SEM a diária desta '
                          f'noite por não terem conta aberta. Abra uma conta nova na ficha da '
                          f'reserva ("Recriar conta") e lance as noites que faltam — senão é '
                          f'alojamento dado de graça.')
        garantidos_por_cobrar = [n for n in no_shows if n['reason']]
        if garantidos_por_cobrar:
            avisos.append(f'{len(garantidos_por_cobrar)} no-show(s) GARANTIDO(s) ficaram por '
                          f'cobrar por não terem conta aberta.')
        if saidas_em_atraso:
            avisos.append(f'{len(saidas_em_atraso)} hóspede(s) com saída marcada e ainda em '
                          f'check-in. Ou ficaram mais uma noite (e falta lançar a diária), ou '
                          f'saíram sem check-out (e o quarto está por vender).')
        if avisos:
            dados['detail'] = ' '.join(avisos)
        return Response(dados, status=201)
