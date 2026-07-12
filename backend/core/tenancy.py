"""
ISOLAMENTO POR PROPRIEDADE (multi-tenancy por hotel).

Problema que isto resolve: os viewsets faziam `Model.objects.all()`. Num grupo com
vários hotéis, o rececionista do Hotel A via (e podia alterar) as reservas, os quartos
e as contas do Hotel B. Nenhum ERP hoteleiro sério permite isto.

Regra:
  - o utilizador só vê os hotéis a que tem acesso (identity.UserHotelAccess);
  - superuser (o dono) vê tudo;
  - um utilizador SEM acessos definidos vê tudo (retrocompatível: instalações
    de hotel único não têm de configurar nada);
  - o hotel "ativo" vem do cabeçalho X-Hotel-Id (ou ?hotel=), e tem de estar
    dentro dos hotéis permitidos — caso contrário é ignorado;
  - ao CRIAR, o hotel é forçado (não se aceita o que vem do cliente).

Aplicação: basta o viewset herdar de HotelScopedMixin e declarar `hotel_path`
(o caminho ORM até ao hotel, ex.: 'hotel' ou 'reservation__hotel').
"""
from rest_framework.exceptions import PermissionDenied


def allowed_hotel_ids(user):
    """IDs dos hotéis que este utilizador pode ver. None = todos (sem restrição)."""
    if not user or not user.is_authenticated or user.is_superuser:
        return None
    try:
        from identity.models import UserHotelAccess
        ids = list(UserHotelAccess.objects.filter(user=user).values_list('hotel_id', flat=True))
    except Exception:
        return None
    return ids or None      # sem acessos definidos = sem restrição (hotel único)


def current_hotel_id(request):
    """Hotel ativo do pedido (X-Hotel-Id / ?hotel=), validado contra os permitidos."""
    raw = (request.headers.get('X-Hotel-Id')
           or request.query_params.get('hotel')
           if hasattr(request, 'query_params') else request.headers.get('X-Hotel-Id'))
    allowed = allowed_hotel_ids(request.user)
    if raw:
        try:
            hid = int(raw)
        except (TypeError, ValueError):
            return None
        if allowed is not None and hid not in allowed:
            raise PermissionDenied('Não tem acesso a este hotel.')
        return hid
    # Sem hotel pedido: se só tem acesso a um, é esse.
    if allowed and len(allowed) == 1:
        return allowed[0]
    return None


def default_hotel_id(request):
    """Hotel a usar ao criar registos: o ativo, senão o 1º permitido, senão o 1º do sistema."""
    hid = current_hotel_id(request)
    if hid:
        return hid
    allowed = allowed_hotel_ids(request.user)
    if allowed:
        return allowed[0]
    from identity.models import Hotel
    h = Hotel.objects.first()
    return h.id if h else None


def scope_qs(request, qs, hotel_path='hotel'):
    """Aplica o isolamento a um queryset já construído (para viewsets com get_queryset próprio)."""
    allowed = allowed_hotel_ids(request.user)
    if allowed is not None:
        qs = qs.filter(**{f'{hotel_path}__in': allowed})
    hid = current_hotel_id(request)
    if hid:
        qs = qs.filter(**{hotel_path: hid})
    return qs


class HotelScopedMixin:
    """Restringe o queryset ao(s) hotel(éis) do utilizador e força o hotel na criação."""
    hotel_path = 'hotel'          # caminho ORM até ao hotel
    hotel_write_field = 'hotel'   # campo a preencher ao criar (None = não escrever)

    def get_queryset(self):
        qs = super().get_queryset()
        allowed = allowed_hotel_ids(self.request.user)
        if allowed is not None:
            qs = qs.filter(**{f'{self.hotel_path}__in': allowed})
        hid = current_hotel_id(self.request)
        if hid:
            qs = qs.filter(**{self.hotel_path: hid})
        return qs

    def perform_create(self, serializer):
        if self.hotel_write_field and self.hotel_write_field in serializer.fields:
            hid = default_hotel_id(self.request)
            if hid:
                from identity.models import Hotel
                serializer.save(**{self.hotel_write_field: Hotel.objects.get(pk=hid)})
                return
        serializer.save()
