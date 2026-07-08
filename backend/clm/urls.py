from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'clients', views.ClientViewSet, basename='client')
router.register(r'licenses', views.LicenseViewSet, basename='license')
router.register(r'installations', views.InstallationViewSet, basename='installation')
router.register(r'audits', views.AuditLogViewSet, basename='audit')
router.register(r'terminals', views.TerminalLicenseViewSet, basename='terminal')

urlpatterns = [
    path('', include(router.urls)),
]
