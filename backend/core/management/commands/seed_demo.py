"""
Cria um ambiente de DEMONSTRAÇÃO completo e coerente para se poder entrar e operar:
organização, utilizador backoffice, operador POS (PIN), artigos, outlet, mesas,
promoções/combos (Commercial), quartos (PMS), conta de tesouraria (Finance) e séries.

Idempotente — pode correr várias vezes. Uso:  python manage.py seed_demo
"""
from decimal import Decimal
from datetime import date, timedelta

from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.contrib.auth.hashers import make_password


class Command(BaseCommand):
    help = 'Cria dados de demonstração (login backoffice + operador POS + catálogo + promoções).'

    def handle(self, *args, **opts):
        from identity.models import (EnterpriseGroup, Company, Hotel, Department, Area,
                                     Subarea, Workstation, Shift, Collaborator, PosOperator)
        from inventory.models import UnitOfMeasure, ItemCategory, Item
        from mdm.models import PaymentMethod, DocumentSeries
        from pos.models import Outlet, POSProductConfig, OutletPaymentMethod, POSTable
        from commercial.models import Promotion, Combo, ComboItem
        from pms.models import RoomType, Room, Guest, Reservation
        from finance.models import FinanceAccount

        out = self.stdout.write

        # ---- Utilizador backoffice ----
        user, _ = User.objects.get_or_create(username='demo', defaults={
            'is_staff': True, 'is_superuser': True, 'first_name': 'Gestor', 'last_name': 'Demo',
            'email': 'demo@hotel.local'})
        user.set_password('demo1234'); user.is_staff = True; user.is_superuser = True; user.save()

        # ---- Organização ----
        grp, _ = EnterpriseGroup.objects.get_or_create(name='Grupo Hoteleiro Demo')
        comp, _ = Company.objects.get_or_create(group=grp, name='Empresa Demo LDA', defaults={'tax_id': '5000000000'})
        hotel, _ = Hotel.objects.get_or_create(company=comp, name='System Mwana Lodge Luanda', defaults={'location': 'Luanda'})
        dept, _ = Department.objects.get_or_create(hotel=hotel, name='Food & Beverage')
        area, _ = Area.objects.get_or_create(department=dept, name='Restaurante')
        sub, _ = Subarea.objects.get_or_create(area=area, name='Sala Principal')
        ws, _ = Workstation.objects.get_or_create(subarea=sub, name='POS-01')
        Shift.objects.get_or_create(hotel=hotel, name='Turno Manhã',
                                    defaults={'start_time': '08:00', 'end_time': '16:00'})

        # ---- Operador POS (PIN 1234) ----
        collab, _ = Collaborator.objects.get_or_create(code='FUNC-001', defaults={
            'name': 'Carlos Manuel', 'hotel': hotel, 'department': dept, 'job_title': 'Empregado de Mesa'})
        op, _ = PosOperator.objects.get_or_create(collaborator=collab, name='Carlos (Caixa)',
                                                  defaults={'pin_code': make_password('1234'), 'is_active': True})
        op.pin_code = make_password('1234'); op.is_active = True; op.save()

        # ---- Catálogo (Master Data) ----
        un, _ = UnitOfMeasure.objects.get_or_create(code='UN', defaults={'name': 'Unidade'})
        cat_beb, _ = ItemCategory.objects.get_or_create(name='Bebidas')
        cat_com, _ = ItemCategory.objects.get_or_create(name='Comida')
        cat_sob, _ = ItemCategory.objects.get_or_create(name='Sobremesas')

        catalog = [
            ('BEB-01', 'Coca-Cola 33cl', cat_beb, 'BAR', 500),
            ('BEB-02', 'Água 50cl', cat_beb, 'BAR', 300),
            ('BEB-03', 'Cerveja 33cl', cat_beb, 'BAR', 700),
            ('COM-01', 'Bife à Portuguesa', cat_com, 'KITCHEN', 3500),
            ('COM-02', 'Frango Grelhado', cat_com, 'KITCHEN', 3000),
            ('SOB-01', 'Gelado', cat_sob, 'PASTRY', 800),
        ]

        # ---- Outlet + pagamentos ----
        outlet, _ = Outlet.objects.get_or_create(code='REST', defaults={
            'hotel': hotel, 'name': 'Restaurante Principal', 'outlet_type': 'RESTAURANT'})

        pms_methods = [('DIN', 'Dinheiro', 'CASH'), ('MCX', 'Multicaixa', 'CARD'),
                       ('QRT', 'Conta Quarto', 'ROOM'), ('GC', 'Gift Card', 'GIFTCARD')]
        for code, name, mtype in pms_methods:
            pm, _ = PaymentMethod.objects.get_or_create(code=code, defaults={'name': name, 'method_type': mtype})
            OutletPaymentMethod.objects.get_or_create(outlet=outlet, payment_method=pm, defaults={'is_active': True})

        for code, name, cat, station, price in catalog:
            item, _ = Item.objects.get_or_create(code=code, defaults={
                'name': name, 'item_type': 'Retail', 'category': cat, 'base_uom': un,
                'sale_price': Decimal(price), 'tax_percentage': Decimal('14.00')})
            POSProductConfig.objects.get_or_create(outlet=outlet, item=item, defaults={
                'kds_station': station, 'is_available': True})

        # ---- Mesas com posições no mapa ----
        for n in range(1, 7):
            POSTable.objects.get_or_create(outlet=outlet, table_number=f'{n}', defaults={
                'seats': 4, 'shape': 'ROUND' if n % 2 else 'SQUARE',
                'pos_x': 30 + ((n - 1) % 3) * 130, 'pos_y': 30 + ((n - 1) // 3) * 130})

        # ---- Setores adicionais (Lounge Bar, Rooftop) ----
        extra_outlets = [('LOUNGE', 'Lounge Bar', 'BAR'), ('ROOF', 'Rooftop', 'POOL_BAR')]
        for ocode, oname, otype in extra_outlets:
            ex, _ = Outlet.objects.get_or_create(code=ocode, defaults={
                'hotel': hotel, 'name': oname, 'outlet_type': otype})
            for code, name, mtype in pms_methods:
                pm = PaymentMethod.objects.get(code=code)
                OutletPaymentMethod.objects.get_or_create(outlet=ex, payment_method=pm, defaults={'is_active': True})
            # bebidas disponíveis nestes setores
            for icode in ('BEB-01', 'BEB-02', 'BEB-03'):
                it = Item.objects.get(code=icode)
                POSProductConfig.objects.get_or_create(outlet=ex, item=it, defaults={'kds_station': 'BAR', 'is_available': True})
            for n in range(1, 5):
                POSTable.objects.get_or_create(outlet=ex, table_number=f'{ocode[0]}{n}', defaults={
                    'seats': 4, 'shape': 'SQUARE', 'pos_x': 30 + ((n - 1) % 2) * 150, 'pos_y': 30 + ((n - 1) // 2) * 150})

        # ---- Séries fiscais ----
        DocumentSeries.objects.get_or_create(code='FT', defaults={
            'name': 'Faturas', 'document_type': 'INVOICE', 'prefix': 'FT', 'year': 2026, 'current_number': 0})
        DocumentSeries.objects.get_or_create(code='NC', defaults={
            'name': 'Notas de Crédito', 'document_type': 'CREDIT_NOTE', 'prefix': 'NC', 'year': 2026, 'current_number': 0})

        # ---- Commercial: promoção + combo (alimentam o POS) ----
        Promotion.objects.get_or_create(name='Bebidas -20% (Demo)', defaults={
            'scope': 'CATEGORY', 'category': cat_beb, 'discount_type': 'PERCENT',
            'value': Decimal('20'), 'is_active': True})
        bife = Item.objects.get(code='COM-01'); agua = Item.objects.get(code='BEB-02'); gelado = Item.objects.get(code='SOB-01')
        combo, created = Combo.objects.get_or_create(name='Menu do Dia', defaults={
            'outlet': outlet, 'price': Decimal('4000'), 'is_active': True})
        if created:
            ComboItem.objects.create(combo=combo, item=bife, quantity=1)
            ComboItem.objects.create(combo=combo, item=agua, quantity=1)
            ComboItem.objects.create(combo=combo, item=gelado, quantity=1)

        # ---- PMS: quartos + hóspede + reserva ----
        rt, _ = RoomType.objects.get_or_create(hotel=hotel, code='STD', defaults={
            'name': 'Standard', 'capacity': 2, 'base_rate': Decimal('15000')})
        for num in ('101', '102', '103'):
            Room.objects.get_or_create(hotel=hotel, number=num, defaults={'room_type': rt, 'floor': '1'})
        guest, _ = Guest.objects.get_or_create(hotel=hotel, full_name='João Turista', defaults={'phone': '+244 900000000'})
        Reservation.objects.get_or_create(confirmation='RES-DEMO01', defaults={
            'hotel': hotel, 'guest': guest, 'room_type': rt, 'check_in': date.today(),
            'check_out': date.today() + timedelta(days=2), 'rate': Decimal('15000')})

        # ---- Finance: conta de tesouraria ----
        FinanceAccount.objects.get_or_create(hotel=hotel, code='CX-CENTRAL', defaults={
            'name': 'Caixa Central', 'account_type': 'CASH', 'opening_balance': Decimal('100000')})

        # ---- PCC (clm): licença REAL do cliente (visível no admin do Django) ----
        try:
            from clm.models import Client as ClmClient, License as ClmLicense
            from django.conf import settings as _s
            from core.modules import optional_app_labels
            active_mods = [c for c in optional_app_labels() if c in _s.INSTALLED_APPS]
            clc, _ = ClmClient.objects.get_or_create(code='CLI-DEMO', defaults={
                'commercial_name': 'System Mwana Lodge Luanda', 'legal_name': 'Empresa Demo LDA',
                'nif': '5000000000', 'status': 'ACTIVE'})
            ClmLicense.objects.get_or_create(license_number='LIC-DEMO-0001', defaults={
                'client': clc, 'plan': 'Enterprise', 'modules': active_mods, 'is_offline': True,
                'valid_until': date.today() + timedelta(days=365),
                'max_hotels': 1, 'max_pos': 5, 'max_users': 20, 'max_rooms': 50})
        except Exception as e:
            out(f'  (aviso PCC/clm: {e})')

        out('')
        out(self.style.SUCCESS('==================================================================='))
        out(self.style.SUCCESS('  AMBIENTE DE DEMONSTRAÇÃO CRIADO'))
        out(self.style.SUCCESS('==================================================================='))
        out('  BACKOFFICE (ERP)   ->  /backoffice/login')
        out('     Utilizador: demo')
        out('     Password:   demo1234')
        out('')
        out('  POS FRONTOFFICE    ->  /pos/login')
        out('     Operador:  Carlos (Caixa)')
        out('     PIN:       1234')
        out('')
        out('  Django Admin       ->  /admin/  (demo / demo1234)')
        out('-------------------------------------------------------------------')
        out(f'  Hotel: {hotel.name}   Outlet: {outlet.name}')
        out(f'  Artigos: {Item.objects.count()}   Mesas: {POSTable.objects.filter(outlet=outlet).count()}'
            f'   Quartos: {Room.objects.count()}')
        out('  Promoção: "Bebidas -20%" (aplica-se sozinha no POS ao vender bebidas)')
        out('  Combo:    "Menu do Dia" (Bife + Água + Gelado por 4000)')
        out('===================================================================')
