"""
Integração POS/Financeiro/PMS -> Motor Fiscal.

Os outros módulos NUNCA emitem documentos por conta própria: chamam este ponto único,
que resolve a série certa (por FiscalConfig), constrói as linhas e delega em
services.issue_document (validação + numeração + assinatura + hash + QR). Idempotente:
não reemite se já existir documento fiscal para a mesma origem.
"""
from .models import FiscalConfig, FiscalSeries, FiscalDocument
from . import services


def _resolve_series(doc_type_code, outlet=None):
    """Devolve a série para um tipo de documento.

    PRIMEIRO a FICHA DO SETOR (parâmetros 8553-8589): é lá que o dono diz "o
    Restaurante emite FR na série A, a Esplanada na B". Este resolvedor é usado pela
    emissão AUTOMÁTICA (a que dispara ao cobrar), e ignorava a ficha — o caminho manual
    respeitava-a e o automático não, e o mesmo setor emitia em séries diferentes
    conforme o botão em que se tocava.
    Sem ficha (ou sem setor), vale a série ativa mais recente do tipo."""
    MAPA = {'FR': '8557', 'NC': '8556', 'CM': '8555', 'FS': '8553', 'VD': '8553',
            'RC': '8558', 'FT': '8562', 'GR': '8588', 'GT': '8588'}
    num = MAPA.get(doc_type_code)
    if outlet is not None and num:
        try:
            from pos.models import PosSector
            setor = PosSector.objects.filter(outlet=outlet).first()
            escolhida = ((setor.params or {}).get(num)
                         or (setor.params or {}).get(int(num))) if setor else None
            if escolhida:
                # Os MESMOS três filtros do caminho sem ficha (ativa + certificada + não
                # fechada) — faltava aqui `certified`, a ficha do setor conseguia apontar
                # para uma série ainda não certificada que o caminho sem ficha recusaria.
                s = (FiscalSeries.objects
                     .filter(pk=escolhida, doc_type__code=doc_type_code,
                             is_active=True, is_closed=False, certified=True).first())
                if s:
                    return s
        except Exception:
            pass
    # Faltava `is_closed=False`: uma série fechada no fim do exercício (ecrã Financeiro >
    # Documentos) continuava elegível aqui — só `validate_issue` a apanhava, tarde demais
    # para dar um erro limpo em vez de uma falha de validação a meio da emissão.
    return (FiscalSeries.objects
            .filter(doc_type__code=doc_type_code, is_active=True, certified=True, is_closed=False)
            .order_by('-year', 'code').first())


def existing_for(source_module, source_ref):
    """Devolve o documento fiscal já emitido para esta origem — ou None se ainda não há.

    EXCLUI os ANULADOS (status='A'): um documento anulado (`void_document`) nunca é
    apagado, mas deixa de valer como "já emitido" — senão uma venda cujo documento foi
    corrigido por anulação ficava PARA SEMPRE impossível de voltar a faturar (todos os
    pontos de emissão tratam "já existe" como definitivo e devolvem o mesmo documento).
    """
    return FiscalDocument.objects.filter(source_module=source_module,
                                         source_ref=str(source_ref)).exclude(status='A').first()


def emit_for_pos_ticket(ticket, user=None, ip=None, credito=False, customer=None):
    """Emite um documento fiscal (Factura-Recibo por defeito) a partir de um ticket POS pago.

    CRÉDITO (conta corrente): o documento é uma FATURA (FT), que nasce POR RECEBER —
    não uma fatura-recibo. Dizer à AGT que se recebeu dinheiro que ainda não entrou é
    declarar um recebimento falso, e deixa a conta corrente do cliente a zero quando
    ele ainda deve tudo.
    """
    cfg = FiscalConfig.get()
    if not cfg.auto_emit_pos:
        return None
    existing = existing_for('pos', ticket.id)
    if existing:
        return existing
    series = _resolve_series('FT' if credito else cfg.pos_doc_type, outlet=ticket.outlet)
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
        customer=customer, settled=(not credito),
    )


