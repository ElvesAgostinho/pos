from django.core.management.base import BaseCommand
from fiscal.models import (FiscalConfig, FiscalDocType, FiscalSeries,
                           TaxRate, TaxExemptionReason)

# Tax/IVA Engine — taxas de IVA de Angola (parametrizáveis).
TAX_RATES = [
    # code, name, percentage, is_default, is_exempt
    ('IVA14', 'IVA — Taxa Normal', 14, True, False),
    ('IVA7', 'IVA — Taxa Reduzida', 7, False, False),
    ('IVA5', 'IVA — Taxa Reduzida (hotelaria/restauração)', 5, False, False),
    ('IVA0', 'IVA — Taxa Zero', 0, False, False),
    ('ISE', 'Isento de IVA', 0, False, True),
]
EXEMPTIONS = [
    ('M01', 'Isento nos termos da legislação em vigor'),
    ('M02', 'Operação não sujeita a IVA'),
    ('M04', 'Isento — exportação de bens'),
    ('M05', 'Isento — prestação de serviços a não residente'),
    ('M99', 'Isento nos termos da legislação em vigor'),
]

# Catálogo AGT (Rules Engine) — parametrizável; ajusta-se sem tocar no núcleo do ERP.
DOC_TYPES = [
    # code, name, saft_type, invoice_type, signable, prints_mention, rectifying, allow_negative
    ('FT', 'Factura', 'SalesInvoice', 'FT', True, True, False, False),
    ('FR', 'Factura-Recibo', 'SalesInvoice', 'FR', True, True, False, False),
    ('FS', 'Factura Simplificada', 'SalesInvoice', 'FS', True, True, False, False),
    ('VD', 'Venda a Dinheiro', 'SalesInvoice', 'VD', True, True, False, False),
    ('NC', 'Nota de Crédito', 'SalesInvoice', 'NC', True, True, True, True),
    ('ND', 'Nota de Débito', 'SalesInvoice', 'ND', True, True, True, False),
    ('CM', 'Consulta de Mesa', 'WorkingDocument', 'CM', True, True, False, False),
    ('OR', 'Orçamento', 'WorkingDocument', 'OR', False, True, False, False),
    ('PF', 'Proforma', 'WorkingDocument', 'PF', False, True, False, False),
    ('GR', 'Guia de Remessa', 'MovementOfGoods', 'GR', True, True, False, False),
    ('GT', 'Guia de Transporte', 'MovementOfGoods', 'GT', True, True, False, False),
    ('RC', 'Recibo', 'Payment', 'RC', False, True, False, False),
]


class Command(BaseCommand):
    help = 'Seed do catálogo fiscal AGT (tipos de documento, config e série demo).'

    def handle(self, *args, **opts):
        cfg = FiscalConfig.get()
        if not cfg.company_name:
            cfg.company_name = 'System Mwana Lodge, Lda'
            cfg.company_nif = '5000000000'
            cfg.certificate_number = '0000'
            cfg.environment = 'TEST'
        # Dados de cabeçalho/rodapé exigidos na fatura legal (preenche se em falta).
        if not cfg.trade_name:
            cfg.trade_name = 'System Mwana Lodge'
            cfg.address_line = 'Avenida Principal, nº 1, Luanda'
            cfg.city = 'Luanda'
            cfg.province = 'Luanda'
            cfg.phone = '+244 900 000 000'
            cfg.share_capital = 'AOA 1.000.000'
            cfg.crc_number = 'C.R.C.L. nº 000-00'
        cfg.save()

        for code, name, saft, inv, sign, mention, rect, neg in DOC_TYPES:
            FiscalDocType.objects.update_or_create(
                code=code,
                defaults=dict(name=name, saft_type=saft, invoice_type=inv, signable=sign,
                              prints_mention=mention, is_rectifying=rect, allow_negative=neg,
                              is_active=True),
            )
        self.stdout.write(self.style.SUCCESS(f'{len(DOC_TYPES)} tipos de documento OK.'))

        for code, name, pct, default, exempt in TAX_RATES:
            TaxRate.objects.update_or_create(
                code=code,
                defaults=dict(name=name, percentage=pct, is_default=default,
                              is_exempt=exempt, tax_type='IVA', is_active=True))
        for code, desc in EXEMPTIONS:
            TaxExemptionReason.objects.update_or_create(code=code, defaults=dict(description=desc, is_active=True))
        self.stdout.write(self.style.SUCCESS(f'{len(TAX_RATES)} taxas IVA + {len(EXEMPTIONS)} motivos de isenção OK.'))

        # Uma série 'A' por cada tipo de documento (produção precisa de todas prontas).
        year = 2026
        for dt in FiscalDocType.objects.filter(is_active=True):
            FiscalSeries.objects.get_or_create(
                code='A', doc_type=dt, year=year,
                defaults=dict(prefix='', certified=True, environment='TEST', is_active=True),
            )
        self.stdout.write(self.style.SUCCESS(
            f'Séries A/{year} criadas para {FiscalDocType.objects.filter(is_active=True).count()} tipos de documento.'))
