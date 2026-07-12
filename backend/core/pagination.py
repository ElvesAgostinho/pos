"""
Paginação opcional e retrocompatível.

- Sem `?page` nem `?page_size` no pedido -> devolve a lista COMPLETA (comportamento
  anterior, para não partir os ecrãs existentes).
- Com `?page=N` (opcional `?page_size=`) -> devolve o envelope paginado
  {count, next, previous, results}, com pesquisa (`?search=`) e ordenação (`?ordering=`).

Isto permite ligar paginação/pesquisa server-side ecrã a ecrã, sem migração global.
"""
from rest_framework.pagination import PageNumberPagination


class OptionalPageNumberPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 500

    def paginate_queryset(self, queryset, request, view=None):
        if 'page' not in request.query_params and 'page_size' not in request.query_params:
            return None  # DRF devolve a lista completa (sem envelope)
        return super().paginate_queryset(queryset, request, view)
