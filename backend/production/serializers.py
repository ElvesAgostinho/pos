from rest_framework import serializers

from identity.models import Hotel
from .models import (
    Allergen, ProductionArea, KitchenEquipment, ItemProductionProfile, Recipe, RecipeLine,
    FnbMenu, FnbMenuItem, FnbEvent, HaccpCheck, WasteRecord, QualityCheck
)


class AllergenSerializer(serializers.ModelSerializer):
    class Meta:
        model = Allergen
        fields = '__all__'


class ProductionAreaSerializer(serializers.ModelSerializer):
    area_type_display = serializers.CharField(source='get_area_type_display', read_only=True)
    hotel = serializers.PrimaryKeyRelatedField(
        queryset=ProductionArea._meta.get_field('hotel').related_model.objects.all(),
        required=False,  # se omitido, o ViewSet usa o hotel principal
    )

    class Meta:
        model = ProductionArea
        fields = '__all__'


class KitchenEquipmentSerializer(serializers.ModelSerializer):
    area_name = serializers.CharField(source='area.name', read_only=True)

    class Meta:
        model = KitchenEquipment
        fields = '__all__'


class ItemProductionProfileSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_code = serializers.CharField(source='item.code', read_only=True)
    allergens = AllergenSerializer(many=True, read_only=True)
    allergen_ids = serializers.PrimaryKeyRelatedField(
        queryset=Allergen.objects.all(), source='allergens', many=True, write_only=True, required=False
    )

    class Meta:
        model = ItemProductionProfile
        fields = '__all__'


class RecipeLineSerializer(serializers.ModelSerializer):
    component_name = serializers.CharField(source='component_item.name', read_only=True)
    component_code = serializers.CharField(source='component_item.code', read_only=True)
    uom_code = serializers.CharField(source='uom.code', read_only=True)
    effective_quantity = serializers.DecimalField(max_digits=14, decimal_places=4, read_only=True)
    line_cost = serializers.DecimalField(max_digits=14, decimal_places=4, read_only=True)

    class Meta:
        model = RecipeLine
        fields = '__all__'


class RecipeSerializer(serializers.ModelSerializer):
    final_item_name = serializers.CharField(source='final_item.name', read_only=True)
    area_name = serializers.CharField(source='area.name', read_only=True, default=None)
    yield_uom_code = serializers.CharField(source='yield_uom.code', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    lines = RecipeLineSerializer(many=True, read_only=True)
    equipment_ids = serializers.PrimaryKeyRelatedField(
        queryset=KitchenEquipment.objects.all(), source='equipments', many=True, write_only=True, required=False
    )
    cost_per_yield_unit = serializers.DecimalField(max_digits=14, decimal_places=4, read_only=True)

    class Meta:
        model = Recipe
        fields = '__all__'


# ------------------------- F&B Operations Center -------------------------

class FnbMenuItemSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True, default=None)
    item_code = serializers.CharField(source='item.code', read_only=True, default=None)
    cost = serializers.DecimalField(max_digits=14, decimal_places=4, read_only=True)
    margin = serializers.DecimalField(max_digits=6, decimal_places=1, read_only=True)

    class Meta:
        model = FnbMenuItem
        fields = '__all__'


class FnbMenuSerializer(serializers.ModelSerializer):
    menu_type_display = serializers.CharField(source='get_menu_type_display', read_only=True)
    outlet_type_display = serializers.CharField(source='get_outlet_type_display', read_only=True, default=None)
    items = FnbMenuItemSerializer(many=True, read_only=True)
    item_count = serializers.IntegerField(source='items.count', read_only=True)
    hotel = serializers.PrimaryKeyRelatedField(queryset=Hotel.objects.all(), required=False)

    class Meta:
        model = FnbMenu
        fields = '__all__'


class FnbEventSerializer(serializers.ModelSerializer):
    event_type_display = serializers.CharField(source='get_event_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    menu_name = serializers.CharField(source='menu.name', read_only=True, default=None)
    hotel = serializers.PrimaryKeyRelatedField(queryset=Hotel.objects.all(), required=False)

    class Meta:
        model = FnbEvent
        fields = '__all__'


class HaccpCheckSerializer(serializers.ModelSerializer):
    check_type_display = serializers.CharField(source='get_check_type_display', read_only=True)
    area_name = serializers.CharField(source='area.name', read_only=True, default=None)
    hotel = serializers.PrimaryKeyRelatedField(queryset=Hotel.objects.all(), required=False)

    class Meta:
        model = HaccpCheck
        fields = '__all__'


class WasteRecordSerializer(serializers.ModelSerializer):
    reason_display = serializers.CharField(source='get_reason_display', read_only=True)
    area_name = serializers.CharField(source='area.name', read_only=True, default=None)
    item_name = serializers.CharField(source='item.name', read_only=True, default=None)
    uom_code = serializers.CharField(source='uom.code', read_only=True, default=None)
    hotel = serializers.PrimaryKeyRelatedField(queryset=Hotel.objects.all(), required=False)

    class Meta:
        model = WasteRecord
        fields = '__all__'


class QualityCheckSerializer(serializers.ModelSerializer):
    result_display = serializers.CharField(source='get_result_display', read_only=True)
    outlet_type_display = serializers.CharField(source='get_outlet_type_display', read_only=True, default=None)
    area_name = serializers.CharField(source='area.name', read_only=True, default=None)
    hotel = serializers.PrimaryKeyRelatedField(queryset=Hotel.objects.all(), required=False)

    class Meta:
        model = QualityCheck
        fields = '__all__'


from .models import PosMessage, PosMessageOption  # noqa: E402


class PosMessageOptionSerializer(serializers.ModelSerializer):
    printer_name = serializers.CharField(source='printer.name', read_only=True, default=None)

    class Meta:
        model = PosMessageOption
        fields = ('id', 'message', 'key_label', 'print_label', 'sort_order',
                  'printer', 'printer_name', 'on_emenu')
        # O modelo é criado DENTRO da mensagem — não se pede o pai outra vez.
        extra_kwargs = {'message': {'required': False}}


class PosMessageSerializer(serializers.ModelSerializer):
    """A mensagem e os seus modelos (respostas) — gravam-se de uma vez, como no ecrã."""
    options = PosMessageOptionSerializer(many=True, required=False)

    class Meta:
        model = PosMessage
        fields = '__all__'

    def create(self, validated):
        opts = validated.pop('options', [])
        msg = PosMessage.objects.create(**validated)
        self._sync(msg, opts)
        return msg

    def update(self, instance, validated):
        opts = validated.pop('options', None)
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        if opts is not None:
            self._sync(instance, opts)
        return instance

    def _sync(self, msg, opts):
        msg.options.all().delete()
        for o in opts:
            o.pop('message', None)
            PosMessageOption.objects.create(message=msg, **o)
