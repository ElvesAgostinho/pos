"""
Fiscal issuance service — Validation Engine + Document Engine + Signature + QR.

Fluxo de emissão (imutável, atómico):
  validar -> numerar sequencialmente -> encadear hash -> assinar -> QR -> menção -> gravar
"""
from decimal import Decimal, ROUND_HALF_UP
from datetime import date, datetime

from django.db import transaction
from django.utils import timezone

from .models import (FiscalConfig, FiscalSeries, FiscalDocument, FiscalDocumentLine,
                     FiscalAuditLog)
from . import signing

TWO = Decimal('0.01')


class FiscalValidationError(Exception):
    """Erro de validação fiscal — bloqueia a emissão antes de assinar."""


def _q(v):
    return Decimal(str(v or 0)).quantize(TWO, rounding=ROUND_HALF_UP)


def summarize_by_rate(items):
    """
    Resumo de IVA por taxa (regra AGT): a incidência e o imposto calculam-se sobre o
    TOTAL agrupado por taxa, com um único arredondamento — não pela soma de arredondamentos
    linha a linha. `items` = lista de (rate: Decimal, gross: Decimal).
    """
    from collections import OrderedDict
    groups = OrderedDict()
    for rate, gross in items:
        groups[rate] = groups.get(rate, Decimal('0')) + gross
    out = []
    for rate, gross in groups.items():
        gross = _q(gross)
        base = _q(gross / (Decimal('1') + rate / Decimal('100'))) if rate > 0 else gross
        out.append({'rate': rate, 'base': base, 'tax': _q(gross - base), 'gross': gross})
    return out


def validate_issue(series: FiscalSeries, doc_type, customer_name, customer_tax_id, lines):
    """Validation Engine — corre ANTES de numerar/assinar."""
    errors = []
    if not series.is_active:
        errors.append('Série inativa/descontinuada.')
    # (Documentos) "Série fechada" — uma série encerrada NUNCA volta a numerar. É assim
    # que se muda de exercício sem partir a sequência: abre-se uma nova, fecha-se a velha.
    if getattr(series, 'is_closed', False):
        errors.append(f'A série {series.code} está FECHADA — abra uma nova série para continuar a numerar.')
    if not series.certified:
        errors.append('Série não certificada — emissão bloqueada.')
    if not doc_type.is_active:
        errors.append(f'Tipo de documento {doc_type.code} inativo.')
    if not lines:
        errors.append('Documento sem linhas.')
    for i, ln in enumerate(lines, 1):
        qty = Decimal(str(ln.get('quantity', 0) or 0))
        price = Decimal(str(ln.get('unit_price', 0) or 0))
        tax = Decimal(str(ln.get('tax_percentage', 0) or 0))
        if not ln.get('description'):
            errors.append(f'Linha {i}: descrição obrigatória.')
        if qty <= 0 and not doc_type.allow_negative:
            errors.append(f'Linha {i}: quantidade tem de ser positiva.')
        if price < 0 and not doc_type.allow_negative:
            errors.append(f'Linha {i}: preço não pode ser negativo (usar nota de crédito/débito).')
        if tax < 0 or tax > 100:
            errors.append(f'Linha {i}: taxa de IVA inválida ({tax}).')
    if doc_type.is_rectifying and not (customer_tax_id or customer_name):
        errors.append('Documento retificativo exige identificação do cliente.')
    if errors:
        raise FiscalValidationError(' '.join(errors))


def _compute_totals(lines, tax_inclusive=True):
    from . import tax_engine
    net = tax = Decimal('0')
    prepared = []
    for ln in lines:
        qty = Decimal(str(ln.get('quantity', 1) or 1))
        price = Decimal(str(ln.get('unit_price', 0) or 0))
        # Tax/IVA Engine resolve a taxa e o motivo de isenção (parametrizável).
        rate, exemption = tax_engine.resolve(ln)
        line_amount = _q(qty * price)
        if tax_inclusive and rate > 0:
            # O preço já inclui IVA: retirar a base (incidência) e o imposto.
            line_net = _q(line_amount / (Decimal('1') + rate / Decimal('100')))
            line_tax = _q(line_amount - line_net)
        else:
            line_net = line_amount
            line_tax = _q(line_net * rate / Decimal('100'))
        prepared.append({
            'description': ln.get('description'),
            'quantity': qty,
            'unit_price': price,
            'tax_percentage': rate,
            'tax_amount': line_tax,
            'line_total': line_net,
            'exemption_reason': exemption,
            '_gross': line_net + line_tax,
        })
    # Totais do documento a partir do resumo agrupado por taxa (arredondamento AGT).
    summary = summarize_by_rate([(p['tax_percentage'], p['_gross']) for p in prepared])
    net = sum((s['base'] for s in summary), Decimal('0'))
    tax = sum((s['tax'] for s in summary), Decimal('0'))
    gross = sum((s['gross'] for s in summary), Decimal('0'))
    for p in prepared:
        p.pop('_gross', None)
    return _q(net), _q(tax), _q(gross), prepared


