"""
Centros de configuração transversal — Integração (20), Notificações (06),
Documentos (18) e Sistema (21). CRUD dos registos + endpoints de sistema
(estado de updates, cache, logs). Os conectores reais ligam-se com credenciais.
"""
import sys
import platform as _platform
from datetime import datetime

import django
from django.conf import settings
from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import (
    IntegrationConnector, NotificationChannel, NotificationRule,
    DocumentTemplate, ScheduledTask, WorkflowFlow, WorkflowTask, GlobalConfig,
)


class IntegrationConnectorSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = IntegrationConnector
        fields = '__all__'


class IntegrationConnectorViewSet(viewsets.ModelViewSet):
    serializer_class = IntegrationConnectorSerializer

    def get_queryset(self):
        qs = IntegrationConnector.objects.all()
        kind = self.request.query_params.get('kind')
        return qs.filter(kind=kind) if kind else qs


class NotificationChannelSerializer(serializers.ModelSerializer):
    channel_display = serializers.CharField(source='get_channel_display', read_only=True)

    class Meta:
        model = NotificationChannel
        fields = '__all__'


class NotificationChannelViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationChannelSerializer

    def get_queryset(self):
        qs = NotificationChannel.objects.all()
        ch = self.request.query_params.get('channel')
        return qs.filter(channel=ch) if ch else qs


class NotificationRuleSerializer(serializers.ModelSerializer):
    channel_name = serializers.CharField(source='channel.name', read_only=True, default=None)

    class Meta:
        model = NotificationRule
        fields = '__all__'


class NotificationRuleViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationRuleSerializer
    queryset = NotificationRule.objects.select_related('channel').all()


class DocumentTemplateSerializer(serializers.ModelSerializer):
    page_format_display = serializers.CharField(source='get_page_format_display', read_only=True)

    class Meta:
        model = DocumentTemplate
        fields = '__all__'


class DocumentTemplateViewSet(viewsets.ModelViewSet):
    serializer_class = DocumentTemplateSerializer

    def get_queryset(self):
        qs = DocumentTemplate.objects.all()
        signature = self.request.query_params.get('signature')
        if signature == '1':
            qs = qs.filter(signature_enabled=True)
        return qs


class ScheduledTaskSerializer(serializers.ModelSerializer):
    frequency_display = serializers.CharField(source='get_frequency_display', read_only=True)

    class Meta:
        model = ScheduledTask
        fields = '__all__'


class ScheduledTaskViewSet(viewsets.ModelViewSet):
    serializer_class = ScheduledTaskSerializer
    queryset = ScheduledTask.objects.all()


# ------------------------- Sistema (21) -------------------------
class SystemInfoView(APIView):
    """GET /api/platform/system/ — versão, updates, cache e saúde (Update/Cache centers)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            'app': 'System Mwana Lodge', 'version': '1.0.0',
            'python': sys.version.split()[0], 'django': django.get_version(),
            'platform': _platform.platform(), 'debug': settings.DEBUG,
            'database': settings.DATABASES['default']['ENGINE'].split('.')[-1],
            'update': {'current': '1.0.0', 'latest': '1.0.0', 'up_to_date': True,
                       'channel': 'stable', 'checked_at': timezone.now().isoformat()},
            'cache': {'backend': settings.CACHES['default']['BACKEND'].split('.')[-1] if getattr(settings, 'CACHES', None) else 'locmem',
                      'clearable': True},
        })

    def post(self, request):
        # Ações de sistema: limpar cache
        if request.data.get('action') == 'clear_cache':
            try:
                from django.core.cache import cache
                cache.clear()
                return Response({'detail': 'Cache limpa com sucesso.'})
            except Exception as e:  # noqa
                return Response({'detail': f'Falha: {str(e)[:120]}'}, status=500)
        return Response({'detail': 'Ação inválida.'}, status=400)


class SystemLogsView(APIView):
    """GET /api/platform/logs/ — eventos recentes do sistema (auditoria consolidada)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        events = []
        try:
            from pos.models import POSAuditLog
            for e in POSAuditLog.objects.order_by('-created_at')[:50]:
                events.append({'at': e.created_at.isoformat(), 'source': 'POS',
                               'event': e.event_type, 'desc': e.description,
                               'user': e.operator_name or e.user})
        except Exception:
            pass
        return Response({'events': events, 'count': len(events)})


