from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import (
    EnterpriseGroupViewSet, CompanyViewSet, HotelViewSet,
    DepartmentViewSet, AreaViewSet, ShiftViewSet,
)
from .hmc import (
    BuildingViewSet, FloorViewSet, ProfitCenterViewSet,
    HotelResourceViewSet, HmcDashboardView,
)

router = DefaultRouter()
router.register(r'groups', EnterpriseGroupViewSet, basename='org-group')
router.register(r'companies', CompanyViewSet, basename='org-company')
router.register(r'hotels', HotelViewSet, basename='org-hotel')
router.register(r'departments', DepartmentViewSet, basename='org-department')
router.register(r'areas', AreaViewSet, basename='org-area')
router.register(r'shifts', ShiftViewSet, basename='org-shift')
# Centro 04 · Hotel Management
router.register(r'buildings', BuildingViewSet, basename='org-building')
router.register(r'floors', FloorViewSet, basename='org-floor')
router.register(r'profit-centers', ProfitCenterViewSet, basename='org-profit-center')
router.register(r'resources', HotelResourceViewSet, basename='org-resource')

urlpatterns = router.urls + [
    path('hmc/dashboard/', HmcDashboardView.as_view(), name='hmc-dashboard'),
]
