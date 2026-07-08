import os
import django
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_server.settings')
django.setup()

from inventory.models import UnitOfMeasure, ItemCategory, Item, Recipe, RecipeIngredient

def run():
    print("Backfilling Fichas Técnicas (Receitas)...")

    # UOM
    uom_kg = UnitOfMeasure.objects.get(code='KG')
    uom_l = UnitOfMeasure.objects.get(code='L')
    uom_un = UnitOfMeasure.objects.get(code='UN')
    
    # Categorias
    cat_bebidas = ItemCategory.objects.get(name='Bebidas')
    cat_mercearia = ItemCategory.objects.get(name='Mercearia')
    
    cat_carnes, _ = ItemCategory.objects.get_or_create(name='Carnes')
    cat_bebidas_prep, _ = ItemCategory.objects.get_or_create(name='Bebidas Preparadas (Cocktails)', parent=cat_bebidas)
    cat_pratos, _ = ItemCategory.objects.get_or_create(name='Pratos de Restaurante')

    # Ingredientes
    bife, _ = Item.objects.get_or_create(code='CAR-001', defaults={
        'name': 'Bife da Vazia', 'item_type': 'RawMaterial', 'category': cat_carnes, 'base_uom': uom_kg, 'current_average_cost': 4500.00
    })
    batata, _ = Item.objects.get_or_create(code='MER-002', defaults={
        'name': 'Batata Frita Congelada', 'item_type': 'RawMaterial', 'category': cat_mercearia, 'base_uom': uom_kg, 'current_average_cost': 800.00
    })
    ovo, _ = Item.objects.get_or_create(code='MER-003', defaults={
        'name': 'Ovo', 'item_type': 'RawMaterial', 'category': cat_mercearia, 'base_uom': uom_un, 'current_average_cost': 150.00
    })
    
    cachaca, _ = Item.objects.get_or_create(code='BEB-002', defaults={
        'name': 'Cachaça 51 1L', 'item_type': 'RawMaterial', 'category': cat_bebidas, 'base_uom': uom_l, 'current_average_cost': 6000.00
    })
    limao, _ = Item.objects.get_or_create(code='MER-004', defaults={
        'name': 'Limão', 'item_type': 'RawMaterial', 'category': cat_mercearia, 'base_uom': uom_kg, 'current_average_cost': 1000.00
    })

    # Produtos Finais (Manufactured)
    bitoque, _ = Item.objects.get_or_create(code='PRT-001', defaults={
        'name': 'Bitoque à Portuguesa', 'item_type': 'Manufactured', 'category': cat_pratos, 'base_uom': uom_un, 'sale_price': 8500.00, 'tax_percentage': 14.00
    })
    caipirinha, _ = Item.objects.get_or_create(code='CKT-001', defaults={
        'name': 'Caipirinha', 'item_type': 'Manufactured', 'category': cat_bebidas_prep, 'base_uom': uom_un, 'sale_price': 3500.00, 'tax_percentage': 14.00
    })

    # Criar Ficha Técnica: Bitoque
    Recipe.objects.filter(final_item=bitoque).delete()
    recipe_bitoque = Recipe.objects.create(
        final_item=bitoque,
        instructions="Fritar o bife em lume forte. Fritar as batatas a 180º. Estrelar o ovo. Montar no prato."
    )
    # Ingredientes do Bitoque
    RecipeIngredient.objects.create(recipe=recipe_bitoque, ingredient_item=bife, quantity=0.200, uom=uom_kg) # 200g
    RecipeIngredient.objects.create(recipe=recipe_bitoque, ingredient_item=batata, quantity=0.150, uom=uom_kg) # 150g
    RecipeIngredient.objects.create(recipe=recipe_bitoque, ingredient_item=ovo, quantity=1, uom=uom_un) # 1 Ovo
    
    # Calcular Custo Teórico Bitoque
    cost_bitoque = (0.200 * 4500) + (0.150 * 800) + (1 * 150)
    recipe_bitoque.theoretical_cost = cost_bitoque
    recipe_bitoque.save()
    
    # Criar Ficha Técnica: Caipirinha
    Recipe.objects.filter(final_item=caipirinha).delete()
    recipe_caipi = Recipe.objects.create(
        final_item=caipirinha,
        instructions="Macerar meio limão com açúcar. Juntar gelo picado. Verter 5cl de Cachaça e mexer bem."
    )
    # Ingredientes Caipirinha
    RecipeIngredient.objects.create(recipe=recipe_caipi, ingredient_item=cachaca, quantity=0.050, uom=uom_l) # 50ml
    RecipeIngredient.objects.create(recipe=recipe_caipi, ingredient_item=limao, quantity=0.050, uom=uom_kg) # 50g (meio limão aprox)
    
    cost_caipi = (0.050 * 6000) + (0.050 * 1000)
    recipe_caipi.theoretical_cost = cost_caipi
    recipe_caipi.save()

    print("Fichas Técnicas criadas com sucesso!")
    print(f"Custo Teórico Bitoque: {cost_bitoque} Kz (Venda: 8500.00 Kz)")
    print(f"Custo Teórico Caipirinha: {cost_caipi} Kz (Venda: 3500.00 Kz)")

if __name__ == '__main__':
    run()
