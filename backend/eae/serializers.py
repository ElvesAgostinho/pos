from rest_framework import serializers
from .models import Profile, Role, Group, Resource, Policy

class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = '__all__'

class RoleSerializer(serializers.ModelSerializer):
    profile_name = serializers.CharField(source='profile.name', read_only=True)
    user_name = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = Role
        fields = '__all__'

class GroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = Group
        fields = '__all__'

class ResourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Resource
        fields = '__all__'

class PolicySerializer(serializers.ModelSerializer):
    resource_urn = serializers.CharField(source='resource.urn', read_only=True)
    
    class Meta:
        model = Policy
        fields = '__all__'
