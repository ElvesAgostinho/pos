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

# O campo `exemption_reason` da linha do documento tem 120 caracteres.
LIMITE_MOTIVO = 120


def motivo_por_defeito():
    """O MOTIVO DE ISENÇÃO que sai IMPRESSO na linha da factura.

    A ficha da isenção tem dois textos e NÃO são iguais:
      - `text`        — a menção legal que sai na factura e no SAF-T
                        (ex.: "Isento Artigo 9.º do CIVA");
      - `description` — a norma completa, para consulta interna
                        (ex.: "IVA - não confere direito à dedução / Artigo 72.º
                        n.º 4 do CIVA").

    Usava-se a `description`: a factura do cliente saía com a nota interna em vez
    da menção legal, e o SAF-T declarava à AGT um motivo de isenção que não é o
    texto que a lei manda. Pior, a `description` pode ter até 400 caracteres e o
    campo da linha tem 120 — em PostgreSQL (produção) a emissão rebentava a meio
    com um erro de base de dados; em SQLite (desenvolvimento) passava em silêncio,
    por isso nunca se via a vir.
    """
    cfg = FiscalConfig.get()
    er = TaxExemptionReason.objects.filter(code=cfg.default_exemption_code).first()
    texto = (getattr(er, 'text', None) or getattr(er, 'description', None)) if er else None
    return (texto or 'Isento nos termos da legislação em vigor')[:LIMITE_MOTIVO]


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
            reason = motivo_por_defeito()
        return pct, ((reason or '')[:LIMITE_MOTIVO] if pct == 0 else None)
    else:
        rate = default_rate()

    if not rate:
        return Decimal('0'), 'Isento nos termos da legislação em vigor'

    if rate.percentage == 0 or rate.is_exempt:
        reason = line.get('exemption_reason') or motivo_por_defeito()
        return Decimal(str(rate.percentage)), reason[:LIMITE_MOTIVO]
    return Decimal(str(rate.percentage)), None
