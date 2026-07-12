from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('auth_engine.urls')),
    path('api/mdm/', include('mdm.urls')),
    path('api/org/', include('identity.urls')),
    path("api/licensing/", include("licensing.urls")),
    path('api/reports/dashboard/', __import__('core.reports', fromlist=['ManagementDashboardView']).ManagementDashboardView.as_view()),
    path('api/ops/center/', __import__('core.ops', fromlist=['OperationsCenterView']).OperationsCenterView.as_view()),
    path('api/documents/center/', __import__('core.documents', fromlist=['DocumentCenterView']).DocumentCenterView.as_view()),
    path('api/documents/dashboard/', __import__('core.documents', fromlist=['DocumentCenterDashboardView']).DocumentCenterDashboardView.as_view()),
    path('api/documents/links/', __import__('core.documents', fromlist=['DocumentLinksView']).DocumentLinksView.as_view()),
    path('api/support/diagnostics/', __import__('core.support', fromlist=['SupportDiagnosticsView']).SupportDiagnosticsView.as_view()),
    path('api/support/backup/', __import__('core.support', fromlist=['SupportBackupView']).SupportBackupView.as_view()),
    path('api/support/actions/', __import__('core.support', fromlist=['SupportActionsView']).SupportActionsView.as_view()),
    # Angola Tax & Fiscal Compliance Center (núcleo — sempre montado).
    path('api/fiscal/', include('fiscal.urls')),
    # Configuração transversal (Integração/Notificações/Documentos/Sistema).
    path('api/platform/', include('core.urls')),
    # Contabilidade Geral (PGC-AO) — sempre montada (infraestrutura legal).
    path('api/accounting/', include('accounting.urls')),
]

# Apenas carrega as rotas se os módulos correspondentes estiverem na lista de apps instalados.
# Isto garante que o startup e o roteamento ficam super rápidos para módulos desativados.
from django.conf import settings

if 'esm' in settings.INSTALLED_APPS:
    urlpatterns.append(path('api/esm/', include('esm.urls')))
if 'inventory' in settings.INSTALLED_APPS:
    urlpatterns.append(path('api/inventory/', include('inventory.urls')))
if 'production' in settings.INSTALLED_APPS:
    urlpatterns.append(path('api/production/', include('production.urls')))
if 'procurement' in settings.INSTALLED_APPS:
    urlpatterns.append(path('api/procurement/', include('procurement.urls')))
if 'pos' in settings.INSTALLED_APPS:
    urlpatterns.append(path('api/pos/', include('pos.urls')))
if 'wms' in settings.INSTALLED_APPS:
    urlpatterns.append(path('api/wms/', include('wms.urls')))
if 'ite' in settings.INSTALLED_APPS:
    urlpatterns.append(path('api/ite/', include('ite.urls')))
if 'edc' in settings.INSTALLED_APPS:
    urlpatterns.append(path("api/edc/", include("edc.urls")))
if 'eae' in settings.INSTALLED_APPS:
    urlpatterns.append(path("api/eae/", include("eae.urls")))
if 'workforce' in settings.INSTALLED_APPS:
    urlpatterns.append(path("api/workforce/", include("workforce.urls")))
if 'pms' in settings.INSTALLED_APPS:
    urlpatterns.append(path("api/pms/", include("pms.urls")))
if 'finance' in settings.INSTALLED_APPS:
    urlpatterns.append(path("api/finance/", include("finance.urls")))
if 'commercial' in settings.INSTALLED_APPS:
    urlpatterns.append(path("api/commercial/", include("commercial.urls")))
if 'clm' in settings.INSTALLED_APPS:
    # Se estiver no modo Platform Control Center
    urlpatterns.append(path("api/clm/", include("clm.urls")))
