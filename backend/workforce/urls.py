from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import WorkforceViewSet, DepartmentViewSet, ShiftViewSet, PosOperatorViewSet, CollaboratorViewSet

router = DefaultRouter()
router.register(r'departments', DepartmentViewSet, basename='departments')
router.register(r'shifts', ShiftViewSet, basename='shifts')
router.register(r'pos_operators', PosOperatorViewSet, basename='pos_operators')
router.register(r'collaborators', CollaboratorViewSet, basename='collaborators')
router.register(r'', WorkforceViewSet, basename='workforce')

urlpatterns = [
    path('', include(router.urls)),
]
