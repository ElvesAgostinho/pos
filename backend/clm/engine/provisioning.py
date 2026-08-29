from datetime import timedelta
from django.utils import timezone
from clm.models import Client, CommercialData, License, AuditLogCLM
# from identity.models import Company, Hotel
import uuid
import json
import base64
from django.conf import settings

from licensing.engine.crypto import sign_license

class ProvisioningWorkflow:
    def __init__(self, admin_user):
        self.admin_user = admin_user

    def execute(self, client_data, commercial_data, modules, feature_flags, limits=None):
        """
        Executes the full provisioning workflow for a new client.
        1. Creates Client and CommercialData.
        2. Generates License Key (offline-capable).
        3. Returns the package to be installed locally.
        """
        limits = limits or {}
        
        # 1. Create Client
        client = Client.objects.create(
            code=client_data.get('code', str(uuid.uuid4())[:8].upper()),
            client_type=client_data.get('client_type', 'COMPANY'),
            commercial_name=client_data.get('commercial_name'),
            nif=client_data.get('nif'),
            status='ACTIVE'
        )
        
        # 2. Create Commercial Data
        CommercialData.objects.create(
            client=client,
            plan=commercial_data.get('plan', 'STANDARD'),
            activation_date=timezone.now().date(),
            expiration_date=(timezone.now() + timedelta(days=365)).date() # 1 year default
        )
        
        # 3. Create License
        license_number = f"LIC-{client.code}-{str(uuid.uuid4())[:8].upper()}"
        license_obj = License.objects.create(
            client=client,
            license_number=license_number,
            plan=commercial_data.get('plan', 'STANDARD'),
            modules=modules,
            feature_flags=feature_flags,
            valid_until=(timezone.now() + timedelta(days=365)).date(),
            is_offline=True,
            max_hotels=limits.get('hotels', 1),
            max_pos=limits.get('pos', 1),
            max_users=limits.get('users', 5),
        )
        
        # 4. Generate Cryptographic Signature for Offline Validation
        license_obj.signature = self._generate_signature(license_obj)

        # 5. ACESSOS — a senha de instalação (gate do setup.exe) e a senha do dono
        # (primeiro login no sistema instalado) nascem AQUI, uma vez, e só voltam em
        # claro NESTA resposta. Depois disso ficam cifradas na base do PCC — quem
        # precisar de as reler outra vez tem de as gerar de novo (regenerate-access).
        from clm.secrets import encrypt, gerar_senha
        install_password = gerar_senha()
        owner_password = gerar_senha()
        license_obj.install_password_enc = encrypt(install_password)
        license_obj.install_password_set_at = timezone.now()
        license_obj.owner_username = 'dono'
        license_obj.owner_password_enc = encrypt(owner_password)
        license_obj.owner_password_set_at = timezone.now()
        license_obj.save()

        # 6. Log Audit
        AuditLogCLM.objects.create(
            action="CREATE_CLIENT_PROVISIONING",
            details={"client_id": client.id, "license": license_number},
            user_identity=self.admin_user
        )

        return {
            "status": "success",
            "client_code": client.code,
            "license_key": self._generate_license_key_string(license_obj),
            "install_password": install_password,
            "owner_username": license_obj.owner_username,
            "owner_password": owner_password,
        }

    def _license_payload(self, license_obj):
        """Payload canónico da licença (sem assinatura). Fonte única para assinar e para exportar."""
        return {
            "license_number": license_obj.license_number,
            "client_code": license_obj.client.code,
            "modules": license_obj.modules,
            "feature_flags": license_obj.feature_flags,
            "valid_until": license_obj.valid_until.isoformat() if license_obj.valid_until else None,
            "limits": {
                "hotels": license_obj.max_hotels,
                "pos": license_obj.max_pos,
                "users": license_obj.max_users,
            },
        }

    def _generate_signature(self, license_obj):
        """Assina o payload da licença com a CHAVE PRIVADA RSA (só disponível no PCC)."""
        return sign_license(self._license_payload(license_obj))

    def _generate_license_key_string(self, license_obj):
        """
        Gera a string base64 (license.key) com o payload + assinatura RSA.
        É isto que o cliente cola no ERP local para ativar offline; a validade é
        garantida pela chave pública, sem contacto com o servidor.

        A assinatura é SEMPRE recalculada na hora a partir dos campos atuais —
        nunca lida de `license_obj.signature` (esse fica gravado só como registo
        de quando a licença foi criada). Se ficasse a ler o campo gravado, editar
        módulos/limites/validade de uma licença já existente no admin do Django
        (caminho já documentado e usado) deixava a assinatura DESSINCRONIZADA do
        payload — toda sincronização/ativação seguinte falhava com "assinatura
        inválida", sem nada visível a dizer porquê. Recalcular elimina essa classe
        de bug inteira: a assinatura devolvida bate sempre com o que a licença é
        NESTE momento.
        """
        data = self._license_payload(license_obj)
        data["signature"] = self._generate_signature(license_obj)
        return base64.b64encode(json.dumps(data).encode('utf-8')).decode('utf-8')
