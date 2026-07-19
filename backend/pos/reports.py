"""
MOTOR DE RELATÓRIOS DO POS — por pastas, como o original.

Um relatório é uma DEFINIÇÃO (pasta, nome, parâmetros) mais uma FUNÇÃO que produz
colunas + linhas + totais. Não há SQL escrito à mão em ecrãs: quem quiser um relatório
novo acrescenta-o aqui e ele aparece na pasta, com o formulário de parâmetros e a
impressão já feitos.

Porquê pastas e não uma lista: um sistema com 40 relatórios numa lista é um sistema
onde ninguém encontra nada. As pastas são as do negócio (Facturação, Caixa, F&B,
Eventos), não as da base de dados.
"""
from decimal import Decimal
from datetime import date, timedelta

from django.db import models
from django.db.models import Sum, Count, Avg, F, Q
from django.utils import timezone


def _hoje():
    return timezone.localdate()


def _periodo(p):
    """Todo o relatório tem um período. Sem ele, um relatório de vendas é o total
    da vida da empresa — que não serve para decidir nada."""
    ini = p.get('from') or str(_hoje() - timedelta(days=30))
    fim = p.get('to') or str(_hoje())
    return ini, fim


def _num(v):
    return Decimal(str(v or 0))


# ─────────────────────────────────────────────────── 06 · FACTURAÇÃO
def r_documentos(p):
    from fiscal.models import FiscalDocument
    ini, fim = _periodo(p)
    qs = (FiscalDocument.objects.filter(source_module='pos', doc_date__gte=ini, doc_date__lte=fim)
          .select_related('doc_type', 'series').order_by('doc_date', 'number'))
    if p.get('doc_type'):
        qs = qs.filter(doc_type__code=p['doc_type'])
    linhas = [{
        'invoice_no': d.invoice_no, 'date': str(d.doc_date), 'type': d.doc_type.code,
        'customer': d.customer_name, 'tax_id': d.customer_tax_id or '',
        'net': str(d.net_total), 'tax': str(d.tax_total), 'gross': str(d.gross_total),
        'status': 'Anulado' if d.status == 'A' else ('Liquidado' if d.settled else 'Por receber'),
    } for d in qs]
    return {
        'columns': [
            ('invoice_no', 'Documento'), ('date', 'Data'), ('type', 'Tipo'),
            ('customer', 'Cliente'), ('tax_id', 'NIF'),
            ('net', 'Incidência', 'money'), ('tax', 'IVA', 'money'),
            ('gross', 'Total', 'money'), ('status', 'Estado'),
        ],
        'rows': linhas,
        'totals': {'gross': str(sum((_num(l['gross']) for l in linhas), Decimal('0'))),
                   'tax': str(sum((_num(l['tax']) for l in linhas), Decimal('0'))),
                   'net': str(sum((_num(l['net']) for l in linhas), Decimal('0')))},
    }


def r_iva(p):
    """IVA LIQUIDADO POR TAXA — é o mapa que se leva à contabilidade e à AGT."""
    from fiscal.models import FiscalDocumentLine
    ini, fim = _periodo(p)
    linhas = (FiscalDocumentLine.objects
              .filter(document__source_module='pos', document__doc_date__gte=ini,
                      document__doc_date__lte=fim, document__status='N')
              .values('tax_percentage')
              .annotate(base=Sum('line_total'), imposto=Sum('tax_amount'), n=Count('id'))
              .order_by('tax_percentage'))
    rows = [{
        'rate': f"{l['tax_percentage']}%", 'lines': l['n'],
        'base': str(l['base'] or 0), 'tax': str(l['imposto'] or 0),
        'total': str(_num(l['base']) + _num(l['imposto'])),
    } for l in linhas]
    return {
        'columns': [('rate', 'Taxa'), ('lines', 'Linhas'), ('base', 'Incidência', 'money'),
                    ('tax', 'IVA liquidado', 'money'), ('total', 'Total', 'money')],
        'rows': rows,
        'totals': {'tax': str(sum((_num(r['tax']) for r in rows), Decimal('0'))),
                   'base': str(sum((_num(r['base']) for r in rows), Decimal('0')))},
    }


def r_anulacoes(p):
    """ANULAÇÕES E NOTAS DE CRÉDITO — o dinheiro que entrou e voltou a sair.
    É o primeiro sítio onde se vê um empregado a anular vendas depois de as cobrar."""
    from fiscal.models import FiscalDocument
    ini, fim = _periodo(p)
    qs = (FiscalDocument.objects
          .filter(source_module='pos', doc_date__gte=ini, doc_date__lte=fim)
          .filter(Q(status='A') | Q(doc_type__is_rectifying=True))
          .select_related('doc_type').order_by('-doc_date'))
    rows = [{
        'invoice_no': d.invoice_no, 'date': str(d.doc_date), 'type': d.doc_type.name,
        'operator': d.operator_name or '', 'customer': d.customer_name,
        'gross': str(d.gross_total), 'ref': d.reference_doc or '',
    } for d in qs]
    return {
        'columns': [('invoice_no', 'Documento'), ('date', 'Data'), ('type', 'Tipo'),
                    ('operator', 'Operador'), ('customer', 'Cliente'),
                    ('ref', 'Retifica'), ('gross', 'Valor', 'money')],
        'rows': rows,
        'totals': {'gross': str(sum((_num(r['gross']) for r in rows), Decimal('0')))},
    }


# ─────────────────────────────────────────────────── 07 · RECEITAS
def r_vendas_dia(p):
    from .models import POSTicket
    ini, fim = _periodo(p)
    qs = (POSTicket.objects.filter(status='PAID', closed_at__date__gte=ini, closed_at__date__lte=fim)
          .values('closed_at__date')
          .annotate(contas=Count('id'), total=Sum('grand_total'), pax=Sum('guests'))
          .order_by('closed_at__date'))
    rows = [{
        'date': str(l['closed_at__date']), 'tickets': l['contas'],
        'pax': l['pax'] or 0, 'total': str(l['total'] or 0),
        'avg': str(round(_num(l['total']) / l['contas'], 2)) if l['contas'] else '0',
    } for l in qs]
    return {
        'columns': [('date', 'Data'), ('tickets', 'Contas'), ('pax', 'Pax'),
                    ('total', 'Total', 'money'), ('avg', 'Ticket médio', 'money')],
        'rows': rows,
        'totals': {'total': str(sum((_num(r['total']) for r in rows), Decimal('0'))),
                   'tickets': sum(r['tickets'] for r in rows)},
    }


def r_vendas_artigo(p):
    from .models import POSTicketLine
    ini, fim = _periodo(p)
    qs = (POSTicketLine.objects
          .filter(ticket__status='PAID', is_void=False,
                  ticket__closed_at__date__gte=ini, ticket__closed_at__date__lte=fim)
          .values('item__code', 'item__name', 'item__subfamily__name')
          .annotate(qtd=Sum('quantity'), total=Sum('line_total'))
          .order_by('-total'))
    rows = [{
        'code': l['item__code'] or '', 'name': l['item__name'] or '',
        'subfamily': l['item__subfamily__name'] or '',
        'qty': str(l['qtd'] or 0), 'total': str(l['total'] or 0),
    } for l in qs]
    return {
        'columns': [('code', 'Código'), ('name', 'Artigo'), ('subfamily', 'Sub-família'),
                    ('qty', 'Quantidade'), ('total', 'Total', 'money')],
        'rows': rows,
        'totals': {'total': str(sum((_num(r['total']) for r in rows), Decimal('0')))},
    }


