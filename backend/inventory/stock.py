"""
Motor de Stock — fonte única do saldo e do custo. Toda a entrada/saída passa por aqui:
- atualiza o StockLevel do armazém,
- regista o movimento no ledger (StockMovement),
- nas entradas, recalcula o CUSTO MÉDIO PONDERADO MÓVEL do artigo (estilo enterprise).
"""
from decimal import Decimal
from django.db import transaction
from django.db.models import Sum

from .models import StockLevel, StockMovement


def _level(warehouse, item):
    lvl, _ = StockLevel.objects.get_or_create(warehouse=warehouse, item=item)
    return lvl


def _recompute_avg_cost(item, qty_in, unit_cost):
    """Custo médio móvel ponderado sobre o total do artigo (todos os armazéns)."""
    total_qty = StockLevel.objects.filter(item=item).aggregate(s=Sum('quantity_on_hand'))['s'] or Decimal('0')
    qty_in = Decimal(str(qty_in)); unit_cost = Decimal(str(unit_cost))
    old_qty = total_qty - qty_in                       # quantidade antes desta entrada
    old_cost = item.current_average_cost or Decimal('0')
    denom = old_qty + qty_in
    if denom > 0:
        new_cost = ((old_qty * old_cost) + (qty_in * unit_cost)) / denom
        item.current_average_cost = new_cost.quantize(Decimal('0.0001'))
        item.save(update_fields=['current_average_cost', 'updated_at'])


@transaction.atomic
def move_in(warehouse, item, quantity, unit_cost, reference='', note='', by=None, mtype='IN'):
    qty = Decimal(str(quantity))
    lvl = _level(warehouse, item)
    lvl.quantity_on_hand = (lvl.quantity_on_hand or Decimal('0')) + qty
    lvl.save(update_fields=['quantity_on_hand', 'last_updated'])
    _recompute_avg_cost(item, qty, unit_cost)
    return StockMovement.objects.create(
        warehouse=warehouse, item=item, movement_type=mtype, quantity=qty,
        unit_cost=Decimal(str(unit_cost)), reference=reference, note=note, created_by=by)


@transaction.atomic
def move_out(warehouse, item, quantity, reference='', note='', by=None, mtype='OUT'):
    qty = Decimal(str(quantity))
    lvl = _level(warehouse, item)
    lvl.quantity_on_hand = (lvl.quantity_on_hand or Decimal('0')) - qty
    lvl.save(update_fields=['quantity_on_hand', 'last_updated'])
    return StockMovement.objects.create(
        warehouse=warehouse, item=item, movement_type=mtype, quantity=qty,
        unit_cost=item.current_average_cost or Decimal('0'), reference=reference, note=note, created_by=by)


@transaction.atomic
def transfer(src, dst, item, quantity, reference='', by=None):
    move_out(src, item, quantity, reference=reference, by=by, mtype='TRANSFER_OUT')
    move_in(dst, item, quantity, item.current_average_cost or Decimal('0'), reference=reference, by=by, mtype='TRANSFER_IN')


@transaction.atomic
def adjust(warehouse, item, counted_qty, reference='', by=None):
    lvl = _level(warehouse, item)
    counted = Decimal(str(counted_qty))
    delta = counted - (lvl.quantity_on_hand or Decimal('0'))
    lvl.quantity_on_hand = counted
    lvl.save(update_fields=['quantity_on_hand', 'last_updated'])
    return StockMovement.objects.create(
        warehouse=warehouse, item=item, movement_type='ADJUST', quantity=abs(delta),
        unit_cost=item.current_average_cost or Decimal('0'), reference=reference,
        note=f'Ajuste de inventário (delta {delta})', created_by=by)
