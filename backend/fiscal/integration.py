"""
Integração POS/Financeiro/PMS -> Motor Fiscal.

Os outros módulos NUNCA emitem documentos por conta própria: chamam este ponto único,
que resolve a série certa (por FiscalConfig), constrói as linhas e delega em
services.issue_document (validação + numeração + assinatura + hash + QR). Idempotente:
não reemite se já existir documento fiscal para a mesma origem.
"""
from .models import FiscalConfig, FiscalSeries, FiscalDocument
from . import services


def _resolve_series(doc_type_code):
    """Devolve a série ativa para um tipo de documento (a mais recente por exercício)."""
    return (FiscalSeries.objects
            .filter(doc_type__code=doc_type_code, is_active=True, certified=True)
            .order_by('-year', 'code').first())


def existing_for(source_module, source_ref):
    return FiscalDocument.objects.filter(source_module=source_module,
                                         source_ref=str(source_ref)).first()


def emit_for_pos_ticket(ticket, user=None, ip=None):
    """Emite um documento fiscal (Factura-Recibo por defeito) a partir de um ticket POS pago."""
    cfg = FiscalConfig.get()
    if not cfg.auto_emit_pos:
        return None
    existing = existing_for('pos', ticket.id)
    if existing:
        return existing
    series = _resolve_series(cfg.pos_doc_type)
    if not series:
        return None  # sem série configurada -> não bloqueia a venda
    # Desconto (VIP/manual) reduz proporcionalmente os preços das linhas na fatura.
    from decimal import Decimal
    factor = Decimal('1')
    if getattr(ticket, 'discount_percent', 0):
        factor = Decimal('1') - (Decimal(str(ticket.discount_percent)) / Decimal('100'))
    lines = [{
        'description': l.description,
        'quantity': l.quantity,
        'unit_price': Decimal(str(l.unit_price)) * factor,
        'tax_percentage': l.tax_percentage,
    } for l in ticket.lines.all()]
    if not lines:
        return None
    # Contexto operacional para a fatura: destino (Mesa/Quarto/Piscina...), forma de pagamento.
    place = getattr(ticket, 'dest_label', None)
    room = None
    try:
        if getattr(ticket, 'dest_kind', None) == 'ROOM':
            room = getattr(ticket, 'dest_label', None)
        elif not place and ticket.table:
            place = getattr(ticket.table, 'table_number', None) or str(ticket.table)
    except Exception:
        pass
    pay = None
    try:
        p = ticket.payments.first()
        pay = getattr(getattr(p, 'payment_method', None), 'name', None) or getattr(p, 'method_name', None)
    except Exception:
        pass
    return services.issue_document(
        series_id=series.id,
        # Se o operador associou um cliente à mesa, a fatura leva nome/NIF; senão Consumidor Final.
        customer_name=getattr(ticket, 'customer_name', None) or getattr(ticket, 'company_name', None),
        customer_tax_id=getattr(ticket, 'customer_tax_id', None),
        lines=lines, user=user, ip=ip,
        source_module='pos', source_ref=ticket.id,
        operator_name=ticket.operator_name, place_ref=place, room_ref=room,
        payment_method=pay, discount_total=ticket.discount_total,
    )


def emit_for_finance_invoice(invoice, user=None, ip=None):
    """Emite uma Factura fiscal a partir de uma fatura do Financeiro (AR)."""
    cfg = FiscalConfig.get()
    existing = existing_for('finance', invoice.id)
    if existing:
        return existing
    series = _resolve_series(cfg.invoice_doc_type)
    if not series:
        return None
    # Nome/NIF do cliente, se a fatura os tiver.
    cust = getattr(invoice, 'customer', None)
    cust_name = getattr(cust, 'name', None) or getattr(invoice, 'customer_name', None)
    cust_nif = getattr(cust, 'tax_id', None) or getattr(cust, 'nif', None) or getattr(invoice, 'customer_tax_id', None)
    lines = []
    line_qs = getattr(invoice, 'lines', None)
    if line_qs is not None:
        for l in line_qs.all():
            lines.append({
                'description': getattr(l, 'description', None) or 'Serviço',
                'quantity': getattr(l, 'quantity', 1) or 1,
                'unit_price': getattr(l, 'unit_price', None) or getattr(l, 'amount', 0) or 0,
                'tax_percentage': getattr(l, 'tax_percentage', 14) or 0,
            })
    if not lines:
        # fatura sem linhas detalhadas -> uma linha global pelo total
        total = getattr(invoice, 'total', None) or getattr(invoice, 'amount', 0) or 0
        lines = [{'description': f"Fatura {getattr(invoice, 'number', invoice.id)}",
                  'quantity': 1, 'unit_price': total, 'tax_percentage': 0}]
    return services.issue_document(
        series_id=series.id,
        customer_name=cust_name, customer_tax_id=cust_nif,
        lines=lines, user=user, ip=ip,
        source_module='finance', source_ref=invoice.id,
    )
