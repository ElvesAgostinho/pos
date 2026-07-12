"""
Middleware da auditoria: dá contexto aos signals (quem, de que IP, em que hotel) e
regista o que os signals não veem — consultas, exportações e acessos recusados.
"""
import re

from .audit_trail import set_context, record, MODULE_AREA

# Consultas que interessa registar (quem foi ver os dados sensíveis).
# Não se regista TUDO o que é lido — isso seria ruído inútil e um custo enorme.
WATCH_READS = re.compile(
    r'/api/(fiscal/documents|fiscal/agt|pms/folios|pms/reservations|accounting|finance|'
    r'auth/users|licensing|core/audit)', re.I)
EXPORT_HINTS = ('export', 'saft', 'printout', 'download', 'report')


def _ip(request):
    fwd = request.META.get('HTTP_X_FORWARDED_FOR')
    return (fwd.split(',')[0].strip() if fwd else request.META.get('REMOTE_ADDR'))


def _module_of(path):
    m = re.match(r'/api/([a-z_]+)/', path or '')
    app = m.group(1) if m else 'core'
    return MODULE_AREA.get(app, (app.title(), None))


class AuditMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    @staticmethod
    def _user(request):
        """Quem está a fazer isto. O JWT só é descodificado pelo DRF dentro da view —
        aqui resolvemo-lo já, senão a auditoria fica toda sem autor."""
        u = getattr(request, 'user', None)
        if u is not None and getattr(u, 'is_authenticated', False):
            return u.username
        try:
            from rest_framework_simplejwt.authentication import JWTAuthentication
            res = JWTAuthentication().authenticate(request)
            if res:
                return res[0].username
        except Exception:
            pass
        return None

    def __call__(self, request):
        username = self._user(request)
        hotel = request.headers.get('X-Hotel-Id')
        set_context(user=username, ip=_ip(request), path=request.path,
                    hotel_id=int(hotel) if (hotel or '').isdigit() else None)

        response = self.get_response(request)
        path = request.path or ''

        try:
            if username and path.startswith('/api/'):
                mod, area = _module_of(path)
                # EXPORTAÇÕES — é por aqui que os dados saem do hotel.
                if any(h in path.lower() for h in EXPORT_HINTS) and response.status_code < 400:
                    record('EXPORT', module=mod, area=area, entity='Exportação',
                           label=f'{request.method} {path}')
                # CONSULTAS a dados sensíveis (contas, faturas, salários, auditoria).
                elif request.method == 'GET' and WATCH_READS.search(path) and response.status_code < 400:
                    record('VIEW', module=mod, area=area, entity='Consulta', label=path)
                # ACESSOS RECUSADOS — tentativas de ver o que não se pode.
                elif response.status_code in (401, 403):
                    record('DENIED', module=mod, area=area, entity='Acesso',
                           label=f'{request.method} {path}',
                           reason=f'HTTP {response.status_code}')
        except Exception:
            pass
        finally:
            set_context()
        return response
