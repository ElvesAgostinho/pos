"""
SAF-T Center — geração do ficheiro SAF-T(AO) (Standard Audit File for Tax — Angola).

Estrutura suportada (extensível):
  Header · MasterFiles(Customer 2.2, Product 2.4, TaxTable 2.5) ·
  SourceDocuments(SalesInvoices 4.1, WorkingDocuments 4.3, Payments 4.4)

O motor é orientado a dados (FiscalConfig/FiscalDocType), pelo que novos layouts
podem ser acrescentados sem tocar no núcleo do ERP.
"""
from decimal import Decimal
from xml.sax.saxutils import escape

from django.db.models import Sum

from .models import FiscalConfig, FiscalDocument, FiscalDocumentLine

NS = 'urn:OECD:StandardAuditFile-Tax:AO_1.01_01'


def _e(tag, val):
    return f"<{tag}>{escape(str(val))}</{tag}>"


def _header(cfg, start, end):
    return (
        "<Header>"
        + _e('AuditFileVersion', cfg.saft_version)
        + _e('CompanyID', cfg.company_nif or '')
        + _e('TaxRegistrationNumber', cfg.company_nif or '')
        + _e('TaxAccountingBasis', 'F')
        + _e('CompanyName', cfg.company_name or 'Empresa')
        + "<CompanyAddress>" + _e('AddressDetail', cfg.tax_office or 'N/D')
        + _e('City', 'Luanda') + _e('Country', 'AO') + "</CompanyAddress>"
        + _e('FiscalYear', start.year)
        + _e('StartDate', start.isoformat())
        + _e('EndDate', end.isoformat())
        + _e('CurrencyCode', 'AOA')
        + _e('DateCreated', end.isoformat())
        + _e('TaxEntity', 'Global')
        + _e('ProductCompanyTaxID', cfg.company_nif or '')
        + _e('SoftwareCertificateNumber', cfg.certificate_number)
        + _e('ProductID', 'HospitalityERP/AngolaFiscalCenter')
        + _e('ProductVersion', '1.0')
        + "</Header>"
    )


def _customers(docs):
    seen, out = {}, []
    for d in docs:
        key = d.customer_tax_id or 'CF'
        if key in seen:
            continue
        seen[key] = True
        out.append(
            "<Customer>"
            + _e('CustomerID', key)
            + _e('AccountID', 'Desconhecido')
            + _e('CustomerTaxID', d.customer_tax_id or '999999999')
            + _e('CompanyName', d.customer_name or 'Consumidor Final')
            + "<BillingAddress>" + _e('AddressDetail', 'N/D')
            + _e('City', 'N/D') + _e('Country', 'AO') + "</BillingAddress>"
            + _e('SelfBillingIndicator', '0')
            + "</Customer>"
        )
    return ''.join(out)


def _lines_xml(doc):
    parts = []
    for i, ln in enumerate(doc.lines.all(), 1):
        parts.append(
            "<Line>"
            + _e('LineNumber', i)
            + _e('Description', ln.description)
            + _e('Quantity', ln.quantity)
            + _e('UnitOfMeasure', 'UN')
            + _e('UnitPrice', ln.unit_price)
            + _e('CreditAmount', ln.line_total)
            + "<Tax>" + _e('TaxType', 'IVA') + _e('TaxCountryRegion', 'AO')
            + _e('TaxPercentage', ln.tax_percentage) + "</Tax>"
            + (('' if ln.tax_percentage else _e('TaxExemptionReason', ln.exemption_reason or 'Isento')))
            + "</Line>"
        )
    return ''.join(parts)


def _doc_xml(doc, wrapper, no_tag):
    return (
        f"<{wrapper}>"
        + _e(no_tag, doc.invoice_no)
        + _e('DocumentStatus', doc.status)
        + _e('Hash', doc.doc_hash)
        + _e('HashControl', doc.key_version)
        + _e('InvoiceDate' if wrapper == 'Invoice' else 'WorkDate', doc.doc_date.isoformat())
        + _e('InvoiceType' if wrapper == 'Invoice' else 'WorkType', doc.doc_type.invoice_type or doc.doc_type.code)
        + _e('SystemEntryDate', doc.system_entry_date.strftime('%Y-%m-%dT%H:%M:%S'))
        + "<Customer>" + _e('CustomerID', doc.customer_tax_id or 'CF') + "</Customer>"
        + _lines_xml(doc)
        + "<DocumentTotals>" + _e('TaxPayable', doc.tax_total)
        + _e('NetTotal', doc.net_total) + _e('GrossTotal', doc.gross_total)
        + "</DocumentTotals>"
        + f"</{wrapper}>"
    )


def _sales_invoices(docs):
    inv = [d for d in docs if d.doc_type.saft_type == 'SalesInvoice']
    if not inv:
        return ''
    body = ''.join(_doc_xml(d, 'Invoice', 'InvoiceNo') for d in inv)
    total_credit = sum((d.gross_total for d in inv), Decimal('0'))
    return ("<SalesInvoices>" + _e('NumberOfEntries', len(inv))
            + _e('TotalDebit', '0.00') + _e('TotalCredit', total_credit) + body + "</SalesInvoices>")


def _working_documents(docs):
    wd = [d for d in docs if d.doc_type.saft_type == 'WorkingDocument']
    if not wd:
        return ''
    body = ''.join(_doc_xml(d, 'WorkDocument', 'DocumentNumber') for d in wd)
    total = sum((d.gross_total for d in wd), Decimal('0'))
    return ("<WorkingDocuments>" + _e('NumberOfEntries', len(wd))
            + _e('TotalDebit', '0.00') + _e('TotalCredit', total) + body + "</WorkingDocuments>")


def document_xml(doc):
    """XML normalizado de UM documento (arquivo fiscal por documento)."""
    cfg = FiscalConfig.get()
    wrapper, no_tag = ('Invoice', 'InvoiceNo') if doc.doc_type.saft_type != 'WorkingDocument' else ('WorkDocument', 'DocumentNumber')
    section = 'SalesInvoices' if wrapper == 'Invoice' else 'WorkingDocuments'
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f'<AuditFile xmlns="{NS}">'
        + _header(cfg, doc.doc_date, doc.doc_date)
        + "<MasterFiles>" + _customers([doc]) + "</MasterFiles>"
        + "<SourceDocuments>"
        + f"<{section}>" + _e('NumberOfEntries', 1) + _e('TotalDebit', '0.00')
        + _e('TotalCredit', doc.gross_total) + _doc_xml(doc, wrapper, no_tag) + f"</{section}>"
        + "</SourceDocuments>"
        + "</AuditFile>"
    )
    return xml


def generate_saft(start, end):
    cfg = FiscalConfig.get()
    docs = list(FiscalDocument.objects.filter(doc_date__gte=start, doc_date__lte=end)
                .select_related('doc_type', 'series').prefetch_related('lines')
                .order_by('number'))
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f'<AuditFile xmlns="{NS}">'
        + _header(cfg, start, end)
        + "<MasterFiles>" + _customers(docs) + "</MasterFiles>"
        + "<SourceDocuments>"
        + _sales_invoices(docs)
        + _working_documents(docs)
        + "</SourceDocuments>"
        + "</AuditFile>"
    )
    return xml
