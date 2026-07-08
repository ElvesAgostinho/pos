import os
import django
import sys
from django.utils import timezone
from datetime import time

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_server.settings')
django.setup()

from identity.models import (
    EnterpriseGroup, Company, Hotel, Department, Area, Subarea, 
    Workstation, Shift, Collaborator, PosOperator, 
    OperatorLocationConstraint, OperatorWorkstationConstraint
)

def run():
    print("Backfilling Identity & Organization data...")
    EnterpriseGroup.objects.all().delete()
    
    group = EnterpriseGroup.objects.create(name='Grupo Top Hotels')
    company = Company.objects.create(group=group, name='Top Hotels Angola SA', tax_id='500000000')
    hotel = Hotel.objects.create(company=company, name='Hotel Luanda', location='Luanda')
    
    dept_fb = Department.objects.create(hotel=hotel, name='F&B (Restauração)')
    dept_rooms = Department.objects.create(hotel=hotel, name='Alojamento')
    
    area_rest = Area.objects.create(department=dept_fb, name='Restaurante Principal')
    area_bar = Area.objects.create(department=dept_fb, name='Bar')
    area_pool = Area.objects.create(department=dept_fb, name='Bar Piscina')
    area_room_service = Area.objects.create(department=dept_fb, name='Room Service')
    
    subarea_rest_sala = Subarea.objects.create(area=area_rest, name='Sala')
    subarea_bar_balcao = Subarea.objects.create(area=area_bar, name='Balcão')
    
    ws_rest_1 = Workstation.objects.create(subarea=subarea_rest_sala, name='POS Restaurante 01', ip_address='192.168.1.101')
    ws_rest_2 = Workstation.objects.create(subarea=subarea_rest_sala, name='POS Restaurante 02', ip_address='192.168.1.102')
    ws_bar_1 = Workstation.objects.create(subarea=subarea_bar_balcao, name='POS Bar', ip_address='192.168.1.103')
    
    shift_rest_morning = Shift.objects.create(hotel=hotel, name='08:00 -> 16:00', start_time=time(8,0), end_time=time(16,0))
    shift_bar_night = Shift.objects.create(hotel=hotel, name='16:00 -> 00:00', start_time=time(16,0), end_time=time(0,0))
    
    # Collaborator "Carlos"
    carlos = Collaborator.objects.create(
        code='EMP-001',
        name='Carlos Silva',
        nif='123456789',
        job_title='Empregado Polivalente',
        hotel=hotel,
        department=dept_fb,
        status='Active'
    )
    
    # POS Operator 1: Restaurante
    op_rest = PosOperator.objects.create(
        collaborator=carlos,
        name='Operador Restaurante (Carlos)',
        pin_code='1234',
        is_active=True
    )
    OperatorLocationConstraint.objects.create(operator=op_rest, area=area_rest)
    OperatorLocationConstraint.objects.create(operator=op_rest, area=area_room_service)
    OperatorWorkstationConstraint.objects.create(operator=op_rest, workstation=ws_rest_1)
    OperatorWorkstationConstraint.objects.create(operator=op_rest, workstation=ws_rest_2)
    
    # POS Operator 2: Bar
    op_bar = PosOperator.objects.create(
        collaborator=carlos,
        name='Operador Bar (Carlos)',
        pin_code='2222',
        is_active=True
    )
    OperatorLocationConstraint.objects.create(operator=op_bar, area=area_bar)
    OperatorWorkstationConstraint.objects.create(operator=op_bar, workstation=ws_bar_1)
    
    print("Identity Backfill completed successfully.")

if __name__ == '__main__':
    run()
