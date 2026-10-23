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
    """(Conta) "É de movimento" — só contas de movimento recebem lançamentos.

    Lançar na agregadora (a "31" em vez da "31.1.2") faz o balancete somar o mesmo
    valor duas vezes. Se a conta mapeada for agregadora, o lançamento é recusado já
    aqui — não à meia-noite, no fecho, quando ninguém sabe porquê.
    """
    mp = mp or _mapping()
    code = mp.get(key)
    conta = Account.objects.filter(code=code).first() if code else None
    if conta is not None and hasattr(conta, 'is_movement') and not conta.is_movement:
        raise ValueError(f'A conta {conta.code} é agregadora — o mapeamento tem de '
                         f'apontar para uma conta de movimento.')
    return conta


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
def _valores_a_lancar(ticket):
    """(bruto, líquido, imposto) que a contabilidade tem de lançar por este ticket.

    A CONTABILIDADE TEM DE DIZER O MESMO QUE A FACTURA. É a mesma venda: se o
    razão e o documento fiscal discordarem, um dos dois está a mentir à AGT.

    O cálculo directo — `líquido = grand_total − tax_total` — está errado sempre
    que houver DESCONTO de mesa, porque os dois campos do ticket falam de bases
    diferentes: o `tax_total` é o IVA do bruto ANTES do desconto, e o
    `grand_total` já vem descontado. Numa conta de 11.400 Kz a 14% com 10% de
    desconto, a factura cobra 10.260 (base 9.000 + IVA 1.260), mas a conta
    directa dava base 8.860 e IVA 1.400: 140 Kz de imposto a mais creditados na
    conta 2431 (IVA a pagar ao Estado) e 140 Kz de receita a menos no razão.

    Por ordem de confiança:
      1. O DOCUMENTO FISCAL já emitido para este ticket — é o que foi declarado.
      2. Sem documento (emissão automática desligada), parte-se do ticket e
         aplica-se ao IVA a mesma proporção do desconto.
    """
    grand = Decimal(str(ticket.grand_total or 0))
    tax = Decimal(str(ticket.tax_total or 0))
    try:
        from fiscal.integration import existing_for
        doc = existing_for('pos', ticket.id)
    except Exception:
        doc = None
    if doc is not None:
        liq, imp = Decimal(str(doc.net_total or 0)), Decimal(str(doc.tax_total or 0))
        return liq + imp, liq, imp
    bruto_linhas = Decimal('0')
    try:
        for l in ticket.lines.filter(is_void=False).select_related('item'):
            bruto_linhas += Decimal(str(l.line_total or 0))
    except Exception:
        bruto_linhas = Decimal('0')
    if bruto_linhas > 0 and grand > 0 and grand != bruto_linhas:
        tax = (tax * grand / bruto_linhas).quantize(Decimal('0.01'))
    return grand, grand - tax, tax


def post_pos_ticket(ticket, autopost=True, by=None):
    if _exists('POS', ticket.ticket_number):
        return None
    mp = _mapping()
    grand, net, tax = _valores_a_lancar(ticket)
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
def rascunhos_por_lancar():
    """Lançamentos AUTOMÁTICOS que ficaram em RASCUNHO — e que ninguém vê.

    Quando o auto-posting não consegue lançar (período fechado, conta do mapa em
    falta), `_make_entry` deixa o movimento em RASCUNHO em vez de o perder. Até
    aqui ninguém o procurava: a lista de pendências dava o documento como "já
    contabilizado" (porque existe um lançamento) e os relatórios ignoram-no
    (porque não está LANÇADO). O documento desaparecia dos dois lados — receita
    por contabilizar sem uma única linha errada à vista, que é o pior tipo de
    erro: não se vê, só falta.
    """
    return [{'ref': e.reference, 'number': e.number, 'source': e.source,
             'date': e.entry_date.isoformat(), 'amount': float(e.total_debit),
             'description': e.description}
            for e in (JournalEntry.objects.filter(status='DRAFT').exclude(source='MANUAL')
                      .prefetch_related('lines').order_by('entry_date', 'id'))]


def lancar_rascunhos(by=None):
    """Tenta lançar os rascunhos que ficaram para trás. Devolve quantos lançou.

    Corre-se depois de resolver o que os bloqueava (reabrir o período, corrigir o
    mapa de contas). Nunca duplica: o lançamento já existe, só lhe falta ser lançado.
    """
    lancados = 0
    for e in JournalEntry.objects.filter(status='DRAFT').exclude(source='MANUAL'):
        try:
            e.post(by=by)
            lancados += 1
        except Exception:
            continue        # continua bloqueado; fica na lista para a próxima
    return lancados


def _pending():
    """Documentos ainda sem lançamento contabilístico, por origem."""
    posted_refs = set(JournalEntry.objects.exclude(status='REVERSED')
                      .exclude(reference__isnull=True).values_list('reference', flat=True))
    # 'drafts' — os lançamentos que ficaram em rascunho. Não se somam às outras
    # listas (o documento já tem lançamento, só não está lançado), mas têm de
    # aparecer em algum sítio, senão ficam esquecidos para sempre.
    out = {'pos': [], 'purchase': [], 'treasury': [], 'drafts': rascunhos_por_lancar()}
    try:
        from pos.models import POSTicket
        for t in POSTicket.objects.filter(status='PAID').order_by('-opened_at')[:500]:
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
    # Primeiro recupera o que ficou em rascunho de corridas anteriores (período
    # que já reabriu, mapa de contas já corrigido) — senão esses documentos nunca
    # mais eram lançados: `_exists` vê o rascunho e não gera nada de novo.
    created = lancar_rascunhos(by) if autopost else 0
    if 'pos' in sources:
        try:
            from pos.models import POSTicket
            for t in POSTicket.objects.filter(status='PAID'):
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
