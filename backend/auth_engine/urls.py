from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import BackofficeLoginView, PosLoginView, MeView, LogoutView, ChangePasswordView
from .security_api import UserViewSet, UserSessionViewSet, AuthEventViewSet, MyAccessView

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='sec-user')
router.register(r'sessions', UserSessionViewSet, basename='sec-session')
router.register(r'events', AuthEventViewSet, basename='sec-event')

urlpatterns = [
    path('login/', BackofficeLoginView.as_view(), name='backoffice-login'),
    path('pos-login/', PosLoginView.as_view(), name='pos-login'),
    path('refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('me/', MeView.as_view(), name='me'),
    path('access/', MyAccessView.as_view(), name='my-access'),
    path('change-password/', ChangePasswordView.as_view(), name='change-password'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('', include(router.urls)),
]
