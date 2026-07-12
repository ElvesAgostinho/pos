"""
MOTOR SAF-T (multi-perfil) — o núcleo fiscal exporta VÁRIOS tipos de SAF-T a partir
dos mesmos dados. Arquitetura pensada para crescer por país/perfil sem tocar no
resto do ERP (PMS/Restauração/POS só EMITEM documentos; a lógica fiscal vive aqui).

Perfis:
  faturacao     — Faturas, NC/ND, recibos, clientes, produtos, impostos  (obrigatório AGT)
  contabilidade — Plano de contas, diários, lançamentos (GeneralLedger)
  inventario    — Produtos, armazéns, existências e movimentos de stock
  ativos        — Ativos fixos (equipamentos/recursos) e depreciações
"""
from decimal import Decimal
from xml.sax.saxutils import escape

from .models import FiscalConfig
from . import saft as saft_faturacao   # perfil de faturação já existente

NS = 'urn:OECD:StandardAuditFile-Tax:AO_1.01_01'


def _e(tag, val):
    return f"<{tag}>{escape(str(val if val is not None else ''))}</{tag}>"


def _header(cfg, start, end, kind):
    return (
        "<Header>"
        + _e('AuditFileVersion', cfg.saft_version)
        + _e('CompanyID', cfg.company_nif or '')
        + _e('TaxRegistrationNumber', cfg.company_nif or '')
        + _e('TaxAccountingBasis', kind)          # F=Faturação, C=Contabilidade, I=Inventário, A=Ativos
        + _e('CompanyName', cfg.company_name or '')
        + _e('FiscalYear', start.year)
        + _e('StartDate', start)
        + _e('EndDate', end)
        + _e('CurrencyCode', 'AOA')
        + _e('DateCreated', end)
        + _e('TaxEntity', 'Global')
        + _e('ProductCompanyTaxID', cfg.company_nif or '')
        + _e('SoftwareCertificateNumber', cfg.certificate_number or '0000')
        + _e('ProductID', 'SystemMwanaLodge/FiscalEngine')
        + _e('ProductVersion', '1.0')
        + "</Header>"
    )


def _wrap(cfg, start, end, kind, body):
    return ('<?xml version="1.0" encoding="UTF-8"?>'
            f'<AuditFile xmlns="{NS}">' + _header(cfg, start, end, kind) + body + '</AuditFile>')


