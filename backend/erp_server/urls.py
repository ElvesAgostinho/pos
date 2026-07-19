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
# (Produção/Restauração eliminado — o POS é autossuficiente e tem o que precisa.)
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
# (PMS eliminado — o POS é autossuficiente.)
if 'finance' in settings.INSTALLED_APPS:
    urlpatterns.append(path("api/finance/", include("finance.urls")))
if 'commercial' in settings.INSTALLED_APPS:
    urlpatterns.append(path("api/commercial/", include("commercial.urls")))
if 'clm' in settings.INSTALLED_APPS:
    # Se estiver no modo Platform Control Center
    urlpatterns.append(path("api/clm/", include("clm.urls")))

# Servir os ficheiros carregados (logótipos, imagens) em desenvolvimento.
from django.conf import settings  # noqa: E402
from django.conf.urls.static import static  # noqa: E402
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# ── O SITE INSTALADO (produção on-premises) ──────────────────────────────────
# Na instalação do cliente não há Vite nem nginx: o MESMO serviço do Windows que
# responde à API serve também o backoffice e o POS compilados. É o que permite ao
# setup.exe instalar UM serviço e o cliente abrir http://localhost:8000 e ter tudo —
# como a Primavera: um instalador, um serviço, um atalho.
# Em desenvolvimento a pasta webapp/ não existe e nada disto se liga (o Vite continua).
import os as _os  # noqa: E402
from pathlib import Path as _Path  # noqa: E402
_WEBAPP = _Path(_os.environ.get('MWANA_WEBAPP', str(settings.BASE_DIR / 'webapp')))
if (_WEBAPP / 'index.html').exists():
    from django.http import FileResponse as _FileResponse  # noqa: E402
    from django.views.static import serve as _serve  # noqa: E402
    from django.urls import re_path as _re_path  # noqa: E402
    from django.views.decorators.csrf import csrf_exempt as _csrf_exempt  # noqa: E402

    def _spa(request, path=''):
        # Qualquer rota que não seja da API devolve o index: quem manda nas rotas
        # (/backoffice, /pos/terminal…) é o React — refrescar a página não pode dar 404.
        return _FileResponse(open(_WEBAPP / 'index.html', 'rb'), content_type='text/html')

    urlpatterns += [
        _re_path(r'^assets/(?P<path>.*)$', _serve, {'document_root': str(_WEBAPP / 'assets')}),
        _re_path(r'^(?!api/|admin/|static/|media/|assets/).*$', _csrf_exempt(_spa)),
    ]
