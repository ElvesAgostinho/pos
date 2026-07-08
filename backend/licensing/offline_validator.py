import os
import json
import base64
import hmac
import hashlib
from pathlib import Path

def get_active_modules(base_dir, secret_key):
    """
    Reads license.key from the project root.
    Validates the cryptographic signature.
    Returns a list of active modules.
    If license is missing or invalid, returns an empty list or raises an exception.
    """
    license_path = os.path.join(base_dir, 'license.key')
    
    if not os.path.exists(license_path):
        return [] # No license found, no extra modules enabled
        
    try:
        with open(license_path, 'r') as f:
            encoded_key = f.read().strip()
            
        json_str = base64.b64decode(encoded_key).decode('utf-8')
        license_data = json.loads(json_str)
        
        signature = license_data.pop('signature', None)
        if not signature:
            return []
            
        # Re-calculate signature
        payload_str = json.dumps(license_data, sort_keys=True)
        secret = secret_key.encode('utf-8')
        expected_signature = hmac.new(secret, payload_str.encode('utf-8'), hashlib.sha256).hexdigest()
        
        if hmac.compare_digest(signature, expected_signature):
            return license_data.get('modules', [])
        else:
            print("WARNING: Invalid license signature!")
            return []
            
    except Exception as e:
        print(f"Error reading license: {e}")
        return []
