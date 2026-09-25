from django.contrib import admin
from .models import RoomType, Room, RatePlan, Block, BlockRoomType, Reservation, Folio, FolioCharge, NightAuditRun

for m in (RoomType, Room, RatePlan, Block, BlockRoomType, Reservation, Folio, FolioCharge, NightAuditRun):
    admin.site.register(m)
