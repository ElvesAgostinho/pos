"""Fidelização (loyalty) + dashboard comercial."""
from rest_framework import serializers, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Promotion, Combo, LoyaltyProgram, LoyaltyTier


class LoyaltyTierSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoyaltyTier
        fields = '__all__'


class LoyaltyProgramSerializer(serializers.ModelSerializer):
    tiers = LoyaltyTierSerializer(many=True, read_only=True)
    tier_count = serializers.IntegerField(source='tiers.count', read_only=True)

    class Meta:
        model = LoyaltyProgram
        fields = '__all__'


class LoyaltyProgramViewSet(viewsets.ModelViewSet):
    serializer_class = LoyaltyProgramSerializer
    queryset = LoyaltyProgram.objects.prefetch_related('tiers').all()


class LoyaltyTierViewSet(viewsets.ModelViewSet):
    serializer_class = LoyaltyTierSerializer

    def get_queryset(self):
        qs = LoyaltyTier.objects.select_related('program').all()
        program = self.request.query_params.get('program')
        return qs.filter(program_id=program) if program else qs


class CommercialDashboardView(APIView):
    """GET /api/commercial/dashboard/ — visão geral do centro comercial."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = {
            'promotions_active': Promotion.objects.filter(is_active=True).count(),
            'promotions_total': Promotion.objects.count(),
            'combos': Combo.objects.count(),
            'loyalty_programs': LoyaltyProgram.objects.filter(is_active=True).count(),
            'loyalty_tiers': LoyaltyTier.objects.count(),
        }
        # Gift cards, se o POS existir
        try:
            from pos.models import GiftCard
            data['giftcards_active'] = GiftCard.objects.filter(status='ACTIVE').count()
            data['giftcards_balance'] = float(sum((g.balance for g in GiftCard.objects.filter(status='ACTIVE')), 0))
        except Exception:
            data['giftcards_active'] = None
            data['giftcards_balance'] = None
        return Response(data)
