from rest_framework.routers import DefaultRouter
from django.urls import path

from .views import (
    RoomTypeViewSet, RoomViewSet, RatePlanViewSet, RateOverrideViewSet, BlockViewSet,
    ReservationViewSet, FolioViewSet, MealPlanEntryViewSet,
)
from .availability import AvailabilityView
from .reports import (
    PerformanceReportView, OccupancyReportView, RevenueReportView,
    PaymentsReportView, ChargesReportView, HousekeepingReportView,
)
from .frontdesk import HotelStatusView
from .night_audit import NightAuditRunViewSet, NightAuditRunView

router = DefaultRouter()
router.register(r'room-types', RoomTypeViewSet)
router.register(r'rooms', RoomViewSet)
router.register(r'rate-plans', RatePlanViewSet, basename='pms-rate-plan')
router.register(r'rate-overrides', RateOverrideViewSet, basename='pms-rate-override')
router.register(r'blocks', BlockViewSet, basename='pms-block')
router.register(r'reservations', ReservationViewSet, basename='pms-reservation')
router.register(r'folios', FolioViewSet, basename='pms-folio')
router.register(r'meal-plan-entries', MealPlanEntryViewSet, basename='pms-meal-plan-entry')
router.register(r'night-audit-runs', NightAuditRunViewSet, basename='pms-night-audit-run')

urlpatterns = [
    path('availability/', AvailabilityView.as_view()),
    path('reports/performance/', PerformanceReportView.as_view()),
    path('reports/occupancy/', OccupancyReportView.as_view()),
    path('reports/revenue/', RevenueReportView.as_view()),
    path('reports/payments/', PaymentsReportView.as_view()),
    path('reports/charges/', ChargesReportView.as_view()),
    path('reports/housekeeping/', HousekeepingReportView.as_view()),
    path('frontdesk/hotel-status/', HotelStatusView.as_view()),
    path('night-audit/run/', NightAuditRunView.as_view()),
] + router.urls
