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
    """Atualiza o desempenho do fornecedor a cada gravação de uma receção.

    HAVIA DUAS CONTAS DIFERENTES PARA A MESMA COISA, e davam números muito
    diferentes. Esta função ia somando por cima do valor anterior (uma média
    alisada: 90% do número antigo + 10% do novo), enquanto o botão "Recalcular"
    (`services.recalculate_supplier_performance`) refaz a conta a partir do
    histórico real. Para o MESMO fornecedor com UMA entrega, atrasada uma semana
    e incompleta a 60%, o automático dava nota 97 e o "Recalcular" dava 44.

    Um índice de desempenho que muda de 97 para 44 por se premir um botão não
    serve para decidir compras — e o número que o dono vê no quadro é o
    automático, isto é, o errado: pela média alisada, a PRIMEIRA entrega atrasada
    quase não se nota.

    Havia dois defeitos a mais, do mesmo desenho incremental:
      · `total_grns += 1` corria a CADA gravação da receção. Acrescentar depois o
        nº da fatura do fornecedor somava outra entrega que não existiu;
      · uma receção ANULADA continuava contada — e a penalização de uma entrega
        que não aconteceu ficava na nota do fornecedor para sempre.

    A correção é deixar de haver duas contas: passa a existir UMA, a que já
    estava escrita e testada no serviço. É recalculada a partir dos factos, pelo
    que é exacta, não acumula e trata a anulação sozinha (só conta receções
    validadas).
    """
    from .services import recalculate_supplier_performance
    recalculate_supplier_performance(instance.supplier)


def update_performance_on_po(sender, instance, created, **kwargs):
    """Mesma razão da função acima: uma só conta, a partir do histórico real."""
    from .services import recalculate_supplier_performance
    recalculate_supplier_performance(instance.supplier)


if _HAS_PROCUREMENT:
    post_save.connect(update_performance_on_grn, sender=GoodsReceipt)
    post_save.connect(update_performance_on_po, sender=PurchaseOrder)