# ---------------------------------------------------------------- CONTABILIDADE
def generate_contabilidade(start, end):
    """SAF-T Contabilidade — GeneralLedgerAccounts + GeneralLedgerEntries (PGC-AO)."""
    cfg = FiscalConfig.get()
    try:
        from accounting.models import Account, JournalEntry
    except Exception:
        raise ValueError('O módulo de Contabilidade não está instalado/licenciado.')

    # Plano de contas
    accs = Account.objects.filter(is_active=True).order_by('code')
    accounts_xml = ''.join(
        "<Account>"
        + _e('AccountID', a.code) + _e('AccountDescription', a.name)
        + _e('GroupingCategory', 'GM' if not a.is_movement else 'GA')
        + _e('GroupingCode', a.parent.code if a.parent else '')
        + _e('TaxonomyCode', a.account_class)
        + "</Account>" for a in accs)

    # Lançamentos LANÇADOS do período
    entries = (JournalEntry.objects.filter(status='POSTED', entry_date__gte=start, entry_date__lte=end)
               .select_related('journal').prefetch_related('lines__account').order_by('entry_date', 'id'))
    total_d = total_c = Decimal('0')
    journals = {}
    for e in entries:
        journals.setdefault(e.journal.code, {'name': e.journal.name, 'entries': []})['entries'].append(e)
        total_d += e.total_debit
        total_c += e.total_credit

    journals_xml = ''
    for code, j in journals.items():
        tx = ''
        for e in j['entries']:
            lines = ''.join(
                ("<DebitLine>" if l.debit else "<CreditLine>")
                + _e('RecordID', l.id) + _e('AccountID', l.account.code)
                + _e('SystemEntryDate', e.created_at.strftime('%Y-%m-%dT%H:%M:%S'))
                + _e('Description', (l.description or e.description)[:200])
                + _e('DebitAmount' if l.debit else 'CreditAmount', l.debit or l.credit)
                + ("</DebitLine>" if l.debit else "</CreditLine>")
                for l in e.lines.all())
            tx += ("<Transaction>"
                   + _e('TransactionID', e.number) + _e('Period', e.entry_date.month)
                   + _e('TransactionDate', e.entry_date) + _e('SourceID', e.created_by or 'SISTEMA')
                   + _e('Description', e.description[:200]) + _e('DocArchivalNumber', e.reference or e.number)
                   + _e('TransactionType', 'N') + _e('GLPostingDate', e.entry_date)
                   + _e('CustomerID', '') + _e('SupplierID', '')
                   + "<Lines>" + lines + "</Lines>"
                   + "</Transaction>")
        journals_xml += ("<Journal>" + _e('JournalID', code) + _e('Description', j['name']) + tx + "</Journal>")

    body = (
        "<MasterFiles><GeneralLedgerAccounts>" + accounts_xml + "</GeneralLedgerAccounts></MasterFiles>"
        + "<GeneralLedgerEntries>"
        + _e('NumberOfEntries', entries.count())
        + _e('TotalDebit', f'{total_d:.2f}') + _e('TotalCredit', f'{total_c:.2f}')
        + journals_xml
        + "</GeneralLedgerEntries>"
    )
    return _wrap(cfg, start, end, 'C', body)


# ---------------------------------------------------------------- INVENTÁRIO
def generate_inventario(start, end):
    """SAF-T Inventário — produtos, armazéns, existências e movimentos (MovementOfGoods)."""
    cfg = FiscalConfig.get()
    try:
        from inventory.models import Item, Warehouse, StockLevel, StockMovement
    except Exception:
        raise ValueError('O módulo de Inventário não está instalado/licenciado.')

    products = ''.join(
        "<Product>"
        + _e('ProductType', 'P') + _e('ProductCode', i.code) + _e('ProductDescription', i.name)
        + _e('ProductNumberCode', i.barcode or i.code)
        + _e('UnitOfMeasure', i.base_uom.code if i.base_uom else 'UN')
        + _e('UnitPrice', i.sale_price or 0) + _e('AverageCost', i.current_average_cost or 0)
        + "</Product>" for i in Item.objects.select_related('base_uom').filter(is_active=True))

    warehouses = ''.join(
        "<Warehouse>" + _e('WarehouseID', w.id) + _e('WarehouseDescription', w.name) + "</Warehouse>"
        for w in Warehouse.objects.all())

    stock = ''.join(
        "<StockItem>"
        + _e('ProductCode', s.item.code) + _e('WarehouseID', s.warehouse_id)
        + _e('ClosingStockQuantity', s.quantity_on_hand or 0)
        + _e('ClosingStockValue', (s.quantity_on_hand or 0) * (s.item.current_average_cost or 0))
        + "</StockItem>"
        for s in StockLevel.objects.select_related('item', 'warehouse').filter(quantity_on_hand__gt=0))

    movs = (StockMovement.objects.select_related('item', 'warehouse')
            .filter(created_at__date__gte=start, created_at__date__lte=end).order_by('created_at'))
    mov_xml = ''.join(
        "<StockMovement>"
        + _e('MovementID', m.id) + _e('MovementDate', m.created_at.date())
        + _e('MovementType', m.movement_type) + _e('ProductCode', m.item.code)
        + _e('WarehouseID', m.warehouse_id) + _e('Quantity', m.quantity)
        + _e('UnitCost', m.unit_cost or 0) + _e('Reference', m.reference or '')
        + "</StockMovement>" for m in movs)

    body = (
        "<MasterFiles>" + f"<Products>{products}</Products>" + f"<Warehouses>{warehouses}</Warehouses>" + "</MasterFiles>"
        + "<StockOnHand>" + stock + "</StockOnHand>"
        + "<MovementOfGoods>" + _e('NumberOfMovementLines', movs.count()) + mov_xml + "</MovementOfGoods>"
    )
    return _wrap(cfg, start, end, 'I', body)


