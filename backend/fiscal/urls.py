from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views, connectivity
from .certification import CertificationView
from .agt_api import SubmissionViewSet, AGTTransmitView
from .saft_center import (
    SaftHistoryViewSet, SaftProfilesView, SaftProfileExportView, SaftValidateView,
)

router = DefaultRouter()
router.register('config', views.FiscalConfigViewSet, basename='fis-config')
router.register('doc-types', views.FiscalDocTypeViewSet, basename='fis-doctype')
router.register('tax-rates', views.TaxRateViewSet, basename='fis-taxrate')
router.register('bank-accounts', views.CompanyBankAccountViewSet, basename='fis-bank')
router.register('exemptions', views.TaxExemptionReasonViewSet, basename='fis-exemption')
router.register('commercial-documents', views.CommercialDocumentViewSet, basename='fis-commercial')
router.register('series', views.FiscalSeriesViewSet, basename='fis-series')
router.register('documents', views.FiscalDocumentViewSet, basename='fis-document')
router.register('submissions', views.SubmissionQueueViewSet, basename='fis-submission')
router.register('audit', views.FiscalAuditLogViewSet, basename='fis-audit')
router.register('connections', connectivity.AGTConnectionViewSet, basename='fis-connection')
router.register('certificates', connectivity.DigitalCertificateViewSet, basename='fis-certificate')
router.register('saft/history', SaftHistoryViewSet, basename='fis-saft-history')
router.register('agt/submissions', SubmissionViewSet, basename='fis-agt-submission')

urlpatterns = [
    path('dashboard/', views.FiscalDashboardView.as_view()),
    path('certification/', CertificationView.as_view()),
    path('monitor/', connectivity.FiscalMonitorView.as_view()),
    path('agt/transmit/', AGTTransmitView.as_view()),
    path('test-center/', connectivity.TestCenterView.as_view()),
    # ---- Centro SAF-T (multi-perfil) ----
    path('saft/profiles/', SaftProfilesView.as_view()),
    path('saft/export/<str:profile>/', SaftProfileExportView.as_view()),
    path('saft/validate/<str:profile>/', SaftValidateView.as_view()),
    path('saft/validate/', SaftValidateView.as_view()),
    path('saft/export/', views.SAFTExportView.as_view()),   # retrocompatível (faturação)
    path('', include(router.urls)),
]
