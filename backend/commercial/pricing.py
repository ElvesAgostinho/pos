"""Motor de preços consumido pelo POS: escolhe a melhor promoção ativa para um artigo."""
from decimal import Decimal
from django.db.models import Q
from .models import Promotion


def apply(outlet, item, unit_price, when=None):
    """
    Devolve (preco_com_desconto, promocao_aplicada|None, valor_desconto).
    Escolhe a promoção ativa (deste outlet ou global) que dá MAIOR desconto ao artigo.
    """
    unit_price = Decimal(str(unit_price))
    best, best_disc = None, Decimal('0')
    qs = Promotion.objects.filter(is_active=True).filter(Q(outlet=outlet) | Q(outlet__isnull=True))
    for p in qs:
        if not p.active_now(when) or not p.matches(item):
            continue
        d = p.discount_amount(unit_price)
        if d > best_disc:
            best, best_disc = p, d
    return (unit_price - best_disc, best, best_disc)
