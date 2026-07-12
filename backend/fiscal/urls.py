from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views, connectivity
from .certification import CertificationView

router = DefaultRouter()
router.register('config', views.FiscalConfigViewSet, basename='fis-config')
router.register('doc-types', views.FiscalDocTypeViewSet, basename='fis-doctype')
router.register('tax-rates', views.TaxRateViewSet, basename='fis-taxrate')
router.register('exemptions', views.TaxExemptionReasonViewSet, basename='fis-exemption')
router.register('commercial-documents', views.CommercialDocumentViewSet, basename='fis-commercial')
router.register('series', views.FiscalSeriesViewSet, basename='fis-series')
router.register('documents', views.FiscalDocumentViewSet, basename='fis-document')
router.register('submissions', views.SubmissionQueueViewSet, basename='fis-submission')
router.register('audit', views.FiscalAuditLogViewSet, basename='fis-audit')
router.register('connections', connectivity.AGTConnectionViewSet, basename='fis-connection')
router.register('certificates', connectivity.DigitalCertificateViewSet, basename='fis-certificate')

urlpatterns = [
    path('dashboard/', views.FiscalDashboardView.as_view()),
    path('certification/', CertificationView.as_view()),
    path('monitor/', connectivity.FiscalMonitorView.as_view()),
    path('test-center/', connectivity.TestCenterView.as_view()),
    path('saft/export/', views.SAFTExportView.as_view()),
    path('', include(router.urls)),
]
