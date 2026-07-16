from django.urls import path
from .views import (ActiveModulesView, LicenseStatusView, LicenseLimitsView, FeaturesView,
                    LicenseSyncView)

urlpatterns = [
    path('sync/', LicenseSyncView.as_view(), name='license-sync'),
    path('active-modules/', ActiveModulesView.as_view(), name='active-modules'),
    path('features/', FeaturesView.as_view(), name='features'),
    path('status/', LicenseStatusView.as_view(), name='license-status'),
    path('limits/', LicenseLimitsView.as_view(), name='license-limits'),
]
