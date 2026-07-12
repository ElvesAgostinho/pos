from django.core.exceptions import ValidationError
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Account, Journal, FiscalPeriod, JournalEntry
from .serializers import (
    AccountSerializer, JournalSerializer, FiscalPeriodSerializer, JournalEntrySerializer,
)


class AccountViewSet(viewsets.ModelViewSet):
    serializer_class = AccountSerializer

    def get_queryset(self):
        qs = Account.objects.all()
        cls = self.request.query_params.get('account_class')
        movement = self.request.query_params.get('is_movement')
        if cls:
            qs = qs.filter(account_class=cls)
        if movement == '1':
            qs = qs.filter(is_movement=True, is_active=True)
        return qs


class JournalViewSet(viewsets.ModelViewSet):
    serializer_class = JournalSerializer
    queryset = Journal.objects.all()


class FiscalPeriodViewSet(viewsets.ModelViewSet):
    serializer_class = FiscalPeriodSerializer
    queryset = FiscalPeriod.objects.all()

    @action(detail=True, methods=['post'])
    def toggle_close(self, request, pk=None):
        p = self.get_object()
        p.is_closed = not p.is_closed
        p.save(update_fields=['is_closed'])
        return Response(self.get_serializer(p).data)


class JournalEntryViewSet(viewsets.ModelViewSet):
    serializer_class = JournalEntrySerializer

    def get_queryset(self):
        qs = JournalEntry.objects.select_related('journal', 'period').prefetch_related('lines__account').all()
        status_param = self.request.query_params.get('status')
        journal = self.request.query_params.get('journal')
        if status_param:
            qs = qs.filter(status=status_param)
        if journal:
            qs = qs.filter(journal_id=journal)
        return qs

    @action(detail=True, methods=['post'])
    def post_entry(self, request, pk=None):
        """Lança (POSTED) o movimento após validar partidas dobradas."""
        entry = self.get_object()
        try:
            entry.post(by=request.user.get_username())
        except ValidationError as e:
            return Response({'detail': '; '.join(e.messages)}, status=400)
        return Response(self.get_serializer(entry).data)

    @action(detail=True, methods=['post'])
    def reverse_entry(self, request, pk=None):
        """Cria um lançamento de estorno (débitos↔créditos) de um movimento lançado."""
        from django.utils import timezone
        from .models import JournalEntryLine
        entry = self.get_object()
        if entry.status != 'POSTED':
            return Response({'detail': 'Só se estornam lançamentos lançados.'}, status=400)
        rev = JournalEntry.objects.create(
            number=JournalEntrySerializer()._next_number(), journal=entry.journal, period=entry.period,
            entry_date=timezone.localdate(), description=f'Estorno de {entry.number}',
            reference=entry.number, source=entry.source, status='DRAFT',
            created_by=request.user.get_username())
        for ln in entry.lines.all():
            JournalEntryLine.objects.create(entry=rev, account=ln.account,
                                            description=f'Estorno: {ln.description or ""}',
                                            debit=ln.credit, credit=ln.debit, cost_center=ln.cost_center)
        rev.post(by=request.user.get_username())
        entry.status = 'REVERSED'
        entry.save(update_fields=['status'])
        return Response(self.get_serializer(rev).data)