def emit_table_consult(ticket, user=None, ip=None):
    """CONSULTA DE MESA (CM) — o documento de conferência que se leva à mesa.

    NÃO é fatura: é um WorkingDocument da AGT (tipo CM do Rules Engine), assinado e com
    número próprio, que mostra ao cliente quanto vai a conta ANTES de fechar. A AGT
    exige-o no SAF-T como qualquer outro: um talão de conferência "por fora" era
    exatamente o buraco por onde as casas vendiam sem faturar.

    Ao contrário da fatura, a MESMA mesa pode pedir várias consultas (o cliente pergunta
    duas vezes) — por isso não é idempotente por ticket.
    """
    series = _resolve_series('CM', outlet=ticket.outlet)
    if not series:
        return None            # sem série CM configurada -> a consulta mostra-se sem documento
    from decimal import Decimal
    factor = Decimal('1')
    if getattr(ticket, 'discount_percent', 0):
        factor = Decimal('1') - (Decimal(str(ticket.discount_percent)) / Decimal('100'))
    lines = [{
        'description': l.description,
        'quantity': l.quantity,
        'unit_price': Decimal(str(l.unit_price)) * factor,
        'tax_percentage': l.tax_percentage,
    } for l in ticket.lines.filter(is_void=False)]
    if not lines:
        return None
    place = getattr(ticket, 'dest_label', None)
    if not place and getattr(ticket, 'table', None):
        place = getattr(ticket.table, 'table_number', None) or str(ticket.table)
    return services.issue_document(
        series_id=series.id,
        customer_name=getattr(ticket, 'customer_name', None),
        customer_tax_id=getattr(ticket, 'customer_tax_id', None),
        lines=lines, user=user, ip=ip,
        source_module='pos', source_ref=f'CM-{ticket.id}-{ticket.lines.count()}',
        operator_name=ticket.operator_name, place_ref=place,
        discount_total=ticket.discount_total,
    )


def emit_for_pms_folio(folio, charges, user=None, ip=None):
    """Emite a Factura fiscal (AGT) do folio do PMS ao check-out/faturação.

    `source_module='pms'` (já era um valor aceite no campo, à espera desde sempre —
    ver `fiscal/saft.py`: o SAF-T sem filtro de módulo já mistura POS e PMS sozinho).
    O quarto vai em `room_ref`, igual ao que o POS já faz para "Lançar em Quarto".

    CHAMAR SEMPRE DENTRO DE transaction.atomic (o `select_for_update` da linha abaixo
    exige-o): duas chamadas concorrentes para o mesmo folio (ex.: duplo-clique em
    "Gerar Fatura") liam as duas "ainda não há documento" ao mesmo tempo e cada uma
    emitia a SUA própria factura, assinada e numerada — duas facturas reais e
    irreversíveis para a mesma conta. Bloquear a linha do folio primeiro serializa-as:
    a segunda só continua depois da primeira ter gravado `existing_for`.
    """
    from .models import TaxRate
    cfg = FiscalConfig.get()
    FolioModel = type(folio)
    folio = FolioModel.objects.select_for_update().get(pk=folio.pk)
    existing = existing_for('pms', folio.id)
    if existing:
        return existing
    if not charges:
        return None
    # Uma conta de EMPRESA/AGÊNCIA que ainda tem saldo por cobrar nasce POR RECEBER —
    # a mesma regra que o POS já aplica em `emit_for_pos_ticket` (crédito -> FT). Antes,
    # isto vinha sempre `settled=True` e sempre no tipo "paga" (FR/FS), fosse qual fosse
    # o saldo: uma fatura de empresa emitida antes do pagamento saía a dizer à AGT que
    # já tinha sido recebida, quando a conta corrente ainda devia tudo.
    settled = folio.balance <= 0
    doc_type_code = (cfg.pos_doc_type or 'FR') if settled else 'FT'
    series = _resolve_series(doc_type_code)
    if not series:
        return None
    default_rate = TaxRate.objects.filter(is_default=True, is_active=True).first()
    tax_pct = default_rate.percentage if default_rate else 0
    res = folio.reservation
    guest = res.guest
    lines = [{
        'description': c.description, 'quantity': 1,
        # Uma "Taxa" (ex.: taxa turística) já É o imposto — aplicar-lhe a taxa de IVA
        # por cima seria imposto sobre imposto. Só os consumos normais levam IVA.
        'unit_price': c.amount,
        'tax_percentage': 0 if c.charge_type == 'TAX' else tax_pct,
    } for c in charges]
    return services.issue_document(
        series_id=series.id,
        customer_name=folio.payer_name or guest.name,
        customer_tax_id=folio.payer_nif or guest.tax_id,
        lines=lines, user=user, ip=ip,
        source_module='pms', source_ref=folio.id,
        room_ref=res.room.number if res.room else None,
        customer=guest, settled=settled,
    )


def emit_for_finance_invoice(invoice, user=None, ip=None):
    """Emite uma Factura fiscal a partir de uma fatura do Financeiro (AR).

    CHAMAR DENTRO DE transaction.atomic (select_for_update abaixo exige-o) — mesma
    razão do lock em emit_for_pms_folio: duas chamadas quase ao mesmo tempo (duplo
    clique em "Emitir") liam ambas "ainda não há documento" e cada uma emitia a sua
    própria factura real e irreversível para a mesma fatura financeira.
    """
    cfg = FiscalConfig.get()
    InvoiceModel = type(invoice)
    invoice = InvoiceModel.objects.select_for_update().get(pk=invoice.pk)
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
