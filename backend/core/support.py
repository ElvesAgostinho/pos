"""
Support Center — diagnóstico e estado do sistema (para assistência remota via VPN).

Reúne, num único ficheiro/endpoint, tudo o que o técnico precisa quando o cliente liga:
versão, licença, estado da BD, migrações pendentes, módulos ativos, serviços e eventos
recentes. O cliente pode "Criar Diagnóstico" e enviar o JSON ao suporte.
"""
import sys
import platform
from datetime import datetime

import django
from django.conf import settings
from django.db import connection
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated


def _collect():
    now = timezone.now()
    data = {'generated_at': now.isoformat(), 'timezone': settings.TIME_ZONE}

    # ---- Sistema ----
    data['system'] = {
        'app': 'System Mwana Lodge', 'version': '1.0.0',
        'python': sys.version.split()[0], 'django': django.get_version(),
        'platform': platform.platform(), 'debug': settings.DEBUG,
        'run_mode': __import__('os').environ.get('SYSTEM_MODE', 'ERP'),
    }

    # ---- Base de dados ----
    db = {'engine': settings.DATABASES['default']['ENGINE'].split('.')[-1], 'connected': False, 'pending_migrations': None}
    try:
        with connection.cursor() as cur:
            cur.execute('SELECT 1')
            db['connected'] = True
        db['name'] = str(settings.DATABASES['default'].get('NAME'))
        from django.db.migrations.executor import MigrationExecutor
        executor = MigrationExecutor(connection)
        targets = executor.loader.graph.leaf_nodes()
        db['pending_migrations'] = len(executor.migration_plan(targets))
    except Exception as e:  # noqa
        db['error'] = str(e)[:200]
    data['database'] = db

    # ---- Licença ----
    try:
        from licensing.views import _real_license
        lic = _real_license()
        data['license'] = {
            'licensed': lic.get('licensed'), 'client': lic.get('client'),
            'license_number': lic.get('license_number'), 'valid_until': lic.get('valid_until'),
            'source': lic.get('source'), 'modules': len(lic.get('modules') or []),
            'features': len(lic.get('features') or []) if lic.get('features') is not None else 'sem restrição',
        }
    except Exception:
        data['license'] = {'error': 'indisponível'}

    # ---- Módulos ativos ----
    try:
        from core.modules import optional_app_labels
        installed = set(settings.INSTALLED_APPS)
        data['modules'] = {'active_optional': [c for c in optional_app_labels() if c in installed]}
    except Exception:
        data['modules'] = {}

    # ---- Serviços / saúde ----
    services = {'api': 'online', 'database': 'online' if db['connected'] else 'offline'}
    # Contagens rápidas (indicador de dados por módulo)
    counts = {}
    for label, path in [('utilizadores', 'django.contrib.auth.models.User'),
                        ('documentos_fiscais', 'fiscal.models.FiscalDocument'),
                        ('reservas', 'pms.models.Reservation'),
                        ('vendas_pos', 'pos.models.POSTicket'),
                        ('artigos', 'inventory.models.Item')]:
        try:
            mod, cls = path.rsplit('.', 1)
            m = __import__(mod, fromlist=[cls])
            counts[label] = getattr(m, cls).objects.count()
        except Exception:
            pass
    data['services'] = services
    data['data_counts'] = counts

    # ---- Impressoras (spooler POS) ----
    printers = {}
    try:
        from pos.models import PrintJob
        from django.db.models import Count
        printers['jobs'] = {r['status']: r['n'] for r in PrintJob.objects.values('status').annotate(n=Count('id'))}
        printers['stations'] = sorted({p.target for p in PrintJob.objects.exclude(target__isnull=True)[:200] if p.target})
        printers['failed'] = printers['jobs'].get('FAILED', 0)
    except Exception:
        pass
    data['printers'] = printers

    # ---- Terminais (licenças de terminal) ----
    terminals = {}
    try:
        from clm.models import TerminalLicense
        terminals['total'] = TerminalLicense.objects.count()
        terminals['active'] = TerminalLicense.objects.filter(status='ACTIVE').count()
    except Exception:
        pass
    # Caixas POS abertas = terminais em uso agora
    try:
        from pos.models import CashSession
        terminals['open_cash_sessions'] = CashSession.objects.filter(status='OPEN').count()
    except Exception:
        pass
    data['terminals'] = terminals

    # ---- Assistência remota / VPN ----
    try:
        from licensing.models import SupportSetting
        ss = SupportSetting.get()
        ra_on = bool(ss.remote_assist_enabled and ss.remote_assist_until and ss.remote_assist_until >= now)
        data['support'] = {
            'support_url': ss.support_url or None,
            'auto_send_logs': ss.auto_send_logs,
            'last_sent_at': ss.last_sent_at.isoformat() if ss.last_sent_at else None,
            'remote_assist': ra_on,
            'remote_assist_until': ss.remote_assist_until.isoformat() if ss.remote_assist_until else None,
            'remote_assist_code': ss.remote_assist_code if ra_on else None,
            'vpn_link': 'configurado' if ss.support_url else 'não configurado',
        }
    except Exception:
        data['support'] = {}

    # ---- Eventos recentes (auditoria) ----
    events = []
    try:
        from pos.models import POSAuditLog
        for e in POSAuditLog.objects.order_by('-created_at')[:15]:
            events.append({'at': e.created_at.isoformat(), 'event': e.event_type,
                           'desc': e.description, 'user': e.operator_name or e.user})
    except Exception:
        pass
    data['recent_events'] = events

    return data


