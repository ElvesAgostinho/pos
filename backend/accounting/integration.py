"""Endpoints de integração contabilística — pendências, execução em lote e mapa de contas."""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .posting import _pending, run_autopost, DEFAULT_MAP, _mapping
from .models import Account


class AutoPostView(APIView):
    """GET: documentos pendentes de contabilização. POST: gera lançamentos em lote."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        p = _pending()
        return Response({
            'pending': p,
            'counts': {k: len(v) for k, v in p.items()},
            'total': sum(len(v) for v in p.values()),
        })

    def post(self, request):
        sources = request.data.get('sources') or ['pos', 'purchase', 'treasury']
        autopost = bool(request.data.get('post', True))
        created = run_autopost(sources=sources, autopost=autopost, by=request.user.get_username())
        return Response({'detail': f'{created} lançamento(s) gerado(s).', 'created': created})


class AccountMappingView(APIView):
    """GET/POST /api/accounting/mapping/ — mapa chave→conta usado no auto-posting."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        mp = _mapping()
        rows = []
        for key, code in mp.items():
            acc = Account.objects.filter(code=code).first()
            rows.append({'key': key, 'code': code, 'account_name': acc.name if acc else None})
        return Response({'mapping': rows, 'defaults': DEFAULT_MAP})

    def post(self, request):
        from core.models import GlobalConfig
        cfg, _ = GlobalConfig.objects.get_or_create(key='accounting_mapping', defaults={'value': {}})
        cfg.value = {**(cfg.value or {}), **(request.data.get('mapping') or {})}
        cfg.save()
        return Response({'detail': 'Mapa de contas atualizado.', 'mapping': cfg.value})
