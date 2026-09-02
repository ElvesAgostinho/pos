from django.contrib import admin
from .models import RoomType, Room, RatePlan, Block, BlockRoomType, Reservation, Folio, FolioCharge

for m in (RoomType, Room, RatePlan, Block, BlockRoomType, Reservation, Folio, FolioCharge):
    admin.site.register(m)