def r_vendas_familia(p):
    from .models import POSTicketLine
    ini, fim = _periodo(p)
    qs = (POSTicketLine.objects
          .filter(ticket__status='PAID', is_void=False,
                  ticket__closed_at__date__gte=ini, ticket__closed_at__date__lte=fim)
          .values('item__subfamily__family__group__name', 'item__subfamily__family__name')
          .annotate(qtd=Sum('quantity'), total=Sum('line_total'))
          .order_by('-total'))
    rows = [{
        'group': l['item__subfamily__family__group__name'] or '—',
        'family': l['item__subfamily__family__name'] or '—',
        'qty': str(l['qtd'] or 0), 'total': str(l['total'] or 0),
    } for l in qs]
    tot = sum((_num(r['total']) for r in rows), Decimal('0'))
    for r in rows:
        r['pct'] = f"{(_num(r['total']) / tot * 100):.1f}%" if tot else '0%'
    return {
        'columns': [('group', 'Grupo'), ('family', 'Família'), ('qty', 'Quantidade'),
                    ('total', 'Total', 'money'), ('pct', '% do total')],
        'rows': rows, 'totals': {'total': str(tot)},
    }


def r_vendas_operador(p):
    from .models import POSTicket
    ini, fim = _periodo(p)
    qs = (POSTicket.objects.filter(status='PAID', closed_at__date__gte=ini, closed_at__date__lte=fim)
          .values('operator_name')
          .annotate(contas=Count('id'), total=Sum('grand_total'), desconto=Sum('discount_total'))
          .order_by('-total'))
    rows = [{
        'operator': l['operator_name'] or '—', 'tickets': l['contas'],
        'total': str(l['total'] or 0), 'discount': str(l['desconto'] or 0),
        'avg': str(round(_num(l['total']) / l['contas'], 2)) if l['contas'] else '0',
    } for l in qs]
    return {
        'columns': [('operator', 'Operador'), ('tickets', 'Contas'),
                    ('total', 'Vendas', 'money'), ('discount', 'Descontos dados', 'money'),
                    ('avg', 'Ticket médio', 'money')],
        'rows': rows,
        'totals': {'total': str(sum((_num(r['total']) for r in rows), Decimal('0'))),
                   'discount': str(sum((_num(r['discount']) for r in rows), Decimal('0')))},
    }


def r_vendas_sector(p):
    from .models import POSTicket
    ini, fim = _periodo(p)
    qs = (POSTicket.objects.filter(status='PAID', closed_at__date__gte=ini, closed_at__date__lte=fim)
          .values('outlet__name')
          .annotate(contas=Count('id'), total=Sum('grand_total'))
          .order_by('-total'))
    rows = [{'outlet': l['outlet__name'] or '—', 'tickets': l['contas'],
             'total': str(l['total'] or 0)} for l in qs]
    return {
        'columns': [('outlet', 'Ponto de venda'), ('tickets', 'Contas'), ('total', 'Total', 'money')],
        'rows': rows,
        'totals': {'total': str(sum((_num(r['total']) for r in rows), Decimal('0')))},
    }


# ─────────────────────────────────────────────────── 09 · CAIXA
def r_caixas(p):
    from .models import CashSession
    ini, fim = _periodo(p)
    qs = (CashSession.objects.filter(opened_at__date__gte=ini, opened_at__date__lte=fim)
          .select_related('outlet').order_by('-opened_at'))
    rows = []
    for s in qs:
        vendas = s.tickets.filter(status='PAID').aggregate(t=Sum('grand_total'))['t'] or 0
        rows.append({
            'id': s.id, 'outlet': s.outlet.name if s.outlet_id else '—',
            'operator': s.operator_name,
            'opened': s.opened_at.strftime('%d/%m %H:%M'),
            'closed': s.closed_at.strftime('%d/%m %H:%M') if s.closed_at else '— ABERTA —',
            'float': str(s.opening_float), 'sales': str(vendas),
            'status': s.get_status_display() if hasattr(s, 'get_status_display') else s.status,
        })
    return {
        'columns': [('id', 'Sessão'), ('outlet', 'Ponto de venda'), ('operator', 'Operador'),
                    ('opened', 'Abertura'), ('closed', 'Fecho'),
                    ('float', 'Fundo', 'money'), ('sales', 'Vendas', 'money'), ('status', 'Estado')],
        'rows': rows,
        'totals': {'sales': str(sum((_num(r['sales']) for r in rows), Decimal('0')))},
    }


def r_movimentos_caixa(p):
    """SANGRIAS E REFORÇOS — o dinheiro que entra e sai da gaveta fora das vendas."""
    from .models import CashMovement
    ini, fim = _periodo(p)
    qs = (CashMovement.objects.filter(created_at__date__gte=ini, created_at__date__lte=fim)
          .select_related('session__outlet').order_by('-created_at'))
    rows = [{
        'date': m.created_at.strftime('%d/%m %H:%M'),
        'outlet': m.session.outlet.name if m.session and m.session.outlet_id else '—',
        'type': m.get_movement_type_display(), 'amount': str(m.amount),
        'reason': m.reason or '', 'by': m.created_by or '',
    } for m in qs]
    return {
        'columns': [('date', 'Data'), ('outlet', 'Ponto de venda'), ('type', 'Tipo'),
                    ('amount', 'Valor', 'money'), ('reason', 'Motivo'), ('by', 'Utilizador')],
        'rows': rows,
        'totals': {'amount': str(sum((_num(r['amount']) for r in rows), Decimal('0')))},
    }


def r_periodo_setor(p):
    """VENDAS POR PERÍODO — o 8611 da ficha do setor.

    A ficha de cada setor escolhe o seu período de reporting (as bandas horárias do
    backoffice). Este mapa soma as vendas por esse período: é como o dono compara o
    turno do almoço do Restaurante com o da noite do Lounge sem folhas de cálculo.
    Setores sem período escolhido aparecem como "(sem período)" — à vista, não escondidos.
    """
    from .models import POSTicket, PosSector, TimeBand
    ini, fim = _periodo(p)
    bandas = {b.id: b.name for b in TimeBand.objects.all()}
    porOutlet = {}
    for s_ in PosSector.objects.all():
        pr = (s_.params or {})
        porOutlet[s_.outlet_id] = (pr.get('8611') or pr.get(8611))
    grupos = {}
    for t in (POSTicket.objects.filter(status='PAID', closed_at__date__gte=ini,
                                       closed_at__date__lte=fim)
              .select_related('outlet')):
        banda = porOutlet.get(t.outlet_id)
        try:
            nome = bandas.get(int(banda), '(sem período)') if banda else '(sem período)'
        except Exception:
            nome = '(sem período)'
        g = grupos.setdefault(nome, {'period': nome, 'n': 0, 'total': Decimal('0')})
        g['n'] += 1
        g['total'] += (t.grand_total or Decimal('0'))
    rows = [{'period': g['period'], 'count': g['n'], 'total': str(g['total'])}
            for g in sorted(grupos.values(), key=lambda x: -x['total'])]
    tot = sum((_num(r['total']) for r in rows), Decimal('0'))
    return {
        'columns': [('period', 'Período (ficha do setor)'), ('count', 'Nº contas'),
                    ('total', 'Total', 'money')],
        'rows': rows, 'totals': {'total': str(tot)},
    }


