from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from .agt import AgtGenerateView, AgtLicenseCredentialsView, AgtConnectionView, AgtDossierView

router = DefaultRouter()
router.register(r'clients', views.ClientViewSet, basename='client')
router.register(r'licenses', views.LicenseViewSet, basename='license')
router.register(r'installations', views.InstallationViewSet, basename='installation')
router.register(r'audits', views.AuditLogViewSet, basename='audit')
router.register(r'terminals', views.TerminalLicenseViewSet, basename='terminal')
router.register(r'releases', views.SystemReleaseViewSet, basename='release')

urlpatterns = [
    path('modules/', views.ModuleCatalogView.as_view(), name='module-catalog'),
    path('features/', views.FeatureCatalogView.as_view(), name='feature-catalog'),
    path('agt/generate/', AgtGenerateView.as_view(), name='agt-generate'),
    path('agt/credentials/', AgtLicenseCredentialsView.as_view(), name='agt-credentials'),
    path('agt/connection/', AgtConnectionView.as_view(), name='agt-connection'),
    path('agt/dossier/', AgtDossierView.as_view(), name='agt-dossier'),
    path('', include(router.urls)),
]
