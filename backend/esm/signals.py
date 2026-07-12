from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Supplier, SupplierPerformanceProfile


@receiver(post_save, sender=Supplier)
def create_supplier_performance_profile(sender, instance, created, **kwargs):
    if created:
        SupplierPerformanceProfile.objects.create(supplier=instance)


# --- Signals do motor de performance que dependem do módulo de Compras (procurement) ---
# Só são ligados se o módulo estiver ativo na licença; assim o ESM funciona de forma
# autónoma (licença ESM sem Compras) sem partir o arranque.
try:
    from procurement.models import GoodsReceipt, PurchaseOrder
    _HAS_PROCUREMENT = True
except Exception:
    _HAS_PROCUREMENT = False


def update_performance_on_grn(sender, instance, **kwargs):
    """Atualiza a performance do fornecedor quando uma GRN é validada."""
    if instance.status == 'Validated':
        profile, _ = SupplierPerformanceProfile.objects.get_or_create(supplier=instance.supplier)
        profile.total_grns += 1

        if instance.purchase_order and instance.purchase_order.expected_delivery_date:
            expected_date = instance.purchase_order.expected_delivery_date
            actual_date = instance.receipt_date.date()
            if actual_date <= expected_date:
                new_punctuality = min(100.00, float(profile.punctuality_percentage) * 0.9 + 10.0)
            else:
                delay_days = (actual_date - expected_date).days
                penalty = min(50, delay_days * 5)  # 5% de penalidade por dia
                new_punctuality = max(0.00, float(profile.punctuality_percentage) * 0.9 + ((100 - penalty) * 0.1))
            profile.punctuality_percentage = new_punctuality

        if instance.purchase_order:
            total_ordered = sum(line.quantity_requested for line in instance.purchase_order.lines.all())
            total_received = sum(line.quantity_received for line in instance.lines.all())
            if total_ordered > 0:
                completeness_ratio = float(total_received) / float(total_ordered)
                completeness_score = min(100.0, completeness_ratio * 100)
                profile.completeness_percentage = (float(profile.completeness_percentage) * 0.9) + (completeness_score * 0.1)

        from .services import compute_overall_score
        profile.overall_score = compute_overall_score(profile)
        profile.save()


def update_performance_on_po(sender, instance, created, **kwargs):
    if created:
        profile, _ = SupplierPerformanceProfile.objects.get_or_create(supplier=instance.supplier)
        profile.total_orders += 1
        profile.save()


if _HAS_PROCUREMENT:
    post_save.connect(update_performance_on_grn, sender=GoodsReceipt)
    post_save.connect(update_performance_on_po, sender=PurchaseOrder)