@transaction.atomic
def issue_document(series_id, customer_name=None, customer_tax_id=None, lines=None,
                   doc_date=None, reference_doc=None, user=None, ip=None,
                   source_module='manual', source_ref=None, customer_address=None,
                   operator_name=None, place_ref=None, room_ref=None,
                   payment_method=None, discount_total=0, tax_inclusive=None):
    """Emite um documento fiscal assinado e encadeado. Ponto único de emissão."""
    from .num2words_pt import amount_to_words
    cfg = FiscalConfig.get()
    if tax_inclusive is None:
        tax_inclusive = cfg.prices_include_tax
    # Lock da série para numeração sequencial contínua e sem colisões.
    series = FiscalSeries.objects.select_for_update().get(pk=series_id)
    doc_type = series.doc_type
    lines = lines or []

    validate_issue(series, doc_type, customer_name, customer_tax_id, lines)

    net, tax, gross, prepared = _compute_totals(lines, tax_inclusive=tax_inclusive)

    # Consumidor Final: sem NIF, mantemos customer_tax_id vazio (o SAF-T/QR usam o NIF
    # genérico configurado) e o nome imprime "Consumidor Final".
    if not customer_name:
        customer_name = 'Consumidor Final'

    number = series.current_number + 1
    prefix = f"{series.prefix} " if series.prefix else ''
    invoice_no = f"{prefix}{doc_type.code} {series.code}/{number}"

    d = doc_date or date.today()
    system_entry = timezone.now()
    system_entry_str = system_entry.strftime('%Y-%m-%dT%H:%M:%S')

    # Encadeamento: hash do último documento da MESMA série (contínuo).
    prev = (FiscalDocument.objects.filter(series=series)
            .order_by('-number').first())
    previous_hash = prev.doc_hash if prev else ''

    if doc_type.signable:
        message = signing.build_message(d.isoformat(), system_entry_str, invoice_no,
                                        f"{gross}", previous_hash)
        doc_hash = signing.sign_message(message)
    else:
        doc_hash = '0'  # não assinável (ex.: recibo)

    disc = _q(discount_total)
    doc = FiscalDocument.objects.create(
        series=series, doc_type=doc_type, number=number, invoice_no=invoice_no,
        doc_date=d, system_entry_date=system_entry,
        customer_name=customer_name, customer_tax_id=customer_tax_id,
        customer_address=customer_address,
        operator_name=operator_name, place_ref=place_ref, room_ref=room_ref,
        payment_method=payment_method, tax_inclusive=tax_inclusive,
        net_total=net, tax_total=tax, discount_total=disc, gross_total=gross,
        amount_in_words=amount_to_words(gross),
        previous_hash=previous_hash, doc_hash=doc_hash,
        key_version=cfg.key_version, source_billing='P',
        source_module=source_module, source_ref=(str(source_ref) if source_ref else None),
        reference_doc=reference_doc, status='N',
        created_by=user,
    )
    doc.print_mention = signing.print_mention(doc_hash, cfg.certificate_number, doc_type.signable)
    if cfg.qr_enabled and doc_type.signable:
        doc.qr_data = signing.build_qr_data(cfg, doc)
    doc.save(update_fields=['print_mention', 'qr_data'])

    for p in prepared:
        FiscalDocumentLine.objects.create(document=doc, **p)

    series.current_number = number
    series.save(update_fields=['current_number'])

    FiscalAuditLog.objects.create(event='ISSUE', document_ref=invoice_no, user=user,
                                  ip_address=ip, detail=f"gross={gross} type={doc_type.code}")

    # COMUNICAÇÃO À AGT: o documento entra na fila assim que é emitido (store-and-forward).
    # A venda nunca espera pela AGT — se a linha estiver em baixo, sai daqui a pouco.
    if doc_type.signable:
        try:
            from . import agt_client
            agt_client.enqueue(doc)
        except Exception as e:                      # noqa — a emissão NUNCA falha por causa da AGT
            FiscalAuditLog.objects.create(event='AGT_ENQUEUE_FAIL', document_ref=invoice_no,
                                          detail=str(e)[:250])
    return doc


