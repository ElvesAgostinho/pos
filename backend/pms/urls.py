from rest_framework.routers import DefaultRouter
from django.urls import path

from .views import (
    RoomTypeViewSet, RoomViewSet, RatePlanViewSet, RateOverrideViewSet, BlockViewSet,
    ReservationViewSet, FolioViewSet, MealPlanEntryViewSet,
    LostFoundItemViewSet, HousekeepingTaskViewSet, PhoneDirectoryEntryViewSet,
)
from .availability import AvailabilityView
from .reports import (
    PerformanceReportView, OccupancyReportView, RevenueReportView,
    PaymentsReportView, ChargesReportView, HousekeepingReportView,
)
from .frontdesk import HotelStatusView
from .night_audit import NightAuditRunViewSet, NightAuditRunView
from .booking_engine import (
    BookingSettingsViewSet, BookingConfigView, BookingAvailabilityView, BookingReserveView,
)
from .channel_manager import ChannelViewSet, ChannelSyncLogViewSet
from .chatbot import ChatbotSettingsViewSet, ChatbotSimulateView
from .events_api import EventViewSet, EventForecastView

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
router.register(r'lost-found-items', LostFoundItemViewSet, basename='pms-lost-found-item')
router.register(r'tasks', HousekeepingTaskViewSet, basename='pms-task')
router.register(r'phone-directory', PhoneDirectoryEntryViewSet, basename='pms-phone-directory')
router.register(r'booking-settings', BookingSettingsViewSet, basename='pms-booking-settings')
router.register(r'channels', ChannelViewSet, basename='pms-channel')
router.register(r'channel-sync-logs', ChannelSyncLogViewSet, basename='pms-channel-sync-log')
router.register(r'chatbot-settings', ChatbotSettingsViewSet, basename='pms-chatbot-settings')
router.register(r'events', EventViewSet, basename='pms-event')

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
    # Booking Engine — endpoints PÚBLICOS (sem login), consumidos pelo site de
    # reservas (BookingSite.tsx) e pelo testador do ecrã de administração.
    path('booking/config/', BookingConfigView.as_view()),
    path('booking/availability/', BookingAvailabilityView.as_view()),
    path('booking/reserve/', BookingReserveView.as_view()),
    # EMS — antes do router para não ser interpretado como events/<pk>.
    path('events/forecast/', EventForecastView.as_view()),
    # Chatbot — simulador (autenticado, dados reais, nunca envia WhatsApp a sério).
    path('chatbot/simulate/', ChatbotSimulateView.as_view()),
] + router.urls