# ---------------------------------------------------------------- ATIVOS FIXOS
def generate_ativos(start, end):
    """SAF-T Ativos Fixos — equipamentos/recursos do hotel (base para depreciações)."""
    cfg = FiscalConfig.get()
    try:
        from identity.models import HotelResource
    except Exception:
        raise ValueError('Estrutura do hotel (recursos) indisponível.')

    assets = ''.join(
        "<Asset>"
        + _e('AssetID', a.code) + _e('AssetDescription', a.name)
        + _e('AssetType', a.resource_type) + _e('Location', a.location or '')
        + _e('AssetStatus', a.status)
        + "<Depreciations>"
        + "<Depreciation>" + _e('DepreciationMethod', 'LINEAR') + _e('DepreciationRate', '0.00')
        + _e('DepreciationAmount', '0.00') + "</Depreciation>"
        + "</Depreciations>"
        + "</Asset>"
        for a in HotelResource.objects.filter(is_active=True))

    body = ("<MasterFiles><AssetsTable>" + assets + "</AssetsTable></MasterFiles>")
    return _wrap(cfg, start, end, 'A', body)


# ---------------------------------------------------------------- REGISTO DE PERFIS
PROFILES = {
    'faturacao': {
        'label': 'SAF-T Faturação',
        'desc': 'Faturas, notas de crédito/débito, recibos, clientes, produtos e impostos. Obrigatório para a AGT.',
        'gen': lambda s, e: saft_faturacao.generate_saft(s, e),
        'required': True,
    },
    'contabilidade': {
        'label': 'SAF-T Contabilidade',
        'desc': 'Plano de contas (PGC-AO), diários e lançamentos (partidas dobradas).',
        'gen': generate_contabilidade,
        'required': False,
    },
    'inventario': {
        'label': 'SAF-T Inventário',
        'desc': 'Produtos, armazéns, existências e movimentos de stock com custos.',
        'gen': generate_inventario,
        'required': False,
    },
    'ativos': {
        'label': 'SAF-T Ativos Fixos',
        'desc': 'Equipamentos e recursos do hotel, base para depreciações e abates.',
        'gen': generate_ativos,
        'required': False,
    },
}


def generate(profile, start, end):
    p = PROFILES.get(profile)
    if not p:
        raise ValueError(f'Perfil SAF-T desconhecido: {profile}')
    return p['gen'](start, end)


def validate_xml(xml_text):
    """Validação estrutural do XML (bem-formado + elementos obrigatórios)."""
    import xml.etree.ElementTree as ET
    problems = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as ex:
        return {'valid': False, 'problems': [f'XML mal formado: {ex}'], 'elements': 0}
    ns = {'s': NS}
    if not root.tag.endswith('AuditFile'):
        problems.append('O elemento raiz não é <AuditFile>.')
    hdr = root.find('s:Header', ns)
    if hdr is None:
        problems.append('Falta o <Header>.')
    else:
        for req in ('CompanyID', 'TaxRegistrationNumber', 'CompanyName', 'StartDate', 'EndDate', 'SoftwareCertificateNumber'):
            el = hdr.find(f's:{req}', ns)
            if el is None or not (el.text or '').strip():
                problems.append(f'Header: falta ou está vazio <{req}>.')
        cert = hdr.find('s:SoftwareCertificateNumber', ns)
        if cert is not None and (cert.text or '') in ('0000', ''):
            problems.append('Aviso: nº de certificado AGT não definido (0000) — o ficheiro não é aceite em produção.')
    return {'valid': not [p for p in problems if not p.startswith('Aviso')],
            'problems': problems, 'elements': len(list(root.iter()))}