def r_comprovativos(p):
    """COMPROVATIVOS DE PAGAMENTO — a referência de cada transferência, TPA e cheque.

    É o relatório da RECONCILIAÇÃO. O dinheiro de uma transferência entra na conta do
    banco dias depois e sem dizer de que venda veio: quem fecha o mês tem uma linha de
    8200 Kz no extrato e nada que a ligue a uma conta do restaurante. Esta lista é essa
    ligação — referência a referência, com a venda, a data e o valor ao lado.

    Só mostra os pagamentos QUE TÊM comprovativo: dinheiro não tem referência nenhuma e
    só faria ruído aqui.
    """
    from .models import POSTicketPayment
    from django.db.models import Q
    ini, fim = _periodo(p)
    qs = (POSTicketPayment.objects
          .filter(ticket__closed_at__date__gte=ini, ticket__closed_at__date__lte=fim)
          .filter(Q(bank_reference__isnull=False) | Q(auth_code__isnull=False)
                  | Q(document_number__isnull=False) | Q(room_ref__isnull=False))
          .exclude(bank_reference='', auth_code='', document_number='', room_ref='')
          .select_related('ticket', 'payment_method')
          .order_by('-created_at'))
    rows = []
    for x in qs:
        rows.append({
            'date': x.created_at.strftime('%d/%m/%Y %H:%M') if x.created_at else '',
            'ticket': x.ticket.ticket_number,
            'method': x.payment_method.name if x.payment_method else '—',
            'reference': x.bank_reference or '',
            'auth': x.auth_code or '',
            'document': x.document_number or '',
            'room': x.room_ref or '',
            'amount': str(x.amount or 0),
        })
    tot = sum((_num(r['amount']) for r in rows), Decimal('0'))
    return {
        'columns': [('date', 'Data'), ('ticket', 'Venda'), ('method', 'Modo de pagamento'),
                    ('reference', 'Referência bancária'), ('auth', 'Cód. autorização (TPA)'),
                    ('document', 'Nº documento'), ('room', 'Quarto'),
                    ('amount', 'Valor', 'money')],
        'rows': rows, 'totals': {'amount': str(tot)},
    }


def r_pagamentos(p):
    """VENDAS POR MODO DE PAGAMENTO — quanto entrou em dinheiro, em cartão, no quarto."""
    from .models import POSTicketPayment
    ini, fim = _periodo(p)
    qs = (POSTicketPayment.objects
          .filter(ticket__status='PAID', ticket__closed_at__date__gte=ini,
                  ticket__closed_at__date__lte=fim)
          .values('payment_method__name')
          .annotate(n=Count('id'), total=Sum('amount'))
          .order_by('-total'))
    rows = [{'method': l['payment_method__name'] or '—', 'count': l['n'],
             'total': str(l['total'] or 0)} for l in qs]
    tot = sum((_num(r['total']) for r in rows), Decimal('0'))
    for r in rows:
        r['pct'] = f"{(_num(r['total']) / tot * 100):.1f}%" if tot else '0%'
    return {
        'columns': [('method', 'Modo de pagamento'), ('count', 'Nº'),
                    ('total', 'Total', 'money'), ('pct', '%')],
        'rows': rows, 'totals': {'total': str(tot)},
    }


# ─────────────────────────────────────────────────── 19 · ESTATÍSTICAS
def r_horas_pico(p):
    """HORAS DE PICO — a que horas se vende. É o que decide as escalas do pessoal."""
    from .models import POSTicket
    ini, fim = _periodo(p)
    qs = POSTicket.objects.filter(status='PAID', closed_at__date__gte=ini, closed_at__date__lte=fim)
    balde = {}
    for t in qs:
        h = timezone.localtime(t.closed_at).hour if t.closed_at else 0
        b = balde.setdefault(h, {'n': 0, 'total': Decimal('0')})
        b['n'] += 1
        b['total'] += _num(t.grand_total)
    rows = [{'hour': f'{h:02d}:00', 'tickets': v['n'], 'total': str(v['total']),
             'avg': str(round(v['total'] / v['n'], 2)) if v['n'] else '0'}
            for h, v in sorted(balde.items())]
    return {
        'columns': [('hour', 'Hora'), ('tickets', 'Contas'), ('total', 'Vendas', 'money'),
                    ('avg', 'Ticket médio', 'money')],
        'rows': rows,
        'totals': {'total': str(sum((_num(r['total']) for r in rows), Decimal('0')))},
    }


def r_top_artigos(p):
    d = r_vendas_artigo(p)
    d['rows'] = d['rows'][:int(p.get('top') or 20)]
    return d


def r_anulacoes_linha(p):
    """ARTIGOS ANULADOS — o que se lançou e se tirou. Quebras, enganos… ou desvios."""
    from .models import POSTicketLine
    ini, fim = _periodo(p)
    # A linha não guarda data própria — a data é a da conta onde foi lançada.
    qs = (POSTicketLine.objects.filter(is_void=True, ticket__opened_at__date__gte=ini,
                                       ticket__opened_at__date__lte=fim)
          .select_related('item', 'ticket').order_by('-ticket__opened_at'))
    rows = [{
        'date': l.ticket.opened_at.strftime('%d/%m %H:%M') if l.ticket_id else '',
        'ticket': l.ticket.ticket_number if l.ticket_id else '',
        'operator': l.ticket.operator_name if l.ticket_id else '',
        'item': l.description, 'qty': str(l.quantity),
        'value': str(l.line_total), 'reason': l.note or '',
    } for l in qs]
    return {
        'columns': [('date', 'Data'), ('ticket', 'Conta'), ('operator', 'Operador'),
                    ('item', 'Artigo'), ('qty', 'Qtd'), ('value', 'Valor', 'money'),
                    ('reason', 'Motivo')],
        'rows': rows,
        'totals': {'value': str(sum((_num(r['value']) for r in rows), Decimal('0')))},
    }


# ─────────────────────────────────────────────────── 20 · CONTAS CORRENTES
def r_contas_correntes(p):
    from mdm.models import Customer
    from fiscal.models import FiscalDocument
    from .models import EntityDeposit
    rows = []
    for c in Customer.objects.all():
        docs = FiscalDocument.objects.filter(customer=c).select_related('doc_type')
        devido = sum((d.gross_total for d in docs
                      if not d.doc_type.is_rectifying and not d.settled), Decimal('0'))
        credito = sum((d.gross_total for d in docs if d.doc_type.is_rectifying), Decimal('0'))
        adiant = EntityDeposit.balance_of(c)
        saldo = devido - credito
        if saldo or adiant:
            rows.append({'name': c.name, 'tax_id': c.tax_id or '', 'contact': c.phone or c.email or '',
                         'balance': str(saldo), 'advance': str(adiant),
                         'blocked': 'Sim' if c.is_blocked else ''})
    rows.sort(key=lambda x: _num(x['balance']), reverse=True)
    return {
        'columns': [('name', 'Entidade'), ('tax_id', 'NIF'), ('contact', 'Contacto'),
                    ('balance', 'Saldo (Conta Corrente)', 'money'),
                    ('advance', 'Saldo (Cash Advance)', 'money'), ('blocked', 'Bloqueada')],
        'rows': rows,
        'totals': {'balance': str(sum((_num(r['balance']) for r in rows), Decimal('0'))),
                   'advance': str(sum((_num(r['advance']) for r in rows), Decimal('0')))},
    }


