from datetime import timedelta
from django.utils import timezone
from clm.models import Client, CommercialData, License, AuditLogCLM
# from identity.models import Company, Hotel
import uuid
import json
import base64
import hmac
import hashlib
from django.conf import settings

class ProvisioningWorkflow:
    def __init__(self, admin_user):
        self.admin_user = admin_user

    def execute(self, client_data, commercial_data, modules, feature_flags):
        """
        Executes the full provisioning workflow for a new client.
        1. Creates Client and CommercialData.
        2. Generates License Key (offline-capable).
        3. Returns the package to be installed locally.
        """
        
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
            is_offline=True
        )
        
        # 4. Generate Cryptographic Signature for Offline Validation
        license_obj.signature = self._generate_signature(license_obj)
        license_obj.save()

        # 5. Log Audit
        AuditLogCLM.objects.create(
            action="CREATE_CLIENT_PROVISIONING",
            details={"client_id": client.id, "license": license_number},
            user_identity=self.admin_user
        )
        
        return {
            "status": "success",
            "client_code": client.code,
            "license_key": self._generate_license_key_string(license_obj)
        }

    def _generate_signature(self, license_obj):
        """
        Generates an HMAC-SHA256 signature using the SECRET_KEY to prevent tampering.
        """
        payload = {
            "license_number": license_obj.license_number,
            "client_code": license_obj.client.code,
            "modules": license_obj.modules,
            "feature_flags": license_obj.feature_flags,
            "valid_until": license_obj.valid_until.isoformat() if license_obj.valid_until else None,
            "limits": {
                "hotels": license_obj.max_hotels,
                "pos": license_obj.max_pos,
                "users": license_obj.max_users
            }
        }
        
        payload_str = json.dumps(payload, sort_keys=True)
        secret = settings.SECRET_KEY.encode('utf-8')
        signature = hmac.new(secret, payload_str.encode('utf-8'), hashlib.sha256).hexdigest()
        
        return signature
        
    def _generate_license_key_string(self, license_obj):
        """
        Generates a base64 encoded string containing the license data and signature.
        This is what the client inputs into their local ERP to activate offline.
        """
        data = {
            "license_number": license_obj.license_number,
            "client_code": license_obj.client.code,
            "modules": license_obj.modules,
            "feature_flags": license_obj.feature_flags,
            "valid_until": license_obj.valid_until.isoformat() if license_obj.valid_until else None,
            "limits": {
                "hotels": license_obj.max_hotels,
                "pos": license_obj.max_pos,
                "users": license_obj.max_users
            },
            "signature": license_obj.signature
        }
        
        json_str = json.dumps(data)
        return base64.b64encode(json_str.encode('utf-8')).decode('utf-8')
