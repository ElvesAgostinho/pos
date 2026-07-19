from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAdminUser, AllowAny  # Consola do fornecedor: apenas staff

from core.modules import all_modules, FEATURES


class ModuleCatalogView(APIView):
    """
    Catálogo canónico de módulos, consumido pela consola PCC (Wizard de licenças).
    Fonte única definida em core/modules.py — garante que ativar um módulo aqui
    corresponde exatamente à app que arranca no ERP do cliente.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response(all_modules())


class FeatureCatalogView(APIView):
    """Catálogo de FUNCIONALIDADES (feature flags) para o PCC selecionar por licença."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response(FEATURES)

from .models import Client, License, Installation, AuditLogCLM, TerminalLicense
from .serializers import (
    ClientSerializer, LicenseSerializer, InstallationSerializer, 
    AuditLogCLMSerializer, ProvisioningRequestSerializer, TerminalLicenseSerializer
)
from .engine.provisioning import ProvisioningWorkflow

class ClientViewSet(viewsets.ModelViewSet):
    queryset = Client.objects.all().order_by('-created_at')
    serializer_class = ClientSerializer
    permission_classes = [IsAdminUser]
    
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
                    feature_flags=serializer.validated_data.get('feature_flags', {}),
                    limits=serializer.validated_data.get('limits', {})
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
    permission_classes = [IsAdminUser]

    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def latest(self, request):
        """SINCRONIZAÇÃO: o backoffice do cliente pede a licença MAIS RECENTE.

        Autenticação por PROVA DE POSSE: o cliente apresenta a licença que TEM
        (assinada pelo PCC). Verificamos a assinatura — quem tem uma licença
        legítima pode pedir a renovação dela; quem não tem, não recebe nada.
        Uma licença EXPIRADA continua a autenticar (renovar é exatamente o caso).
        """
        import json, base64
        from licensing.engine.crypto import verify_license
        raw = (request.data.get('license_key') or '').strip()
        try:
            data = json.loads(base64.b64decode(raw).decode('utf-8'))
            sig = data.pop('signature', None)
            if not (sig and verify_license(data, sig)):
                return Response({'detail': 'A licença apresentada não é válida.'}, status=403)
        except Exception:
            return Response({'detail': 'Licença apresentada ilegível.'}, status=400)

        code = data.get('client_code')
        lic = (License.objects.filter(client__code=code)
               .order_by('-created_at').first())
        if not lic:
            return Response({'detail': f'Cliente "{code}" desconhecido no PCC.'}, status=404)
        if lic.client.status in ('SUSPENDED', 'CANCELED'):
            return Response({'detail': 'A conta deste cliente está suspensa no PCC. '
                                       'Contacte o fornecedor.'}, status=403)

        from clm.engine.provisioning import ProvisioningWorkflow
        wf = ProvisioningWorkflow(admin_user='remote-sync')
        AuditLogCLM.objects.create(
            action='LICENSE_SYNC_PULL',
            details={'client': code, 'license': lic.license_number,
                     'presented': data.get('license_number')},
            user_identity='remote-sync')
        resp = {
            'license_number': lic.license_number,
            'valid_until': str(lic.valid_until) if lic.valid_until else None,
            'license_key': wf._generate_license_key_string(lic),
        }
        # CERTIFICAÇÃO AGT AUTOMÁTICA: se o PCC tem as credenciais desta licença
        # (geradas em CLM › AGT), seguem no MESMO canal autenticado — o cliente
        # ativa e as faturas saem logo com o nº de certificação, sem instalador
        # a copiar ficheiros à mão. É tudo do FORNECEDOR: o cliente só recebe.
        # HERANÇA: se a licença mais recente ainda não tiver as credenciais/ligação
        # (ex.: renovação emitida depois de configurar a AGT), valem as da licença
        # anterior DO MESMO CLIENTE — renovar nunca pode desligar a fatura eletrónica.
        lic_cert = lic
        if not (lic_cert.agt_certificate_number and lic_cert.agt_private_key):
            lic_cert = (License.objects.filter(client=lic.client,
                                               agt_certificate_number__isnull=False)
                        .exclude(agt_private_key__isnull=True).exclude(agt_private_key='')
                        .order_by('-created_at').first()) or lic
        if lic_cert.agt_certificate_number and lic_cert.agt_private_key:
            resp['agt'] = {
                'certificate_number': lic_cert.agt_certificate_number,
                'private_key': lic_cert.agt_private_key,
                'public_key': lic_cert.agt_public_key,
            }
        # A LIGAÇÃO AGT (fatura eletrónica): endpoints + credenciais do contribuinte,
        # configurados NO PCC e entregues pelo mesmo canal — o cliente não escreve URLs.
        lic_con = lic if lic.agt_connection else (
            License.objects.filter(client=lic.client)
            .exclude(agt_connection={}).order_by('-created_at').first())
        if lic_con and lic_con.agt_connection:
            resp.setdefault('agt', {})['connection'] = lic_con.agt_connection
        return Response(resp)

class InstallationViewSet(viewsets.ModelViewSet):
    queryset = Installation.objects.all()
    serializer_class = InstallationSerializer
    permission_classes = [IsAdminUser]

class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLogCLM.objects.all().order_by('-timestamp')
    serializer_class = AuditLogCLMSerializer
    permission_classes = [IsAdminUser]

class TerminalLicenseViewSet(viewsets.ModelViewSet):
    queryset = TerminalLicense.objects.all().order_by('-created_at')
    serializer_class = TerminalLicenseSerializer
    permission_classes = [IsAdminUser]
    
    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def activate(self, request):
        """
        Activates a terminal. Receives terminal_id, activation_key, and fingerprint.
        Público: autenticado pela própria activation key (ativação de dispositivo no ERP,
        antes de qualquer login de utilizador).
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