# ------------------------- Workflow (19) -------------------------
class WorkflowFlowSerializer(serializers.ModelSerializer):
    task_count = serializers.IntegerField(source='tasks.count', read_only=True)

    class Meta:
        model = WorkflowFlow
        fields = '__all__'


class WorkflowFlowViewSet(viewsets.ModelViewSet):
    serializer_class = WorkflowFlowSerializer
    queryset = WorkflowFlow.objects.prefetch_related('tasks').all()


class WorkflowTaskSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    flow_name = serializers.CharField(source='flow.name', read_only=True, default=None)

    class Meta:
        model = WorkflowTask
        fields = '__all__'


class WorkflowTaskViewSet(viewsets.ModelViewSet):
    serializer_class = WorkflowTaskSerializer

    def get_queryset(self):
        qs = WorkflowTask.objects.select_related('flow').all()
        st = self.request.query_params.get('status')
        return qs.filter(status=st) if st else qs


class WorkflowDashboardView(APIView):
    """GET /api/platform/workflow/dashboard/ — visão geral dos fluxos e tarefas."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.db.models import Count
        tasks = WorkflowTask.objects.all()
        by_status = {r['status']: r['n'] for r in tasks.values('status').annotate(n=Count('id'))}
        return Response({
            'flows': WorkflowFlow.objects.filter(is_active=True).count(),
            'tasks_total': tasks.count(),
            'tasks_pending': by_status.get('PENDING', 0),
            'tasks_in_progress': by_status.get('IN_PROGRESS', 0),
            'tasks_done': by_status.get('DONE', 0),
            'tasks_urgent': tasks.filter(priority='URGENT').exclude(status__in=['DONE', 'CANCELLED']).count(),
            'by_status': by_status,
        })


# ------------------------- Segurança (03) -------------------------
class SecurityPolicyView(APIView):
    """GET/POST /api/platform/security-policy/ — política de PIN e MFA (GlobalConfig)."""
    permission_classes = [IsAuthenticated]
    KEY = 'security_policy'
    DEFAULT = {'pin_min_length': 4, 'pin_expiry_days': 0, 'pin_lockout_attempts': 5,
               'mfa_enabled': False, 'mfa_method': 'TOTP', 'session_timeout_mins': 30}

    def get(self, request):
        cfg = GlobalConfig.objects.filter(key=self.KEY).first()
        return Response(cfg.value if cfg else self.DEFAULT)

    def post(self, request):
        cfg, _ = GlobalConfig.objects.get_or_create(key=self.KEY, defaults={'value': self.DEFAULT})
        value = {**(cfg.value or self.DEFAULT), **request.data}
        cfg.value = value
        cfg.save()
        return Response(value)


class SecurityDashboardView(APIView):
    """GET /api/platform/security/dashboard/ — visão geral de segurança."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.contrib.auth.models import User
        now = timezone.now()
        data = {
            'users_total': User.objects.count(),
            'users_active': User.objects.filter(is_active=True).count(),
            'staff': User.objects.filter(is_staff=True).count(),
            'superusers': User.objects.filter(is_superuser=True).count(),
        }
        try:
            from django.contrib.sessions.models import Session
            data['active_sessions'] = Session.objects.filter(expire_date__gte=now).count()
        except Exception:
            data['active_sessions'] = None
        try:
            from identity.models import PosOperator
            data['pos_operators'] = PosOperator.objects.count()
        except Exception:
            data['pos_operators'] = None
        return Response(data)
