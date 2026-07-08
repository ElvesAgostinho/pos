from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny # Update to IsAuthenticated for prod

from .models import Client, License, Installation, AuditLogCLM, TerminalLicense
from .serializers import (
    ClientSerializer, LicenseSerializer, InstallationSerializer, 
    AuditLogCLMSerializer, ProvisioningRequestSerializer, TerminalLicenseSerializer
)
from .engine.provisioning import ProvisioningWorkflow

class ClientViewSet(viewsets.ModelViewSet):
    queryset = Client.objects.all().order_by('-created_at')
    serializer_class = ClientSerializer
    permission_classes = [AllowAny] # In PCC, this will be protected by internal auth
    
    @action(detail=False, methods=['post'])
    def provision(self, request):
        """
        Wizard Endpoint: Creates a client, commercial data, and generates the license key.
        """
        serializer = ProvisioningRequestSerializer(data=request.data)
        if serializer.is_valid():
            workflow = ProvisioningWorkflow(admin_user=request.user.username if request.user.is_authenticated else 'system_admin')
            try:
                result = workflow.execute(
                    client_data=serializer.validated_data['client_data'],
                    commercial_data=serializer.validated_data['commercial_data'],
                    modules=serializer.validated_data['modules'],
                    feature_flags=serializer.validated_data.get('feature_flags', {})
                )
                return Response(result, status=status.HTTP_201_CREATED)
            except Exception as e:
                return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        """
        Returns stats for the PCC Dashboard
        """
        total_clients = Client.objects.count()
        active_clients = Client.objects.filter(status='ACTIVE').count()
        trial_clients = Client.objects.filter(status='TRIAL').count()
        total_licenses = License.objects.count()
        
        return Response({
            "total_clients": total_clients,
            "active_clients": active_clients,
            "trial_clients": trial_clients,
            "total_licenses": total_licenses
        })

class LicenseViewSet(viewsets.ModelViewSet):
    queryset = License.objects.all().order_by('-created_at')
    serializer_class = LicenseSerializer
    permission_classes = [AllowAny]

class InstallationViewSet(viewsets.ModelViewSet):
    queryset = Installation.objects.all()
    serializer_class = InstallationSerializer
    permission_classes = [AllowAny]

class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLogCLM.objects.all().order_by('-timestamp')
    serializer_class = AuditLogCLMSerializer
    permission_classes = [AllowAny]

class TerminalLicenseViewSet(viewsets.ModelViewSet):
    queryset = TerminalLicense.objects.all().order_by('-created_at')
    serializer_class = TerminalLicenseSerializer
    permission_classes = [AllowAny]
    
    @action(detail=False, methods=['post'])
    def activate(self, request):
        """
        Activates a terminal. Receives terminal_id, activation_key, and fingerprint.
        """
        terminal_id = request.data.get('terminal_id')
        activation_key = request.data.get('activation_key')
        fingerprint = request.data.get('fingerprint')
        
        if not all([terminal_id, activation_key, fingerprint]):
            return Response({"error": "Missing required fields"}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            terminal = TerminalLicense.objects.get(terminal_id=terminal_id, activation_key=activation_key)
            
            if terminal.status == 'ACTIVATED':
                if terminal.hardware_fingerprint != fingerprint:
                    return Response({"error": "License already bound to another hardware"}, status=status.HTTP_403_FORBIDDEN)
                # If it's the same fingerprint, it's just re-downloading the token
            elif terminal.status in ['CREATED', 'LICENSED']:
                # First time activation
                terminal.status = 'ACTIVATED'
                terminal.hardware_fingerprint = fingerprint
                import django.utils.timezone as timezone
                terminal.activated_at = timezone.now()
                terminal.save()
            else:
                return Response({"error": f"Terminal is {terminal.status}"}, status=status.HTTP_403_FORBIDDEN)
                
            # Simulate JWT generation (for local testing without JWT library)
            import json, base64
            payload = {
                "terminal_id": terminal.terminal_id,
                "client_id": terminal.client.id,
                "asset_type": terminal.asset_type,
                "fingerprint": terminal.hardware_fingerprint
            }
            token = base64.b64encode(json.dumps(payload).encode()).decode()
            
            return Response({
                "message": "Activated successfully",
                "token": token,
                "terminal": TerminalLicenseSerializer(terminal).data
            })
            
        except TerminalLicense.DoesNotExist:
            return Response({"error": "Invalid Terminal ID or Activation Key"}, status=status.HTTP_404_NOT_FOUND)
