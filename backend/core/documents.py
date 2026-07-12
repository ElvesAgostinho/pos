"""
Document Center — repositório documental TRANSVERSAL.

Não duplica os documentos: AGREGA em tempo real, num formato comum, os documentos de
todos os módulos (Faturação, POS, PMS, Compras, Stock, Tesouraria), com pesquisa global
("FT2026…", "Quarto 405", "João Silva", valor) e um dashboard por área. Imports guardados:
cada secção degrada graciosamente se o módulo não estiver ativo/instalado.
"""
from decimal import Decimal, InvalidOperation

from django.db.models import Q
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated


def _row(category, doc_type, number, date, party, amount, status, module, ref=None):
    return {'category': category, 'doc_type': doc_type, 'number': number,
            'date': date.isoformat() if hasattr(date, 'isoformat') else (str(date) if date else None),
            'party': party, 'amount': str(amount) if amount is not None else None,
            'status': status, 'module': module, 'ref': ref or number}


CATEGORIES = [
    ('FATURACAO', 'Faturação'), ('POS', 'POS / Vendas'), ('PMS', 'Hotel (PMS)'),
    ('COMPRAS', 'Compras'), ('STOCK', 'Stock'), ('TESOURARIA', 'Tesouraria'),
    ('CONTABILIDADE', 'Contabilidade'),
]