@transaction.atomic
def void_document(doc_id, reason='', user=None, ip=None):
    """Anula (estado A) — não apaga nem edita; mantém assinatura e encadeamento."""
    doc = FiscalDocument.objects.select_for_update().get(pk=doc_id)
    if doc.status == 'A':
        return doc
    doc.status = 'A'
    doc.save(update_fields=['status'])
    FiscalAuditLog.objects.create(event='VOID', document_ref=doc.invoice_no, user=user,
                                  ip_address=ip, detail=reason[:250])
    return doc


@transaction.atomic
def create_credit_note(original_doc_id, reason='', user=None, ip=None):
    """
    Anulação INTELIGENTE de uma fatura: emite automaticamente uma Nota de Crédito (NC)
    que reverte o documento original (mesmas linhas, mesmo cliente), assinada e encadeada,
    e marca o original como anulado. É a forma legal de anular em Angola (não se apaga).
    """
    original = (FiscalDocument.objects.select_for_update()
                .select_related('doc_type').prefetch_related('lines').get(pk=original_doc_id))
    if original.doc_type.is_rectifying:
        raise ValueError('Uma nota de crédito/débito não se anula com outra NC.')
    if original.status == 'A':
        raise ValueError('Documento já anulado.')

    from .models import FiscalDocType, FiscalSeries
    nc_type = FiscalDocType.objects.filter(code='NC', is_active=True).first()
    if not nc_type:
        raise ValueError('Tipo de documento "NC" (Nota de Crédito) não está configurado.')
    nc_series = (FiscalSeries.objects.filter(doc_type=nc_type, is_active=True)
                 .order_by('-year').first())
    if not nc_series:
        raise ValueError('Não há série de Nota de Crédito ativa. Crie-a no Centro Fiscal.')

    lines = [{'description': l.description, 'quantity': l.quantity, 'unit_price': l.unit_price,
              'tax_percentage': l.tax_percentage, 'exemption_reason': l.exemption_reason}
             for l in original.lines.all()]

    nc = issue_document(
        nc_series.id, customer_name=original.customer_name, customer_tax_id=original.customer_tax_id,
        lines=lines, reference_doc=original.invoice_no, user=user, ip=ip,
        source_module='void', source_ref=original.invoice_no,
        customer_address=original.customer_address, tax_inclusive=original.tax_inclusive,
    )
    original.status = 'A'
    original.save(update_fields=['status'])
    FiscalAuditLog.objects.create(event='CREDIT_NOTE', document_ref=nc.invoice_no, user=user,
                                  ip_address=ip, detail=f'NC de {original.invoice_no}. Motivo: {reason[:180]}')
    return nc


def verify_chain(series_id):
    """Auditoria: revalida a cadeia de hash + assinatura RSA de uma série inteira."""
    cfg = FiscalConfig.get()
    docs = list(FiscalDocument.objects.filter(series_id=series_id).order_by('number'))
    prev = ''
    results = []
    for doc in docs:
        ok_chain = (doc.previous_hash or '') == (prev or '')
        ok_sig = True
        if doc.doc_type.signable:
            msg = signing.build_message(doc.doc_date.isoformat(),
                                        doc.system_entry_date.strftime('%Y-%m-%dT%H:%M:%S'),
                                        doc.invoice_no, f"{doc.gross_total}", doc.previous_hash)
            ok_sig = signing.verify_message(msg, doc.doc_hash)
        results.append({'invoice_no': doc.invoice_no, 'chain_ok': ok_chain, 'signature_ok': ok_sig})
        prev = doc.doc_hash
    return {'series': series_id, 'count': len(docs),
            'all_ok': all(r['chain_ok'] and r['signature_ok'] for r in results),
            'documents': results}
