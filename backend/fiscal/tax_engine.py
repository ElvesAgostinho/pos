"""
Tax / IVA Engine — resolução parametrizável de taxas e motivos de isenção.

Uma linha pode indicar:
  - tax_code  -> resolve percentagem (e, se isenta, o motivo) a partir de TaxRate;
  - tax_percentage direto (retrocompatível);
Se nada for indicado, aplica-se a taxa marcada como is_default.
"""
from decimal import Decimal

from .models import TaxRate, TaxExemptionReason, FiscalConfig

_cache = {}


def _rates():
    rates = {r.code: r for r in TaxRate.objects.filter(is_active=True)}
    return rates


def default_rate():
    return TaxRate.objects.filter(is_active=True, is_default=True).first()


def resolve(line: dict):
    """Devolve (percentage: Decimal, exemption_reason: str|None) para uma linha."""
    rates = _rates()
    code = line.get('tax_code')
    rate = None
    if code and code in rates:
        rate = rates[code]
    elif 'tax_percentage' in line and line.get('tax_percentage') is not None:
        pct = Decimal(str(line['tax_percentage']))
        reason = line.get('exemption_reason')
        if pct == 0 and not reason:
            cfg = FiscalConfig.get()
            er = TaxExemptionReason.objects.filter(code=cfg.default_exemption_code).first()
            reason = er.description if er else 'Isento nos termos da legislação em vigor'
        return pct, (reason if pct == 0 else None)
    else:
        rate = default_rate()

    if not rate:
        return Decimal('0'), 'Isento nos termos da legislação em vigor'

    if rate.percentage == 0 or rate.is_exempt:
        reason = line.get('exemption_reason')
        if not reason:
            cfg = FiscalConfig.get()
            er = TaxExemptionReason.objects.filter(code=cfg.default_exemption_code).first()
            reason = er.description if er else 'Isento nos termos da legislação em vigor'
        return Decimal(str(rate.percentage)), reason
    return Decimal(str(rate.percentage)), None
