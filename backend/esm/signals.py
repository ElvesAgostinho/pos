from django.db.models.signals import post_save
from django.dispatch import receiver
from django.db.models import Sum, F, ExpressionWrapper, DecimalField
from django.utils import timezone
from .models import Supplier, SupplierPerformanceProfile
from procurement.models import GoodsReceipt, PurchaseOrder

@receiver(post_save, sender=Supplier)
def create_supplier_performance_profile(sender, instance, created, **kwargs):
    if created:
        SupplierPerformanceProfile.objects.create(supplier=instance)

@receiver(post_save, sender=GoodsReceipt)
def update_performance_on_grn(sender, instance, **kwargs):
    """
    Updates the supplier's performance when a GRN is validated.
    """
    if instance.status == 'Validated':
        profile, _ = SupplierPerformanceProfile.objects.get_or_create(supplier=instance.supplier)
        
        # Incrementar contagem
        profile.total_grns += 1
        
        # Simples lógica de pontualidade: Se a data de receção for <= data esperada da PO
        if instance.purchase_order and instance.purchase_order.expected_delivery_date:
            expected_date = instance.purchase_order.expected_delivery_date
            actual_date = instance.receipt_date.date()
            
            # Ajuste de pontualidade (média ponderada simplificada)
            if actual_date <= expected_date:
                # Recebeu a tempo ou antes
                new_punctuality = min(100.00, float(profile.punctuality_percentage) * 0.9 + 10.0)
            else:
                # Atrasado
                delay_days = (actual_date - expected_date).days
                penalty = min(50, delay_days * 5) # 5% de penalidade por dia
                new_punctuality = max(0.00, float(profile.punctuality_percentage) * 0.9 + ((100 - penalty) * 0.1))
                
            profile.punctuality_percentage = new_punctuality
            
        # Simples lógica de completude (Completeness)
        # Comparar quantidade recebida com quantidade pedida
        if instance.purchase_order:
            total_ordered = sum(line.quantity_requested for line in instance.purchase_order.lines.all())
            total_received = sum(line.quantity_received for line in instance.lines.all())
            
            if total_ordered > 0:
                completeness_ratio = float(total_received) / float(total_ordered)
                completeness_score = min(100.0, completeness_ratio * 100)
                profile.completeness_percentage = (float(profile.completeness_percentage) * 0.9) + (completeness_score * 0.1)

        # Cálculo do Score Geral
        profile.overall_score = int(
            (float(profile.punctuality_percentage) * 0.4) + 
            (float(profile.completeness_percentage) * 0.4) + 
            ((100 - float(profile.price_variance_percentage)) * 0.1) +
            ((100 - float(profile.return_rate_percentage)) * 0.1)
        )
        
        profile.save()

@receiver(post_save, sender=PurchaseOrder)
def update_performance_on_po(sender, instance, created, **kwargs):
    if created:
        profile, _ = SupplierPerformanceProfile.objects.get_or_create(supplier=instance.supplier)
        profile.total_orders += 1
        profile.save()
