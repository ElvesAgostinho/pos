from django.conf import settings
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from core.modules import optional_app_labels, all_modules, FEATURES, resolve_active_features


def _real_license():
    """
    Licença REAL da instalação — fonte de verdade: o PCC (clm.License), gerido no admin do
    Django. Fallback: license.key assinada (artefacto offline exportado pelo PCC para on-premises).
    """
    # 1) PCC — clm.License (registo no admin/BD do cliente)
    try:
        from clm.models import License
        from django.utils import timezone
        lic = License.objects.select_related('client').order_by('-created_at').first()
        if lic:
            valid = (lic.valid_until is None) or (lic.valid_until >= timezone.localdate())
            # feature_flags é um dict {key: bool}. Se tiver conteúdo, restringe (allowed = keys True).
            ff = lic.feature_flags or {}
            features = [k for k, v in ff.items() if v] if ff else None
            return {
                'licensed': bool(valid),
                'client': getattr(lic.client, 'commercial_name', None),
                'license_number': lic.license_number,
                'valid_until': str(lic.valid_until) if lic.valid_until else None,
                'modules': lic.modules or [],
                'features': features,   # None = licença não restringe funcionalidades
                'limits': {'hotels': lic.max_hotels, 'pos': lic.max_pos, 'users': lic.max_users, 'rooms': lic.max_rooms},
                'source': 'clm',
            }
    except Exception:
        pass
    # 2) Fallback offline — license.key assinada
    try:
        from .offline_validator import get_license
        f = get_license(settings.BASE_DIR)
        if f:
            return {
                'licensed': True, 'client': f.get('client_code'), 'license_number': f.get('license_number'),
                'valid_until': f.get('valid_until'), 'modules': f.get('modules', []),
                'limits': f.get('limits', {}), 'source': 'license.key',
            }
    except Exception:
        pass
    return {'licensed': False, 'modules': [], 'source': None}


class LicenseStatusView(APIView):
    """Estado da licença real (on-premises). Sem licença válida = sem acesso à plataforma."""
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(_real_license())


class LicenseLimitsView(APIView):
    """Consumo vs licenciado: propriedades, terminais e utilizadores.

    O sistema vende-se POR PROPRIEDADE — este ecrã mostra ao cliente quantas tem e
    quantas pode ter. Criar acima do limite é recusado pelo servidor.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .limits import status
        return Response(status())


def _active_modules():
    installed = set(settings.INSTALLED_APPS)
    active = [c for c in optional_app_labels() if c in installed]
    # 'fiscal' é núcleo (sempre instalado) mas as suas features contam como módulo ativo.
    if 'fiscal' in installed:
        active.append('fiscal')
    return active


class ActiveModulesView(APIView):
    """Módulos opcionais efetivamente carregados. O frontend mostra apenas estes."""
    permission_classes = [AllowAny]

    def get(self, request):
        info = _real_license()
        return Response({
            'active': _active_modules(),
            'licensed': info['licensed'],
            'license_modules': info.get('modules', []),
            'core': ['core', 'mdm', 'identity', 'eae', 'licensing'],
            'catalog': all_modules(),
        })


class FeaturesView(APIView):
    """Funcionalidades (feature flags) — licenciamento dentro do módulo.
    GET: catálogo (dos módulos ativos) + lista de ativas. POST {key, enabled}: override do admin."""
    permission_classes = [AllowAny]

    def _overrides(self):
        try:
            from .models import FeatureFlag
            return {f.key: f.enabled for f in FeatureFlag.objects.all()}
        except Exception:
            return {}

    def get(self, request):
        info = _real_license()
        active_modules = _active_modules()
        lic_features = info.get('features')  # None se a licença não restringir
        overrides = self._overrides()
        active = resolve_active_features(active_modules, lic_features, overrides)
        catalog = [f for f in FEATURES if f['module'] in active_modules or f['module'] == 'ops']
        for f in catalog:
            f = f  # noqa
        return Response({
            'catalog': [{**f, 'active': f['key'] in active} for f in catalog],
            'active': active,
        })

    def post(self, request):
        from .models import FeatureFlag
        key = request.data.get('key')
        enabled = bool(request.data.get('enabled'))
        if not key:
            return Response({'detail': 'key obrigatório.'}, status=400)
        FeatureFlag.objects.update_or_create(key=key, defaults={'enabled': enabled})
        return self.get(request)
