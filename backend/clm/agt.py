"""
Certificação AGT — geração de credenciais NO PCC (lado fornecedor).

O fornecedor (dono do software) gera o par de chaves RSA e regista o nº de
certificado atribuído pela AGT. Estas credenciais são entregues ao cliente e
aplicadas no motor fiscal — o cliente NUNCA gera as suas próprias chaves.
"""
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from .models import License


def _generate_keypair():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    ).decode('ascii')
    public_pem = key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode('ascii')
    return private_pem, public_pem


class AgtGenerateView(APIView):
    """
    POST /api/clm/agt/generate/  {license_id?, certificate_number}
    Gera um par de chaves RSA-2048 e associa o nº de certificado AGT.
    Se license_id for indicado, guarda as credenciais nessa licença.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        cert = (request.data.get('certificate_number') or '').strip()
        if not cert:
            return Response({'detail': 'Indique o nº de certificado atribuído pela AGT.'}, status=400)
        private_pem, public_pem = _generate_keypair()

        lic = None
        lic_id = request.data.get('license_id')
        if lic_id:
            lic = License.objects.filter(id=lic_id).first()
            if not lic:
                return Response({'detail': 'Licença não encontrada.'}, status=404)
            lic.agt_certificate_number = cert
            lic.agt_public_key = public_pem
            lic.agt_private_key = private_pem
            lic.agt_issued_at = timezone.now()
            lic.save(update_fields=['agt_certificate_number', 'agt_public_key', 'agt_private_key', 'agt_issued_at'])

        return Response({
            'detail': 'Credenciais AGT geradas.',
            'certificate_number': cert,
            'private_key': private_pem,   # entregar ao motor fiscal do cliente
            'public_key': public_pem,
            'license': lic.license_number if lic else None,
            'note': 'Entregue estas credenciais ao cliente (Fiscal → Certificação AGT). O cliente não gera chaves.',
        })


class AgtLicenseCredentialsView(APIView):
    """GET /api/clm/agt/credentials/?license_id= — credenciais AGT guardadas de uma licença."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        lic = License.objects.filter(id=request.query_params.get('license_id')).first()
        if not lic:
            return Response({'detail': 'Licença não encontrada.'}, status=404)
        return Response({
            'license': lic.license_number,
            'certificate_number': lic.agt_certificate_number,
            'public_key': lic.agt_public_key,
            'private_key': lic.agt_private_key,
            'issued_at': lic.agt_issued_at,
            'certified': bool(lic.agt_certificate_number and lic.agt_certificate_number not in ('0000', '')),
        })
