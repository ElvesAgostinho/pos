from rest_framework import serializers
from .models import EnterpriseGroup, Company, Hotel, Department, Area, Shift


class EnterpriseGroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = EnterpriseGroup
        fields = '__all__'


class CompanySerializer(serializers.ModelSerializer):
    group = serializers.PrimaryKeyRelatedField(queryset=EnterpriseGroup.objects.all(), required=False)
    group_name = serializers.CharField(source='group.name', read_only=True)

    class Meta:
        model = Company
        fields = '__all__'


class HotelSerializer(serializers.ModelSerializer):
    company = serializers.PrimaryKeyRelatedField(queryset=Company.objects.all(), required=False)
    company_name = serializers.CharField(source='company.name', read_only=True)

    class Meta:
        model = Hotel
        fields = '__all__'


class DepartmentSerializer(serializers.ModelSerializer):
    hotel = serializers.PrimaryKeyRelatedField(queryset=Hotel.objects.all(), required=False)
    hotel_name = serializers.CharField(source='hotel.name', read_only=True)

    class Meta:
        model = Department
        fields = '__all__'


class AreaSerializer(serializers.ModelSerializer):
    department = serializers.PrimaryKeyRelatedField(queryset=Department.objects.all(), required=False)
    department_name = serializers.CharField(source='department.name', read_only=True)

    class Meta:
        model = Area
        fields = '__all__'


class ShiftSerializer(serializers.ModelSerializer):
    hotel = serializers.PrimaryKeyRelatedField(queryset=Hotel.objects.all(), required=False)
    hotel_name = serializers.CharField(source='hotel.name', read_only=True)

    class Meta:
        model = Shift
        fields = '__all__'
