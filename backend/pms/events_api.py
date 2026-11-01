"""
EMS — a vista hoteleira dos PEDIDOS DE EVENTO.

─── PORQUE É QUE ISTO DEIXOU DE TER TABELA PRÓPRIA ────────────────────────
Havia duas tabelas a guardar a mesma coisa: `pms.Event` (este módulo, um MVP)
e `pos.EventRequest` (o motor de eventos do comercial). As duas guardavam
designação, cliente, contacto, data, número de pessoas, espaço, estado e notas.

A diferença não era de âmbito — era de maturidade. O `pos.EventRequest` tem
tipo de evento, tipo e disposição de espaço, estados do hotel com a regra de
BLOQUEIO DO ESPAÇO (um estado que bloqueia tira a sala do mercado e o sistema
recusa outro pedido à mesma hora), motivo de cancelamento, segmento, canal,
package, preço por pessoa e extras. O `pms.Event` guardava o espaço como TEXTO
LIVRE e o estado como quatro palavras fixas que não bloqueavam nada.

O que isso custava na casa: um evento marcado no EMS **não reservava a sala**.
Nada impedia dois eventos no mesmo espaço à mesma hora, porque um lado não
sabia do outro. E o calendário do EMS lia a tabela do PMS, por isso os eventos
que o comercial lançava no ecrã bom não apareciam nele.

Agora é uma tabela só. O que fica aqui é a VISTA do hotel sobre ela: a lista e
a previsão de receita, no vocabulário do PMS (nome, data, sala, hóspede), para
os ecrãs de calendário e previsão não terem de aprender o vocabulário do
comercial. Quem CRIA e ALTERA é o ecrã de Pedidos de Evento — um só, para não
voltarem a existir duas portas com perguntas diferentes.
"""
from datetime import date

from rest_framework import serializers, viewsets, mixins
from rest_framework.response import Response
from rest_framework.views import APIView

from pos.models import EventRequest


def _scope(request, qs):
    """Só os eventos do hotel em que se está a trabalhar.

    O pedido de evento não tem hotel próprio: tem ESPAÇO, e o espaço pertence a
    um ponto de venda, que pertence a um hotel. É por aí que se chega — e é mais
    uma razão para o espaço do evento ser um sítio a sério e não texto livre.
    """
    hotel = request.headers.get('X-Hotel') or request.query_params.get('hotel')
    return qs.filter(space__outlet__hotel_id=hotel) if hotel else qs


class EventoDoHotelSerializer(serializers.ModelSerializer):
    """O pedido de evento dito no vocabulário do PMS."""
    name = serializers.CharField(source='title', read_only=True)
    event_date = serializers.SerializerMethodField()
    start_time = serializers.SerializerMethodField()
    end_time = serializers.SerializerMethodField()
    venue = serializers.CharField(source='space.name', read_only=True, default=None)
    client = serializers.IntegerField(source='customer_id', read_only=True)
    client_name = serializers.CharField(source='customer.name', read_only=True, default=None)
    expected_guests = serializers.IntegerField(source='pax', read_only=True)
    status = serializers.SerializerMethodField()
    # O ESTADO ESCRITO É O DO HOTEL, não uma de quatro palavras nossas. Se a casa
    # chama "Pré-reserva do casamento" ao que equivale a uma opção, é isso que
    # aparece no calendário — era uma das coisas que a tabela antiga não sabia
    # dizer.
    status_display = serializers.CharField(source='state.name', read_only=True, default=None)
    estimated_revenue = serializers.SerializerMethodField()

    class Meta:
        model = EventRequest
        fields = ['id', 'number', 'name', 'event_date', 'start_time', 'end_time', 'venue',
                  'client', 'client_name', 'expected_guests', 'status', 'status_display',
                  'estimated_revenue', 'notes']

    def get_event_date(self, o):
        return o.start_at.date().isoformat() if o.start_at else None

    def get_start_time(self, o):
        return o.start_at.time().isoformat(timespec='minutes') if o.start_at else None

    def get_end_time(self, o):
        return o.end_at.time().isoformat(timespec='minutes') if o.end_at else None

    def get_status(self, o):
        """As quatro palavras que os ecrãs do PMS já pintam, derivadas do estado
        real. Não se inventa um estado novo: traduz-se o que o hotel definiu."""
        if o.cancelled_at or (o.state_id and o.state.equivalent == 'CANCELLED'):
            return 'CANCELLED'
        if o.blocks_space:
            return 'CONFIRMED'
        return 'INQUIRY'

    def get_estimated_revenue(self, o):
        return float(o.price_per_pax or 0) * int(o.pax or 0) + float(o.extra_total or 0)


class EventViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """SÓ DE LEITURA, e é de propósito.

    Criar e alterar um pedido de evento tem regras que não cabem num formulário
    de hotel — o bloqueio do espaço, o motivo de cancelamento obrigatório, a
    marca de "respondido" que tira o pedido da lista do comercial. Deixar gravar
    por aqui era recriar a segunda porta que este ficheiro veio fechar.
    """
    queryset = (EventRequest.objects
                .select_related('customer', 'space', 'state')
                .order_by('start_at'))
    serializer_class = EventoDoHotelSerializer

    def get_queryset(self):
        qs = _scope(self.request, super().get_queryset())
        p = self.request.query_params
        if p.get('q'):
            from django.db.models import Q
            t = p['q']
            qs = qs.filter(Q(title__icontains=t) | Q(space__name__icontains=t)
                           | Q(customer__name__icontains=t))
        if p.get('date_from'):
            qs = qs.filter(start_at__date__gte=p['date_from'])
        if p.get('date_to'):
            qs = qs.filter(start_at__date__lte=p['date_to'])
        return qs


class EventForecastView(APIView):
    """GET pms/events/forecast/?months=N — receita esperada por mês.

    Conta os pedidos cujo estado BLOQUEIA o espaço: são os que a casa já não
    pode vender a outro, e portanto os únicos em que a receita se pode contar.
    Uma opção ainda por confirmar não entra numa previsão — seria contar
    dinheiro que ainda se pode perder para o concorrente.
    """

    def get(self, request):
        try:
            months = max(1, min(int(request.query_params.get('months') or 6), 24))
        except (TypeError, ValueError):
            months = 6
        today = date.today()
        buckets = []
        y, m = today.year, today.month
        for _ in range(months):
            buckets.append((y, m))
            m += 1
            if m > 12:
                m = 1
                y += 1
        by_month = {(y, m): 0.0 for (y, m) in buckets}

        first_y, first_m = buckets[0]
        last_y, last_m = buckets[-1]
        upper_y, upper_m = (last_y + 1, 1) if last_m == 12 else (last_y, last_m + 1)

        qs = _scope(request, EventRequest.objects
                    .select_related('state', 'segment', 'channel', 'event_type')
                    .filter(cancelled_at__isnull=True,
                            start_at__date__gte=date(first_y, first_m, 1),
                            start_at__date__lt=date(upper_y, upper_m, 1)))

        # DE ONDE VEM A RECEITA, e não só quanto é.
        #
        # A previsão dizia "em Março esperam-se X kwanzas" e mais nada. É um
        # número que não se pode accionar: para decidir onde pôr o esforço
        # comercial é preciso saber se vem de casamentos ou de empresas, e se
        # chega por venda directa ou por uma agência que leva comissão.
        #
        # Os eventos passaram a ter segmento, canal e tipo quando se unificaram
        # com o motor do comercial — a informação já cá estava, só não era
        # mostrada. "(Sem ...)" aparece por inteiro em vez de desaparecer: um
        # eixo onde metade da receita não está classificada é uma coisa que o
        # dono tem de VER, não de adivinhar por as parcelas não somarem o total.
        por_segmento, por_canal, por_tipo = {}, {}, {}

        def _junta(d, chave, valor):
            d[chave] = d.get(chave, 0.0) + valor

        for ev in qs:
            if not ev.blocks_space:
                continue
            valor = float(ev.price_per_pax or 0) * int(ev.pax or 0) + float(ev.extra_total or 0)
            key = (ev.start_at.year, ev.start_at.month)
            if key in by_month:
                by_month[key] += valor
            _junta(por_segmento, ev.segment.name if ev.segment_id else '(Sem segmento)', valor)
            _junta(por_canal, ev.channel.name if ev.channel_id else '(Venda directa)', valor)
            _junta(por_tipo, ev.event_type.name if ev.event_type_id else '(Sem tipo)', valor)

        def _lista(d):
            return [{'label': k, 'revenue': round(v, 2)}
                    for k, v in sorted(d.items(), key=lambda kv: -kv[1]) if v]

        rows = [{'year': y, 'month': m, 'label': date(y, m, 1).strftime('%Y-%m'),
                 'revenue': round(by_month[(y, m)], 2)} for (y, m) in buckets]
        return Response({'months': months, 'rows': rows,
                         'total': round(sum(r['revenue'] for r in rows), 2),
                         'by_segment': _lista(por_segmento),
                         'by_channel': _lista(por_canal),
                         'by_type': _lista(por_tipo)})
