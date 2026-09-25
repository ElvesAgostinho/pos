from django.contrib import admin
from .models import (
    RoomType, Room, RatePlan, Block, BlockRoomType, Reservation, Folio, FolioCharge,
    LostFoundItem, HousekeepingTask, PhoneDirectoryEntry,
)

for m in (RoomType, Room, RatePlan, Block, BlockRoomType, Reservation, Folio, FolioCharge,
          LostFoundItem, HousekeepingTask, PhoneDirectoryEntry):
    admin.site.register(m)