# ─────────────────────────────────────────────────── F&B
def r_compras(p):
    from .models import StockDoc
    ini, fim = _periodo(p)
    qs = (StockDoc.objects.filter(series__nature='PAYABLE', voided=False,
                                  doc_date__gte=ini, doc_date__lte=fim)
          .select_related('entity', 'series', 'warehouse'))
    rows = [{
        'number': d.number, 'date': str(d.doc_date),
        'entity': d.entity.name if d.entity_id else '—',
        'ref': d.external_ref or '', 'warehouse': d.warehouse.name if d.warehouse_id else '',
        'total': str(d.total), 'paid': 'Pago' if d.paid else 'Por pagar',
        'posted': 'Sim' if d.posted else 'Não',
    } for d in qs]
    return {
        'columns': [('number', 'Documento'), ('date', 'Data'), ('entity', 'Fornecedor'),
                    ('ref', 'Ref. fornecedor'), ('warehouse', 'Armazém'),
                    ('total', 'Total', 'money'), ('posted', 'No stock'), ('paid', 'Estado')],
        'rows': rows,
        'totals': {'total': str(sum((_num(r['total']) for r in rows), Decimal('0')))},
    }


def r_stock_valorizado(p):
    from inventory.models import StockLevel
    qs = StockLevel.objects.select_related('item', 'warehouse')
    if p.get('warehouse'):
        qs = qs.filter(warehouse_id=p['warehouse'])
    rows = []
    for n in qs:
        qtd = n.quantity_on_hand or Decimal('0')
        custo = n.item.current_average_cost or Decimal('0')
        rows.append({'code': n.item.code, 'name': n.item.name, 'warehouse': n.warehouse.name,
                     'qty': str(qtd), 'cost': str(custo), 'value': str(qtd * custo)})
    rows.sort(key=lambda x: _num(x['value']), reverse=True)
    return {
        'columns': [('code', 'Código'), ('name', 'Artigo'), ('warehouse', 'Armazém'),
                    ('qty', 'Quantidade'), ('cost', 'Custo médio', 'money'),
                    ('value', 'Valor', 'money')],
        'rows': rows,
        'totals': {'value': str(sum((_num(r['value']) for r in rows), Decimal('0')))},
    }


def r_quebras(p):
    """QUEBRAS DE INVENTÁRIO — a diferença entre o que se contou e o que devia lá estar.
    É o relatório mais desconfortável do hotel, e o mais necessário."""
    from .models import StockDoc
    ini, fim = _periodo(p)
    rows = []
    for d in (StockDoc.objects.filter(series__kind='INVENTORY', posted=True, voided=False,
                                      doc_date__gte=ini, doc_date__lte=fim)
              .prefetch_related('lines__item').select_related('warehouse')):
        for l in d.lines.all():
            dif = (l.quantity or Decimal('0')) - (l.theoretical_qty or Decimal('0'))
            if dif:
                rows.append({
                    'doc': d.number, 'date': str(d.doc_date),
                    'warehouse': d.warehouse.name if d.warehouse_id else '',
                    'responsible': d.responsible or d.created_by or '',
                    'item': l.item.name, 'theoretical': str(l.theoretical_qty),
                    'counted': str(l.quantity), 'diff': str(dif),
                    'value': str(dif * (l.theoretical_cost or Decimal('0'))),
                })
    rows.sort(key=lambda x: _num(x['value']))
    return {
        'columns': [('doc', 'Inventário'), ('date', 'Data'), ('warehouse', 'Armazém'),
                    ('responsible', 'Responsável'), ('item', 'Artigo'),
                    ('theoretical', 'Teórico'), ('counted', 'Contado'),
                    ('diff', 'Diferença'), ('value', 'Valor', 'money')],
        'rows': rows,
        'totals': {'value': str(sum((_num(r['value']) for r in rows), Decimal('0')))},
    }


def r_consumo(p):
    """CONSUMO POR ARTIGO — o que a venda tirou do armazém (fecha o ciclo)."""
    from inventory.models import StockMovement
    ini, fim = _periodo(p)
    qs = (StockMovement.objects.filter(movement_type__in=['OUT', 'CONSUMPTION'],
                                       created_at__date__gte=ini, created_at__date__lte=fim)
          .values('item__code', 'item__name')
          .annotate(qtd=Sum('quantity'), custo=Sum(F('quantity') * F('unit_cost')))
          .order_by('-qtd'))
    rows = [{'code': l['item__code'], 'name': l['item__name'],
             'qty': str(l['qtd'] or 0), 'cost': str(l['custo'] or 0)} for l in qs]
    return {
        'columns': [('code', 'Código'), ('name', 'Artigo'), ('qty', 'Quantidade consumida'),
                    ('cost', 'Custo', 'money')],
        'rows': rows,
        'totals': {'cost': str(sum((_num(r['cost']) for r in rows), Decimal('0')))},
    }



def r_margem(p):
    """MARGEM POR ARTIGO — quanto é que cada prato deixa MESMO.

    O preço de venda toda a gente sabe. O que ninguém sabe é o CUSTO: e o custo está
    aqui, no custo médio ponderado que as compras vão atualizando. Cruzando os dois,
    responde-se à pergunta que nenhum POS responde bem: *o hambúrguer dá lucro?*

    Um artigo com margem NEGATIVA está a ser vendido abaixo do custo — normalmente
    porque o fornecedor subiu o preço e ninguém mexeu na tabela.
    """
    from .models import POSTicketLine
    from inventory.models import Item
    ini, fim = _periodo(p)

    vendas = (POSTicketLine.objects
              .filter(ticket__status='PAID', is_void=False,
                      ticket__closed_at__date__gte=ini, ticket__closed_at__date__lte=fim)
              .values('item_id')
              .annotate(qtd=Sum('quantity'), receita=Sum('line_total')))

    itens = {i.id: i for i in Item.objects.filter(id__in=[v['item_id'] for v in vendas if v['item_id']])}
    rows = []
    for v in vendas:
        it = itens.get(v['item_id'])
        if not it:
            continue
        qtd = _num(v['qtd'])
        receita = _num(v['receita'])
        custo_un = _num(it.current_average_cost)
        custo = custo_un * qtd
        lucro = receita - custo
        margem = (lucro / receita * 100) if receita else Decimal('0')
        rows.append({
            'code': it.code, 'name': it.name,
            'qty': str(qtd),
            'price': str(round(receita / qtd, 2)) if qtd else '0',
            'cost': str(round(custo_un, 2)),
            'revenue': str(receita), 'total_cost': str(round(custo, 2)),
            'profit': str(round(lucro, 2)),
            'margin': f'{margem:.1f}%',
            'alert': 'ABAIXO DO CUSTO' if lucro < 0 else ('margem baixa' if margem < 20 else ''),
        })
    rows.sort(key=lambda r: _num(r['profit']), reverse=True)
    return {
        'columns': [('code', 'Código'), ('name', 'Artigo'), ('qty', 'Vendidos'),
                    ('price', 'Preço médio', 'money'), ('cost', 'Custo médio', 'money'),
                    ('revenue', 'Receita', 'money'), ('total_cost', 'Custo total', 'money'),
                    ('profit', 'Lucro', 'money'), ('margin', 'Margem'), ('alert', 'Aviso')],
        'rows': rows,
        'totals': {'revenue': str(sum((_num(r['revenue']) for r in rows), Decimal('0'))),
                   'total_cost': str(sum((_num(r['total_cost']) for r in rows), Decimal('0'))),
                   'profit': str(sum((_num(r['profit']) for r in rows), Decimal('0')))},
    }


