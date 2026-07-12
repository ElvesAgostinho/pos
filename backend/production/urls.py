from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    PosMessageViewSet,
    AllergenViewSet, ProductionAreaViewSet, KitchenEquipmentViewSet,
    ItemProductionProfileViewSet, RecipeViewSet, RecipeLineViewSet
)
from .fnb import (
    FnbMenuViewSet, FnbMenuItemViewSet, FnbEventViewSet, HaccpCheckViewSet,
    WasteRecordViewSet, QualityCheckViewSet,
    FnbDashboardView, FnbOutletsView, FnbTimingView, FnbReportsView,
)

router = DefaultRouter()
router.register(r'allergens', AllergenViewSet, basename='prod-allergen')
router.register(r'pos-messages', PosMessageViewSet, basename='prod-pos-message')
router.register(r'areas', ProductionAreaViewSet, basename='prod-area')
router.register(r'equipment', KitchenEquipmentViewSet, basename='prod-equipment')
router.register(r'item-profiles', ItemProductionProfileViewSet, basename='prod-item-profile')
router.register(r'recipes', RecipeViewSet, basename='prod-recipe')
router.register(r'recipe-lines', RecipeLineViewSet, basename='prod-recipe-line')
# F&B Operations Center
router.register(r'fnb/menus', FnbMenuViewSet, basename='fnb-menu')
router.register(r'fnb/menu-items', FnbMenuItemViewSet, basename='fnb-menu-item')
router.register(r'fnb/events', FnbEventViewSet, basename='fnb-event')
router.register(r'fnb/haccp', HaccpCheckViewSet, basename='fnb-haccp')
router.register(r'fnb/waste', WasteRecordViewSet, basename='fnb-waste')
router.register(r'fnb/quality', QualityCheckViewSet, basename='fnb-quality')

urlpatterns = [
    path('fnb/dashboard/', FnbDashboardView.as_view(), name='fnb-dashboard'),
    path('fnb/outlets/', FnbOutletsView.as_view(), name='fnb-outlets'),
    path('fnb/timing/', FnbTimingView.as_view(), name='fnb-timing'),
    path('fnb/reports/', FnbReportsView.as_view(), name='fnb-reports'),
    path('', include(router.urls)),
]
