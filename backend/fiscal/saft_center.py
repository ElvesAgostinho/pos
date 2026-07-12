"""
CENTRO SAF-T — exportações fiscais multi-perfil, histórico e validação.
O PMS/Restauração/POS não sabem nada de SAF-T: só emitem documentos. Toda a lógica
fiscal vive aqui (Motor Fiscal), o que permite acrescentar perfis/países sem tocar no ERP.
"""
import hashlib
from datetime import datetime

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import FiscalConfig, FiscalAuditLog, SaftExport
from . import saft_profiles


class SaftExportSerializer(serializers.ModelSerializer):
    profile_label = serializers.SerializerMethodField()

    class Meta:
        model = SaftExport
        fields = '__all__'

    def get_profile_label(self, obj):
        p = saft_profiles.PROFILES.get(obj.profile)
        return p['label'] if p else obj.profile


class SaftHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    """GET /api/fiscal/saft/history/ — histórico de exportações (auditoria)."""
    serializer_class = SaftExportSerializer
    queryset = SaftExport.objects.all()[:300]


class SaftProfilesView(APIView):
    """GET /api/fiscal/saft/profiles/ — perfis disponíveis + estado fiscal."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cfg = FiscalConfig.get()
        certified = bool(cfg.certificate_number and cfg.certificate_number not in ('0000', ''))
        return Response({
            'profiles': [
                {'key': k, 'label': v['label'], 'description': v['desc'], 'required': v['required']}
                for k, v in saft_profiles.PROFILES.items()
            ],
            'fiscal': {
                'company_name': cfg.company_name, 'company_nif': cfg.company_nif,
                'certificate_number': cfg.certificate_number, 'certified': certified,
                'environment': cfg.environment, 'saft_version': cfg.saft_version,
            },
            'last_exports': SaftExportSerializer(SaftExport.objects.all()[:5], many=True).data,
        })


def _period(request):
    try:
        start = datetime.strptime(request.GET.get('start'), '%Y-%m-%d').date()
        end = datetime.strptime(request.GET.get('end'), '%Y-%m-%d').date()
    except (TypeError, ValueError):
        today = timezone.localdate()
        start, end = today.replace(day=1), today
    return start, end


class SaftProfileExportView(APIView):
    """
    GET /api/fiscal/saft/export/<profile>/?start=&end= — gera, VALIDA e descarrega o XML,
    registando no histórico (com impressão digital SHA-256).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, profile):
        start, end = _period(request)
        try:
            xml = saft_profiles.generate(profile, start, end)
        except ValueError as e:
            return Response({'detail': str(e)}, status=400)
        except Exception as e:  # noqa
            return Response({'detail': f'Falha a gerar o SAF-T: {str(e)[:200]}'}, status=500)

        check = saft_profiles.validate_xml(xml)
        data = xml.encode('utf-8')
        digest = hashlib.sha256(data).hexdigest()
        fname = f"SAFT_{profile.upper()}_{start:%Y%m%d}_{end:%Y%m%d}.xml"

        SaftExport.objects.create(
            profile=profile, start_date=start, end_date=end, filename=fname,
            size_bytes=len(data), sha256=digest, is_valid=check['valid'],
            problems='\n'.join(check['problems']) or None,
            created_by=str(getattr(request.user, 'username', '') or ''))
        FiscalAuditLog.objects.create(event='SAFT_EXPORT', document_ref=fname,
                                      user=str(getattr(request.user, 'username', '') or ''),
                                      detail=f'{profile} {start}..{end} sha256={digest[:16]}')

        resp = HttpResponse(data, content_type='application/xml')
        resp['Content-Disposition'] = f'attachment; filename="{fname}"'
        resp['X-SAFT-Valid'] = str(check['valid'])
        resp['X-SAFT-SHA256'] = digest
        return resp


class SaftValidateView(APIView):
    """
    GET  /api/fiscal/saft/validate/<profile>/?start=&end= — valida SEM descarregar.
    POST /api/fiscal/saft/validate/  {xml} — valida um XML colado/enviado.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, profile):
        start, end = _period(request)
        try:
            xml = saft_profiles.generate(profile, start, end)
        except ValueError as e:
            return Response({'detail': str(e)}, status=400)
        check = saft_profiles.validate_xml(xml)
        return Response({**check, 'profile': profile, 'size_bytes': len(xml.encode('utf-8')),
                         'preview': xml[:1200]})

    def post(self, request):
        xml = request.data.get('xml') or ''
        if not xml.strip():
            return Response({'detail': 'Cole o conteúdo do XML a validar.'}, status=400)
        return Response(saft_profiles.validate_xml(xml))