class DocumentCenterView(APIView):
    """GET /api/documents/center/?q=&category=&limit= — lista unificada de documentos."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        q = (request.query_params.get('q') or '').strip()
        cat = request.query_params.get('category') or ''
        try:
            limit = min(int(request.query_params.get('limit', 60)), 200)
        except ValueError:
            limit = 60
        amount_q = None
        try:
            amount_q = Decimal(q.replace(',', '.')) if q and q.replace(',', '.').replace('.', '').isdigit() else None
        except InvalidOperation:
            amount_q = None
        rows = []

        def want(c):
            return not cat or cat == c

        # ---------------- FATURAÇÃO (fiscal) ----------------
        if want('FATURACAO'):
            try:
                from fiscal.models import FiscalDocument, CommercialDocument
                fd = FiscalDocument.objects.select_related('doc_type')
                if q:
                    fd = fd.filter(Q(invoice_no__icontains=q) | Q(customer_name__icontains=q) | Q(customer_tax_id__icontains=q))
                for d in fd.order_by('-created_at')[:limit]:
                    rows.append(_row('FATURACAO', d.doc_type.name, d.invoice_no, d.doc_date,
                                     d.customer_name, d.gross_total, d.get_status_display(), 'fiscal', str(d.id)))
                cd = CommercialDocument.objects.all()
                if q:
                    cd = cd.filter(Q(number__icontains=q) | Q(customer_name__icontains=q))
                for d in cd.order_by('-created_at')[:limit]:
                    rows.append(_row('FATURACAO', d.get_kind_display(), d.number, d.doc_date,
                                     d.customer_name, d.gross_total, d.get_state_display(), 'fiscal', str(d.id)))
            except Exception:
                pass

        # ---------------- POS / Vendas ----------------
        if want('POS'):
            try:
                from pos.models import POSTicket
                tk = POSTicket.objects.all()
                if q:
                    tk = tk.filter(Q(ticket_number__icontains=q) | Q(operator_name__icontains=q)
                                   | Q(customer_name__icontains=q) | Q(dest_label__icontains=q))
                for t in tk.order_by('-opened_at')[:limit]:
                    rows.append(_row('POS', f'Venda ({t.get_status_display()})', t.ticket_number, t.opened_at.date(),
                                     t.dest_label or t.customer_name or '—', t.grand_total, t.get_status_display(), 'pos', str(t.id)))
            except Exception:
                pass

        # ---------------- PMS ----------------
        if want('PMS'):
            try:
                from pms.models import Folio, Reservation
                fo = Folio.objects.select_related('reservation__guest', 'reservation__room')
                if q:
                    fo = fo.filter(Q(number__icontains=q) | Q(reservation__guest__full_name__icontains=q)
                                   | Q(reservation__room__number__icontains=q))
                for f in fo.order_by('-opened_at')[:limit]:
                    guest = f.reservation.guest.full_name if f.reservation and f.reservation.guest else '—'
                    rows.append(_row('PMS', 'Folio', f.number, f.opened_at.date(), guest, f.balance, f.get_status_display(), 'pms', str(f.id)))
                rv = Reservation.objects.select_related('guest', 'room')
                if q:
                    rv = rv.filter(Q(confirmation__icontains=q) | Q(guest__full_name__icontains=q) | Q(room__number__icontains=q))
                for r in rv.order_by('-created_at')[:limit]:
                    rows.append(_row('PMS', 'Reserva', r.confirmation, r.check_in, r.guest.full_name if r.guest else '—',
                                     r.rate, r.get_status_display(), 'pms', str(r.id)))
            except Exception:
                pass

        # ---------------- COMPRAS ----------------
        if want('COMPRAS'):
            try:
                from finance.models import SupplierInvoice
                si = SupplierInvoice.objects.all()
                if q:
                    si = si.filter(Q(number__icontains=q) | Q(supplier_name__icontains=q))
                for d in si.order_by('-date')[:limit]:
                    rows.append(_row('COMPRAS', 'Fatura de Fornecedor', d.number, d.date,
                                     getattr(d, 'supplier_name', '—'), getattr(d, 'amount', None),
                                     d.get_status_display() if hasattr(d, 'get_status_display') else d.status, 'finance', str(d.id)))
            except Exception:
                pass

        # ---------------- STOCK ----------------
        if want('STOCK'):
            try:
                from inventory.models import StockMovement
                sm = StockMovement.objects.select_related('item')
                if q:
                    sm = sm.filter(Q(item__code__icontains=q) | Q(item__name__icontains=q) | Q(reference__icontains=q))
                for m in sm.order_by('-created_at')[:limit]:
                    rows.append(_row('STOCK', m.get_movement_type_display(), m.reference or f'MV-{m.id}',
                                     m.created_at.date(), f'{m.item.code} · {m.item.name}', m.quantity, m.get_movement_type_display(), 'inventory', str(m.id)))
            except Exception:
                pass

        # ---------------- TESOURARIA ----------------
        if want('TESOURARIA'):
            try:
                from finance.models import Receipt, PaymentVoucher
                rc = Receipt.objects.all()
                if q:
                    rc = rc.filter(Q(number__icontains=q) | Q(party_name__icontains=q))
                for d in rc.order_by('-date')[:limit]:
                    rows.append(_row('TESOURARIA', 'Recebimento', d.number, d.date, d.party_name, d.amount,
                                     d.get_status_display() if hasattr(d, 'get_status_display') else d.status, 'finance', str(d.id)))
                pv = PaymentVoucher.objects.all()
                if q:
                    pv = pv.filter(Q(number__icontains=q) | Q(party_name__icontains=q))
                for d in pv.order_by('-date')[:limit]:
                    rows.append(_row('TESOURARIA', 'Pagamento', d.number, d.date, getattr(d, 'party_name', '—'), d.amount,
                                     d.get_status_display() if hasattr(d, 'get_status_display') else getattr(d, 'status', ''), 'finance', str(d.id)))
            except Exception:
                pass

        # ---------------- CONTABILIDADE ----------------
        if want('CONTABILIDADE'):
            try:
                from accounting.models import JournalEntry
                je = JournalEntry.objects.select_related('journal')
                if q:
                    je = je.filter(Q(number__icontains=q) | Q(description__icontains=q) | Q(reference__icontains=q))
                for e in je.order_by('-entry_date', '-id')[:limit]:
                    rows.append(_row('CONTABILIDADE', f'Lançamento ({e.journal.code})', e.number, e.entry_date,
                                     e.description, e.total_debit, e.get_status_display(), 'accounting', str(e.id)))
            except Exception:
                pass

        # Ordena por data desc e limita.
        rows.sort(key=lambda r: r['date'] or '', reverse=True)
        return Response({'count': len(rows), 'results': rows[:limit], 'categories': [{'key': k, 'name': n} for k, n in CATEGORIES]})


class DocumentLinksView(APIView):
    """GET /api/documents/links/?module=&id= — o documento + documentos LIGADOS (fluxo)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        module = request.query_params.get('module')
        did = request.query_params.get('id')
        detail = {}
        links = []

        if module == 'pos':
            try:
                from pos.models import POSTicket
                t = POSTicket.objects.prefetch_related('lines', 'payments').get(pk=did)
                detail = {'title': f'Venda {t.ticket_number}', 'fields': {
                    'Operador': t.operator_name, 'Destino': t.dest_label or '—',
                    'Cliente': t.customer_name or 'Consumidor Final', 'Total': str(t.grand_total),
                    'Estado': t.get_status_display(), 'Aberta': t.opened_at.strftime('%Y-%m-%d %H:%M')},
                    'items': [f'{int(l.quantity)}x {l.description}' for l in t.lines.all()]}
                # Recibo fiscal ligado
                from fiscal.models import FiscalDocument
                for fd in FiscalDocument.objects.filter(source_module='pos', source_ref=str(t.id)):
                    links.append({'category': 'FATURACAO', 'label': 'Recibo fiscal', 'number': fd.invoice_no,
                                  'module': 'fiscal', 'id': str(fd.id), 'amount': str(fd.gross_total)})
                # Cobrança no quarto (folio)
                from pms.models import FolioCharge
                for ch in FolioCharge.objects.filter(source_reference=t.ticket_number):
                    links.append({'category': 'PMS', 'label': 'Cobrança no folio', 'number': ch.folio.number,
                                  'module': 'pms', 'id': str(ch.folio_id), 'amount': str(ch.amount)})
            except Exception:
                pass

        elif module == 'fiscal':
            try:
                from fiscal.models import FiscalDocument
                d = FiscalDocument.objects.prefetch_related('lines', 'submissions').get(pk=did)
                detail = {'title': d.invoice_no, 'fields': {
                    'Tipo': d.doc_type.name, 'Cliente': d.customer_name or 'Consumidor Final',
                    'NIF': d.customer_tax_id or '—', 'Total': str(d.gross_total),
                    'Estado': d.get_status_display(), 'Ciclo': d.lifecycle_state, 'Data': d.doc_date.isoformat()},
                    'items': [f'{int(l.quantity)}x {l.description} ({l.tax_percentage}%)' for l in d.lines.all()],
                    'printable': d.doc_type.signable}
                if d.source_module and d.source_ref:
                    links.append({'category': d.source_module.upper(), 'label': f'Origem ({d.source_module})',
                                  'number': d.source_ref, 'module': d.source_module, 'id': d.source_ref, 'amount': None})
                for sub in d.submissions.all():
                    links.append({'category': 'AGT', 'label': f'Submissão AGT ({sub.status})',
                                  'number': sub.status, 'module': None, 'id': None, 'amount': None})
            except Exception:
                pass

        elif module == 'accounting':
            try:
                from accounting.models import JournalEntry
                e = JournalEntry.objects.select_related('journal').prefetch_related('lines__account').get(pk=did)
                detail = {'title': f'Lançamento {e.number}', 'fields': {
                    'Diário': e.journal.name, 'Data': e.entry_date.isoformat(),
                    'Descrição': e.description, 'Referência': e.reference or '—',
                    'Total Débito': str(e.total_debit), 'Total Crédito': str(e.total_credit),
                    'Estado': e.get_status_display()},
                    'items': [f'{l.account.code} {l.account.name}: {"D " + str(l.debit) if l.debit else "C " + str(l.credit)}' for l in e.lines.all()]}
                if e.source and e.reference:
                    links.append({'category': e.source, 'label': f'Documento de origem ({e.source})',
                                  'number': e.reference, 'module': None, 'id': None, 'amount': None})
            except Exception:
                pass

        elif module == 'pms':
            try:
                from pms.models import Folio
                f = Folio.objects.select_related('reservation__guest', 'reservation__room').prefetch_related('charges').get(pk=did)
                res = f.reservation
                detail = {'title': f'Folio {f.number}', 'fields': {
                    'Hóspede': res.guest.full_name if res and res.guest else '—',
                    'Quarto': res.room.number if res and res.room else '—',
                    'Saldo': str(f.balance), 'Estado': f.get_status_display(),
                    'Fatura': f.invoice_number or '—'},
                    'items': [f'{c.get_charge_type_display()}: {c.description} = {c.amount}' for c in f.charges.all()]}
                if res:
                    links.append({'category': 'PMS', 'label': 'Reserva', 'number': res.confirmation,
                                  'module': 'pms', 'id': str(res.id), 'amount': str(res.rate)})
            except Exception:
                pass

        return Response({'detail': detail, 'links': links})


