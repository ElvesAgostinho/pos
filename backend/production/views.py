from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import (
    Allergen, ProductionArea, KitchenEquipment, ItemProductionProfile, Recipe, RecipeLine
)
from .serializers import (
    AllergenSerializer, ProductionAreaSerializer, KitchenEquipmentSerializer,
    ItemProductionProfileSerializer, RecipeSerializer, RecipeLineSerializer
)


class AllergenViewSet(viewsets.ModelViewSet):
    queryset = Allergen.objects.all()
    serializer_class = AllergenSerializer


class ProductionAreaViewSet(viewsets.ModelViewSet):
    serializer_class = ProductionAreaSerializer

    def get_queryset(self):
        qs = ProductionArea.objects.select_related('hotel').all()
        hotel = self.request.query_params.get('hotel')
        return qs.filter(hotel_id=hotel) if hotel else qs

    def perform_create(self, serializer):
        # Se o hotel não for enviado, usa o hotel principal (dev single-hotel).
        if not serializer.validated_data.get('hotel'):
            from identity.models import Hotel
            serializer.save(hotel=Hotel.objects.first())
        else:
            serializer.save()


class KitchenEquipmentViewSet(viewsets.ModelViewSet):
    serializer_class = KitchenEquipmentSerializer

    def get_queryset(self):
        qs = KitchenEquipment.objects.select_related('area').all()
        area = self.request.query_params.get('area')
        return qs.filter(area_id=area) if area else qs


class ItemProductionProfileViewSet(viewsets.ModelViewSet):
    serializer_class = ItemProductionProfileSerializer

    def get_queryset(self):
        qs = ItemProductionProfile.objects.select_related('item').prefetch_related('allergens').all()
        item = self.request.query_params.get('item')
        return qs.filter(item_id=item) if item else qs


class RecipeViewSet(viewsets.ModelViewSet):
    serializer_class = RecipeSerializer

    def get_queryset(self):
        qs = (
            Recipe.objects.select_related('final_item', 'area', 'yield_uom')
            .prefetch_related('lines__component_item', 'lines__uom', 'equipments')
            .all()
        )
        item = self.request.query_params.get('final_item')
        status_param = self.request.query_params.get('status')
        if item:
            qs = qs.filter(final_item_id=item)
        if status_param:
            qs = qs.filter(status=status_param)
        return qs

    @action(detail=True, methods=['post'])
    def recalculate_cost(self, request, pk=None):
        """Recalcula o custo teórico da receita a partir dos componentes atuais."""
        recipe = self.get_object()
        recipe.compute_cost(save=True)
        return Response(self.get_serializer(recipe).data)


class RecipeLineViewSet(viewsets.ModelViewSet):
    serializer_class = RecipeLineSerializer

    def get_queryset(self):
        qs = RecipeLine.objects.select_related('component_item', 'uom', 'recipe').all()
        recipe = self.request.query_params.get('recipe')
        return qs.filter(recipe_id=recipe) if recipe else qs

    def _recalc(self, recipe_id):
        try:
            Recipe.objects.get(id=recipe_id).compute_cost(save=True)
        except Recipe.DoesNotExist:
            pass

    def perform_create(self, serializer):
        line = serializer.save()
        self._recalc(line.recipe_id)

    def perform_update(self, serializer):
        line = serializer.save()
        self._recalc(line.recipe_id)

    def perform_destroy(self, instance):
        recipe_id = instance.recipe_id
        instance.delete()
        self._recalc(recipe_id)
