from rest_framework import serializers
from identity.models import Collaborator, PosOperator, Department, Hotel, Workstation, Shift, OperatorWorkstationConstraint
from eae.models import Profile, Role
from django.contrib.auth.models import User
from django.contrib.auth.hashers import make_password, identify_hasher

class CollaboratorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Collaborator
        fields = '__all__'

class PosOperatorSerializer(serializers.ModelSerializer):
    # PIN só de escrita: nunca é devolvido nas respostas e é sempre hasheado.
    pin_code = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = PosOperator
        fields = '__all__'

    def _hash_pin(self, validated_data):
        raw = validated_data.get('pin_code')
        if raw:
            try:
                identify_hasher(raw)  # já está hasheado? não voltar a hashear
            except ValueError:
                validated_data['pin_code'] = make_password(raw)
        return validated_data

    def create(self, validated_data):
        return super().create(self._hash_pin(validated_data))

    def update(self, instance, validated_data):
        if not validated_data.get('pin_code'):
            validated_data.pop('pin_code', None)  # não apagar PIN se não vier
        else:
            self._hash_pin(validated_data)
        return super().update(instance, validated_data)

class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = '__all__'

class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = '__all__'

class WorkstationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workstation
        fields = '__all__'

class ShiftSerializer(serializers.ModelSerializer):
    class Meta:
        model = Shift
        fields = '__all__'
