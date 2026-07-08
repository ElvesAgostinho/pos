import os
import django
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_server.settings')
django.setup()

from ecc.models import Parameter, ParameterValue

def run():
    print("Backfilling ECC Parameters...")
    
    parameters_data = [
        # GLOBAL CONFIGURATION
        {"code": "SYS_PLATFORM_NAME", "name": "Nome da Plataforma", "category": "Configuração Global", "type": "Text", "default": "Hospitality ERP Enterprise"},
        {"code": "SYS_ENV", "name": "Ambiente", "category": "Configuração Global", "type": "List", "default": "Desenvolvimento"},
        {"code": "SYS_BASE_LANG", "name": "Idioma Padrão", "category": "Configuração Global", "type": "Text", "default": "pt-PT"},
        {"code": "SYS_BASE_CURRENCY", "name": "Moeda Base", "category": "Configuração Global", "type": "Text", "default": "AOA"},
        {"code": "SYS_TIMEZONE", "name": "Fuso Horário", "category": "Configuração Global", "type": "Text", "default": "Africa/Luanda"},
        
        # POS CONFIGURATION
        {"code": "POS_LOGOUT_TIME", "name": "Tempo Logout (segundos)", "category": "POS", "type": "Number", "default": 60},
        {"code": "POS_UI_MODE", "name": "Modo UI", "category": "POS", "type": "List", "default": "Touch"},
        {"code": "POS_THEME", "name": "Tema", "category": "POS", "type": "List", "default": "Dark"},
        {"code": "POS_OFFLINE_MODE", "name": "Permitir Modo Offline", "category": "POS", "type": "Boolean", "default": True},
        {"code": "POS_GRID_COLS", "name": "Número de Colunas (Grid)", "category": "POS", "type": "Number", "default": 5},
        
        # STOCK CONFIGURATION
        {"code": "STK_VALUATION_METHOD", "name": "Método de Custeio", "category": "Stock", "type": "List", "default": "Custo Médio Ponderado"},
        {"code": "STK_REQUIRE_APPROVAL", "name": "Transferências Requerem Aprovação", "category": "Stock", "type": "Boolean", "default": True},
        
        # SECURITY & AUTHENTICATION
        {"code": "AUTH_MAX_FAILED_LOGIN", "name": "Tentativas Máx. Login", "category": "Segurança", "type": "Number", "default": 3},
        {"code": "AUTH_PWD_MIN_LENGTH", "name": "Tamanho Mín. Password", "category": "Segurança", "type": "Number", "default": 12},
        {"code": "AUTH_PIN_MIN_LENGTH", "name": "Tamanho Mín. PIN", "category": "Segurança", "type": "Number", "default": 4},
    ]
    
    for pd in parameters_data:
        param, created = Parameter.objects.get_or_create(
            code=pd["code"],
            defaults={
                "name": pd["name"],
                "category": pd["category"],
                "data_type": pd["type"],
                "default_value": pd["default"],
                "is_mandatory": True
            }
        )
        if created:
            print(f"Created Parameter: {param.code}")

if __name__ == '__main__':
    run()
