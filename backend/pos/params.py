"""
MOTOR DE PARÂMETROS.

Um parâmetro que se grava mas que ninguém lê é decoração. Este módulo é a única
porta por onde o sistema pergunta "esta função está ligada?", e a resposta vem
sempre da base de dados — nunca de um valor escrito no código.

    from pos.params import P
    if P.bool(8128):        # Emitir sempre nota de crédito ao anular fatura
        ...
    limite = P.int(8620, 10)   # Desconto máximo sem supervisor
"""
from django.core.cache import cache

CACHE_KEY = 'pos_params_global'
TTL = 30      # segundos: uma alteração entra em vigor em menos de meio minuto


def _all():
    vals = cache.get(CACHE_KEY)
    if vals is None:
        from .models import PosParameter
        vals = {p.number: (p.value if p.value not in (None, '') else p.default)
                for p in PosParameter.objects.filter(scope='GLOBAL')}
        cache.set(CACHE_KEY, vals, TTL)
    return vals


def invalidate():
    cache.delete(CACHE_KEY)


class P:
    @staticmethod
    def raw(number, default=None):
        return _all().get(number, default)

    @staticmethod
    def bool(number, default=False):
        v = _all().get(number)
        if v is None:
            return default
        return str(v).lower() in ('1', 'true', 'sim', 'yes', 'on')

    @staticmethod
    def int(number, default=0):
        try:
            return int(str(_all().get(number, default)).strip() or default)
        except (TypeError, ValueError):
            return default

    @staticmethod
    def text(number, default=''):
        v = _all().get(number)
        return default if v in (None, '') else str(v)