class DocumentCenterDashboardView(APIView):
    """GET /api/documents/dashboard/ — indicadores do dia por área."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        d = {'date': today.isoformat(), 'invoices': 0, 'commercial': 0, 'pos_sales': 0,
             'checkins': 0, 'checkouts': 0, 'purchases': 0, 'stock_moves': 0, 'voided': 0, 'total_today': 0}
        try:
            from fiscal.models import FiscalDocument, CommercialDocument
            d['invoices'] = FiscalDocument.objects.filter(doc_date=today).count()
            d['voided'] = FiscalDocument.objects.filter(status='A').count()
            d['commercial'] = CommercialDocument.objects.filter(doc_date=today).count()
        except Exception:
            pass
        try:
            from pos.models import POSTicket
            d['pos_sales'] = POSTicket.objects.filter(status='PAID', closed_at__date=today).count()
        except Exception:
            pass
        try:
            from pms.models import Reservation
            d['checkins'] = Reservation.objects.filter(status='CHECKED_IN', checked_in_at__date=today).count()
            d['checkouts'] = Reservation.objects.filter(status='CHECKED_OUT', checked_out_at__date=today).count()
        except Exception:
            pass
        try:
            from finance.models import SupplierInvoice
            d['purchases'] = SupplierInvoice.objects.filter(date=today).count()
        except Exception:
            pass
        try:
            from inventory.models import StockMovement
            d['stock_moves'] = StockMovement.objects.filter(created_at__date=today).count()
        except Exception:
            pass
        d['total_today'] = d['invoices'] + d['commercial'] + d['pos_sales'] + d['purchases'] + d['stock_moves']
        return Response(d)
