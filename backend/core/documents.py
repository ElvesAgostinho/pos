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
            # A RECEÇÃO DE MERCADORIA É UM DOCUMENTO, e faltava aqui.
            #
            # Em "Compras" só aparecia a factura do fornecedor — o papel que chega
            # no FIM. O que entrou em armazém (a guia, o GRN), a encomenda que a
            # pediu e a requisição que a originou não se encontravam pelo número:
            # quem precisava de responder "esta mercadoria, de que guia veio e quem
            # a pediu?" tinha de ir ecrã a ecrã. Num arquivo documental, é
            # precisamente essa a pergunta.
            try:
                from procurement.models import GoodsReceipt, PurchaseOrder, PurchaseRequisition
                gr = GoodsReceipt.objects.select_related('supplier', 'delivery_warehouse')
                if q:
                    gr = gr.filter(Q(receipt_number__icontains=q)
                                   | Q(supplier__commercial_name__icontains=q)
                                   | Q(supplier_invoice_ref__icontains=q))
                for d in gr.order_by('-receipt_date')[:limit]:
                    rows.append(_row('COMPRAS', 'Receção de Mercadoria', d.receipt_number,
                                     d.receipt_date.date() if hasattr(d.receipt_date, 'date') else d.receipt_date,
                                     d.supplier.commercial_name if d.supplier_id else '—',
                                     None, d.get_status_display(), 'procurement_grn', str(d.id)))
                po = PurchaseOrder.objects.select_related('supplier')
                if q:
                    po = po.filter(Q(po_number__icontains=q)
                                   | Q(supplier__commercial_name__icontains=q))
                for d in po.order_by('-issue_date', '-id')[:limit]:
                    rows.append(_row('COMPRAS', 'Ordem de Compra', d.po_number, d.issue_date,
                                     d.supplier.commercial_name if d.supplier_id else '—',
                                     d.total_amount, d.get_status_display(), 'procurement_po', str(d.id)))
                pr = PurchaseRequisition.objects.all()
                if q:
                    pr = pr.filter(Q(number__icontains=q) | Q(requester__icontains=q))
                for d in pr.order_by('-id')[:limit]:
                    rows.append(_row('COMPRAS', 'Requisição de Compra', d.number,
                                     getattr(d, 'created_at', None) and d.created_at.date(),
                                     d.requester or '—', None, d.get_status_display(),
                                     'procurement_req', str(d.id)))
            except Exception:
                pass
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
            # OS MOVIMENTOS NÃO SÃO OS DOCUMENTOS.
            #
            # Aqui só havia `StockMovement` — as LINHAS do ledger. Procurar pelo
            # número de um documento de stock encontrava os movimentos que ele
            # gerou, mas não o documento: sem estado, sem total, sem saber se foi
            # anulado, sem o poder abrir. E uma entrada anulada deixa movimentos
            # dos dois lados, que sem o documento por trás parecem mercadoria a
            # entrar e a sair sem razão.
            try:
                from pos.models import StockDoc
                sd = StockDoc.objects.select_related('series', 'warehouse', 'entity')
                if q:
                    sd = sd.filter(Q(number__icontains=q) | Q(external_ref__icontains=q)
                                   | Q(entity__name__icontains=q) | Q(series__name__icontains=q))
                for d in sd.order_by('-doc_date', '-id')[:limit]:
                    estado = ('Anulado' if d.voided else
                              'Lançado' if d.posted else 'Por lançar')
                    rows.append(_row('STOCK', d.series.name, d.number, d.doc_date,
                                     (d.entity.name if d.entity_id else None) or d.warehouse.name,
                                     d.total, estado, 'pos_stockdoc', str(d.id)))
            except Exception:
                pass
            try:
                # As ordens de produção: o que a cozinha transformou, com o custo
                # que se formou. É um documento como os outros — tem número,
                # estado e valor — e não estava em sítio nenhum do arquivo.
                from inventory.models import ProductionOrder
                op = ProductionOrder.objects.select_related('item', 'warehouse')
                if q:
                    op = op.filter(Q(number__icontains=q) | Q(item__code__icontains=q)
                                   | Q(item__name__icontains=q) | Q(lot_number__icontains=q))
                for d in op.order_by('-created_at')[:limit]:
                    rows.append(_row('STOCK', 'Ordem de Produção', d.number,
                                     d.created_at.date() if d.created_at else None,
                                     f'{d.item.code} · {d.item.name}', d.total_cost,
                                     d.get_status_display(), 'inventory_production', str(d.id)))
            except Exception:
                pass
            try:
                # Transferências e contagens do Centro de Armazém (Centro 09).
                from inventory.models import InventoryCount, StockTransfer
                tr = StockTransfer.objects.select_related('source', 'destination')
                if q:
                    tr = tr.filter(Q(number__icontains=q) | Q(source__name__icontains=q)
                                   | Q(destination__name__icontains=q))
                for d in tr.order_by('-created_at')[:limit]:
                    rows.append(_row('STOCK', 'Transferência', d.number,
                                     d.created_at.date() if d.created_at else None,
                                     f'{d.source.name} → {d.destination.name}', None,
                                     d.get_status_display(), 'inventory_transfer', str(d.id)))
                ic = InventoryCount.objects.select_related('warehouse')
                if q:
                    ic = ic.filter(Q(number__icontains=q) | Q(warehouse__name__icontains=q))
                for d in ic.order_by('-created_at')[:limit]:
                    rows.append(_row('STOCK', 'Contagem de Inventário', d.number,
                                     d.created_at.date() if d.created_at else None,
                                     d.warehouse.name, None, d.get_status_display(),
                                     'inventory_count', str(d.id)))
            except Exception:
                pass
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

        elif module in ('procurement_grn', 'procurement_po', 'procurement_req',
                        'pos_stockdoc', 'inventory_production', 'inventory_transfer',
                        'inventory_count', 'finance'):
            # O SILÊNCIO QUE ISTO TIRA.
            #
            # O centro listava linhas marcadas como `inventory` e `finance`, e esta
            # vista só conhecia quatro módulos (pos, fiscal, accounting, pms). Para
            # os outros caía no fim e devolvia `{}` — o painel abria VAZIO. Como
            # tudo aqui vive dentro de um try/except, não dava erro nenhum: dava
            # silêncio, que é pior, porque parece que o documento não tem nada.
            detalhe, ligados = _detalhe_de(module, did)
            detail, links = detalhe, ligados

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


