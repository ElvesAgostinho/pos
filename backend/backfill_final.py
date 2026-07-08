import os
import django
import sys
from datetime import datetime

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_server.settings')
django.setup()

from fme.models import FeatureFlag, FeatureOverride
from amc.models import TelemetryEvent, SystemAlert
from eum.models import SoftwareRelease, WorkstationUpdateStatus
from identity.models import Workstation, Hotel

def run():
    print("Backfilling Final Foundation Modules (FME, AMC, EUM)...")
    
    # --- FME BACKFILL ---
    FeatureFlag.objects.all().delete()
    
    feat_offline = FeatureFlag.objects.create(
        code='FEAT_OFFLINE_MODE',
        name='Modo Offline (Tolerância a Falhas)',
        description='Permite ao POS faturar quando o servidor central perde conectividade.',
        module='POS',
        default_state=True,
        is_locked=True # Vem sempre ligado
    )
    
    feat_spa = FeatureFlag.objects.create(
        code='FEAT_SPA_MODULE',
        name='Módulo de Spa & Bem-Estar',
        description='Ativa a gestão de terapeutas e agendamento de massagens.',
        module='CORE',
        default_state=False # Desligado por defeito (Vendido à parte)
    )

    try:
        hotel_luanda = Hotel.objects.get(name='Hotel Luanda')
        pos_bar = Workstation.objects.get(name='POS Bar')
        
        # O Hotel Luanda comprou o módulo SPA! Vamos ligá-lo só para eles.
        FeatureOverride.objects.create(
            feature_flag=feat_spa,
            hotel=hotel_luanda,
            is_enabled=True
        )
    except Exception as e:
        print("Aviso: Hotel ou Workstation não encontrados. Crie-os primeiro se quiser testar overrides.")
        hotel_luanda = None
        pos_bar = None

    # --- AMC BACKFILL ---
    TelemetryEvent.objects.all().delete()
    SystemAlert.objects.all().delete()
    
    TelemetryEvent.objects.create(
        service='AUTH_ENGINE',
        event_type='FAST_SWITCH_RESUME',
        severity='INFO',
        payload={"pos": "Bar", "operator": "Maria"},
        execution_time_ms=12
    )
    
    SystemAlert.objects.create(
        title='Falha Crítica na Impressora de Faturas (POS Bar)',
        description='A impressora Epson TM-T20III parou de responder a pings há 5 minutos.',
        is_resolved=False
    )

    # --- EUM BACKFILL ---
    SoftwareRelease.objects.all().delete()
    
    release_1 = SoftwareRelease.objects.create(
        version_number='1.0.4',
        target_module='POS_FRONTEND',
        release_notes='Correção no cálculo de descontos compostos.',
        is_mandatory=True,
        release_date=django.utils.timezone.now()
    )
    
    if pos_bar:
        WorkstationUpdateStatus.objects.create(
            workstation=pos_bar,
            release=release_1,
            status='Installed'
        )

    print("Backfill completed successfully.")

if __name__ == '__main__':
    run()
