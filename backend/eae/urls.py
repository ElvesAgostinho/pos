from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ProfileViewSet, RoleViewSet, GroupViewSet, ResourceViewSet, PolicyViewSet

router = DefaultRouter()
router.register(r'profiles', ProfileViewSet)
router.register(r'roles', RoleViewSet)
router.register(r'groups', GroupViewSet)
router.register(r'resources', ResourceViewSet)
router.register(r'policies', PolicyViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