# ─────────────────────────────────────────────────── EVENTOS
def r_eventos(p):
    from .models import EventRequest
    ini, fim = _periodo(p)
    qs = (EventRequest.objects.filter(start_at__date__gte=ini, start_at__date__lte=fim)
          .select_related('event_type', 'space', 'state', 'segment', 'channel', 'customer'))
    rows = [{
        'number': e.number, 'title': e.title,
        'customer': e.customer.name if e.customer_id else (e.contact_name or ''),
        'type': e.event_type.name if e.event_type_id else '',
        'space': e.space.name if e.space_id else '',
        'start': e.start_at.strftime('%d/%m %H:%M'), 'pax': e.pax,
        'state': e.state.name if e.state_id else '',
        'segment': e.segment.name if e.segment_id else '',
        'channel': e.channel.name if e.channel_id else '',
        'total': str(e.total), 'answered': 'Sim' if e.answered else 'Não',
    } for e in qs]
    return {
        'columns': [('number', 'Nº'), ('title', 'Evento'), ('customer', 'Entidade'),
                    ('type', 'Tipo'), ('space', 'Espaço'), ('start', 'Início'),
                    ('pax', 'Pax'), ('state', 'Estado'), ('segment', 'Segmento'),
                    ('channel', 'Canal'), ('answered', 'Respondido'), ('total', 'Total', 'money')],
        'rows': rows,
        'totals': {'total': str(sum((_num(r['total']) for r in rows), Decimal('0')))},
    }


# ─────────────────────────────────────────────────── AUDITORIA
def r_auditoria(p):
    from .models import POSAuditLog
    ini, fim = _periodo(p)
    qs = (POSAuditLog.objects.filter(created_at__date__gte=ini, created_at__date__lte=fim)
          .select_related('outlet').order_by('-created_at'))
    rows = [{
        'date': a.created_at.strftime('%d/%m %H:%M'),
        'event': a.get_event_type_display(), 'operator': a.operator_name or '',
        'outlet': a.outlet.name if a.outlet_id else '',
        'ref': a.reference or '', 'detail': a.description or '',
        'amount': str(a.amount) if a.amount else '',
    } for a in qs]
    return {
        'columns': [('date', 'Data'), ('event', 'Evento'), ('operator', 'Operador'),
                    ('outlet', 'Ponto de venda'), ('ref', 'Referência'),
                    ('detail', 'Descrição'), ('amount', 'Valor', 'money')],
        'rows': rows, 'totals': {},
    }



# ─────────────────────────────────────────────────── SISTEMA (tudo o que se passa)
def r_sistema(p):
    """TUDO O QUE SE PASSA NO SISTEMA — criações, alterações, anulações, CONSULTAS,
    exportações, entradas e saídas. Vem do registo de auditoria (core.AuditEvent), que
    o middleware alimenta a cada pedido.

    Sem limite artificial de linhas: quem quer auditar um mês inteiro precisa do mês
    inteiro. Se for muita coisa, filtra-se — não se corta às escondidas.
    """
    from core.audit_trail import AuditEvent
    ini, fim = _periodo(p)
    qs = AuditEvent.objects.filter(at__date__gte=ini, at__date__lte=fim)
    if p.get('action'):
        qs = qs.filter(action=p['action'])
    if p.get('module'):
        qs = qs.filter(module__icontains=p['module'])
    if p.get('user'):
        qs = qs.filter(user__icontains=p['user'])
    if p.get('q'):
        qs = qs.filter(models.Q(label__icontains=p['q']) | models.Q(search_text__icontains=p['q']))
    rows = [{
        'at': timezone.localtime(a.at).strftime('%d/%m/%Y %H:%M:%S'),
        'action': a.get_action_display(), 'module': a.module, 'area': a.area or '',
        'entity': a.entity, 'entity_id': a.entity_id or '',
        'label': a.label, 'user': a.user or '(anónimo)', 'ip': a.ip_address or '',
        'reason': a.reason or '', 'amount': str(a.amount) if a.amount is not None else '',
    } for a in qs]
    return {
        'columns': [('at', 'Data/Hora'), ('action', 'Ação'), ('module', 'Módulo'),
                    ('area', 'Área'), ('entity', 'Registo'), ('entity_id', 'ID'),
                    ('label', 'Descrição'), ('user', 'Utilizador'), ('ip', 'IP'),
                    ('reason', 'Motivo'), ('amount', 'Valor', 'money')],
        'rows': rows, 'totals': {},
    }


def r_acessos(p):
    """ENTRADAS E SAÍDAS — quem entrou, quando, de onde, e quem tentou e falhou.

    As tentativas FALHADAS são o que interessa: três falhas seguidas à meia-noite no
    terminal do bar não são um esquecimento de password.
    """
    from auth_engine.models import AuthEventLog
    ini, fim = _periodo(p)
    qs = (AuthEventLog.objects.filter(timestamp__date__gte=ini, timestamp__date__lte=fim)
          .select_related('workstation').order_by('-timestamp'))
    if p.get('user'):
        qs = qs.filter(identity_attempt__icontains=p['user'])
    if p.get('only_failed') in (True, 'true', '1'):
        qs = qs.filter(event_type__startswith='LOGIN_FAILED')
    rows = [{
        'at': timezone.localtime(a.timestamp).strftime('%d/%m/%Y %H:%M:%S'),
        'event': a.get_event_type_display(),
        'user': a.identity_attempt or '',
        'workstation': str(a.workstation) if a.workstation_id else '',
        'ip': a.ip_address or '', 'details': a.details or '',
        'failed': 'SIM' if a.event_type.startswith('LOGIN_FAILED') else '',
    } for a in qs]
    return {
        'columns': [('at', 'Data/Hora'), ('event', 'Evento'), ('user', 'Utilizador'),
                    ('workstation', 'Posto'), ('ip', 'IP'), ('failed', 'Falhou'),
                    ('details', 'Detalhes')],
        'rows': rows,
        'totals': {'failed': str(sum(1 for r in rows if r['failed']))},
    }


