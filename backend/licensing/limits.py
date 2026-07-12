"""
LIMITES DA LICENÇA — o que o cliente pagou é o que o cliente pode usar.

O sistema vende-se POR PROPRIEDADE. Sem isto, um grupo comprava uma licença para um
hotel e registava os outros seis à borla no mesmo sistema: o isolamento por hotel
passava de funcionalidade paga a prenda.

Os limites vêm dentro da licença ASSINADA (license.key → limits: {hotels, pos, users}).
Como o payload é assinado com a chave privada do fornecedor, o cliente não os pode
adulterar: mexer no ficheiro invalida a assinatura e a licença deixa de valer.

Quem quiser mais hotéis, compra mais hotéis.
"""
from django.conf import settings
from rest_framework.exceptions import PermissionDenied

from .offline_validator import get_license

# Uma licença = UM hotel. É assim que o sistema se vende.
DEFAULTS = {'hotels': 1, 'pos': 1, 'users': 5}

LABEL = {
    'hotels': 'propriedades (hotéis)',
    'pos': 'terminais POS',
    'users': 'utilizadores',
}


def get_limits():
    lic = get_license(settings.BASE_DIR) or {}
    limits = dict(DEFAULTS)
    limits.update(lic.get('limits') or {})
    return limits


def limit_of(kind):
    return int(get_limits().get(kind, DEFAULTS.get(kind, 1)))


def current_usage():
    from identity.models import Hotel
    from django.contrib.auth.models import User
    usage = {'hotels': Hotel.objects.count(), 'users': User.objects.filter(is_active=True).count()}
    try:
        from identity.models import Workstation      # postos de trabalho = terminais POS
        usage['pos'] = Workstation.objects.count()
    except Exception:
        usage['pos'] = 0
    return usage


def enforce(kind, adding=1):
    """Levanta 403 se criar mais este(s) registo(s) ultrapassar o que foi licenciado."""
    lim = limit_of(kind)
    used = current_usage().get(kind, 0)
    if used + adding > lim:
        raise PermissionDenied(
            f'A sua licença cobre {lim} {LABEL.get(kind, kind)} e já tem {used} em uso. '
            f'Para acrescentar mais, é necessário alargar a licença — contacte o fornecedor.'
        )


def status():
    """Consumo vs licenciado (para o painel de licença)."""
    lim, use = get_limits(), current_usage()
    return {
        k: {'used': use.get(k, 0), 'licensed': int(lim.get(k, DEFAULTS[k])),
            'available': max(0, int(lim.get(k, DEFAULTS[k])) - use.get(k, 0)),
            'label': LABEL[k]}
        for k in DEFAULTS
    }