class SupportDiagnosticsView(APIView):
    """GET /api/support/diagnostics/ (?download=1 para descarregar o ficheiro de diagnóstico)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = _collect()
        if request.query_params.get('download') == '1':
            import json
            resp = HttpResponse(json.dumps(data, indent=2, ensure_ascii=False), content_type='application/json')
            stamp = datetime.now().strftime('%Y%m%d_%H%M')
            resp['Content-Disposition'] = f'attachment; filename="diagnostico_{stamp}.json"'
            return resp
        return Response(data)


class SupportBackupView(APIView):
    """GET /api/support/backup/ — backup portável da BD (dumpdata JSON, agnóstico do motor)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        import io
        from django.core.management import call_command
        buf = io.StringIO()
        # Exclui tabelas de sessão/log volumosas; mantém dados de negócio.
        call_command('dumpdata', '--natural-foreign', '--natural-primary',
                     '-e', 'contenttypes', '-e', 'auth.permission', '-e', 'sessions',
                     '-e', 'admin.logentry', stdout=buf)
        stamp = datetime.now().strftime('%Y%m%d_%H%M')
        resp = HttpResponse(buf.getvalue(), content_type='application/json')
        resp['Content-Disposition'] = f'attachment; filename="backup_{stamp}.json"'
        return resp


class SupportActionsView(APIView):
    """POST /api/support/actions/ — {action: remote_assist|revoke|send_logs|save_config, ...}."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from licensing.models import SupportSetting
        ss = SupportSetting.get()
        return Response({'support_url': ss.support_url, 'auto_send_logs': ss.auto_send_logs,
                         'remote_assist': bool(ss.remote_assist_enabled and ss.remote_assist_until and ss.remote_assist_until >= timezone.now()),
                         'remote_assist_until': ss.remote_assist_until, 'remote_assist_code': ss.remote_assist_code})

    def post(self, request):
        import secrets
        from datetime import timedelta
        from licensing.models import SupportSetting
        ss = SupportSetting.get()
        action = request.data.get('action')

        if action == 'save_config':
            ss.support_url = request.data.get('support_url') or None
            ss.support_token = request.data.get('support_token') or ss.support_token
            ss.auto_send_logs = bool(request.data.get('auto_send_logs'))
            ss.save()
            return Response({'detail': 'Configuração de suporte guardada.'})

        if action == 'remote_assist':
            hours = int(request.data.get('hours') or 2)
            ss.remote_assist_enabled = True
            ss.remote_assist_until = timezone.now() + timedelta(hours=hours)
            ss.remote_assist_code = secrets.token_hex(3).upper()
            ss.save()
            return Response({'detail': f'Assistência remota autorizada por {hours}h.',
                             'code': ss.remote_assist_code, 'until': ss.remote_assist_until})

        if action == 'revoke':
            ss.remote_assist_enabled = False
            ss.remote_assist_until = None
            ss.remote_assist_code = None
            ss.save()
            return Response({'detail': 'Assistência remota revogada.'})

        if action == 'send_logs':
            if not ss.support_url:
                return Response({'detail': 'Servidor de suporte não configurado (support_url).'}, status=400)
            payload = _collect()
            try:
                import requests
                headers = {'Authorization': f'Bearer {ss.support_token}'} if ss.support_token else {}
                r = requests.post(ss.support_url, json=payload, headers=headers, timeout=15)
                ss.last_sent_at = timezone.now()
                ss.save(update_fields=['last_sent_at'])
                return Response({'detail': f'Diagnóstico enviado ao suporte (HTTP {r.status_code}).'})
            except Exception as e:  # noqa
                return Response({'detail': f'Falha ao enviar: {str(e)[:150]}'}, status=502)

        return Response({'detail': 'Ação inválida.'}, status=400)
