"""
Auto-posting — transforma documentos de negócio em lançamentos contabilísticos.

Regras (dupla entrada), idempotentes por (source, reference):
- Venda POS:        Dr Caixa POS (grand_total) | Cr Vendas/Serviço (líquido) + Cr IVA liquidado
- Fatura fornecedor: Dr Compras/Existências (total) | Cr Fornecedores (total)
- Recebimento:      Dr Caixa/Banco | Cr Clientes
- Pagamento:        Dr Fornecedores | Cr Caixa/Banco

O mapa de contas (chave → código) é PARAMETRIZÁVEL via GlobalConfig('accounting_mapping').
POS e finance são módulos opcionais: importados de forma tolerante.
"""
from decimal import Decimal

from django.db import transaction

from .models import Account, Journal, FiscalPeriod, JournalEntry, JournalEntryLine

DEFAULT_MAP = {
    'CASH': '111', 'POS_CASH': '112', 'BANK': '121',
    'CLIENTS': '211', 'SUPPLIERS': '221',
    'VAT_PAYABLE': '2431', 'VAT_DEDUCTIBLE': '2432',
    'SALES_SERVICE': '622', 'SALES_GOODS': '611', 'PURCHASES': '31',
}


def _mapping():
    try:
        from core.models import GlobalConfig
        cfg = GlobalConfig.objects.filter(key='accounting_mapping').first()
        if cfg and cfg.value:
            return {**DEFAULT_MAP, **cfg.value}
    except Exception:
        pass
    return DEFAULT_MAP


def _acc(key, mp=None):
    mp = mp or _mapping()
    code = mp.get(key)
    return Account.objects.filter(code=code).first() if code else None


def _journal(jtype):
    return Journal.objects.filter(journal_type=jtype).first() or Journal.objects.filter(journal_type='GENERAL').first()


def _period(d):
    return FiscalPeriod.objects.filter(start_date__lte=d, end_date__gte=d).first()


def _next_number():
    n = JournalEntry.objects.count() + 1
    while JournalEntry.objects.filter(number=f'LC{n:06d}').exists():
        n += 1
    return f'LC{n:06d}'


def _exists(source, reference):
    return JournalEntry.objects.filter(source=source, reference=reference).exclude(status='REVERSED').exists()


@transaction.atomic
def _make_entry(journal, date, description, source, reference, lines, autopost=True, by=None):
    """lines = [(account, debit, credit), ...]. Cria e (opcional) lança."""
    if not journal:
        return None, 'Sem diário configurado.'
    valid = [ln for ln in lines if ln[0] and (ln[1] or ln[2])]
    if not valid:
        return None, 'Sem contas mapeadas.'
    entry = JournalEntry.objects.create(
        number=_next_number(), journal=journal, period=_period(date), entry_date=date,
        description=description[:255], reference=reference, source=source,
        status='DRAFT', created_by=by)
    for ln in valid:
        acc, d, c = ln[0], ln[1], ln[2]
        cc = ln[3] if len(ln) > 3 else None      # centro de custo (conta analítica)
        JournalEntryLine.objects.create(entry=entry, account=acc,
                                        debit=Decimal(str(d or 0)), credit=Decimal(str(c or 0)),
                                        cost_center=cc)
    if autopost:
        try:
            entry.post(by=by)
        except Exception as e:  # noqa — fica em rascunho se não saldar
            return entry, str(e)
    return entry, None


# ------------------------- Geradores por documento -------------------------
def post_pos_ticket(ticket, autopost=True, by=None):
    if _exists('POS', ticket.ticket_number):
        return None
    mp = _mapping()
    grand = Decimal(str(ticket.grand_total or 0))
    tax = Decimal(str(ticket.tax_total or 0))
    net = grand - tax
    vendas = _acc('SALES_SERVICE', mp)

    # A receita reparte-se pelas CONTAS ANALÍTICAS dos artigos (centro de custo).
    # Sem isto, o bar e o restaurante caíam ambos na conta "Vendas" e ninguém sabia
    # qual dos dois dava lucro. O artigo sem conta analítica vai para a do outlet.
    por_cc = {}
    for l in ticket.lines.filter(is_void=False).select_related('item'):
        cc = (getattr(l.item, 'analytic_account_sale', None) or ticket.outlet.code)
        bruto = Decimal(str(l.line_total or 0))
        taxa = Decimal(str(l.tax_percentage or 0))
        liq = bruto / (Decimal('1') + taxa / Decimal('100')) if taxa > 0 else bruto
        por_cc[cc] = por_cc.get(cc, Decimal('0')) + liq

    lines = [(_acc('POS_CASH', mp), grand, 0, None)]
    if por_cc and net > 0:
        # Reparte o líquido REAL (já com desconto) na proporção de cada conta analítica.
        total_cc = sum(por_cc.values()) or Decimal('1')
        acumulado = Decimal('0')
        itens = list(por_cc.items())
        for i, (cc, v) in enumerate(itens):
            parte = (net - acumulado) if i == len(itens) - 1 else (net * v / total_cc).quantize(Decimal('0.01'))
            acumulado += parte
            lines.append((vendas, 0, parte, cc))
    else:
        lines.append((vendas, 0, net, None))
    lines.append((_acc('VAT_PAYABLE', mp), 0, tax, None))
    entry, _ = _make_entry(_journal('SALES'), ticket.closed_at.date() if ticket.closed_at else ticket.opened_at.date(),
                           f'Venda POS {ticket.ticket_number}', 'POS', ticket.ticket_number, lines, autopost, by)
    return entry


