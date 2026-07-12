from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import PromotionViewSet, ComboViewSet
from .loyalty import LoyaltyProgramViewSet, LoyaltyTierViewSet, CommercialDashboardView

router = DefaultRouter()
router.register(r'promotions', PromotionViewSet, basename='com-promotion')
router.register(r'combos', ComboViewSet, basename='com-combo')
router.register(r'loyalty-programs', LoyaltyProgramViewSet, basename='com-loyalty-program')
router.register(r'loyalty-tiers', LoyaltyTierViewSet, basename='com-loyalty-tier')

urlpatterns = router.urls + [
    path('dashboard/', CommercialDashboardView.as_view(), name='com-dashboard'),
]
