from rest_framework.routers import DefaultRouter
from django.urls import path

from .views import (
    RoomTypeViewSet, RoomViewSet, RatePlanViewSet, BlockViewSet,
    ReservationViewSet, FolioViewSet, MealPlanEntryViewSet,
)
from .availability import AvailabilityView

router = DefaultRouter()
router.register(r'room-types', RoomTypeViewSet)
router.register(r'rooms', RoomViewSet)
router.register(r'rate-plans', RatePlanViewSet, basename='pms-rate-plan')
router.register(r'blocks', BlockViewSet, basename='pms-block')
router.register(r'reservations', ReservationViewSet, basename='pms-reservation')
router.register(r'folios', FolioViewSet, basename='pms-folio')
router.register(r'meal-plan-entries', MealPlanEntryViewSet, basename='pms-meal-plan-entry')

urlpatterns = [
    path('availability/', AvailabilityView.as_view()),
] + router.urls
