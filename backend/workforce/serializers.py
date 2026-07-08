from rest_framework import serializers
from identity.models import Collaborator, PosOperator, Department, Hotel, Workstation, Shift, OperatorWorkstationConstraint
from eae.models import Profile, Role
from django.contrib.auth.models import User

class CollaboratorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Collaborator
        fields = '__all__'

class PosOperatorSerializer(serializers.ModelSerializer):
    class Meta:
        model = PosOperator
        fields = '__all__'

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
