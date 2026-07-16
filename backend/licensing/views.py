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


class LicenseSyncView(APIView):
    """SINCRONIZAR COM O PCC — o botão do Gestor de licenças.

    O cliente apresenta a licença que TEM ao PCC (HTTPS); o PCC devolve a mais
    recente desse cliente. ANTES de gravar, valida-se localmente a assinatura e
    que o client_code é o mesmo — o PCC podia estar comprometido, o ficheiro no
    disco não fica à mercê dele. A antiga fica em license.key.bak.

    Sem internet, nada muda: o sistema continua com a licença que tem (offline
    é o desenho, não a falha).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        import os, json, base64, shutil
        import requests as http
        from django.conf import settings
        from licensing.engine.crypto import verify_license

        pcc = os.environ.get('PCC_URL', getattr(settings, 'PCC_URL', 'http://127.0.0.1:8000'))
        caminho = os.path.join(settings.BASE_DIR, 'license.key')
        atual_raw = open(caminho).read().strip() if os.path.exists(caminho) else ''
        if not atual_raw:
            return Response({'detail': 'Não há licença instalada — a primeira instala-se '
                                       'com o ficheiro do PCC, não por sincronização.'}, status=400)
        try:
            r = http.post(f'{pcc.rstrip("/")}/api/clm/licenses/latest/',
                          json={'license_key': atual_raw}, timeout=20)
        except Exception as e:
            return Response({'detail': f'Sem ligação ao PCC ({pcc}): {e}'}, status=502)
        if r.status_code != 200:
            try:
                return Response(r.json(), status=r.status_code)
            except Exception:
                return Response({'detail': f'PCC respondeu {r.status_code}.'}, status=502)

        nova_raw = (r.json().get('license_key') or '').strip()
        try:
            nova = json.loads(base64.b64decode(nova_raw).decode('utf-8'))
            sig = nova.pop('signature', None)
            if not (sig and verify_license(nova, sig)):
                return Response({'detail': 'O PCC devolveu uma licença com assinatura '
                                           'inválida — nada foi alterado.'}, status=502)
            antiga = json.loads(base64.b64decode(atual_raw).decode('utf-8'))
            if nova.get('client_code') != antiga.get('client_code'):
                return Response({'detail': 'A licença devolvida é de OUTRO cliente — '
                                           'nada foi alterado.'}, status=502)
        except Exception:
            return Response({'detail': 'Licença devolvida ilegível — nada foi alterado.'}, status=502)

        mudou_modulos = set(nova.get('modules') or []) != set(antiga.get('modules') or [])
        shutil.copyfile(caminho, caminho + '.bak')
        with open(caminho, 'w') as f:
            f.write(nova_raw)

        return Response({
            'detail': 'Licença sincronizada com o PCC.',
            'license_number': nova.get('license_number'),
            'valid_until': nova.get('valid_until'),
            'limits': nova.get('limits'),
            'modules': len(nova.get('modules') or []),
            # módulos novos só entram quando o serviço reinicia (INSTALLED_APPS)
            'restart_needed': mudou_modulos,
        })


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
