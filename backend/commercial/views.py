from rest_framework import viewsets
from .models import Promotion, Combo
from .serializers import PromotionSerializer, ComboSerializer


class PromotionViewSet(viewsets.ModelViewSet):
    serializer_class = PromotionSerializer

    def get_queryset(self):
        qs = Promotion.objects.select_related('item', 'category', 'outlet').all()
        outlet = self.request.query_params.get('outlet')
        return qs.filter(outlet_id=outlet) if outlet else qs


class ComboViewSet(viewsets.ModelViewSet):
    serializer_class = ComboSerializer

    def get_queryset(self):
        qs = Combo.objects.prefetch_related('items__item').all()
        outlet = self.request.query_params.get('outlet')
        return qs.filter(outlet_id=outlet) if outlet else qs
