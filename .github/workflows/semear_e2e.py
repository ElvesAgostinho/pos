# -*- coding: utf-8 -*-
"""Semeia uma casa a trabalhar — corre dentro do `manage.py shell`.

Nao e um teste: e o cenario. O mesmo minimo que um cliente novo tem de
configurar, para a varredura dos ecras ter dados reais em vez de listas vazias.
Uma varredura sobre uma base vazia passa por estar tudo vazio e nao por estar
tudo bem.
"""
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import User

from fiscal.models import FiscalConfig, FiscalDocType, FiscalSeries, TaxRate
from identity.models import Company, EnterpriseGroup, Hotel
from inventory.models import (Item, ItemCategory, Printer, UnitOfMeasure,
                              Warehouse)
from mdm.models import Customer, PaymentMethod
from pms.models import Folio, Reservation, Room, RoomType
from pos.models import (CashSession, Outlet, OutletPaymentMethod,
                        POSProductConfig, POSTable, PosHardware, StockDocSeries)

OPERADOR = 'dono'
SENHA = 'MwanaLodge#2026'

if User.objects.filter(username=OPERADOR).exists():
    print('Ja semeado.')
    raise SystemExit(0)

User.objects.create_superuser(OPERADOR, '', SENHA)

grupo = EnterpriseGroup.objects.create(name='Grupo Mwana')
empresa = Company.objects.create(group=grupo, name='Mwana Lodge, Lda.', tax_id='5000000000')
hotel = Hotel.objects.create(company=empresa, name='Mwana Lodge', is_master=True)

armazem = Warehouse.objects.create(hotel=hotel, code='ECO', name='Economato', is_main=True)
outlet = Outlet.objects.create(hotel=hotel, name='Restaurante', code='RST', warehouse=armazem)
POSTable.objects.create(outlet=outlet, table_number='12', seats=4)
POSTable.objects.create(outlet=outlet, table_number='13', seats=2)
maquina = PosHardware.objects.create(code='HW-COZ', name='Impressora Cozinha')
Printer.objects.create(code='P-COZ', name='Cozinha', station='KITCHEN', outlet=outlet,
                       device=maquina)
Printer.objects.create(code='P-BAR', name='Bar', station='BAR', outlet=outlet, device=maquina)

un = UnitOfMeasure.objects.create(code='UN', name='Unidade')
kg = UnitOfMeasure.objects.create(code='KG', name='Quilograma')
comida = ItemCategory.objects.create(name='Restauracao')
bebidas = ItemCategory.objects.create(name='Bebidas')

bife = Item.objects.create(code='A001', name='Bife a Casa', item_type='Manufactured',
                           category=comida, base_uom=un, sale_price=Decimal('8500'),
                           tax_percentage=Decimal('14'))
cerveja = Item.objects.create(code='B001', name='Cerveja Cuca 33cl', item_type='Retail',
                              category=bebidas, base_uom=un, sale_price=Decimal('1200'),
                              tax_percentage=Decimal('14'))
carne = Item.objects.create(code='M001', name='Carne de Vaca', item_type='RawMaterial',
                            category=comida, base_uom=kg, shelf_life_days=5)
POSProductConfig.objects.create(outlet=outlet, item=bife, kds_station='KITCHEN')
POSProductConfig.objects.create(outlet=outlet, item=cerveja, kds_station='BAR')

dinheiro = PaymentMethod.objects.create(code='DIN', name='Dinheiro', method_type='CASH',
                                        for_pos=True)
quarto_pm = PaymentMethod.objects.create(code='QRT', name='Conta Quarto', method_type='ROOM',
                                         for_pos=True, charge_to_room=True)
OutletPaymentMethod.objects.create(outlet=outlet, payment_method=dinheiro)
OutletPaymentMethod.objects.create(outlet=outlet, payment_method=quarto_pm)

cfg = FiscalConfig.get()
cfg.company_name, cfg.company_nif = 'Mwana Lodge, Lda.', '5000000000'
cfg.auto_emit_pos = True
cfg.save()
TaxRate.objects.create(code='IVA14', name='IVA 14%', percentage=Decimal('14'),
                       is_default=True, is_active=True)
ano = timezone.localdate().year
for codigo, nome in (('FR', 'Fatura-Recibo'), ('FT', 'Fatura'), ('PF', 'Proforma')):
    tipo = FiscalDocType.objects.create(code=codigo, name=nome, invoice_type=codigo)
    FiscalSeries.objects.create(code='A', doc_type=tipo, year=ano, prefix=codigo, certified=True)

CashSession.objects.create(outlet=outlet, opening_float=Decimal('10000'), opened_by=OPERADOR,
                           operator_name='Empregado 1', status='OPEN')

tipo_quarto = RoomType.objects.create(hotel=hotel, code='STD', name='Standard',
                                      base_rate=Decimal('25000'))
quarto = Room.objects.create(hotel=hotel, room_type=tipo_quarto, number='101',
                             status='OCCUPIED')
Room.objects.create(hotel=hotel, room_type=tipo_quarto, number='102')
hospede = Customer.objects.create(code='C001', name='Ana Silva', tax_id='5401234567')
Customer.objects.create(code='E001', name='Sonangol EP', tax_id='5417000000',
                        credit_limit=Decimal('500000'))
hoje = timezone.localdate()
reserva = Reservation.objects.create(hotel=hotel, confirmation='RES0001', guest=hospede,
                                     room=quarto, room_type=tipo_quarto, check_in=hoje,
                                     check_out=hoje + timedelta(days=2), status='CHECKED_IN',
                                     adults=1, rate=Decimal('25000'))
Folio.objects.create(reservation=reserva, number='F0001', status='OPEN')

StockDocSeries.objects.create(code='FTF', name='Fatura de Fornecedor', kind='INVOICE',
                              nature='PAYABLE')
StockDocSeries.objects.create(code='REQ', name='Requisicao Interna', kind='REQUEST')
StockDocSeries.objects.create(code='INV', name='Inventario', kind='INVENTORY')

print('Semeado:', OPERADOR, '/', SENHA)

# O OPERADOR DO TERMINAL: o POS nao se abre com a senha do dono, abre com um PIN.
from pos.models import PosUser, PosSector
if not PosUser.objects.filter(code='EMP1').exists():
    PosUser.objects.create(code='EMP1', first_name='Joaquim', last_name='Pedro',
                           is_active=True,
                           pos_pin=make_password('4071', hasher='pbkdf2_pos_pin'))
if not PosSector.objects.filter(outlet=outlet).exists():
    PosSector.objects.create(outlet=outlet, code='SALA', name='Sala')
# E um setor SEM ponto de venda, que e o caso que o terminal tem de recusar.
if not PosSector.objects.filter(code='ESP').exists():
    PosSector.objects.create(code='ESP', name='Esplanada', outlet=None)
print('Casa semeada para a varredura.')
