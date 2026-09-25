"""
EMS — Events Management (MVP). CRUD real de `Event` + uma previsão de
receita (soma de `estimated_revenue` dos eventos CONFIRMED, por mês, para
os próximos N meses) no mesmo estilo de agregação só-de-leitura de
`reports.py`.
"""
from datetime import date

from rest_framework import viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from core.tenancy import HotelScopedMixin, scope_qs
from .models import Event
from .serializers import EventSerializer
from .views import HotelDefaultMixin


class EventViewSet(HotelScopedMixin, HotelDefaultMixin, viewsets.ModelViewSet):
    queryset = Event.objects.select_related('client').all()
    serializer_class = EventSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get('q'):
            from django.db.models import Q
            t = p['q']
            qs = qs.filter(Q(name__icontains=t) | Q(venue__icontains=t) | Q(client__name__icontains=t))
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        if p.get('date_from'):
            qs = qs.filter(event_date__gte=p['date_from'])
        if p.get('date_to'):
            qs = qs.filter(event_date__lte=p['date_to'])
        return qs


class EventForecastView(APIView):
    """GET pms/events/forecast/?months=N — soma de estimated_revenue dos
    eventos CONFIRMED, agrupada por mês, a partir do mês atual."""

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
        by_month = {(y, m): 0 for (y, m) in buckets}

        qs = scope_qs(request, Event.objects.filter(status='CONFIRMED'))
        first_y, first_m = buckets[0]
        last_y, last_m = buckets[-1]
        upper_y, upper_m = (last_y + 1, 1) if last_m == 12 else (last_y, last_m + 1)
        qs = qs.filter(event_date__gte=date(first_y, first_m, 1), event_date__lt=date(upper_y, upper_m, 1))
        for ev in qs:
            key = (ev.event_date.year, ev.event_date.month)
            if key in by_month:
                by_month[key] += ev.estimated_revenue

        rows = [{'year': y, 'month': m, 'label': date(y, m, 1).strftime('%Y-%m'),
                 'revenue': round(float(by_month[(y, m)]), 2)} for (y, m) in buckets]
        return Response({'months': months, 'rows': rows, 'total': round(sum(r['revenue'] for r in rows), 2)})
