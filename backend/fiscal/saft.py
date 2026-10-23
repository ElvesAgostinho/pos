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


def _products(docs):
    """PRODUTOS (2.4) — a AGT exige a lista dos artigos vendidos no ficheiro.

    Sem esta secção o SAF-T é recusado: a AGT quer poder ligar cada linha de fatura a
    um produto do catálogo. O código do produto é o do artigo; quando a linha não tem
    artigo (ex.: serviço avulso), usa-se a própria descrição como código.
    """
    seen, out = {}, []
    for d in docs:
        for ln in d.lines.all():
            code = (ln.description or 'ART')[:60]
            if code in seen:
                continue
            seen[code] = True
            out.append(
                "<Product>"
                + _e('ProductType', 'P')          # P=produto, S=serviço
                + _e('ProductCode', code)
                + _e('ProductDescription', ln.description or code)
                + _e('ProductNumberCode', code)
                + "</Product>"
            )
    return ''.join(out)


def _tax_table(docs):
    """TAXTABLE (2.5) — as taxas de IVA usadas no ficheiro.

    Cada percentagem que aparece nas linhas tem de estar declarada aqui, com o motivo
    de isenção quando a taxa é zero. É o que permite à AGT conferir o imposto liquidado.
    """
    from .models import TaxRate
    taxas, out = {}, []
    for d in docs:
        for ln in d.lines.all():
            taxas.setdefault(Decimal(str(ln.tax_percentage or 0)), ln.exemption_reason)
    if not taxas:
        return ''
    for pct, isencao in sorted(taxas.items()):
        tr = TaxRate.objects.filter(percentage=pct).first()
        code = tr.code if tr else (f'IVA{int(pct)}' if pct else 'ISE')
        out.append(
            "<TaxTableEntry>"
            + _e('TaxType', 'IVA')
            + _e('TaxCountryRegion', 'AO')
            + _e('TaxCode', code)
            + _e('Description', tr.name if tr else (f'IVA {pct}%' if pct else 'Isento'))
            + (_e('TaxPercentage', pct) if pct else _e('TaxPercentage', '0.00'))
            + "</TaxTableEntry>"
        )
    # As entradas vivem DENTRO de <TaxTable> — sem o invólucro, a AGT rejeita o ficheiro.
    return "<TaxTable>" + ''.join(out) + "</TaxTable>"


