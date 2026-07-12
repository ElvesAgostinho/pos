from datetime import date, datetime

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import (FiscalConfig, FiscalDocType, FiscalSeries, FiscalDocument,
                     SubmissionQueue, FiscalAuditLog, TaxRate, TaxExemptionReason)
from .serializers import (FiscalConfigSerializer, FiscalDocTypeSerializer,
                          FiscalSeriesSerializer, FiscalDocumentSerializer,
                          SubmissionQueueSerializer, FiscalAuditLogSerializer,
                          TaxRateSerializer, TaxExemptionReasonSerializer)
from . import services, saft


from .models import CommercialDocument, CommercialDocumentLine
from .serializers import CommercialDocumentSerializer, CommercialDocumentLineSerializer
from . import commercial as commercial_svc


class CommercialDocumentViewSet(viewsets.ModelViewSet):
    """Documentos comerciais (Orçamento/Proforma/Encomenda) — editáveis só em rascunho."""
    permission_classes = [IsAuthenticated]
    serializer_class = CommercialDocumentSerializer
    search_fields = ['number', 'customer_name', 'customer_tax_id']
    ordering_fields = ['created_at', 'doc_date', 'gross_total']

    def get_queryset(self):
        qs = CommercialDocument.objects.prefetch_related('lines').all()
        for f in ('kind', 'state'):
            v = self.request.query_params.get(f)
            if v:
                qs = qs.filter(**{f: v})
        return qs

    def create(self, request, *args, **kwargs):
        d = request.data
        doc = commercial_svc.create_document(
            kind=d.get('kind', 'BUDGET'), customer_name=d.get('customer_name'),
            customer_tax_id=d.get('customer_tax_id'), customer_address=d.get('customer_address'),
            operator_name=d.get('operator_name'), notes=d.get('notes'),
            valid_until=d.get('valid_until') or None, lines=d.get('lines') or [],
            user=str(getattr(request.user, 'username', '') or ''))
        return Response(CommercialDocumentSerializer(doc).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        doc = self.get_object()
        if not doc.editable:
            return Response({'detail': 'Só rascunhos podem ser editados.'}, status=400)
        # Substitui as linhas se enviadas, e recalcula.
        for field in ('customer_name', 'customer_tax_id', 'customer_address', 'operator_name', 'notes', 'valid_until'):
            if field in request.data:
                setattr(doc, field, request.data[field] or None)
        doc.save()
        if 'lines' in request.data:
            doc.lines.all().delete()
            for ln in request.data['lines']:
                CommercialDocumentLine.objects.create(
                    document=doc, description=ln.get('description', ''),
                    quantity=ln.get('quantity', 1) or 1, unit_price=ln.get('unit_price', 0) or 0,
                    tax_code=ln.get('tax_code'), tax_percentage=ln.get('tax_percentage', 0) or 0)
        doc.recompute()
        return Response(CommercialDocumentSerializer(doc).data)

    def destroy(self, request, *args, **kwargs):
        doc = self.get_object()
        if not doc.editable:
            return Response({'detail': 'Só rascunhos podem ser eliminados.'}, status=400)
        return super().destroy(request, *args, **kwargs)

    def _t(self, request, pk, state):
        try:
            doc = commercial_svc.transition(self.get_object(), state)
        except ValueError as e:
            return Response({'detail': str(e)}, status=400)
        return Response(CommercialDocumentSerializer(doc).data)

    @action(detail=True, methods=['post'])
    def submit_approval(self, request, pk=None):
        return self._t(request, pk, 'APPROVAL')

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        return self._t(request, pk, 'APPROVED')

    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        return self._t(request, pk, 'SENT')

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        return self._t(request, pk, 'ACCEPTED')

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        return self._t(request, pk, 'REJECTED')

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        doc = commercial_svc.duplicate(pk, user=str(getattr(request.user, 'username', '') or ''))
        return Response(CommercialDocumentSerializer(doc).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def printout(self, request, pk=None):
        """Dados para imprimir/enviar o documento comercial (Orçamento/Proforma/Encomenda)."""
        doc = self.get_object()
        cfg = FiscalConfig.get()
        summ = services.summarize_by_rate([(l.tax_percentage, l.line_total + l.tax_amount) for l in doc.lines.all()])
        from .num2words_pt import amount_to_words
        return Response({
            'company': {
                'name': cfg.company_name, 'trade_name': cfg.trade_name or cfg.company_name,
                'nif': cfg.company_nif, 'address': cfg.address_line, 'city': cfg.city,
                'phone': cfg.phone, 'share_capital': cfg.share_capital, 'crc_number': cfg.crc_number,
                'certificate_number': cfg.certificate_number,
            },
            'document': {
                'invoice_no': doc.number, 'type_name': doc.get_kind_display(),
                'copy_label': doc.get_state_display(), 'status': doc.get_state_display(),
                'date': doc.doc_date.isoformat(), 'operator': doc.operator_name,
                'place': None, 'room': None, 'signable': False,
                'valid_until': doc.valid_until.isoformat() if doc.valid_until else None,
            },
            'customer': {'name': doc.customer_name or '', 'nif': doc.customer_tax_id or '', 'address': doc.customer_address or ''},
            'lines': [{
                'quantity': str(l.quantity), 'description': l.description, 'unit_price': str(l.unit_price),
                'discount': '0.00', 'tax_percentage': str(l.tax_percentage),
                'total': str(l.line_total + l.tax_amount), 'exemption_reason': l.exemption_reason,
            } for l in doc.lines.all()],
            'tax_summary': [{'rate': float(s['rate']), 'base': str(s['base']), 'tax': str(s['tax']), 'total': str(s['gross'])} for s in summ],
            'payments': [],
            'totals': {'net': str(doc.net_total), 'discount': '0.00', 'tax': str(doc.tax_total), 'gross': str(doc.gross_total)},
            'amount_in_words': amount_to_words(doc.gross_total),
            'qr_data': None,
            'print_mention': f"Documento não fiscal · {doc.get_kind_display()} sem valor fiscal",
            'hash': None,
        })

    @action(detail=True, methods=['post'])
    def convert(self, request, pk=None):
        try:
            fdoc = commercial_svc.convert_to_invoice(
                pk, doc_type_code=request.data.get('doc_type'),
                user=str(getattr(request.user, 'username', '') or ''), ip=_client_ip(request))
        except ValueError as e:
            return Response({'detail': str(e)}, status=400)
        SubmissionQueue.objects.create(document=fdoc, status='QUEUED')
        return Response({'commercial': CommercialDocumentSerializer(self.get_object()).data,
                         'fiscal': FiscalDocumentSerializer(fdoc).data}, status=201)


class TaxRateViewSet(viewsets.ModelViewSet):
    """Tax/IVA Engine — taxas parametrizáveis."""
    permission_classes = [IsAuthenticated]
    queryset = TaxRate.objects.all()
    serializer_class = TaxRateSerializer


class TaxExemptionReasonViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = TaxExemptionReason.objects.all()
    serializer_class = TaxExemptionReasonSerializer


def _client_ip(request):
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    return xff.split(',')[0].strip() if xff else request.META.get('REMOTE_ADDR')


class FiscalConfigViewSet(viewsets.ModelViewSet):
    """Company Fiscal Profile / parâmetros do motor (singleton)."""
    permission_classes = [IsAuthenticated]
    serializer_class = FiscalConfigSerializer

    def get_queryset(self):
        FiscalConfig.get()  # garante existência
        return FiscalConfig.objects.all()


class FiscalDocTypeViewSet(viewsets.ModelViewSet):
    """Rules Engine — catálogo de tipos de documento (parametrizável)."""
    permission_classes = [IsAuthenticated]
    queryset = FiscalDocType.objects.all()
    serializer_class = FiscalDocTypeSerializer


class FiscalSeriesViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = FiscalSeries.objects.select_related('doc_type').all()
    serializer_class = FiscalSeriesSerializer

    @action(detail=True, methods=['get'])
    def verify(self, request, pk=None):
        """Auditoria: revalida cadeia de hash + assinaturas da série."""
        return Response(services.verify_chain(pk))


class FiscalDocumentViewSet(viewsets.ReadOnlyModelViewSet):
    """Documentos são imutáveis: só se criam via 'issue'; não há update/delete."""
    permission_classes = [IsAuthenticated]
    queryset = FiscalDocument.objects.select_related('doc_type', 'series').prefetch_related('lines').all()
    serializer_class = FiscalDocumentSerializer
    search_fields = ['invoice_no', 'customer_name', 'customer_tax_id']
    ordering_fields = ['created_at', 'doc_date', 'gross_total', 'number']
    filterset_fields = ['status', 'doc_type', 'series', 'agt_status', 'is_archived', 'source_module', 'source_ref']

    @action(detail=False, methods=['post'])
    def issue(self, request):
        d = request.data
        try:
            doc = services.issue_document(
                series_id=d.get('series'),
                customer_name=d.get('customer_name'),
                customer_tax_id=d.get('customer_tax_id'),
                lines=d.get('lines') or [],
                doc_date=None,
                reference_doc=d.get('reference_doc'),
                user=str(getattr(request.user, 'username', '') or ''),
                ip=_client_ip(request),
            )
        except services.FiscalValidationError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except FiscalSeries.DoesNotExist:
            return Response({'detail': 'Série inexistente.'}, status=status.HTTP_400_BAD_REQUEST)
        # Enfileira automaticamente para comunicação à AGT (store-and-forward).
        SubmissionQueue.objects.create(document=doc, status='QUEUED')
        return Response(FiscalDocumentSerializer(doc).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def void(self, request, pk=None):
        doc = services.void_document(pk, reason=request.data.get('reason', ''),
                                     user=str(getattr(request.user, 'username', '') or ''),
                                     ip=_client_ip(request))
        return Response(FiscalDocumentSerializer(doc).data)

    @action(detail=True, methods=['post'])
    def credit_note(self, request, pk=None):
        """Anulação inteligente: gera a Nota de Crédito que reverte a fatura + anula o original."""
        try:
            nc = services.create_credit_note(pk, reason=request.data.get('reason', ''),
                                             user=str(getattr(request.user, 'username', '') or ''),
                                             ip=_client_ip(request))
        except ValueError as e:
            return Response({'detail': str(e)}, status=400)
        return Response({'detail': f'Nota de Crédito {nc.invoice_no} emitida — fatura anulada.',
                         'credit_note': FiscalDocumentSerializer(nc).data}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def xml(self, request, pk=None):
        """Exporta o documento em XML normalizado (arquivo fiscal)."""
        doc = self.get_object()
        content = saft.document_xml(doc)
        resp = HttpResponse(content, content_type='application/xml')
        safe = doc.invoice_no.replace('/', '-').replace(' ', '_')
        resp['Content-Disposition'] = f'attachment; filename="{safe}.xml"'
        return resp

    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        doc = self.get_object()
        doc.is_archived = True
        doc.save(update_fields=['is_archived'])
        FiscalAuditLog.objects.create(event='ARCHIVE', document_ref=doc.invoice_no,
                                      user=str(getattr(request.user, 'username', '') or ''))
        return Response(FiscalDocumentSerializer(doc).data)

    @action(detail=True, methods=['post'])
    def settle(self, request, pk=None):
        """Marca como pago (liquidado) — normalmente acionado pelo Financeiro."""
        doc = self.get_object()
        doc.settled = True
        doc.save(update_fields=['settled'])
        return Response(FiscalDocumentSerializer(doc).data)

    @action(detail=True, methods=['get'])
    def printout(self, request, pk=None):
        """Dados completos para impressão/arquivo legal (cabeçalho, IVA por taxa, extenso, QR)."""
        from decimal import Decimal
        from collections import OrderedDict
        doc = self.get_object()
        cfg = FiscalConfig.get()
        # Marca de cópia: 1ª impressão = Original; seguintes = Duplicado/Triplicado...
        register = request.query_params.get('register') == '1'
        copy_index = doc.print_count
        if register:
            doc.print_count = doc.print_count + 1
            doc.save(update_fields=['print_count'])
            FiscalAuditLog.objects.create(event='PRINT', document_ref=doc.invoice_no,
                                          user=str(getattr(request.user, 'username', '') or ''),
                                          ip_address=_client_ip(request), detail=f"copy={copy_index}")
        copy_label = 'Original' if copy_index == 0 else ('Duplicado' if copy_index == 1
                     else ('Triplicado' if copy_index == 2 else f'Cópia {copy_index + 1}'))
        # Resumo de IVA agrupado por taxa (regra AGT: arredonda sobre o total por taxa).
        summ = services.summarize_by_rate([(l.tax_percentage, l.line_total + l.tax_amount) for l in doc.lines.all()])
        tax_summary = [{'rate': float(s['rate']), 'base': str(s['base']),
                        'tax': str(s['tax']), 'total': str(s['gross'])} for s in summ]
        return Response({
            'company': {
                'name': cfg.company_name, 'trade_name': cfg.trade_name or cfg.company_name,
                'nif': cfg.company_nif, 'address': cfg.address_line, 'city': cfg.city,
                'province': cfg.province, 'phone': cfg.phone, 'fax': cfg.fax, 'email': cfg.email,
                'share_capital': cfg.share_capital, 'crc_number': cfg.crc_number,
                'logo_url': cfg.logo_url, 'certificate_number': cfg.certificate_number,
            },
            'document': {
                'invoice_no': doc.invoice_no, 'type_name': doc.doc_type.name,
                'copy_label': copy_label, 'status': doc.get_status_display(),
                'date': doc.system_entry_date.strftime('%Y-%m-%d %H:%M'),
                'operator': doc.operator_name, 'place': doc.place_ref, 'room': doc.room_ref,
                'signable': doc.doc_type.signable,
            },
            'customer': {
                'name': doc.customer_name or 'Consumidor Final',
                'nif': doc.customer_tax_id or '', 'address': doc.customer_address or '',
            },
            'lines': [{
                'quantity': str(l.quantity), 'description': l.description,
                'unit_price': str(l.unit_price), 'discount': '0.00',
                'tax_percentage': str(l.tax_percentage),
                'total': str(l.line_total + l.tax_amount),  # total da linha com IVA (preço faturado)
                'exemption_reason': l.exemption_reason,
            } for l in doc.lines.all()],
            'tax_summary': tax_summary,
            'payments': [{'method': doc.payment_method or 'Numerário', 'amount': str(doc.gross_total)}] if doc.payment_method or doc.doc_type.code in ('FR', 'VD') else [],
            'totals': {
                'net': str(doc.net_total), 'discount': str(doc.discount_total),
                'tax': str(doc.tax_total), 'gross': str(doc.gross_total),
            },
            'amount_in_words': doc.amount_in_words,
            'qr_data': doc.qr_data,
            'print_mention': doc.print_mention,
            'hash': doc.doc_hash,
        })


class SubmissionQueueViewSet(viewsets.ModelViewSet):
    """Submission Queue — comunicação à AGT com fila e reenvio (modo offline seguro)."""
    permission_classes = [IsAuthenticated]
    queryset = SubmissionQueue.objects.select_related('document').all()
    serializer_class = SubmissionQueueSerializer
    http_method_names = ['get', 'post', 'head', 'options']

    @action(detail=True, methods=['post'])
    def process(self, request, pk=None):
        """Processa um item da fila (envio à AGT). Integração real quando a API estiver ativa."""
        item = self.get_object()
        item.attempts += 1
        item.status = 'ACK'  # ambiente de testes: aceite simulado
        item.sent_at = timezone.now()
        item.response = 'ACK · ambiente de testes (integração AGT pendente de credenciais)'
        item.save()
        # Sincroniza o ciclo de vida do documento.
        item.document.agt_status = 'ACCEPTED'
        item.document.save(update_fields=['agt_status'])
        FiscalAuditLog.objects.create(event='SUBMIT', document_ref=item.document.invoice_no,
                                      user=str(getattr(request.user, 'username', '') or ''),
                                      ip_address=_client_ip(request), detail=item.status)
        return Response(SubmissionQueueSerializer(item).data)

    @action(detail=True, methods=['post'])
    def retry(self, request, pk=None):
        item = self.get_object()
        item.status = 'RETRY'
        item.save(update_fields=['status'])
        return Response(SubmissionQueueSerializer(item).data)


class FiscalAuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = FiscalAuditLog.objects.all()
    serializer_class = FiscalAuditLogSerializer


class FiscalDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        docs_today = FiscalDocument.objects.filter(doc_date=today)
        q = SubmissionQueue.objects.all()
        cfg = FiscalConfig.get()
        return Response({
            'date': today.isoformat(),
            'environment': cfg.environment,
            'certificate_number': cfg.certificate_number,
            'issued_today': docs_today.count(),
            'issued_total': FiscalDocument.objects.count(),
            'voided': FiscalDocument.objects.filter(status='A').count(),
            'queue_pending': q.filter(status__in=['QUEUED', 'RETRY']).count(),
            'queue_sent': q.filter(status__in=['SENT', 'ACK']).count(),
            'queue_rejected': q.filter(status='REJECTED').count(),
            'active_series': FiscalSeries.objects.filter(is_active=True).count(),
            'doc_types': FiscalDocType.objects.filter(is_active=True).count(),
            'commercial': {
                'drafts': CommercialDocument.objects.filter(state='DRAFT').count(),
                'open': CommercialDocument.objects.filter(state__in=['SENT', 'APPROVED', 'ACCEPTED']).count(),
                'converted': CommercialDocument.objects.filter(state='CONVERTED').count(),
                'total': CommercialDocument.objects.count(),
            },
            'lifecycle': {
                'signed': FiscalDocument.objects.filter(agt_status='PENDING', status='N').count(),
                'paid': FiscalDocument.objects.filter(settled=True).count(),
                'archived': FiscalDocument.objects.filter(is_archived=True).count(),
            },
        })


class SAFTExportView(APIView):
    """SAF-T Center — exportação do ficheiro XML (por período)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            start = datetime.strptime(request.GET.get('start'), '%Y-%m-%d').date()
            end = datetime.strptime(request.GET.get('end'), '%Y-%m-%d').date()
        except (TypeError, ValueError):
            today = timezone.localdate()
            start, end = today.replace(day=1), today
        xml = saft.generate_saft(start, end)
        FiscalAuditLog.objects.create(event='SAFT_EXPORT',
                                      detail=f"{start}..{end}",
                                      user=str(getattr(request.user, 'username', '') or ''),
                                      ip_address=_client_ip(request))
        resp = HttpResponse(xml, content_type='application/xml')
        resp['Content-Disposition'] = f'attachment; filename="SAFT_AO_{start}_{end}.xml"'
        return resp
