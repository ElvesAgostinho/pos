"""
Consumo de stock na venda do POS (fecha o ciclo comprar→stock→vender→consumir).
Quando o ticket é pago, dá SAÍDA de stock no armazém do outlet:
- artigo PRODUZIDO (com ficha técnica) → consome os ingredientes proporcionalmente;
- artigo de REVENDA → consome o próprio artigo.
Idempotente (só uma vez por ticket).
"""
from decimal import Decimal


def _active_recipe(item):   # noqa: mantido por compatibilidade de chamadas
    # O POS vende-se SOZINHO. Um cliente que só compra o POS não tem o motor de
    # Produção — e, sem ficha técnica, um hambúrguer sai do stock como hambúrguer
    # (revenda), não como pão+carne. O que não pode é a venda rebentar por causa
    # de um módulo que ele não comprou.
    # O POS é AUTOSSUFICIENTE: sem módulo de fichas técnicas, um hambúrguer sai do
    # stock como hambúrguer (revenda) — que é exatamente o que o POS vende.
    return None
    # (código morto abaixo, mantido para quem ligar um motor de receitas próprio)
    try:
        from production.models import Recipe   # pragma: no cover
    except Exception:
        return None
    # A ficha técnica em vigor: prioriza a Aprovada, depois a versão mais recente.
    return (Recipe.objects.filter(final_item=item, is_active=True)
            .prefetch_related('lines__component_item')
            .order_by('-status', '-version', '-id').first())


def _stock_control_on(outlet):
    """(Interface Stock) "Controlo de stock" — desmarcada, a venda NÃO consome stock.

    Há casas que só usam o POS para faturar e gerem o stock noutro sistema. Consumir
    aqui também era abater duas vezes.
    """
    try:
        from .models import StockErpLink
        link = StockErpLink.objects.first()
        if link is not None and hasattr(link, 'stock_control'):
            return bool(link.stock_control)
    except Exception:
        pass
    return True


def _warehouse_for(item, outlet):
    """De que armazém sai este artigo NESTE ponto de venda.

    As polpas vendidas no Restaurante saem do armazém do Restaurante; as mesmas
    polpas vendidas no Bar da Piscina saem do armazém do Bar. É o mapeamento por
    sub-família que manda — só se não houver é que se usa o armazém do outlet.
    """
    from inventory.models import SubFamilyMapping, Warehouse
    if item.subfamily_id:
        m = SubFamilyMapping.objects.filter(subfamily_id=item.subfamily_id, outlet=outlet).first()
        if m and m.warehouse_id:
            return m.warehouse
    return outlet.warehouse or Warehouse.objects.first()


def consume_ticket_stock(ticket, by=None):
    # (Interface Stock) 'Controlo de stock' desligado: a venda fatura, o stock
    # vive noutro sistema. Consumir aqui também era abater duas vezes.
    if not _stock_control_on(getattr(ticket, 'outlet', None)):
        return 0
    if ticket.stock_consumed:
        return
    from inventory import stock as stock_engine

    # Linhas anuladas não consomem: o cliente não levou nada.
    for line in ticket.lines.select_related('item', 'item__subfamily').filter(is_void=False):
        item = line.item
        # (Artigo) "Não movimenta stock" — serviços, taxas, couvert: vendem-se mas
        # não têm existência física. Sem esta caixa, o stock ficava negativo para sempre.
        if getattr(item, 'no_stock_movement', False):
            continue
        wh = _warehouse_for(item, ticket.outlet)
        if not wh:
            continue  # sem armazém configurado, não há stock a mover
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