def _lines_xml(doc):
    parts = []
    for i, ln in enumerate(doc.lines.all(), 1):
        parts.append(
            "<Line>"
            + _e('LineNumber', i)
            # Sem ProductCode, a AGT não consegue ligar a linha ao produto do MasterFile.
            + _e('ProductCode', (ln.description or 'ART')[:60])
            + _e('ProductDescription', ln.description or 'ART')
            + _e('Description', ln.description)
            + _e('Quantity', ln.quantity)
            + _e('UnitOfMeasure', 'UN')
            + _e('UnitPrice', ln.unit_price)
            # UMA NOTA DE CRÉDITO LANÇA-SE A DÉBITO. O montante da linha de uma NC
            # vai em <DebitAmount>; o de uma factura (ou de uma Nota de Débito, que
            # aumenta o que o cliente deve) vai em <CreditAmount>. Com tudo em
            # CreditAmount, a soma de controlo <TotalDebit> do ficheiro não
            # correspondia a nenhum valor lá dentro — e o validador da AGT rejeita
            # um ficheiro cujas somas não fecham com as linhas.
            + _e('DebitAmount' if doc.doc_type.code == 'NC' else 'CreditAmount',
                 ln.line_total)
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


def _montante_das_linhas(doc):
    """Soma dos montantes das linhas do documento, SEM IMPOSTO.

    É isto — e não o total com IVA — que as somas de controlo do SAF-T medem:
    <TotalCredit> é a soma de controlo do campo <CreditAmount> das linhas, e
    <CreditAmount> é o valor da linha sem imposto. Declarar lá o total com IVA
    inflacionava as vendas do período pelo valor do próprio imposto, e deixava o
    ficheiro a contradizer-se: a soma anunciada não batia com a soma das linhas
    que iam dentro dele.
    """
    return sum((Decimal(str(l.line_total or 0)) for l in doc.lines.all()), Decimal('0'))


def _soma(valores):
    return f"{sum(valores, Decimal('0')):.2f}"


def _nao_anulados(docs):
    """Os documentos que CONTAM para as somas de controlo.

    Um documento ANULADO continua no ficheiro — é o que prova à AGT que o número
    foi usado e não saltado (numeração sem buracos) — mas NÃO é receita: o campo
    <DocumentStatus> diz 'A' e as somas de controlo deixam-no de fora. Antes
    somava como qualquer outro: um mês com anulações declarava mais vendas do que
    a casa tinha feito, e era o total declarado que ficava a mais.
    """
    return [d for d in docs if d.status != 'A']


def _sales_invoices(docs):
    inv = [d for d in docs if d.doc_type.saft_type == 'SalesInvoice']
    if not inv:
        return ''
    body = ''.join(_doc_xml(d, 'Invoice', 'InvoiceNo') for d in inv)
    # Convenção SAF-T (OECD/AT, a mesma família do SAF-T-AO): a Nota de Crédito é um
    # DÉBITO à receita — reduz o que a casa vendeu, não soma como se fosse mais uma
    # venda. O resto (faturas normais + Nota de Débito, que aumenta o que se deve) é
    # CRÉDITO. Antes, TUDO ia para TotalCredit e TotalDebit ficava sempre "0.00" —
    # um período com estornos inflacionava o total de vendas declarado à AGT.
    vivos = _nao_anulados(inv)
    total_debit = _soma(_montante_das_linhas(d) for d in vivos if d.doc_type.code == 'NC')
    total_credit = _soma(_montante_das_linhas(d) for d in vivos if d.doc_type.code != 'NC')
    return ("<SalesInvoices>" + _e('NumberOfEntries', len(inv))
            + _e('TotalDebit', total_debit) + _e('TotalCredit', total_credit) + body + "</SalesInvoices>")


def _working_documents(docs):
    wd = [d for d in docs if d.doc_type.saft_type == 'WorkingDocument']
    if not wd:
        return ''
    body = ''.join(_doc_xml(d, 'WorkDocument', 'DocumentNumber') for d in wd)
    total = _soma(_montante_das_linhas(d) for d in _nao_anulados(wd))
    return ("<WorkingDocuments>" + _e('NumberOfEntries', len(wd))
            + _e('TotalDebit', '0.00') + _e('TotalCredit', total) + body + "</WorkingDocuments>")


def document_xml(doc):
    """XML normalizado de UM documento (arquivo fiscal por documento)."""
    cfg = FiscalConfig.get()
    wrapper, no_tag = ('Invoice', 'InvoiceNo') if doc.doc_type.saft_type != 'WorkingDocument' else ('WorkDocument', 'DocumentNumber')
    section = 'SalesInvoices' if wrapper == 'Invoice' else 'WorkingDocuments'
    # Mesma convenção de _sales_invoices: uma Nota de Crédito sozinha vai para
    # TotalDebit, não TotalCredit; as somas são do montante das linhas (sem imposto)
    # e um documento anulado não conta como receita.
    e_debito = doc.doc_type.code == 'NC'
    montante = Decimal('0') if doc.status == 'A' else _montante_das_linhas(doc)
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f'<AuditFile xmlns="{NS}">'
        + _header(cfg, doc.doc_date, doc.doc_date)
        + "<MasterFiles>" + _customers([doc]) + "</MasterFiles>"
        + "<SourceDocuments>"
        + f"<{section}>" + _e('NumberOfEntries', 1)
        + _e('TotalDebit', f'{montante:.2f}' if e_debito else '0.00')
        + _e('TotalCredit', '0.00' if e_debito else f'{montante:.2f}')
        + _doc_xml(doc, wrapper, no_tag) + f"</{section}>"
        + "</SourceDocuments>"
        + "</AuditFile>"
    )
    return xml


def generate_saft(start, end, module=None):
    """SAF-T do período. `module` restringe à origem (ex.: 'pos').

    Um restaurante que só comunica o POS não pode mandar no mesmo ficheiro as faturas
    do alojamento — e um hotel que vende só o POS nem sequer as tem.
    """
    cfg = FiscalConfig.get()
    qs = FiscalDocument.objects.filter(doc_date__gte=start, doc_date__lte=end)
    if module:
        qs = qs.filter(source_module=module)
    docs = list(qs.select_related('doc_type', 'series').prefetch_related('lines')
                .order_by('number'))
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f'<AuditFile xmlns="{NS}">'
        + _header(cfg, start, end)
        + "<MasterFiles>" + _customers(docs) + _products(docs) + _tax_table(docs)
        + "</MasterFiles>"
        + "<SourceDocuments>"
        + _sales_invoices(docs)
        + _working_documents(docs)
        + "</SourceDocuments>"
        + "</AuditFile>"
    )
    return xml
