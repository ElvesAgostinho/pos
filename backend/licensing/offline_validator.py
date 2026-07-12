import os
import json
import base64

from licensing.engine.crypto import verify_license


def get_license(base_dir):
    """Devolve o payload da licença VALIDADO (assinatura RSA) ou None se faltar/for inválida."""
    license_path = os.path.join(base_dir, 'license.key')
    if not os.path.exists(license_path):
        return None
    try:
        data = json.loads(base64.b64decode(open(license_path).read().strip()).decode('utf-8'))
        signature = data.pop('signature', None)
        if signature and verify_license(data, signature):
            return data
    except Exception:
        pass
    return None


def get_active_modules(base_dir, secret_key=None):
    """
    Lê a license.key da raiz do projeto, valida a ASSINATURA RSA com a chave pública
    e devolve a lista de módulos ativos. Se a licença faltar ou for inválida/adulterada,
    devolve uma lista vazia (nenhum módulo opcional é carregado).

    `secret_key` mantido por compatibilidade de assinatura — já não é usado (a validação
    passou de HMAC simétrico para RSA assimétrico).
    """
    license_path = os.path.join(base_dir, 'license.key')

    if not os.path.exists(license_path):
        return []  # Sem licença -> sem módulos opcionais

    try:
        with open(license_path, 'r') as f:
            encoded_key = f.read().strip()

        json_str = base64.b64decode(encoded_key).decode('utf-8')
        license_data = json.loads(json_str)

        signature = license_data.pop('signature', None)
        if not signature:
            return []

        # O que resta (license_data sem 'signature') é exatamente o payload assinado.
        if verify_license(license_data, signature):
            return license_data.get('modules', [])

        print("WARNING: Assinatura de licença inválida!")
        return []

    except Exception as e:
        print(f"Error reading license: {e}")
        return []
