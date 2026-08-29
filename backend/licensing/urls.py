from django.urls import path
from .views import (ActiveModulesView, LicenseStatusView, LicensePreflightView, LicenseLimitsView,
                    FeaturesView, LicenseSyncView, ApplyUpdateView, OwnerPasswordResetView,
                    RemoteActivationView, UploadLicenseView)

urlpatterns = [
    path('sync/', LicenseSyncView.as_view(), name='license-sync'),
    path('activate-remote/', RemoteActivationView.as_view(), name='activate-remote'),
    path('upload/', UploadLicenseView.as_view(), name='license-upload'),
    path('active-modules/', ActiveModulesView.as_view(), name='active-modules'),
    path('features/', FeaturesView.as_view(), name='features'),
    path('status/', LicenseStatusView.as_view(), name='license-status'),
    path('preflight/', LicensePreflightView.as_view(), name='license-preflight'),
    path('limits/', LicenseLimitsView.as_view(), name='license-limits'),
    path('apply-update/', ApplyUpdateView.as_view(), name='apply-update'),
    path('reset-owner-password/', OwnerPasswordResetView.as_view(), name='reset-owner-password'),
]