def r_atividade_utilizador(p):
    """ATIVIDADE POR UTILIZADOR — quantas ações cada um fez, e de que tipo.
    É o mapa que responde a "quem andou a mexer nisto?"."""
    from core.audit_trail import AuditEvent
    ini, fim = _periodo(p)
    qs = (AuditEvent.objects.filter(at__date__gte=ini, at__date__lte=fim)
          .values('user', 'action').annotate(n=Count('id')))
    por_user = {}
    for x in qs:
        u = por_user.setdefault(x['user'] or '(anónimo)',
                                {'user': x['user'] or '(anónimo)', 'CREATE': 0, 'UPDATE': 0,
                                 'DELETE': 0, 'VOID': 0, 'VIEW': 0, 'EXPORT': 0, 'total': 0})
        if x['action'] in por_user[u if False else (x['user'] or '(anónimo)')]:
            por_user[x['user'] or '(anónimo)'][x['action']] = x['n']
        por_user[x['user'] or '(anónimo)']['total'] += x['n']
    rows = sorted(por_user.values(), key=lambda r: r['total'], reverse=True)
    return {
        'columns': [('user', 'Utilizador'), ('CREATE', 'Criações'), ('UPDATE', 'Alterações'),
                    ('DELETE', 'Eliminações'), ('VOID', 'Anulações'), ('VIEW', 'Consultas'),
                    ('EXPORT', 'Exportações'), ('total', 'Total de ações')],
        'rows': rows,
        'totals': {'total': sum(r['total'] for r in rows)},
    }


def r_exportacoes(p):
    """EXPORTAÇÕES — por onde os dados saíram do hotel. Quem exportou o quê, e quando."""
    from core.audit_trail import AuditEvent
    ini, fim = _periodo(p)
    qs = AuditEvent.objects.filter(action='EXPORT', at__date__gte=ini, at__date__lte=fim)
    rows = [{
        'at': timezone.localtime(a.at).strftime('%d/%m/%Y %H:%M:%S'),
        'user': a.user or '', 'module': a.module, 'label': a.label, 'ip': a.ip_address or '',
    } for a in qs]
    return {
        'columns': [('at', 'Data/Hora'), ('user', 'Utilizador'), ('module', 'Módulo'),
                    ('label', 'O que saiu'), ('ip', 'IP')],
        'rows': rows, 'totals': {},
    }



# ══════════════════════════════════════════════════ COMPARAÇÃO DE PERÍODOS
def _periodo_anterior(ini, fim, modo):
    """O período com que se compara. Sem comparação, um número não diz nada:
    "vendeu 2,4M" não é informação; "2,4M, menos 12% do que na semana passada" é."""
    import datetime as _d
    i = _d.date.fromisoformat(str(ini))
    f = _d.date.fromisoformat(str(fim))
    dias = (f - i).days + 1
    if modo == 'year':
        try:
            return str(i.replace(year=i.year - 1)), str(f.replace(year=f.year - 1))
        except ValueError:                       # 29 de fevereiro
            return str(i - timedelta(days=365)), str(f - timedelta(days=365))
    return str(i - timedelta(days=dias)), str(f - timedelta(days=dias))


def _somas(dados):
    out = {}
    for c in dados['columns']:
        if len(c) > 2 and c[2] == 'money':
            out[c[0]] = sum((_num(r.get(c[0])) for r in dados['rows']), Decimal('0'))
    out['__linhas'] = Decimal(len(dados['rows']))
    return out


def compare(rep, params, dados, modo):
    """Corre o MESMO relatório no período anterior e devolve os deltas."""
    ini, fim = _periodo(params)
    ai, af = _periodo_anterior(ini, fim, modo)
    antes = rep['fn']({**params, 'from': ai, 'to': af})
    antes = apply_advanced(antes, params.get('advanced'))

    agora_s, antes_s = _somas(dados), _somas(antes)
    linhas = []
    for k, v in agora_s.items():
        anterior = antes_s.get(k, Decimal('0'))
        delta = v - anterior
        pct = (delta / anterior * 100) if anterior else None
        etiqueta = ('Registos' if k == '__linhas'
                    else next((c[1] for c in dados['columns'] if c[0] == k), k))
        linhas.append({
            'key': k, 'label': etiqueta,
            'now': str(v), 'before': str(anterior), 'delta': str(delta),
            'pct': (f'{pct:+.1f}%' if pct is not None else '—'),
            'up': bool(delta > 0), 'down': bool(delta < 0),
        })
    return {'from': ai, 'to': af, 'mode': modo, 'lines': linhas}


# ══════════════════════════════════════════════════ CATÁLOGO
P_PERIODO = [
    {'key': 'from', 'label': 'De data', 'type': 'date'},
    {'key': 'to', 'label': 'A data', 'type': 'date'},
]

