"""
Consumo de stock na venda do POS (fecha o ciclo comprar→stock→vender→consumir).
Quando o ticket é pago, dá SAÍDA de stock no armazém do outlet:
- artigo PRODUZIDO (com ficha técnica) → consome os ingredientes proporcionalmente;
- artigo de REVENDA → consome o próprio artigo.
Idempotente (só uma vez por ticket).
"""
from decimal import Decimal


def _active_recipe(item):
    from production.models import Recipe
    # A ficha técnica em vigor: prioriza a Aprovada, depois a versão mais recente.
    return (Recipe.objects.filter(final_item=item, is_active=True)
            .prefetch_related('lines__component_item')
            .order_by('-status', '-version', '-id').first())


def consume_ticket_stock(ticket, by=None):
    if ticket.stock_consumed:
        return
    from inventory.models import Warehouse
    from inventory import stock as stock_engine
    wh = ticket.outlet.warehouse or Warehouse.objects.first()
    if not wh:
        return  # sem armazém configurado, não há stock a mover

    for line in ticket.lines.select_related('item').all():
        item = line.item
        sold = Decimal(str(line.quantity))
        recipe = _active_recipe(item)
        if recipe and recipe.lines.exists():
            yield_q = recipe.yield_quantity or Decimal('1')
            for comp in recipe.lines.select_related('component_item').all():
                per_unit = comp.effective_quantity / yield_q
                stock_engine.move_out(wh, comp.component_item, per_unit * sold,
                                      reference=ticket.ticket_number, note=f'Consumo p/ {item.code}',
                                      by=by, mtype='CONSUMPTION')
        else:
            stock_engine.move_out(wh, item, sold, reference=ticket.ticket_number,
                                  note='Venda POS', by=by, mtype='CONSUMPTION')

    ticket.stock_consumed = True
    ticket.save(update_fields=['stock_consumed'])
