from rest_framework import serializers
from .models import Promotion, Combo, ComboItem


class PromotionSerializer(serializers.ModelSerializer):
    scope_display = serializers.CharField(source='get_scope_display', read_only=True)
    discount_type_display = serializers.CharField(source='get_discount_type_display', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True, default=None)
    category_name = serializers.CharField(source='category.name', read_only=True, default=None)
    outlet_name = serializers.CharField(source='outlet.name', read_only=True, default=None)
    active_now = serializers.SerializerMethodField()

    class Meta:
        model = Promotion
        fields = '__all__'

    def get_active_now(self, obj):
        return obj.active_now()


class ComboItemSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)

    class Meta:
        model = ComboItem
        fields = ['id', 'item', 'item_name', 'quantity']


class ComboSerializer(serializers.ModelSerializer):
    items = ComboItemSerializer(many=True, required=False)
    outlet_name = serializers.CharField(source='outlet.name', read_only=True, default=None)

    class Meta:
        model = Combo
        fields = '__all__'

    def create(self, validated_data):
        items = validated_data.pop('items', [])
        combo = Combo.objects.create(**validated_data)
        for it in items:
            ComboItem.objects.create(combo=combo, **it)
        return combo

    def update(self, instance, validated_data):
        items = validated_data.pop('items', None)
        for k, v in validated_data.items():
            setattr(instance, k, v)
        instance.save()
        if items is not None:
            instance.items.all().delete()
            for it in items:
                ComboItem.objects.create(combo=instance, **it)
        return instance
