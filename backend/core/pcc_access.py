"""
PORTÃO DE ACESSO DO PCC — só ativo no modo PCC (SYSTEM_MODE=PCC).

Na VPS tradicional, o nginx fazia "allow 10.8.0.0/24; deny all;" e só a
sincronização de licenças ficava de fora. Num painel Docker (EasyPanel e
semelhantes) não há nginx próprio para editar — quem serve o domínio é o
painel — por isso a mesma regra faz-se DENTRO da app: uma lista de IPs/redes
permitidas em PCC_ALLOWED_IPS (env var, CIDR separado por vírgulas).

Isto é uma camada A MAIS, não a única: todos os ecrãs do PCC (Gestão de
Clientes, Wizard, /admin/) já exigem login de staff (IsAdminUser). Só a
sincronização que as instalações dos clientes chamam sozinhas
(licenses/latest/) fica sempre pública — é ela própria que verifica a
assinatura da licença apresentada, essa é a autenticação dela.
"""
import ipaddress
import logging

from django.conf import settings
from django.http import HttpResponseForbidden

logger = logging.getLogger('pcc_access')

# Só este caminho responde a quem não está na lista — é o que as instalações
# dos clientes chamam sozinhas, sem VPN nem lista de IPs do lado deles.
PUBLIC_PATHS = ('/api/clm/licenses/latest/',)


def _client_ip(request):
    fwd = request.META.get('HTTP_X_FORWARDED_FOR')
    return (fwd.split(',')[0].strip() if fwd else request.META.get('REMOTE_ADDR'))


class PccConsoleGateMiddleware:
    """Sem PCC_ALLOWED_IPS definida, não bloqueia nada (falha ABERTA): bloquear por
    omissão sem ninguém ter configurado a lista trancava o próprio dono fora do
    PCC — pior do que ficar por configurar."""

    def __init__(self, get_response):
        self.get_response = get_response
        raw = getattr(settings, 'PCC_ALLOWED_IPS', '') or ''
        self.networks = []
        for item in raw.split(','):
            item = item.strip()
            if not item:
                continue
            try:
                self.networks.append(ipaddress.ip_network(item, strict=False))
            except ValueError:
                logger.warning('PCC_ALLOWED_IPS: entrada inválida ignorada: %r', item)

    def __call__(self, request):
        if not self.networks or request.path in PUBLIC_PATHS:
            return self.get_response(request)

        ip = _client_ip(request)
        try:
            addr = ipaddress.ip_address(ip) if ip else None
        except ValueError:
            addr = None

        if addr and any(addr in net for net in self.networks):
            return self.get_response(request)

        logger.warning('PCC: acesso recusado a %s (IP %s fora de PCC_ALLOWED_IPS)', request.path, ip)
        return HttpResponseForbidden('Acesso restrito a esta consola.')