CATALOG = [
    {'code': '06', 'name': 'Facturação', 'reports': [
        {'code': 'fat_documentos', 'name': 'Documentos emitidos (com estado e IVA)',
         'params': P_PERIODO + [{'key': 'doc_type', 'label': 'Tipo de documento', 'type': 'text'}],
         'fn': r_documentos},
        {'code': 'fat_iva', 'name': 'IVA liquidado por taxa (mapa para a AGT)',
         'params': P_PERIODO, 'fn': r_iva},
        {'code': 'fat_anulacoes', 'name': 'Anulações e notas de crédito',
         'params': P_PERIODO, 'fn': r_anulacoes},
    ]},
    {'code': '07', 'name': 'Receitas', 'reports': [
        {'code': 'rec_dia', 'name': 'Vendas por dia (com ticket médio)',
         'params': P_PERIODO, 'fn': r_vendas_dia},
        {'code': 'rec_artigo', 'name': 'Vendas por artigo', 'params': P_PERIODO, 'fn': r_vendas_artigo},
        {'code': 'rec_familia', 'name': 'Vendas por grupo/família (% do total)',
         'params': P_PERIODO, 'fn': r_vendas_familia},
        {'code': 'rec_operador', 'name': 'Vendas por operador (com descontos dados)',
         'params': P_PERIODO, 'fn': r_vendas_operador},
        {'code': 'rec_sector', 'name': 'Vendas por ponto de venda',
         'params': P_PERIODO, 'fn': r_vendas_sector},
    ]},
    {'code': '09', 'name': 'Caixa', 'reports': [
        {'code': 'cx_sessoes', 'name': 'Sessões de caixa (aberturas e fechos)',
         'params': P_PERIODO, 'fn': r_caixas},
        {'code': 'cx_movimentos', 'name': 'Sangrias e reforços', 'params': P_PERIODO,
         'fn': r_movimentos_caixa},
        {'code': 'cx_pagamentos', 'name': 'Vendas por modo de pagamento',
         'params': P_PERIODO, 'fn': r_pagamentos},
        {'code': 'cx_comprovativos', 'name': 'Comprovativos de pagamento (banco/TPA/cheque)',
         'params': P_PERIODO, 'fn': r_comprovativos},
        {'code': 'cx_periodo', 'name': 'Vendas por período (8611 da ficha do setor)',
         'params': P_PERIODO, 'fn': r_periodo_setor},
    ]},
    {'code': '19', 'name': 'Estatísticas', 'reports': [
        {'code': 'est_horas', 'name': 'Horas de pico (para as escalas)',
         'params': P_PERIODO, 'fn': r_horas_pico},
        {'code': 'est_top', 'name': 'Top artigos mais vendidos',
         'params': P_PERIODO + [{'key': 'top', 'label': 'Quantos', 'type': 'number', 'default': 20}],
         'fn': r_top_artigos},
        {'code': 'est_anulados', 'name': 'Artigos anulados (com motivo)',
         'params': P_PERIODO, 'fn': r_anulacoes_linha},
    ]},
    {'code': '20', 'name': 'Contas Correntes', 'reports': [
        {'code': 'cc_saldos', 'name': 'Saldos por entidade (conta corrente e cash advance)',
         'params': [], 'fn': r_contas_correntes},
    ]},
    {'code': 'FB', 'name': 'F&B (Compras e Stock)', 'reports': [
        {'code': 'fb_compras', 'name': 'Compras por fornecedor', 'params': P_PERIODO, 'fn': r_compras},
        {'code': 'fb_stock', 'name': 'Stock valorizado (dinheiro parado no armazém)',
         'params': [{'key': 'warehouse', 'label': 'Armazém', 'type': 'warehouse'}],
         'fn': r_stock_valorizado},
        {'code': 'fb_quebras', 'name': 'Quebras de inventário (contado vs teórico)',
         'params': P_PERIODO, 'fn': r_quebras},
        {'code': 'fb_consumo', 'name': 'Consumo por artigo (o que a venda tirou do armazém)',
         'params': P_PERIODO, 'fn': r_consumo},
        {'code': 'fb_margem', 'name': 'MARGEM por artigo (o prato dá lucro?)',
         'params': P_PERIODO, 'fn': r_margem},
    ]},
    {'code': 'EV', 'name': 'Eventos', 'reports': [
        {'code': 'ev_pedidos', 'name': 'Pedidos de eventos (por estado, segmento e canal)',
         'params': P_PERIODO, 'fn': r_eventos},
    ]},
    {'code': 'SY', 'name': 'Sistema (tudo o que se passa)', 'reports': [
        {'code': 'sy_tudo', 'name': 'Registo completo do sistema (inclui consultas)',
         'params': P_PERIODO + [
             {'key': 'action', 'label': 'Ação', 'type': 'text'},
             {'key': 'module', 'label': 'Módulo', 'type': 'text'},
             {'key': 'user', 'label': 'Utilizador', 'type': 'text'},
             {'key': 'q', 'label': 'Pesquisa livre', 'type': 'text'}],
         'fn': r_sistema},
        {'code': 'sy_acessos', 'name': 'Entradas e saídas (login/logout, e falhas)',
         'params': P_PERIODO + [{'key': 'user', 'label': 'Utilizador', 'type': 'text'}],
         'fn': r_acessos},
        {'code': 'sy_atividade', 'name': 'Atividade por utilizador (o que cada um fez)',
         'params': P_PERIODO, 'fn': r_atividade_utilizador},
        {'code': 'sy_export', 'name': 'Exportações (por onde os dados saíram)',
         'params': P_PERIODO, 'fn': r_exportacoes},
    ]},
    {'code': 'AU', 'name': 'Auditoria do POS', 'reports': [
        {'code': 'au_log', 'name': 'Registo de auditoria do POS',
         'params': P_PERIODO, 'fn': r_auditoria},
    ]},
]

BY_CODE = {r['code']: (f, r) for f in CATALOG for r in f['reports']}


def _columns_of(rep):
    """As colunas de um relatório, sem o correr a sério.

    Corre-se com um período vazio (1900): devolve zero linhas mas as colunas certas.
    É o que permite ao ecrã oferecer "agrupar por <coluna>" ANTES de abrir o relatório.
    """
    try:
        d = rep['fn']({'from': '1900-01-01', 'to': '1900-01-02'})
        return [{'value': c[0], 'label': c[1]} for c in d['columns']]
    except Exception:
        return []


def catalog():
    """As pastas e os relatórios (sem as funções — isso não vai para o browser)."""
    return [{
        'code': f['code'], 'name': f['name'], 'count': len(f['reports']),
        'reports': [{'code': r['code'], 'name': r['name'], 'params': r['params'],
                     'columns': _columns_of(r)}
                    for r in f['reports']],
    } for f in CATALOG]




# ══════════════════════════════════════════════════ FILTRO UNIVERSAL
"""
O FILTRO AVANÇADO aplica-se a QUALQUER relatório — não é código repetido em cada um.

Um relatório devolve colunas + linhas. Este motor recebe essas linhas e responde às
perguntas que ninguém consegue fazer com um simples "de data / a data":

  · "quem consultou faturas DEPOIS das 22h?"          -> janela horária
  · "o que se passou aos sábados e domingos?"          -> dias da semana
  · "só as vendas acima de 50.000"                     -> intervalo de valor
  · "só o que o Carlos fez"                            -> texto livre em qualquer coluna
  · "quanto vendeu cada operador, por mês?"            -> agrupar + somar
  · "as 10 maiores"                                    -> ordenar + limitar

Porquê no servidor e não no browser: um mês de auditoria são dezenas de milhares de
linhas. Mandá-las todas para o browser para ali filtrar é lento e, num terminal de
caixa, é o que faz o ecrã bloquear a meio do serviço.
"""
import datetime as _dt
import re as _re

_FORMATOS = ['%d/%m/%Y %H:%M:%S', '%d/%m/%Y %H:%M', '%d/%m/%Y', '%Y-%m-%d %H:%M:%S',
             '%Y-%m-%d', '%d/%m %H:%M', '%H:%M']
_DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']


def _parse_dt(v):
    """Lê a data/hora de uma célula, seja qual for o formato com que o relatório a escreveu."""
    s = str(v or '').strip()
    if not s:
        return None
    for f in _FORMATOS:
        try:
            d = _dt.datetime.strptime(s, f)
            if f == '%H:%M':
                d = d.replace(year=2000)
            return d
        except ValueError:
            continue
    return None


def _row_dt(row, cols):
    """A data/hora da linha: a primeira coluna que se leia como data."""
    for c in cols:
        d = _parse_dt(row.get(c[0]))
        if d:
            return d
    return None


def _to_num(v):
    try:
        return Decimal(str(v).replace(' ', '').replace(',', '.'))
    except Exception:
        return None


def _money_cols(cols):
    return [c[0] for c in cols if len(c) > 2 and c[2] == 'money']


