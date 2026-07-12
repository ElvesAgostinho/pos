"""
Centro 04 · Hotel Management — estrutura física (edifícios/pisos), dimensões de
gestão (centros de lucro/custo) e recursos/equipamentos. Viewsets + dashboard.
"""
from rest_framework import serializers, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Hotel, Building, Floor, ProfitCenter, HotelResource


def _default_hotel():
    return Hotel.objects.first()


class _HotelDefault(viewsets.ModelViewSet):
    """Injeta o hotel principal antes da validação quando não é enviado
    (satisfaz o UniqueTogetherValidator de (hotel, code) em dev single-hotel)."""
    def create(self, request, *args, **kwargs):
        if not request.data.get('hotel'):
            h = _default_hotel()
            if h:
                data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
                data['hotel'] = h.id
                serializer = self.get_serializer(data=data)
                serializer.is_valid(raise_exception=True)
                self.perform_create(serializer)
                return Response(serializer.data, status=201, headers=self.get_success_headers(serializer.data))
        return super().create(request, *args, **kwargs)


class BuildingSerializer(serializers.ModelSerializer):
    hotel = serializers.PrimaryKeyRelatedField(queryset=Hotel.objects.all(), required=False)
    hotel_name = serializers.CharField(source='hotel.name', read_only=True)
    floors_count = serializers.IntegerField(source='floors.count', read_only=True)

    class Meta:
        model = Building
        fields = '__all__'


class BuildingViewSet(_HotelDefault):
    serializer_class = BuildingSerializer

    def get_queryset(self):
        qs = Building.objects.select_related('hotel').all()
        h = self.request.query_params.get('hotel')
        return qs.filter(hotel_id=h) if h else qs


class FloorSerializer(serializers.ModelSerializer):
    building_name = serializers.CharField(source='building.name', read_only=True)

    class Meta:
        model = Floor
        fields = '__all__'


class FloorViewSet(viewsets.ModelViewSet):
    serializer_class = FloorSerializer

    def get_queryset(self):
        qs = Floor.objects.select_related('building').all()
        b = self.request.query_params.get('building')
        return qs.filter(building_id=b) if b else qs


class ProfitCenterSerializer(serializers.ModelSerializer):
    hotel = serializers.PrimaryKeyRelatedField(queryset=Hotel.objects.all(), required=False)

    class Meta:
        model = ProfitCenter
        fields = '__all__'


class ProfitCenterViewSet(_HotelDefault):
    serializer_class = ProfitCenterSerializer
    queryset = ProfitCenter.objects.all()


class HotelResourceSerializer(serializers.ModelSerializer):
    hotel = serializers.PrimaryKeyRelatedField(queryset=Hotel.objects.all(), required=False)
    resource_type_display = serializers.CharField(source='get_resource_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = HotelResource
        fields = '__all__'


class HotelResourceViewSet(_HotelDefault):
    serializer_class = HotelResourceSerializer

    def get_queryset(self):
        qs = HotelResource.objects.select_related('cost_center').all()
        rt = self.request.query_params.get('resource_type')
        return qs.filter(resource_type=rt) if rt else qs


class HmcDashboardView(APIView):
    """GET /api/org/hmc/dashboard/ — visão geral da estrutura do hotel."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = {
            'hotels': Hotel.objects.count(),
            'buildings': Building.objects.filter(is_active=True).count(),
            'floors': Floor.objects.filter(is_active=True).count(),
            'departments': __import__('identity.models', fromlist=['Department']).Department.objects.count(),
            'profit_centers': ProfitCenter.objects.filter(is_active=True).count(),
            'resources': HotelResource.objects.filter(is_active=True).count(),
            'resources_maintenance': HotelResource.objects.filter(status='MAINTENANCE').count(),
        }
        # Centros de custo (módulo finance)
        try:
            from finance.models import CostCenter as FinCostCenter
            data['cost_centers'] = FinCostCenter.objects.filter(is_active=True).count()
        except Exception:
            data['cost_centers'] = None
        # Quartos, se o PMS existir
        try:
            from pms.models import Room
            data['rooms'] = Room.objects.count()
        except Exception:
            data['rooms'] = None
        # Outlets, se o POS existir
        try:
            from pos.models import Outlet
            data['outlets'] = Outlet.objects.filter(is_active=True).count()
        except Exception:
            data['outlets'] = None
        return Response(data)