def _detalhe_de(module, did):
    """O painel de um documento das famílias de COMPRAS e de STOCK.

    Cada família responde às mesmas três perguntas — o que é, quanto vale, o que
    tem dentro — e aponta para os documentos ligados: a receção aponta para a
    encomenda e para os movimentos de stock que gerou, a ordem de produção para o
    que consumiu, o documento de stock para o seu ledger.
    """
    detalhe, ligados = {}, []

    def movimentos_de(referencia):
        """Os movimentos de stock que este documento gerou — o seu rasto."""
        try:
            from inventory.models import StockMovement
            for m in StockMovement.objects.select_related('item').filter(reference=referencia)[:50]:
                ligados.append({'category': 'STOCK', 'label': m.get_movement_type_display(),
                                'number': f'{m.item.code} · {m.quantity}', 'module': None,
                                'id': None, 'amount': str(m.quantity)})
        except Exception:
            pass

    try:
        if module == 'procurement_grn':
            from procurement.models import GoodsReceipt
            d = (GoodsReceipt.objects.select_related('supplier', 'delivery_warehouse',
                                                      'purchase_order')
                 .prefetch_related('lines__item', 'lines__uom').get(pk=did))
            detalhe = {'title': f'Receção {d.receipt_number}', 'fields': {
                'Fornecedor': d.supplier.commercial_name if d.supplier_id else '—',
                'Guia/Factura do fornecedor': d.supplier_invoice_ref or '—',
                'Armazém de entrega': d.delivery_warehouse.name,
                'Estado': d.get_status_display(),
                'Data': d.receipt_date.strftime('%Y-%m-%d %H:%M') if d.receipt_date else '—'},
                'items': [f'{l.quantity_received} {l.uom.code} de {l.item.name}'
                          + (f' · lote {l.lot_number}' if l.lot_number else '')
                          + (f' · validade {l.expiry_date}' if l.expiry_date else '')
                          for l in d.lines.all()]}
            if d.purchase_order_id:
                ligados.append({'category': 'COMPRAS', 'label': 'Ordem de compra',
                                'number': d.purchase_order.po_number, 'module': 'procurement_po',
                                'id': str(d.purchase_order_id),
                                'amount': str(d.purchase_order.total_amount)})
            movimentos_de(d.receipt_number)

        elif module == 'procurement_po':
            from procurement.models import PurchaseOrder
            d = (PurchaseOrder.objects.select_related('supplier')
                 .prefetch_related('lines__item', 'receipts').get(pk=did))
            detalhe = {'title': f'Ordem de compra {d.po_number}', 'fields': {
                'Fornecedor': d.supplier.commercial_name if d.supplier_id else '—',
                'Estado': d.get_status_display(), 'Total': str(d.total_amount),
                'Emitida': d.issue_date.isoformat() if d.issue_date else '—',
                'Entrega prevista': d.expected_delivery_date.isoformat()
                                    if d.expected_delivery_date else '—'},
                'items': [f'{l.quantity_requested} x {l.item.name} @ {l.unit_price}'
                          for l in d.lines.all()]}
            for r in d.receipts.all():
                ligados.append({'category': 'COMPRAS', 'label': 'Receção', 'number': r.receipt_number,
                                'module': 'procurement_grn', 'id': str(r.id), 'amount': None})

        elif module == 'procurement_req':
            from procurement.models import PurchaseRequisition
            d = PurchaseRequisition.objects.prefetch_related('lines__item').get(pk=did)
            detalhe = {'title': f'Requisição {d.number}', 'fields': {
                'Requisitante': d.requester or '—', 'Aprovador': d.approver or '—',
                'Estado': d.get_status_display(), 'Observações': d.notes or '—'},
                'items': [f'{l.quantity} x {l.item.name}' for l in d.lines.all()]}

        elif module == 'pos_stockdoc':
            from pos.models import StockDoc
            d = (StockDoc.objects.select_related('series', 'warehouse', 'warehouse_from', 'entity')
                 .prefetch_related('lines__item').get(pk=did))
            detalhe = {'title': f'{d.series.name} {d.number}', 'fields': {
                'Série': f'{d.series.code} · {d.series.name}',
                'Armazém': d.warehouse.name,
                'Origem': d.warehouse_from.name if d.warehouse_from_id else '—',
                'Entidade': d.entity.name if d.entity_id else '—',
                'Total': str(d.total),
                'Estado': 'Anulado' if d.voided else ('Lançado' if d.posted else 'Por lançar'),
                'Data': d.doc_date.isoformat() if d.doc_date else '—'},
                'items': [f'{l.quantity} x {l.item.name} @ {l.unit_cost}'
                          + (f' · lote {l.lot}' if l.lot else '') for l in d.lines.all()]}
            movimentos_de(d.number)

        elif module == 'inventory_production':
            from inventory.models import ProductionOrder
            d = (ProductionOrder.objects.select_related('item', 'warehouse')
                 .prefetch_related('consumptions__item').get(pk=did))
            detalhe = {'title': f'Ordem de produção {d.number}', 'fields': {
                'Produzido': f'{d.item.code} · {d.item.name}', 'Quantidade': str(d.quantity),
                'Armazém': d.warehouse.name, 'Estado': d.get_status_display(),
                'Lote': d.lot_number or d.number,
                'Validade': d.expiry_date.isoformat() if d.expiry_date else '—',
                'Custo unitário': str(d.unit_cost), 'Custo total': str(d.total_cost)},
                'items': [f'{c.quantity} x {c.item.name} @ {c.unit_cost} = {c.total_cost}'
                          for c in d.consumptions.all()]}
            movimentos_de(d.number)

        elif module == 'inventory_transfer':
            from inventory.models import StockTransfer
            d = (StockTransfer.objects.select_related('source', 'destination')
                 .prefetch_related('lines__item').get(pk=did))
            detalhe = {'title': f'Transferência {d.number}', 'fields': {
                'Origem': d.source.name, 'Destino': d.destination.name,
                'Estado': d.get_status_display(), 'Observações': d.note or '—'},
                'items': [f'{l.quantity} x {l.item.name}' for l in d.lines.all()]}
            movimentos_de(d.number)

        elif module == 'inventory_count':
            from inventory.models import InventoryCount
            d = (InventoryCount.objects.select_related('warehouse')
                 .prefetch_related('lines__item').get(pk=did))
            detalhe = {'title': f'Contagem {d.number}', 'fields': {
                'Armazém': d.warehouse.name, 'Estado': d.get_status_display(),
                'Observações': d.note or '—',
                'Confirmada': d.confirmed_at.strftime('%Y-%m-%d %H:%M') if d.confirmed_at else '—'},
                'items': [f'{l.item.name}: sistema {l.system_qty} · contado {l.counted_qty}'
                          for l in d.lines.all()]}
            movimentos_de(d.number)

        elif module == 'finance':
            # Recebimentos, pagamentos e facturas de fornecedor — as três famílias
            # que a Tesouraria e as Compras listam com este módulo.
            from finance.models import PaymentVoucher, Receipt, SupplierInvoice
            for modelo, titulo in ((Receipt, 'Recebimento'), (PaymentVoucher, 'Pagamento'),
                                   (SupplierInvoice, 'Factura de fornecedor')):
                d = modelo.objects.filter(pk=did).first()
                if d is None:
                    continue
                campos = {'Nº': d.number,
                          'Data': d.date.isoformat() if getattr(d, 'date', None) else '—',
                          'Valor': str(getattr(d, 'amount', '') or '')}
                for chave, atributo in (('Entidade', 'party_name'),
                                        ('Fornecedor', 'supplier_name'),
                                        ('Estado', 'status')):
                    valor = getattr(d, atributo, None)
                    if valor:
                        campos[chave] = str(valor)
                detalhe = {'title': f'{titulo} {d.number}', 'fields': campos, 'items': []}
                break
    except Exception:
        pass
    return detalhe, ligados


