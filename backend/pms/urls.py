from rest_framework.routers import DefaultRouter
from django.urls import path
from .views import (
    GuestViewSet, RoomTypeViewSet, RoomViewSet,
    ReservationViewSet, FolioViewSet,
    HousekeepingTaskViewSet, MaintenanceOrderViewSet, RatePlanViewSet,
    LaundryOrderViewSet, MinibarItemViewSet, SpaAppointmentViewSet,
    CorporateAccountViewSet, PmsDashboardView, NightAuditView,
)
from .booking import (
    BookingAvailabilityView, BookingReserveView, BookingSettingViewSet, BookingConfigView,
    MyReservationView, MyReservationCancelView, MyReservationCheckinView,
    BookingPaymentInitiateView, BookingPaymentConfirmView, BookingPaymentWebhookView,
)
from .channels import ChannelViewSet, ChannelRoomMapViewSet, ChannelSyncLogViewSet
from .frontdesk import FrontDeskView

router = DefaultRouter()
router.register(r'guests', GuestViewSet)
router.register(r'room-types', RoomTypeViewSet)
router.register(r'rooms', RoomViewSet)
router.register(r'reservations', ReservationViewSet)
router.register(r'folios', FolioViewSet)
router.register(r'housekeeping', HousekeepingTaskViewSet, basename='pms-housekeeping')
router.register(r'maintenance', MaintenanceOrderViewSet, basename='pms-maintenance')
router.register(r'rate-plans', RatePlanViewSet, basename='pms-rate-plan')
router.register(r'laundry', LaundryOrderViewSet, basename='pms-laundry')
router.register(r'minibar', MinibarItemViewSet, basename='pms-minibar')
router.register(r'spa', SpaAppointmentViewSet, basename='pms-spa')
router.register(r'corporate-accounts', CorporateAccountViewSet, basename='pms-corporate')
router.register(r'booking-settings', BookingSettingViewSet, basename='pms-booking-setting')
router.register(r'channels', ChannelViewSet, basename='pms-channel')
router.register(r'channel-room-maps', ChannelRoomMapViewSet, basename='pms-channel-map')
router.register(r'channel-sync-logs', ChannelSyncLogViewSet, basename='pms-channel-log')

urlpatterns = [
    path('dashboard/', PmsDashboardView.as_view()),
    path('frontdesk/', FrontDeskView.as_view()),
    path('night-audit/', NightAuditView.as_view()),
    path('booking/config/', BookingConfigView.as_view()),
    path('booking/availability/', BookingAvailabilityView.as_view()),
    path('booking/reserve/', BookingReserveView.as_view()),
    path('booking/reservation/', MyReservationView.as_view()),
    path('booking/reservation/cancel/', MyReservationCancelView.as_view()),
    path('booking/reservation/checkin/', MyReservationCheckinView.as_view()),
    path('booking/payment/initiate/', BookingPaymentInitiateView.as_view()),
    path('booking/payment/confirm/', BookingPaymentConfirmView.as_view()),
    path('booking/payment/webhook/', BookingPaymentWebhookView.as_view()),
] + router.urls
