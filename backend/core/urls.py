from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .platform import (
    IntegrationConnectorViewSet, NotificationChannelViewSet, NotificationRuleViewSet,
    DocumentTemplateViewSet, ScheduledTaskViewSet, SystemInfoView, SystemLogsView,
    WorkflowFlowViewSet, WorkflowTaskViewSet, WorkflowDashboardView,
    SecurityPolicyView, SecurityDashboardView,
)

router = DefaultRouter()
router.register(r'connectors', IntegrationConnectorViewSet, basename='cfg-connector')
router.register(r'notification-channels', NotificationChannelViewSet, basename='cfg-notif-channel')
router.register(r'notification-rules', NotificationRuleViewSet, basename='cfg-notif-rule')
router.register(r'document-templates', DocumentTemplateViewSet, basename='cfg-doc-template')
router.register(r'scheduled-tasks', ScheduledTaskViewSet, basename='cfg-task')
router.register(r'workflow-flows', WorkflowFlowViewSet, basename='cfg-wf-flow')
router.register(r'workflow-tasks', WorkflowTaskViewSet, basename='cfg-wf-task')

urlpatterns = [
    path('system/', SystemInfoView.as_view(), name='cfg-system'),
    path('logs/', SystemLogsView.as_view(), name='cfg-logs'),
    path('workflow/dashboard/', WorkflowDashboardView.as_view(), name='cfg-wf-dashboard'),
    path('security-policy/', SecurityPolicyView.as_view(), name='cfg-security-policy'),
    path('security/dashboard/', SecurityDashboardView.as_view(), name='cfg-security-dashboard'),
    path('', include(router.urls)),
]
