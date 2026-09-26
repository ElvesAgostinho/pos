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
        total_posted = Decimal('0')
        try:
            with transaction.atomic():
                reservations = (scope_qs(request, Reservation.objects
                                          .select_related('room_type', 'rate_plan', 'room')
                                          .prefetch_related('folios__charges'))
                                 .filter(status='CHECKED_IN', check_in__lte=audit_date, check_out__gt=audit_date))
                for res in reservations:
                    folio = res.folio
                    if not folio or folio.status != 'OPEN':
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
                        posted_by=str(getattr(request.user, 'username', '') or 'night-audit'),
                    )
                    rooms_charged += 1
                    total_posted += rate

                run = NightAuditRun.objects.create(
                    hotel=hotel, audit_date=audit_date,
                    run_by=str(getattr(request.user, 'username', '') or 'night-audit'),
                    rooms_charged=rooms_charged, total_posted=total_posted,
                )
        except IntegrityError:
            return Response({'detail': f'A Auditoria da Noite de {audit_date.isoformat()} já foi '
                                       f'executada para este hotel.'}, status=409)
        return Response(NightAuditRunSerializer(run).data, status=201)
