from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import (
    SupplierCategory, Supplier, SupplierContact, SupplierProductCatalog,
    SupplierContract, SupplierDocument, SupplierQualityControl, SupplierPerformanceProfile
)
from .serializers import (
    SupplierCategorySerializer, SupplierSerializer, SupplierContactSerializer,
    SupplierProductCatalogSerializer, SupplierContractSerializer,
    SupplierDocumentSerializer, SupplierQualityControlSerializer,
    SupplierPerformanceProfileSerializer
)
from .services import recalculate_supplier_performance

# Fornecedores considerados "locais" (mercado interno). Ajustável por configuração.
LOCAL_COUNTRY = "Angola"


class SupplierCategoryViewSet(viewsets.ModelViewSet):
    queryset = SupplierCategory.objects.all().order_by('name')
    serializer_class = SupplierCategorySerializer


class SupplierViewSet(viewsets.ModelViewSet):
    serializer_class = SupplierSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['code', 'commercial_name', 'legal_name', 'nif', 'city']
    ordering_fields = ['code', 'commercial_name', 'created_at', 'status']

    def get_queryset(self):
        qs = (
            Supplier.objects.all()
            .select_related('performance_profile')
            .prefetch_related('categories', 'contacts', 'contracts', 'documents', 'quality_controls', 'catalog__item')
            .order_by('commercial_name')
        )
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(categories__id=category)
        return qs

    @action(detail=True, methods=['get'])
    def catalog(self, request, pk=None):
        """Catálogo de produtos/preços acordados de um fornecedor."""
        supplier = self.get_object()
        items = supplier.catalog.select_related('item').all()
        return Response(SupplierProductCatalogSerializer(items, many=True).data)

    @action(detail=True, methods=['get', 'post'])
    def performance(self, request, pk=None):
        """
        GET: devolve o perfil de desempenho atual.
        POST: força um recálculo completo a partir do histórico de Compras.
        """
        supplier = self.get_object()
        if request.method == 'POST':
            profile = recalculate_supplier_performance(supplier)
        else:
            profile, _ = SupplierPerformanceProfile.objects.get_or_create(supplier=supplier)
        return Response(SupplierPerformanceProfileSerializer(profile).data)

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        """KPIs e alertas para o Dashboard ESM do Backoffice."""
        today = timezone.now().date()
        soon = today + timedelta(days=30)

        base = Supplier.objects.all()
        total = base.count()
        by_status = {
            row['status']: row['n']
            for row in base.values('status').annotate(n=Count('id'))
        }

        expiring_documents = (
            SupplierDocument.objects
            .filter(expiration_date__isnull=False, expiration_date__gte=today, expiration_date__lte=soon)
            .select_related('supplier')
            .order_by('expiration_date')[:20]
        )
        expired_documents_count = SupplierDocument.objects.filter(
            expiration_date__isnull=False, expiration_date__lt=today
        ).count()

        expiring_contracts = (
            SupplierContract.objects
            .filter(is_active=True, end_date__isnull=False, end_date__gte=today, end_date__lte=soon)
            .select_related('supplier')
            .order_by('end_date')[:20]
        )

        top_suppliers = (
            Supplier.objects
            .select_related('performance_profile')
            .filter(performance_profile__isnull=False)
            .order_by('-performance_profile__overall_score')[:5]
        )

        return Response({
            'total_suppliers': total,
            'active': by_status.get('ACTIVE', 0),
            'blocked': by_status.get('BLOCKED', 0),
            'evaluation': by_status.get('EVALUATION', 0),
            'local': base.filter(country=LOCAL_COUNTRY).count(),
            'international': base.exclude(country=LOCAL_COUNTRY).count(),
            'expired_documents': expired_documents_count,
            'expiring_documents': [
                {
                    'id': d.id,
                    'supplier_id': d.supplier_id,
                    'supplier_name': d.supplier.commercial_name,
                    'title': d.title,
                    'document_type': d.get_document_type_display(),
                    'expiration_date': d.expiration_date,
                }
                for d in expiring_documents
            ],
            'expiring_contracts': [
                {
                    'id': c.id,
                    'supplier_id': c.supplier_id,
                    'supplier_name': c.supplier.commercial_name,
                    'reference': c.reference,
                    'end_date': c.end_date,
                }
                for c in expiring_contracts
            ],
            'top_suppliers': [
                {
                    'id': s.id,
                    'code': s.code,
                    'commercial_name': s.commercial_name,
                    'overall_score': s.performance_profile.overall_score,
                    'punctuality': s.performance_profile.punctuality_percentage,
                }
                for s in top_suppliers
            ],
        })


class SupplierContactViewSet(viewsets.ModelViewSet):
    serializer_class = SupplierContactSerializer

    def get_queryset(self):
        qs = SupplierContact.objects.select_related('supplier').all()
        supplier = self.request.query_params.get('supplier')
        return qs.filter(supplier_id=supplier) if supplier else qs


class SupplierProductCatalogViewSet(viewsets.ModelViewSet):
    serializer_class = SupplierProductCatalogSerializer

    def get_queryset(self):
        qs = SupplierProductCatalog.objects.select_related('supplier', 'item').all()
        supplier = self.request.query_params.get('supplier')
        return qs.filter(supplier_id=supplier) if supplier else qs


class SupplierContractViewSet(viewsets.ModelViewSet):
    serializer_class = SupplierContractSerializer

    def get_queryset(self):
        qs = SupplierContract.objects.select_related('supplier').all()
        supplier = self.request.query_params.get('supplier')
        return qs.filter(supplier_id=supplier) if supplier else qs


class SupplierDocumentViewSet(viewsets.ModelViewSet):
    serializer_class = SupplierDocumentSerializer

    def get_queryset(self):
        qs = SupplierDocument.objects.select_related('supplier').all()
        supplier = self.request.query_params.get('supplier')
        return qs.filter(supplier_id=supplier) if supplier else qs


class SupplierQualityControlViewSet(viewsets.ModelViewSet):
    serializer_class = SupplierQualityControlSerializer

    def get_queryset(self):
        qs = SupplierQualityControl.objects.select_related('supplier').all()
        supplier = self.request.query_params.get('supplier')
        return qs.filter(supplier_id=supplier) if supplier else qs


class SupplierPerformanceProfileViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = SupplierPerformanceProfile.objects.select_related('supplier').all()
    serializer_class = SupplierPerformanceProfileSerializer
