import os
import django
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_server.settings')
django.setup()

from identity.models import Hotel, Workstation
from ewm.models import Peripheral, WorkstationPeripheral

def run():
    print("Backfilling EWM Peripherals...")
    
    # Obter o hotel e o POS Bar que criámos no backfill_identity
    try:
        hotel_luanda = Hotel.objects.get(name='Hotel Luanda')
        pos_bar = Workstation.objects.get(name='POS Bar')
    except Exception as e:
        print("Hotel or Workstation not found. Please run backfill_identity.py first.")
        return

    Peripheral.objects.all().delete()
    WorkstationPeripheral.objects.all().delete()

    # 1. Criar o inventário (As peças físicas)
    printer_epson_1 = Peripheral.objects.create(
        hotel=hotel_luanda,
        peripheral_type='Printer',
        brand='Epson',
        model='TM-T20III',
        serial_number='EPS-2023-001A',
        mac_address='00:11:22:33:44:55',
        ip_address='192.168.1.150',
        connection_type='Network',
        status='Available'
    )

    scanner_datalogic = Peripheral.objects.create(
        hotel=hotel_luanda,
        peripheral_type='Scanner',
        brand='Datalogic',
        model='QuickScan QW2100',
        serial_number='DL-999-XYZ',
        connection_type='USB',
        status='Available'
    )
    
    # 2. Vincular (Acoplamento Lógico) ao POS Bar
    # Impressora -> Como Impressora de Talões (Receipt)
    WorkstationPeripheral.objects.create(
        workstation=pos_bar,
        peripheral=printer_epson_1,
        logical_purpose='Receipt',
        connection_params={"ip": "192.168.1.150", "port": 9100}
    )
    
    # Scanner -> Como Scanner Principal
    WorkstationPeripheral.objects.create(
        workstation=pos_bar,
        peripheral=scanner_datalogic,
        logical_purpose='Scanner_Primary',
        connection_params={"usb_port": "COM4"}
    )
    
    print("EWM Backfill completed. Hardware allocated to POS Bar.")

if __name__ == '__main__':
    run()
