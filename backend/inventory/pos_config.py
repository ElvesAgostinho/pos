"""
CONFIGURAÇÃO POS — ARTIGOS.

A ficha do artigo é o coração do backoffice do POS: é aqui que se define o que se
vende, por quanto, com que IVA, em que teclado aparece, em que impressora sai a
comanda, que alergénios tem, que descontos aceita e em que armazém desconta.

Um endpoint por separador seria um pesadelo de manutenção. Em vez disso há UM
endpoint que devolve a ficha completa e a grava de uma vez (como no ecrã: "Gravar").
"""
from decimal import Decimal

from django.db.models import Q, Sum, Count
from rest_framework import viewsets, serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import (Item, ItemGroup, ItemFamily, ItemSubFamily, Printer,
                     ItemBarcode, ItemPrice, UnitOfMeasure, StockLevel, Warehouse,
                     SubFamilyMapping, ReportDefinition)


# --------------------------------------------------------------------------
# Hierarquia comercial
# --------------------------------------------------------------------------
class ItemGroupSerializer(serializers.ModelSerializer):
    families_count = serializers.IntegerField(source='families.count', read_only=True)

    class Meta:
        model = ItemGroup
        fields = '__all__'


class ItemFamilySerializer(serializers.ModelSerializer):
    group_name = serializers.CharField(source='group.name', read_only=True)
    subfamilies_count = serializers.IntegerField(source='subfamilies.count', read_only=True)

    class Meta:
        model = ItemFamily
        fields = '__all__'


class ItemSubFamilySerializer(serializers.ModelSerializer):
    family_name = serializers.CharField(source='family.name', read_only=True)
    group_name = serializers.CharField(source='family.group.name', read_only=True)
    group = serializers.IntegerField(source='family.group_id', read_only=True)
    items_count = serializers.IntegerField(source='items.count', read_only=True)

    class Meta:
        model = ItemSubFamily
        fields = '__all__'


class PrinterSerializer(serializers.ModelSerializer):
    outlet_name = serializers.CharField(source='outlet.name', read_only=True, default=None)
    station_display = serializers.CharField(source='get_station_display', read_only=True)
    device_name = serializers.CharField(source='device.name', read_only=True, default=None)

    class Meta:
        model = Printer
        fields = '__all__'


class ItemGroupViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = ItemGroup.objects.all()
    serializer_class = ItemGroupSerializer


class ItemFamilyViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = ItemFamilySerializer

    def get_queryset(self):
        qs = ItemFamily.objects.select_related('group')
        g = self.request.query_params.get('group')
        return qs.filter(group_id=g) if g else qs


class ItemSubFamilyViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = ItemSubFamilySerializer

    @action(detail=True, methods=['get'])
    def mappings(self, request, pk=None):
        """Como esta sub-família se comporta em CADA outlet: de que armazém sai o
        stock e com que encargo entra no folio do quarto."""
        sub = self.get_object()
        from pos.models import Outlet
        existing = {m.outlet_id: m for m in sub.mappings.all()}
        rows = []
        for o in Outlet.objects.filter(is_active=True):
            m = existing.get(o.id)
            rows.append({
                'outlet': o.id, 'outlet_name': o.name,
                'warehouse': m.warehouse_id if m else None,
                'warehouse_name': m.warehouse.name if (m and m.warehouse) else None,
                'pms_charge_code': m.pms_charge_code if m else None,
                'pms_charge_tax': str(m.pms_charge_tax) if (m and m.pms_charge_tax is not None) else None,
            })
        return Response({
            'subfamily': sub.id, 'code': sub.code, 'name': sub.name,
            'rows': rows,
            'warehouses': [{'id': w.id, 'name': w.name} for w in Warehouse.objects.all()],
        })

    @action(detail=True, methods=['post'])
    def set_mapping(self, request, pk=None):
        sub = self.get_object()
        SubFamilyMapping.objects.update_or_create(
            subfamily=sub, outlet_id=request.data['outlet'],
            defaults={
                'warehouse_id': request.data.get('warehouse') or None,
                'pms_charge_code': (request.data.get('pms_charge_code') or '').strip() or None,
                'pms_charge_tax': request.data.get('pms_charge_tax') or None,
            })
        return self.mappings(request, pk)

    def get_queryset(self):
        qs = ItemSubFamily.objects.select_related('family__group')
        f = self.request.query_params.get('family')
        g = self.request.query_params.get('group')
        if f:
            qs = qs.filter(family_id=f)
        if g:
            qs = qs.filter(family__group_id=g)
        return qs


class PrinterViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Printer.objects.select_related('outlet').all()
    serializer_class = PrinterSerializer


def _promotions():
    """Descontos aplicáveis (o módulo comercial é opcional na licença)."""
    try:
        from commercial.models import Promotion
        return Promotion.objects.all()
    except Exception:
        return Item.objects.none()


# --------------------------------------------------------------------------
# Ficha do artigo
# --------------------------------------------------------------------------
class ItemBarcodeSerializer(serializers.ModelSerializer):
    uom_code = serializers.CharField(source='uom.code', read_only=True, default=None)

    class Meta:
        model = ItemBarcode
        fields = ('id', 'barcode', 'uom', 'uom_code', 'quantity', 'is_main')


class ItemPriceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ItemPrice
        fields = ('id', 'level', 'price')


class PosItemListSerializer(serializers.ModelSerializer):
    """A LINHA DA GRELHA — só o que se vê na lista (rápida, sem carregar a ficha toda)."""
    subfamily_name = serializers.CharField(source='subfamily.name', read_only=True, default=None)
    family_name = serializers.CharField(source='subfamily.family.name', read_only=True, default=None)
    group_name = serializers.CharField(source='subfamily.family.group.name', read_only=True, default=None)
    prices = serializers.SerializerMethodField()
    printers_label = serializers.SerializerMethodField()
    units_label = serializers.SerializerMethodField()
    stock_qty = serializers.SerializerMethodField()

    class Meta:
        model = Item
        fields = ('id', 'code', 'name', 'subfamily', 'subfamily_name', 'family_name', 'group_name',
                  'item_type', 'tax_percentage', 'exemption_code_1', 'sale_price',
                  'prices', 'printers_label', 'units_label', 'stock_qty', 'is_active')

    def get_prices(self, o):
        return [{'level': p.level, 'price': str(p.price)} for p in o.prices.all()] \
            or ([{'level': 1, 'price': str(o.sale_price or 0)}] if o.sale_price else [])

    def get_printers_label(self, o):
        return ', '.join(p.name for p in o.printers.all())

    def get_units_label(self, o):
        def c(u):
            return u.code if u else '—'
        return f'{c(o.purchase_uom)} / {c(o.stock_uom)} / {c(o.sale_uom or o.base_uom)}'

    def get_stock_qty(self, o):
        return str(StockLevel.objects.filter(item=o).aggregate(q=Sum('quantity_on_hand'))['q'] or Decimal('0'))


class PosItemDetailSerializer(serializers.ModelSerializer):
    """A FICHA COMPLETA — tudo o que os separadores mostram."""
    barcodes = ItemBarcodeSerializer(many=True, read_only=True)
    prices = ItemPriceSerializer(many=True, read_only=True)
    printer_ids = serializers.PrimaryKeyRelatedField(source='printers', many=True,
                                                     queryset=Printer.objects.all(), required=False)
    discount_ids = serializers.PrimaryKeyRelatedField(source='discounts', many=True,
                                                      queryset=_promotions(), required=False)
    allergen_ids = serializers.SerializerMethodField()
    family = serializers.SerializerMethodField()
    group = serializers.SerializerMethodField()

    class Meta:
        model = Item
        exclude = ('printers', 'discounts')

    def get_family(self, o):
        return o.subfamily.family_id if o.subfamily else None

    def get_group(self, o):
        return o.subfamily.family.group_id if o.subfamily else None

    def get_allergen_ids(self, o):
        prof = getattr(o, 'production_profile', None)
        return [a.id for a in prof.allergens.all()] if prof else []


