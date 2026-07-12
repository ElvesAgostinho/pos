"""
Pipeline de documentos comerciais (Documents Center).

Orçamento / Proforma / Encomenda de Cliente -> (conversão) -> Fatura (fiscal, assinada).
Regras: editável só em rascunho; numeração sequencial própria por tipo/exercício;
a conversão delega no motor fiscal (services.issue_document) para numerar e assinar.
"""
from datetime import date

from django.db import transaction

from .models import CommercialDocument, CommercialDocumentLine, FiscalConfig
from . import services, integration


@transaction.atomic
def create_document(kind='BUDGET', customer_name=None, customer_tax_id=None,
                    customer_address=None, operator_name=None, notes=None,
                    valid_until=None, lines=None, user=None, source_ref=None):
    cfg = FiscalConfig.get()
    year = date.today().year
    prefix = CommercialDocument.PREFIX.get(kind, 'DOC')
    seq = (CommercialDocument.objects.filter(kind=kind, year=year).count()) + 1
    number = f"{prefix} {year}/{seq}"
    doc = CommercialDocument.objects.create(
        kind=kind, number=number, year=year, seq=seq, doc_date=date.today(),
        valid_until=valid_until, customer_name=customer_name, customer_tax_id=customer_tax_id,
        customer_address=customer_address, operator_name=operator_name, notes=notes,
        tax_inclusive=cfg.prices_include_tax, state='DRAFT', created_by=user, source_ref=source_ref,
    )
    for ln in (lines or []):
        CommercialDocumentLine.objects.create(
            document=doc, description=ln.get('description', ''),
            quantity=ln.get('quantity', 1) or 1, unit_price=ln.get('unit_price', 0) or 0,
            tax_code=ln.get('tax_code'), tax_percentage=ln.get('tax_percentage', 0) or 0)
    doc.recompute()
    return doc


@transaction.atomic
def convert_to_invoice(commercial_id, doc_type_code=None, user=None, ip=None):
    """Converte um documento comercial num documento fiscal (Fatura) assinado."""
    doc = CommercialDocument.objects.select_for_update().prefetch_related('lines').get(pk=commercial_id)
    if doc.state == 'CONVERTED' and doc.converted_to_id:
        return doc.converted_to
    cfg = FiscalConfig.get()
    code = doc_type_code or cfg.invoice_doc_type
    series = integration._resolve_series(code)
    if not series:
        raise ValueError(f'Sem série ativa para o tipo {code}.')
    lines = [{
        'description': l.description, 'quantity': l.quantity,
        'unit_price': l.unit_price, 'tax_code': l.tax_code,
        'tax_percentage': l.tax_percentage,
    } for l in doc.lines.all()]
    fiscal_doc = services.issue_document(
        series_id=series.id, customer_name=doc.customer_name,
        customer_tax_id=doc.customer_tax_id, customer_address=doc.customer_address,
        operator_name=doc.operator_name, lines=lines, user=user, ip=ip,
        source_module='commercial', source_ref=doc.number,
        tax_inclusive=doc.tax_inclusive,
    )
    doc.state = 'CONVERTED'
    doc.converted_to = fiscal_doc
    doc.save(update_fields=['state', 'converted_to'])
    return fiscal_doc


@transaction.atomic
def duplicate(commercial_id, user=None):
    src = CommercialDocument.objects.prefetch_related('lines').get(pk=commercial_id)
    lines = [{'description': l.description, 'quantity': l.quantity, 'unit_price': l.unit_price,
              'tax_code': l.tax_code, 'tax_percentage': l.tax_percentage} for l in src.lines.all()]
    return create_document(kind=src.kind, customer_name=src.customer_name,
                           customer_tax_id=src.customer_tax_id, customer_address=src.customer_address,
                           operator_name=src.operator_name, notes=src.notes, lines=lines,
                           user=user, source_ref=src.number)


VALID_TRANSITIONS = {
    'DRAFT': ['APPROVAL', 'SENT', 'REJECTED'],
    'APPROVAL': ['APPROVED', 'REJECTED', 'DRAFT'],
    'APPROVED': ['SENT', 'ACCEPTED'],
    'SENT': ['ACCEPTED', 'REJECTED', 'EXPIRED'],
    'ACCEPTED': [],  # segue por conversão
    'REJECTED': ['DRAFT'],
    'EXPIRED': ['DRAFT'],
}


def transition(doc, new_state):
    if new_state not in VALID_TRANSITIONS.get(doc.state, []):
        raise ValueError(f'Transição inválida: {doc.state} -> {new_state}.')
    doc.state = new_state
    doc.save(update_fields=['state'])
    return doc
