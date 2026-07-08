import os
import django
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_server.settings')
django.setup()

from identity.models import Hotel, Department
from inventory.models import UnitOfMeasure, ItemCategory, Item, Warehouse, StockLevel
from procurement.models import Supplier, PurchaseOrder, PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine

def run():
    print("Backfilling Supply Chain (Inventory & Procurement)...")

    try:
        hotel_luanda = Hotel.objects.get(name='Hotel Luanda')
        dept_fnb = Department.objects.get(name='F&B (Restauração)')
    except Exception as e:
        print("Hotel or F&B Department not found. Run backfill_identity.py first.")
        return

    # Clean existing
    GoodsReceipt.objects.all().delete()
    PurchaseOrder.objects.all().delete()
    Supplier.objects.all().delete()
    StockLevel.objects.all().delete()
    Warehouse.objects.all().delete()
    Item.objects.all().delete()
    ItemCategory.objects.all().delete()
    UnitOfMeasure.objects.all().delete()

    # 1. UOM
    uom_kg = UnitOfMeasure.objects.create(code='KG', name='Kilograma')
    uom_l = UnitOfMeasure.objects.create(code='L', name='Litro')
    uom_un = UnitOfMeasure.objects.create(code='UN', name='Unidade')
    uom_cx = UnitOfMeasure.objects.create(code='CX', name='Caixa')

    # 2. Categorias
    cat_bebidas = ItemCategory.objects.create(name='Bebidas')
    cat_refrigerantes = ItemCategory.objects.create(name='Refrigerantes', parent=cat_bebidas)
    cat_mercearia = ItemCategory.objects.create(name='Mercearia')

    # 3. Items
    item_cola = Item.objects.create(
        code='BEB-001',
        name='Coca-Cola Lata 33cl',
        item_type='Retail',
        category=cat_refrigerantes,
        base_uom=uom_un,
        sale_price=500.00,
        tax_percentage=14.00
    )
    
    item_farinha = Item.objects.create(
        code='MER-001',
        name='Farinha de Trigo',
        item_type='RawMaterial',
        category=cat_mercearia,
        base_uom=uom_kg
    )

    # 4. Armazéns
    wh_central = Warehouse.objects.create(
        name='Armazém Central F&B',
        hotel=hotel_luanda,
        department=dept_fnb,
        is_main=True
    )

    # 5. Fornecedor
    sup_refriango = Supplier.objects.create(
        name='Refriango, Lda',
        tax_id='500123456',
        payment_terms='Pronto Pagamento'
    )

    # 6. Compra (Purchase Order)
    po = PurchaseOrder.objects.create(
        po_number='PO-2026-0001',
        supplier=sup_refriango,
        hotel=hotel_luanda,
        delivery_warehouse=wh_central,
        status='Sent'
    )
    po_line = PurchaseOrderLine.objects.create(
        purchase_order=po,
        item=item_cola,
        quantity_requested=500,
        uom=uom_un,
        unit_price=150.00
    )
    # Update PO total
    po.total_amount = po_line.line_total
    po.save()

    # 7. Receção (Goods Receipt) -> Camião chegou
    grn = GoodsReceipt.objects.create(
        receipt_number='GRN-2026-0001',
        purchase_order=po,
        supplier=sup_refriango,
        supplier_invoice_ref='FT REF-001',
        delivery_warehouse=wh_central,
        status='Validated' # Ao validar, afeta stock
    )
    GoodsReceiptLine.objects.create(
        goods_receipt=grn,
        po_line=po_line,
        item=item_cola,
        quantity_received=500,
        uom=uom_un,
        unit_cost=150.00
    )
    # Fechar Encomenda
    po.status = 'Closed'
    po.save()

    # 8. Atualizar Stock do Hotel Luanda - Armazém Central
    # Na vida real, o sinal 'post_save' do GoodsReceiptLine faria isto automaticamente,
    # Mas aqui fazemos diretamente para demonstrar.
    StockLevel.objects.create(
        warehouse=wh_central,
        item=item_cola,
        quantity_on_hand=500,
        min_stock_alert=100
    )
    
    # E atualizamos o Custo Médio do Artigo
    item_cola.current_average_cost = 150.00
    item_cola.save()

    print("Supply Chain Backfill completed! (Coca-Cola stock updated)")

if __name__ == '__main__':
    run()