class DocumentCenterDashboardView(APIView):
    """GET /api/documents/dashboard/ — indicadores do dia por área."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        d = {'date': today.isoformat(), 'invoices': 0, 'commercial': 0, 'pos_sales': 0,
             'checkins': 0, 'checkouts': 0, 'purchases': 0, 'stock_moves': 0, 'voided': 0,
             'receipts': 0, 'production': 0, 'stock_docs': 0, 'total_today': 0}
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
        try:
            # A mercadoria que ENTROU hoje e o que a cozinha produziu hoje: dois
            # números que o dono procura no painel e que não estavam lá.
            from procurement.models import GoodsReceipt
            d['receipts'] = GoodsReceipt.objects.filter(receipt_date__date=today).count()
        except Exception:
            d['receipts'] = 0
        try:
            from inventory.models import ProductionOrder
            d['production'] = ProductionOrder.objects.filter(status='DONE',
                                                             produced_at__date=today).count()
        except Exception:
            d['production'] = 0
        try:
            from pos.models import StockDoc
            d['stock_docs'] = StockDoc.objects.filter(doc_date=today, voided=False).count()
        except Exception:
            d['stock_docs'] = 0
        d['total_today'] = (d['invoices'] + d['commercial'] + d['pos_sales'] + d['purchases']
                            + d['stock_moves'] + d['receipts'] + d['production']
                            + d['stock_docs'])
        return Response(d)
