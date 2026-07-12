"""
Semeia a configuração POS: hierarquia comercial + impressoras + níveis de preço.

Migra o catálogo existente (que só tinha "categoria") para a árvore
GRUPO → FAMÍLIA → SUB-FAMÍLIA, sem perder nada e sem duplicar.
"""
from django.core.management.base import BaseCommand

from inventory.models import Item, ItemGroup, ItemFamily, ItemSubFamily, ItemPrice, Printer


class Command(BaseCommand):
    help = 'Cria grupos/famílias/sub-famílias e impressoras, e liga os artigos existentes.'

    def handle(self, *args, **o):
        # --- Impressoras (postos onde a comanda sai) ---
        printers = [
            ('REST', 'RESTAURANTE', 'KITCHEN'),
            ('COZ', 'COZINHA', 'KITCHEN'),
            ('BAR_PISCINA', 'BAR PISCINA', 'BAR'),
            ('BAR_ROOFTOP', 'BAR ROOFTOP', 'BAR'),
            ('PAST', 'PASTELARIA', 'PASTRY'),
            ('CAIXA', 'CAIXA', 'CASHIER'),
        ]
        for code, name, station in printers:
            Printer.objects.get_or_create(code=code, defaults={'name': name, 'station': station})
        self.stdout.write(f'Impressoras: {Printer.objects.count()}')

        # --- Hierarquia: usa a categoria atual do artigo como FAMÍLIA ---
        fnb, _ = ItemGroup.objects.get_or_create(code='FNB', defaults={'name': 'F&B'})
        outros, _ = ItemGroup.objects.get_or_create(code='OUT', defaults={'name': 'Outros'})

        ligados = 0
        for item in Item.objects.filter(subfamily__isnull=True):
            cat = item.category
            nome_fam = (cat.name if cat else 'GERAL').upper()
            grupo = fnb if item.is_sold else outros
            fam, _ = ItemFamily.objects.get_or_create(
                group=grupo, code=nome_fam[:20],
                defaults={'name': nome_fam})
            sub, _ = ItemSubFamily.objects.get_or_create(
                family=fam, code=nome_fam[:20],
                defaults={'name': nome_fam})
            item.subfamily = sub
            # Unidades: compra / stock / venda — por omissão, a unidade base.
            item.purchase_uom = item.purchase_uom or item.base_uom
            item.stock_uom = item.stock_uom or item.base_uom
            item.sale_uom = item.sale_uom or item.base_uom
            item.save(update_fields=['subfamily', 'purchase_uom', 'stock_uom', 'sale_uom'])

            # Nível 1 de preço = preço de venda atual.
            if item.sale_price:
                ItemPrice.objects.get_or_create(item=item, level=1,
                                                defaults={'price': item.sale_price})
            ligados += 1

        self.stdout.write(self.style.SUCCESS(
            f'Grupos: {ItemGroup.objects.count()} · Famílias: {ItemFamily.objects.count()} · '
            f'Sub-famílias: {ItemSubFamily.objects.count()} · Artigos ligados: {ligados}'))
