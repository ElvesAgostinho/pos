from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAdminUser, AllowAny  # Consola do fornecedor: apenas staff

from core.modules import sellable_modules, FEATURES


class ModuleCatalogView(APIView):
    """
    Catálogo de módulos VENDÁVEIS, consumido pela consola PCC (Wizard de
    licenças) para provisionar clientes NOVOS. Fonte única definida em
    core/modules.py — um módulo ainda em desenvolvimento (sellable=False,
    ex.: PMS) não aparece aqui, mas continua a funcionar normalmente para
    quem já o tem ativo (isto só limita o que se oferece a partir de agora).
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response(sellable_modules())


class FeatureCatalogView(APIView):
    """Catálogo de FUNCIONALIDADES (feature flags) para o PCC selecionar por licença."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response(FEATURES)

from .models import Client, License, Installation, AuditLogCLM, TerminalLicense, SystemRelease, ErrorReport
from .serializers import (
    ClientSerializer, LicenseSerializer, InstallationSerializer,
    AuditLogCLMSerializer, ProvisioningRequestSerializer, TerminalLicenseSerializer,
    SystemReleaseSerializer, ErrorReportSerializer
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

def _build_license_response(lic, request, hostname):
    """Monta a resposta de licença+AGT+empresa+versão que TANTO a sincronização
    (`latest`, prova de posse) como a ativação remota (`activate`, senha de
    instalação) devolvem — o cliente aplica-a exatamente da mesma forma nos
    dois casos, por isso a resposta tem de ter a mesma forma nos dois casos.
    """
    from clm.engine.provisioning import ProvisioningWorkflow
    from django.utils import timezone
    wf = ProvisioningWorkflow(admin_user='remote-sync')

    # "ESTE CLIENTE ESTÁ ONLINE": last_ping existia no modelo mas nada o escrevia.
    # É AQUI que se sabe, a cada sincronização/ativação, que a instalação está
    # viva; get_or_create para não obrigar a criar a Instalação à mão antes.
    installation, _ = Installation.objects.get_or_create(
        client=lic.client, name=hostname or 'Servidor Produção',
        defaults={'install_type': 'PRODUCTION'})
    installation.last_ping = timezone.now()
    ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR')
    if ip:
        installation.server_ip = ip
    # VERSÃO REAL — o campo já existia no modelo mas nada o escrevia (mesmo
    # esquecimento do last_ping antes de o resolvermos): sem isto o PCC nunca
    # sabia que build cada cliente tinha instalada, mesmo com "Versões
    # publicadas" já a existir. Agora importa mais: tanto a sincronização como
    # a ativação remota mandam a versão que estão a correr neste momento.
    app_version = (request.data.get('app_version') or '').strip()[:50]
    if app_version:
        installation.version = app_version
    installation.save(update_fields=['last_ping', 'server_ip', 'version'])

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
    # VERSÃO MAIS RECENTE — a mesma resposta também diz "há uma versão nova aqui"
    # (SystemRelease, publicada pelo fornecedor). O cliente é que decide se
    # descarrega e quando corre o instalador — isto é só o aviso.
    rel = SystemRelease.objects.order_by('-created_at').first()
    if rel:
        resp['release'] = {'version': rel.version, 'download_url': rel.download_url,
                           'notes': rel.release_notes}
    # DADOS DA EMPRESA — os mesmos que o técnico já escreveu aqui ao criar o
    # cliente (Novo Provisionamento). O cliente instalado usa isto para
    # preencher sozinho a ficha "Configuração POS → Empresa", em vez de o dono
    # ter de escrever tudo outra vez. Não inclui logo_url de propósito: essa
    # continua a ser sempre upload local (nunca uma imagem por URL).
    c = lic.client
    resp['company'] = {
        'name': c.commercial_name, 'name2': c.legal_name, 'nif': c.nif,
        'address': c.address, 'city': c.city, 'province': c.province,
        'country': c.country, 'postal_code': c.postal_code, 'phone': c.phone,
        'email': c.general_email, 'website': c.website, 'currency': c.currency,
        'timezone': c.timezone,
    }
    return resp


class LicenseViewSet(viewsets.ModelViewSet):
    queryset = License.objects.all().order_by('-created_at')
    serializer_class = LicenseSerializer
    permission_classes = [IsAdminUser]

    @action(detail=True, methods=['get'])
    def key(self, request, pk=None):
        """
        Devolve o license.key desta licença — recalculado na hora (payload + assinatura
        RSA), nunca guardado em claro. Ao contrário das senhas de instalação/dono (essas
        sim, mostradas só uma vez), o license.key não é um segredo de uso único: pode
        pedir-se de novo sempre que precisar, para o entregar outra vez a um técnico.
        """
        from clm.engine.provisioning import ProvisioningWorkflow
        lic = self.get_object()
        wf = ProvisioningWorkflow(admin_user=str(getattr(request.user, 'username', '') or ''))
        return Response({
            'license_number': lic.license_number,
            'client_code': lic.client.code,
            'license_key': wf._generate_license_key_string(lic),
        })

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

        AuditLogCLM.objects.create(
            action='LICENSE_SYNC_PULL',
            details={'client': code, 'license': lic.license_number,
                     'presented': data.get('license_number')},
            user_identity='remote-sync')
        hostname = (request.data.get('hostname') or '').strip()[:100]
        return Response(_build_license_response(lic, request, hostname))

    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def activate(self, request):
        """ATIVAÇÃO REMOTA — a primeira ativação, sem PowerShell nem copiar
        ficheiros à mão. Diferente de `latest` (que exige já TER uma licença
        para provar posse): aqui não há nenhuma ainda, por isso autentica-se
        pela SENHA DE INSTALAÇÃO — a mesma que já se gera no PCC (Acessos) e se
        entrega ao técnico para o setup.exe; reaproveitada, não é um segredo novo.
        POST {client_code, install_password, hostname}.
        """
        from .secrets import decrypt
        code = (request.data.get('client_code') or '').strip()
        senha = request.data.get('install_password') or ''
        if not (code and senha):
            return Response({'detail': 'Indique o código do cliente e a senha de instalação.'}, status=400)

        lic = License.objects.filter(client__code=code).order_by('-created_at').first()
        if not lic:
            return Response({'detail': f'Cliente "{code}" desconhecido no PCC.'}, status=404)
        if lic.client.status in ('SUSPENDED', 'CANCELED'):
            return Response({'detail': 'A conta deste cliente está suspensa no PCC. '
                                       'Contacte o fornecedor.'}, status=403)
        if not lic.install_password_enc or decrypt(lic.install_password_enc) != senha:
            AuditLogCLM.objects.create(action='REMOTE_ACTIVATION_FAILED',
                details={'client': code}, user_identity='remote-activation')
            return Response({'detail': 'Código de cliente ou senha de instalação incorretos.'}, status=403)

        AuditLogCLM.objects.create(action='REMOTE_ACTIVATION_OK',
            details={'client': code, 'license': lic.license_number}, user_identity='remote-activation')
        hostname = (request.data.get('hostname') or '').strip()[:100]
        return Response(_build_license_response(lic, request, hostname))

    @action(detail=True, methods=['post'], url_path='regenerate-access')
    def regenerate_access(self, request, pk=None):
        """ACESSOS — (re)gera a senha de instalação ou a senha do dono desta licença.

        POST {kind: 'install' | 'owner'}. A senha só volta em claro NESTA resposta —
        depois fica cifrada na base do PCC (clm.secrets) e não há forma de a reler,
        só de a substituir por uma nova. Regenerar invalida a anterior: quem já a
        tinha copiado tem de a copiar outra vez.
        """
        from django.utils import timezone
        from .secrets import encrypt, gerar_senha
        lic = self.get_object()
        kind = request.data.get('kind')
        if kind not in ('install', 'owner'):
            return Response({'detail': 'kind tem de ser "install" ou "owner".'}, status=400)

        nova = gerar_senha()
        if kind == 'install':
            lic.install_password_enc = encrypt(nova)
            lic.install_password_set_at = timezone.now()
            lic.save(update_fields=['install_password_enc', 'install_password_set_at'])
            AuditLogCLM.objects.create(action='REGENERATE_INSTALL_PASSWORD',
                details={'license': lic.license_number}, user_identity=str(request.user))
            return Response({'kind': 'install', 'password': nova})

        username = (request.data.get('owner_username') or lic.owner_username or 'dono').strip()
        lic.owner_username = username
        lic.owner_password_enc = encrypt(nova)
        lic.owner_password_set_at = timezone.now()
        lic.save(update_fields=['owner_username', 'owner_password_enc', 'owner_password_set_at'])
        AuditLogCLM.objects.create(action='REGENERATE_OWNER_PASSWORD',
            details={'license': lic.license_number}, user_identity=str(request.user))
        return Response({'kind': 'owner', 'username': username, 'password': nova})

    @action(detail=True, methods=['post'], url_path='generate-reset-code')
    def generate_reset_code(self, request, pk=None):
        """CÓDIGO DE REPOSIÇÃO — repõe a password do dono numa instalação JÁ A
        CORRER, sem PowerShell nem ida à máquina. Diferente do `regenerate_access`
        acima (esse só é lido por um instalador NOVO, via wizard): este código
        dita-se ao telefone/WhatsApp e usa-se em "Esqueci-me da password" no login
        da instalação já existente — expira sozinho, uso único (verify_reset_code
        apaga-o ao validar).
        """
        from datetime import timedelta
        from django.utils import timezone
        from .secrets import gerar_senha
        lic = self.get_object()
        codigo = gerar_senha(8)
        lic.owner_reset_code = codigo
        lic.owner_reset_expires_at = timezone.now() + timedelta(minutes=30)
        lic.save(update_fields=['owner_reset_code', 'owner_reset_expires_at'])
        AuditLogCLM.objects.create(action='GENERATE_OWNER_RESET_CODE',
            details={'license': lic.license_number}, user_identity=str(request.user))
        return Response({'code': codigo, 'expires_at': lic.owner_reset_expires_at,
                         'username': lic.owner_username or 'dono'})

    @action(detail=False, methods=['post'], url_path='verify-reset-code', permission_classes=[AllowAny])
    def verify_reset_code(self, request):
        """RECEÇÃO: a instalação do cliente confirma aqui o código que o dono
        recebeu por telefone, antes de repor a password LOCALMENTE (a password
        em si nunca sai daqui — o PCC só diz "sim, pode repor", quem escreve a
        nova password é o próprio servidor do cliente). Mesma prova de posse por
        assinatura da licença dos outros endpoints públicos; código de uso único
        (apagado logo que verificado, válido ou não o pedido)."""
        import json
        import base64
        from django.utils import timezone
        from licensing.engine.crypto import verify_license

        raw = (request.data.get('license_key') or '').strip()
        codigo = (request.data.get('code') or '').strip()
        try:
            data = json.loads(base64.b64decode(raw).decode('utf-8'))
            sig = data.pop('signature', None)
            if not (sig and verify_license(data, sig)):
                return Response({'valid': False, 'detail': 'Licença inválida.'}, status=403)
        except Exception:
            return Response({'valid': False, 'detail': 'Licença ilegível.'}, status=400)

        code_ = data.get('client_code')
        # O código vive na LICENÇA em que foi gerado (generate_reset_code, via
        # self.get_object() — uma licença concreta), não necessariamente a mais
        # recente do cliente: se uma renovação criar uma licença nova entre gerar
        # o código e o usar, "a mais recente" já não é a que tem o código pendente,
        # e um código válido parecia "sem código nenhum". Procura-se a que TEM.
        lic = (License.objects.filter(client__code=code_, owner_reset_code__isnull=False)
               .order_by('-created_at').first())
        if not lic or not lic.owner_reset_code:
            return Response({'valid': False, 'detail': 'Sem código pendente para este cliente.'}, status=404)

        valido = (codigo and codigo == lic.owner_reset_code
                 and lic.owner_reset_expires_at and lic.owner_reset_expires_at >= timezone.now())
        username = lic.owner_username or 'dono'
        # uso único: desaparece ao ser verificado, valha ou não valha — nunca se
        # tenta adivinhar o código à bruta contra o mesmo código repetidamente.
        lic.owner_reset_code = None
        lic.owner_reset_expires_at = None
        lic.save(update_fields=['owner_reset_code', 'owner_reset_expires_at'])
        AuditLogCLM.objects.create(action='OWNER_PASSWORD_RESET_USED' if valido else 'OWNER_PASSWORD_RESET_FAILED',
            details={'license': lic.license_number}, user_identity='remote-reset')
        if not valido:
            return Response({'valid': False, 'detail': 'Código inválido ou expirado.'}, status=403)
        return Response({'valid': True, 'username': username})


class InstallationViewSet(viewsets.ModelViewSet):
    queryset = Installation.objects.all()
    serializer_class = InstallationSerializer
    permission_classes = [IsAdminUser]

class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Trilho de auditoria do PCC — quem fez o quê (provisionar cliente, gerar
    acessos, reposição de password, ativação remota falhada, etc.). Só leitura
    de propósito: um registo de auditoria que se pudesse editar não provava nada.
    """
    queryset = AuditLogCLM.objects.all().order_by('-timestamp')
    serializer_class = AuditLogCLMSerializer
    permission_classes = [IsAdminUser]
    search_fields = ['action', 'user_identity']
    ordering_fields = ['timestamp', 'action']

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


class SystemReleaseViewSet(viewsets.ModelViewSet):
    """VERSÕES — o fornecedor publica aqui cada .exe novo (build_instalador.ps1).

    Só o fornecedor (staff do PCC) publica; os clientes só LEEM a mais recente,
    e só através de licenses/latest/ (autenticado por prova de posse da licença,
    não por esta rota — esta é admin-only).
    """
    queryset = SystemRelease.objects.all()
    serializer_class = SystemReleaseSerializer
    permission_classes = [IsAdminUser]

    def perform_create(self, serializer):
        serializer.save(created_by=getattr(self.request.user, 'username', '') or 'PCC')


class ErrorReportViewSet(viewsets.ModelViewSet):
    """ERROS AUTOMÁTICOS — o fornecedor lê e faz a TRIAGEM aqui (staff, PATCH em
    `resolved`/`resolved_note` — é o que o ecrã do PCC usa). Os clientes nunca
    escrevem por aqui: entregam SEMPRE pela ação `report` (prova de posse da
    licença, mesmo desenho de `LicenseViewSet.latest`), que ignora por completo
    o serializer e os campos read-only abaixo.
    """
    queryset = ErrorReport.objects.select_related('installation', 'installation__client').all()
    serializer_class = ErrorReportSerializer
    permission_classes = [IsAdminUser]

    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def report(self, request):
        """RECEÇÃO: a instalação do cliente manda aqui, sozinha, quando algo rebenta.

        Mesma autenticação por PROVA DE POSSE da sincronização de licença — sem
        segredo novo nenhum para gerir. Aceita licenças expiradas (saber que um
        cliente com licença vencida ainda está a ter erros continua a interessar).
        Nunca deve receber dados de negócio — só o que o cliente (pos.tasks/
        core.error_reporting) já filtrou antes de enviar.
        """
        import json
        import base64
        from licensing.engine.crypto import verify_license

        raw = (request.data.get('license_key') or '').strip()
        try:
            data = json.loads(base64.b64decode(raw).decode('utf-8'))
            sig = data.pop('signature', None)
            if not (sig and verify_license(data, sig)):
                return Response({'detail': 'Licença inválida.'}, status=403)
        except Exception:
            return Response({'detail': 'Licença ilegível.'}, status=400)

        code = data.get('client_code')
        lic = License.objects.filter(client__code=code).order_by('-created_at').first()
        if not lic:
            return Response({'detail': f'Cliente "{code}" desconhecido.'}, status=404)
        # Mesma regra de latest/activate: uma conta SUSPENDED/CANCELED não deve
        # continuar a falar com o PCC indefinidamente com uma licença antiga —
        # isto é sobre a CONTA estar fechada, diferente de licença EXPIRADA
        # (essa continua aceite de propósito, ver docstring acima).
        if lic.client.status in ('SUSPENDED', 'CANCELED'):
            return Response({'detail': 'A conta deste cliente está suspensa no PCC.'}, status=403)

        hostname = (request.data.get('hostname') or '').strip()[:100]
        installation, _ = Installation.objects.get_or_create(
            client=lic.client, name=hostname or 'Servidor Produção',
            defaults={'install_type': 'PRODUCTION'})
        from django.utils import timezone
        installation.last_ping = timezone.now()
        ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR')
        if ip:
            installation.server_ip = ip
        app_version = (request.data.get('app_version') or '').strip()[:50]
        if app_version:
            installation.version = app_version
        installation.save(update_fields=['last_ping', 'server_ip', 'version'])

        ErrorReport.objects.create(
            installation=installation, client_code=code,
            level=(request.data.get('level') or 'ERROR')[:20],
            logger_name=(request.data.get('logger') or '')[:100],
            message=(request.data.get('message') or '')[:2000],
            traceback=(request.data.get('traceback') or '')[:8000],
            path=(request.data.get('path') or '')[:300],
            app_version=(request.data.get('app_version') or '')[:50],
            hostname=hostname,
        )
        return Response({'detail': 'recebido'}, status=201)
