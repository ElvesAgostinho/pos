"""
Supplier Performance Engine.

Centraliza o cálculo do Índice de Desempenho do Fornecedor (0-100) a partir do
histórico real de Encomendas (PO) e Receções (GRN) do módulo de Compras.

Os signals (esm/signals.py) mantêm o perfil atualizado de forma incremental a cada
receção validada; este serviço permite um recálculo completo (full recompute), útil
para o botão "Recalcular" no Backoffice ou para um cronjob de consolidação noturno.
"""
from decimal import Decimal


# Pesos do índice global de desempenho (somam 1.0)
WEIGHT_PUNCTUALITY = Decimal("0.40")
WEIGHT_COMPLETENESS = Decimal("0.40")
WEIGHT_PRICE = Decimal("0.10")
WEIGHT_RETURNS = Decimal("0.10")


def compute_overall_score(profile) -> int:
    """Combina as métricas parciais num índice único de 0 a 100."""
    score = (
        Decimal(profile.punctuality_percentage) * WEIGHT_PUNCTUALITY
        + Decimal(profile.completeness_percentage) * WEIGHT_COMPLETENESS
        + (Decimal("100") - Decimal(profile.price_variance_percentage)) * WEIGHT_PRICE
        + (Decimal("100") - Decimal(profile.return_rate_percentage)) * WEIGHT_RETURNS
    )
    return int(max(Decimal("0"), min(Decimal("100"), score)))


def recalculate_supplier_performance(supplier):
    """
    Reconstrói o SupplierPerformanceProfile de um fornecedor a partir do zero,
    varrendo todas as suas Encomendas e Receções validadas.

    Devolve o perfil atualizado. Se o módulo de Compras não estiver instalado
    (licença sem `procurement`), apenas garante que o perfil existe.
    """
    from .models import SupplierPerformanceProfile

    profile, _ = SupplierPerformanceProfile.objects.get_or_create(supplier=supplier)

    try:
        from procurement.models import PurchaseOrder, GoodsReceipt
    except ImportError:
        # Módulo de Compras desativado por licença: nada a agregar.
        return profile

    purchase_orders = PurchaseOrder.objects.filter(supplier=supplier)
    grns = (
        GoodsReceipt.objects.filter(supplier=supplier, status="Validated")
        .select_related("purchase_order")
        .prefetch_related("lines", "purchase_order__lines")
    )

    profile.total_orders = purchase_orders.count()
    profile.total_grns = grns.count()

    on_time = 0
    punctuality_evaluable = 0
    completeness_ratios = []

    for grn in grns:
        po = grn.purchase_order
        if po and po.expected_delivery_date:
            punctuality_evaluable += 1
            if grn.receipt_date.date() <= po.expected_delivery_date:
                on_time += 1

        if po:
            total_ordered = sum((line.quantity_requested for line in po.lines.all()), Decimal("0"))
            total_received = sum((line.quantity_received for line in grn.lines.all()), Decimal("0"))
            if total_ordered > 0:
                ratio = min(Decimal("1"), total_received / total_ordered)
                completeness_ratios.append(ratio)

    if punctuality_evaluable > 0:
        profile.punctuality_percentage = (Decimal(on_time) / Decimal(punctuality_evaluable)) * Decimal("100")
    if completeness_ratios:
        avg = sum(completeness_ratios, Decimal("0")) / Decimal(len(completeness_ratios))
        profile.completeness_percentage = avg * Decimal("100")

    profile.overall_score = compute_overall_score(profile)
    profile.save()
    return profile