def post_supplier_invoice(inv, autopost=True, by=None):
    if _exists('PURCHASE', inv.number):
        return None
    mp = _mapping()
    total = Decimal(str(inv.amount or 0))
    tax = Decimal(str(getattr(inv, 'tax_amount', 0) or 0))
    net = total - tax
    # Dr Compras/Existências (líquido) + Dr IVA dedutível (imposto) | Cr Fornecedores (total)
    lines = [(_acc('PURCHASES', mp), net, 0)]
    if tax > 0:
        lines.append((_acc('VAT_DEDUCTIBLE', mp), tax, 0))
    lines.append((_acc('SUPPLIERS', mp), 0, total))
    entry, _ = _make_entry(_journal('PURCHASES'), inv.date, f'Fatura {inv.supplier_name} {inv.number}',
                           'PURCHASE', inv.number, lines, autopost, by)
    return entry


def post_receipt(r, autopost=True, by=None):
    if _exists('TREASURY', f'REC-{r.number}'):
        return None
    mp = _mapping()
    amt = Decimal(str(r.amount or 0))
    money = _acc('BANK', mp) if getattr(r.account, 'account_type', 'CASH') == 'BANK' else _acc('CASH', mp)
    lines = [(money, amt, 0), (_acc('CLIENTS', mp), 0, amt)]
    entry, _ = _make_entry(_journal('CASH'), r.date, f'Recebimento {r.party_name} {r.number}',
                           'TREASURY', f'REC-{r.number}', lines, autopost, by)
    return entry


def post_payment(p, autopost=True, by=None):
    if _exists('TREASURY', f'PAG-{p.number}'):
        return None
    mp = _mapping()
    amt = Decimal(str(p.amount or 0))
    money = _acc('BANK', mp) if getattr(p.account, 'account_type', 'CASH') == 'BANK' else _acc('CASH', mp)
    lines = [(_acc('SUPPLIERS', mp), amt, 0), (money, 0, amt)]
    entry, _ = _make_entry(_journal('BANK'), p.date, f'Pagamento {p.party_name} {p.number}',
                           'TREASURY', f'PAG-{p.number}', lines, autopost, by)
    return entry


# ------------------------- Pendências e execução em lote -------------------------
def _pending():
    """Documentos ainda sem lançamento contabilístico, por origem."""
    posted_refs = set(JournalEntry.objects.exclude(status='REVERSED')
                      .exclude(reference__isnull=True).values_list('reference', flat=True))
    out = {'pos': [], 'purchase': [], 'treasury': []}
    try:
        from pos.models import POSTicket
        for t in POSTicket.objects.filter(status='CLOSED').order_by('-opened_at')[:500]:
            if t.ticket_number not in posted_refs:
                out['pos'].append({'ref': t.ticket_number, 'date': (t.closed_at or t.opened_at).date().isoformat(),
                                   'amount': float(t.grand_total or 0)})
    except Exception:
        pass
    try:
        from finance.models import SupplierInvoice, Receipt, PaymentVoucher
        for inv in SupplierInvoice.objects.all().order_by('-date')[:500]:
            if inv.number not in posted_refs:
                out['purchase'].append({'ref': inv.number, 'date': inv.date.isoformat(), 'amount': float(inv.amount or 0)})
        for r in Receipt.objects.filter(status='CONFIRMED').order_by('-date')[:500]:
            if f'REC-{r.number}' not in posted_refs:
                out['treasury'].append({'ref': r.number, 'kind': 'Recebimento', 'date': r.date.isoformat(), 'amount': float(r.amount or 0)})
        for p in PaymentVoucher.objects.filter(status='CONFIRMED').order_by('-date')[:500]:
            if f'PAG-{p.number}' not in posted_refs:
                out['treasury'].append({'ref': p.number, 'kind': 'Pagamento', 'date': p.date.isoformat(), 'amount': float(p.amount or 0)})
    except Exception:
        pass
    return out


def run_autopost(sources=None, autopost=True, by=None):
    """Gera lançamentos para todos os documentos pendentes das origens indicadas."""
    sources = sources or ['pos', 'purchase', 'treasury']
    created = 0
    if 'pos' in sources:
        try:
            from pos.models import POSTicket
            for t in POSTicket.objects.filter(status='CLOSED'):
                if post_pos_ticket(t, autopost, by):
                    created += 1
        except Exception:
            pass
    if 'purchase' in sources:
        try:
            from finance.models import SupplierInvoice
            for inv in SupplierInvoice.objects.all():
                if post_supplier_invoice(inv, autopost, by):
                    created += 1
        except Exception:
            pass
    if 'treasury' in sources:
        try:
            from finance.models import Receipt, PaymentVoucher
            for r in Receipt.objects.filter(status='CONFIRMED'):
                if post_receipt(r, autopost, by):
                    created += 1
            for p in PaymentVoucher.objects.filter(status='CONFIRMED'):
                if post_payment(p, autopost, by):
                    created += 1
        except Exception:
            pass
    return created