def apply_advanced(dados, adv):
    """Aplica o filtro universal às linhas de um relatório já produzido."""
    if not adv:
        return dados

    cols = dados['columns']
    linhas = dados['rows']

    # 1) TEXTO LIVRE — em qualquer coluna. É a pergunta "onde é que aparece o nome dele?".
    q = (adv.get('q') or '').strip().lower()
    if q:
        linhas = [r for r in linhas
                  if any(q in str(v).lower() for v in r.values())]

    # 2) JANELA HORÁRIA — "o que aconteceu entre as 22h e as 6h".
    #    A janela pode ATRAVESSAR a meia-noite (22h→06h): é o turno da noite, e é
    #    precisamente aí que as coisas estranhas acontecem.
    h1, h2 = adv.get('hour_from'), adv.get('hour_to')
    if h1 not in (None, '') and h2 not in (None, ''):
        h1, h2 = int(h1), int(h2)
        novas = []
        for r in linhas:
            d = _row_dt(r, cols)
            if not d:
                continue
            h = d.hour
            dentro = (h1 <= h <= h2) if h1 <= h2 else (h >= h1 or h <= h2)
            if dentro:
                novas.append(r)
        linhas = novas

    # 3) DIAS DA SEMANA — "só ao fim de semana" (0=Segunda … 6=Domingo).
    dias = adv.get('weekdays')
    if dias:
        dias = set(int(x) for x in dias)
        linhas = [r for r in linhas
                  if (_row_dt(r, cols) or _dt.datetime(1900, 1, 1)).weekday() in dias
                  and _row_dt(r, cols)]

    # 4) INTERVALO DE VALOR — na coluna de dinheiro escolhida (ou na primeira).
    mcols = _money_cols(cols)
    vcol = adv.get('value_col') or (mcols[0] if mcols else None)
    vmin, vmax = adv.get('min'), adv.get('max')
    if vcol and (vmin not in (None, '') or vmax not in (None, '')):
        lo = _to_num(vmin) if vmin not in (None, '') else None
        hi = _to_num(vmax) if vmax not in (None, '') else None
        novas = []
        for r in linhas:
            v = _to_num(r.get(vcol))
            if v is None:
                continue
            if lo is not None and v < lo:
                continue
            if hi is not None and v > hi:
                continue
            novas.append(r)
        linhas = novas

    # 5) AGRUPAR + SOMAR — transforma a lista num resumo. "Quanto vendeu cada operador?"
    #    Agrupar por DIA/MÊS/HORA usa a data da linha; por coluna, usa a coluna.
    grupo = adv.get('group_by')
    if grupo:
        chaves = {}
        for r in linhas:
            if grupo in ('__day', '__month', '__hour', '__weekday'):
                d = _row_dt(r, cols)
                if not d:
                    continue
                if grupo == '__day':
                    k = d.strftime('%d/%m/%Y')
                elif grupo == '__month':
                    k = d.strftime('%m/%Y')
                elif grupo == '__hour':
                    k = f'{d.hour:02d}:00'
                else:
                    k = _DIAS[d.weekday()]
            else:
                k = str(r.get(grupo, '') or '—')
            g = chaves.setdefault(k, {'grupo': k, 'linhas': 0})
            g['linhas'] += 1
            for m in mcols:
                g[m] = (g.get(m) or Decimal('0')) + (_to_num(r.get(m)) or Decimal('0'))

        etiqueta = {'__day': 'Dia', '__month': 'Mês', '__hour': 'Hora',
                    '__weekday': 'Dia da semana'}.get(
            grupo, next((c[1] for c in cols if c[0] == grupo), grupo))

        novas_cols = [('grupo', etiqueta), ('linhas', 'Registos')] + \
                     [(m, next(c[1] for c in cols if c[0] == m), 'money') for m in mcols]
        linhas = [{k: (str(v) if isinstance(v, Decimal) else v) for k, v in g.items()}
                  for g in chaves.values()]
        cols = novas_cols
        dados['grouped_by'] = etiqueta

    # 6) ORDENAR
    sort = adv.get('sort_by')
    if sort and any(c[0] == sort for c in cols):
        desc = (adv.get('sort_dir') or 'desc') == 'desc'
        def chave(r):
            v = _to_num(r.get(sort))
            return (0, v) if v is not None else (1, str(r.get(sort) or ''))
        try:
            linhas = sorted(linhas, key=chave, reverse=desc)
        except TypeError:
            linhas = sorted(linhas, key=lambda r: str(r.get(sort) or ''), reverse=desc)

    # 7) LIMITAR — "as 10 maiores". Guarda-se quantas havia antes de cortar.
    total_antes = len(linhas)
    lim = adv.get('limit')
    if lim:
        linhas = linhas[:int(lim)]

    # 8) TOTAIS do que sobrou (o rodapé tem de falar do que está no ecrã)
    totais = {}
    for m in [c[0] for c in cols if len(c) > 2 and c[2] == 'money']:
        totais[m] = str(sum((_to_num(r.get(m)) or Decimal('0') for r in linhas), Decimal('0')))

    dados['columns'] = cols
    dados['rows'] = linhas
    dados['totals'] = totais
    dados['filtered'] = True
    dados['matched'] = total_antes
    return dados


FILTER_META = {
    'weekdays': [{'value': i, 'label': d} for i, d in enumerate(_DIAS)],
    'group_by': [
        {'value': '__day', 'label': 'Dia'},
        {'value': '__month', 'label': 'Mês'},
        {'value': '__hour', 'label': 'Hora do dia'},
        {'value': '__weekday', 'label': 'Dia da semana'},
    ],
    'compare': [
        {'value': 'previous', 'label': 'Período anterior'},
        {'value': 'year', 'label': 'Mesmo período do ano passado'},
    ],
    'presets': [
        {'value': 'today', 'label': 'Hoje'},
        {'value': 'yesterday', 'label': 'Ontem'},
        {'value': 'week', 'label': 'Esta semana'},
        {'value': 'month', 'label': 'Este mês'},
        {'value': 'last_month', 'label': 'Mês passado'},
        {'value': 'quarter', 'label': 'Este trimestre'},
        {'value': 'year', 'label': 'Este ano'},
    ],
}


def preset_period(preset):
    """Atalhos de período — ninguém quer escrever duas datas para ver "hoje"."""
    h = _hoje()
    if preset == 'today':
        return str(h), str(h)
    if preset == 'yesterday':
        d = h - timedelta(days=1)
        return str(d), str(d)
    if preset == 'week':
        ini = h - timedelta(days=h.weekday())
        return str(ini), str(h)
    if preset == 'month':
        return str(h.replace(day=1)), str(h)
    if preset == 'last_month':
        fim = h.replace(day=1) - timedelta(days=1)
        return str(fim.replace(day=1)), str(fim)
    if preset == 'quarter':
        t = (h.month - 1) // 3 * 3 + 1
        return str(h.replace(month=t, day=1)), str(h)
    if preset == 'year':
        return str(h.replace(month=1, day=1)), str(h)
    return None, None


def run(code, params):
    if code not in BY_CODE:
        raise KeyError(code)
    pasta, rep = BY_CODE[code]
    params = dict(params or {})

    # Atalho de período (Hoje, Esta semana, Mês passado…) antes de correr o relatório.
    if params.get('preset'):
        i, f = preset_period(params['preset'])
        if i:
            params['from'], params['to'] = i, f

    dados = rep['fn'](params)
    dados = apply_advanced(dados, params.get('advanced'))

    # COMPARAÇÃO — o mesmo relatório no período anterior (ou no ano passado).
    modo = params.get('compare')
    if modo:
        try:
            dados['comparison'] = compare(rep, params, dados, modo)
        except Exception as e:
            dados['comparison_error'] = str(e)
    dados['title'] = rep['name']
    dados['folder'] = f"{pasta['code']} {pasta['name']}"
    dados['params'] = params
    dados['generated_at'] = timezone.now()
    return dados
