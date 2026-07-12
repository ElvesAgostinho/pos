from rest_framework import viewsets

from .models import EnterpriseGroup, Company, Hotel, Department, Area, Shift
from .serializers import (
    EnterpriseGroupSerializer, CompanySerializer, HotelSerializer,
    DepartmentSerializer, AreaSerializer, ShiftSerializer,
)


def _first(model):
    return model.objects.first()


class EnterpriseGroupViewSet(viewsets.ModelViewSet):
    queryset = EnterpriseGroup.objects.all().order_by('name')
    serializer_class = EnterpriseGroupSerializer


class CompanyViewSet(viewsets.ModelViewSet):
    serializer_class = CompanySerializer

    def get_queryset(self):
        qs = Company.objects.select_related('group').all().order_by('name')
        g = self.request.query_params.get('group')
        return qs.filter(group_id=g) if g else qs

    def perform_create(self, serializer):
        if not serializer.validated_data.get('group'):
            grp = _first(EnterpriseGroup) or EnterpriseGroup.objects.create(name='Grupo Principal')
            serializer.save(group=grp)
        else:
            serializer.save()


class HotelViewSet(viewsets.ModelViewSet):
    serializer_class = HotelSerializer

    def get_queryset(self):
        qs = Hotel.objects.select_related('company').all().order_by('name')
        c = self.request.query_params.get('company')
        return qs.filter(company_id=c) if c else qs

    def perform_create(self, serializer):
        if not serializer.validated_data.get('company'):
            comp = _first(Company)
            if not comp:
                grp = _first(EnterpriseGroup) or EnterpriseGroup.objects.create(name='Grupo Principal')
                comp = Company.objects.create(group=grp, name='Empresa Principal')
            serializer.save(company=comp)
        else:
            serializer.save()


class DepartmentViewSet(viewsets.ModelViewSet):
    serializer_class = DepartmentSerializer

    def get_queryset(self):
        qs = Department.objects.select_related('hotel').all().order_by('name')
        h = self.request.query_params.get('hotel')
        return qs.filter(hotel_id=h) if h else qs

    def perform_create(self, serializer):
        if not serializer.validated_data.get('hotel'):
            serializer.save(hotel=_first(Hotel))
        else:
            serializer.save()


class AreaViewSet(viewsets.ModelViewSet):
    serializer_class = AreaSerializer

    def get_queryset(self):
        qs = Area.objects.select_related('department').all().order_by('name')
        d = self.request.query_params.get('department')
        return qs.filter(department_id=d) if d else qs

    def perform_create(self, serializer):
        if not serializer.validated_data.get('department'):
            serializer.save(department=_first(Department))
        else:
            serializer.save()


class ShiftViewSet(viewsets.ModelViewSet):
    serializer_class = ShiftSerializer

    def get_queryset(self):
        qs = Shift.objects.select_related('hotel').all().order_by('name')
        h = self.request.query_params.get('hotel')
        return qs.filter(hotel_id=h) if h else qs

    def perform_create(self, serializer):
        if not serializer.validated_data.get('hotel'):
            serializer.save(hotel=_first(Hotel))
        else:
            serializer.save()