class PosItemViewSet(viewsets.ModelViewSet):
    """Configuração POS → Artigos. CRUD real, com todos os separadores."""
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        return PosItemListSerializer if self.action == 'list' else PosItemDetailSerializer

    def get_queryset(self):
        qs = (Item.objects
              .select_related('subfamily__family__group', 'base_uom', 'purchase_uom', 'stock_uom', 'sale_uom')
              .prefetch_related('printers', 'prices', 'barcodes')
              .order_by('code'))
        p = self.request.query_params

        if p.get('group'):
            qs = qs.filter(subfamily__family__group_id=p['group'])
        if p.get('family'):
            qs = qs.filter(subfamily__family_id=p['family'])
        if p.get('subfamily'):
            qs = qs.filter(subfamily_id=p['subfamily'])
        if p.get('item_type'):
            qs = qs.filter(item_type=p['item_type'])
        if p.get('state') == 'ACTIVE':
            qs = qs.filter(is_active=True)
        elif p.get('state') == 'INACTIVE':
            qs = qs.filter(is_active=False)
        if p.get('module') == 'SALE':
            qs = qs.filter(is_sold=True)
        elif p.get('module') == 'PURCHASE':
            qs = qs.filter(is_purchased=True)
        elif p.get('module') == 'RECIPE':
            qs = qs.filter(has_recipe=True)
        elif p.get('module') == 'MENU':
            qs = qs.filter(is_menu=True)

        # Pesquisa por texto livre — código, nome, barras, PLU.
        q = (p.get('q') or '').strip()
        if q:
            qs = qs.filter(Q(code__icontains=q) | Q(name__icontains=q) |
                           Q(plu_code__icontains=q) | Q(barcodes__barcode__icontains=q)).distinct()
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=str(getattr(self.request.user, 'username', '') or ''),
                        updated_by=str(getattr(self.request.user, 'username', '') or ''))

    def perform_update(self, serializer):
        serializer.save(updated_by=str(getattr(self.request.user, 'username', '') or ''))

    # ---------------- Separadores que leem de outros módulos ----------------
    @action(detail=True, methods=['get'])
    def warehouses(self, request, pk=None):
        """Separador ARMAZÉNS: existências, custo e limites por armazém."""
        item = self.get_object()
        levels = {l.warehouse_id: l for l in StockLevel.objects.filter(item=item)}
        rows = []
        for w in Warehouse.objects.all():
            l = levels.get(w.id)
            qty = l.quantity_on_hand if l else Decimal('0')
            reserved = l.quantity_reserved if l else Decimal('0')
            rows.append({
                'warehouse': w.id, 'warehouse_name': w.name,
                'quantity': str(qty),
                'pending': str(reserved),
                'total_cost': str((qty * (item.current_average_cost or Decimal('0'))).quantize(Decimal('0.01'))),
                'min_stock': str((l.min_stock_alert if l else None) or item.min_stock or 0),
                'max_stock': str((l.max_stock_capacity if l else None) or item.max_stock or 0),
                'negative': qty < 0,
            })
        return Response(rows)

    @action(detail=True, methods=['get'])
    def suppliers(self, request, pk=None):
        """Separador FORNECEDORES: histórico real de compras deste artigo."""
        item = self.get_object()
        rows = []
        try:
            from procurement.models import PurchaseOrderLine
            for l in (PurchaseOrderLine.objects
                      .filter(item=item)
                      .select_related('purchase_order__supplier')
                      .order_by('-purchase_order__order_date')[:100]):
                po = l.purchase_order
                rows.append({
                    'date': po.order_date.isoformat() if po.order_date else None,
                    'supplier': getattr(po.supplier, 'name', '—'),
                    'document': po.number if hasattr(po, 'number') else str(po.id),
                    'quantity': str(l.quantity),
                    'price_net': str(l.unit_price),
                    'price_gross': str(l.unit_price),
                    'uom': item.purchase_uom.code if item.purchase_uom else (item.base_uom.code if item.base_uom else ''),
                    'discount': '0.00',
                })
        except Exception:
            pass
        return Response(rows)

    @action(detail=True, methods=['get'])
    def dashboard(self, request, pk=None):
        """Separador DASHBOARD: vendas e compras deste artigo, mês a mês."""
        from datetime import date
        item = self.get_object()
        year = int(request.query_params.get('year') or date.today().year)
        sales = [0] * 12
        sales_value = [0.0] * 12
        last_sale = None
        try:
            from pos.models import POSTicketLine
            qs = (POSTicketLine.objects
                  .filter(item=item, is_void=False, ticket__status__in=['PAID', 'CLOSED'],
                          ticket__opened_at__year=year)
                  .select_related('ticket'))
            for l in qs:
                m = l.ticket.opened_at.month - 1
                sales[m] += float(l.quantity)
                sales_value[m] += float(l.line_total)
            last = qs.order_by('-ticket__opened_at').first()
            if last:
                last_sale = {'at': last.ticket.opened_at.isoformat(), 'ref': last.ticket.ticket_number}
        except Exception:
            pass

        purchases = [0] * 12
        last_purchase = None
        try:
            from procurement.models import PurchaseOrderLine
            for l in (PurchaseOrderLine.objects
                      .filter(item=item, purchase_order__order_date__year=year)
                      .select_related('purchase_order')):
                d = l.purchase_order.order_date
                if d:
                    purchases[d.month - 1] += float(l.quantity)
            lp = (PurchaseOrderLine.objects.filter(item=item)
                  .select_related('purchase_order').order_by('-purchase_order__order_date').first())
            if lp and lp.purchase_order.order_date:
                last_purchase = {'at': lp.purchase_order.order_date.isoformat()}
        except Exception:
            pass

        return Response({
            'year': year, 'sales_qty': sales, 'sales_value': sales_value,
            'purchases_qty': purchases,
            'last_sale': last_sale, 'last_purchase': last_purchase,
        })

    # ---------------- Ações da barra de ferramentas ----------------
    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        """Copiar — o botão "Copiar" da barra. Duplica a ficha inteira."""
        src = self.get_object()
        printers = list(src.printers.all())
        discounts = list(src.discounts.all())
        prices = list(src.prices.all())
        src.pk = None
        base = f'{src.code}-C'
        n, code = 1, base
        while Item.objects.filter(code=code).exists():
            n += 1
            code = f'{base}{n}'
        src.code = code
        src.name = f'{src.name} (cópia)'
        src.save()
        src.printers.set(printers)
        src.discounts.set(discounts)
        for p in prices:
            ItemPrice.objects.create(item=src, level=p.level, price=p.price)
        return Response(PosItemDetailSerializer(src).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def set_prices(self, request, pk=None):
        """Grava os preços por nível (o quadro "Preço" do separador Geral)."""
        item = self.get_object()
        for row in request.data.get('prices', []):
            ItemPrice.objects.update_or_create(
                item=item, level=int(row['level']),
                defaults={'price': Decimal(str(row.get('price') or 0))})
        # O nível 1 é o preço de venda de referência.
        p1 = item.prices.filter(level=1).first()
        if p1:
            item.sale_price = p1.price
            item.save(update_fields=['sale_price'])
        return Response(ItemPriceSerializer(item.prices.all(), many=True).data)

    @action(detail=True, methods=['post'])
    def add_barcode(self, request, pk=None):
        item = self.get_object()
        bc = (request.data.get('barcode') or '').strip()
        if not bc:
            return Response({'detail': 'Indique o código de barras.'}, status=400)
        if ItemBarcode.objects.filter(barcode=bc).exclude(item=item).exists():
            return Response({'detail': f'O código {bc} já pertence a outro artigo.'}, status=409)
        obj, _ = ItemBarcode.objects.update_or_create(
            item=item, barcode=bc,
            defaults={'uom_id': request.data.get('uom') or None,
                      'quantity': request.data.get('quantity') or 1,
                      'is_main': bool(request.data.get('is_main'))})
        return Response(ItemBarcodeSerializer(obj).data, status=201)

    @action(detail=True, methods=['post'])
    def remove_barcode(self, request, pk=None):
        self.get_object().barcodes.filter(pk=request.data.get('id')).delete()
        return Response(status=204)

    @action(detail=True, methods=['post'])
    def set_allergens(self, request, pk=None):
        """Separador NOTAS/ALERGÉNIOS — a informação crítica que chega à cozinha."""
        item = self.get_object()
        try:
            from production.models import ItemProductionProfile
            prof, _ = ItemProductionProfile.objects.get_or_create(item=item)
            prof.allergens.set(request.data.get('allergen_ids') or [])
            return Response({'allergen_ids': [a.id for a in prof.allergens.all()]})
        except Exception as e:
            return Response({'detail': f'Módulo de produção indisponível: {e}'}, status=409)


class ReportDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportDefinition
        fields = '__all__'


class ReportDefinitionViewSet(viewsets.ModelViewSet):
    """Definições de relatório — agrupam artigos para a análise de vendas."""
    permission_classes = [IsAuthenticated]
    queryset = ReportDefinition.objects.all()
    serializer_class = ReportDefinitionSerializer
