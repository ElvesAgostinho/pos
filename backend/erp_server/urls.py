from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/mdm/', include('mdm.urls')),
    path("api/licensing/", include("licensing.urls")),
]

# Apenas carrega as rotas se os módulos correspondentes estiverem na lista de apps instalados.
# Isto garante que o startup e o roteamento ficam super rápidos para módulos desativados.
from django.conf import settings

if 'inventory' in settings.INSTALLED_APPS:
    urlpatterns.append(path('api/inventory/', include('inventory.urls')))
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
if 'clm' in settings.INSTALLED_APPS:
    # Se estiver no modo Platform Control Center
    urlpatterns.append(path("api/clm/", include("clm.urls")))
