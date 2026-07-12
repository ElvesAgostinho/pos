"""
F&B Operations Center (Centro 10) — viewsets CRUD + endpoints agregados.

Os endpoints agregados (dashboard/outlets/timing/reports) leem dados reais de
outros módulos (POS) de forma preguiçosa e tolerante: se o módulo POS não estiver
instalado/licenciado, degradam com segurança em vez de rebentar.
"""
from datetime import timedelta
from decimal import Decimal

from django.db.models import Sum, Count, Avg, F
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import (
    FnbMenu, FnbMenuItem, FnbEvent, HaccpCheck, WasteRecord, QualityCheck,
    Recipe, ProductionArea, FNB_OUTLET_TYPES,
)
from .serializers import (
    FnbMenuSerializer, FnbMenuItemSerializer, FnbEventSerializer,
    HaccpCheckSerializer, WasteRecordSerializer, QualityCheckSerializer,
)


def _default_hotel():
    from identity.models import Hotel
    return Hotel.objects.first()


class _HotelDefaultMixin:
    """Se o pedido não trouxer hotel, usa o hotel principal (dev single-hotel)."""
    def perform_create(self, serializer):
        if not serializer.validated_data.get('hotel'):
            serializer.save(hotel=_default_hotel())
        else:
            serializer.save()


class FnbMenuViewSet(_HotelDefaultMixin, viewsets.ModelViewSet):
    serializer_class = FnbMenuSerializer

    def get_queryset(self):
        qs = FnbMenu.objects.prefetch_related('items__item').all()
        mt = self.request.query_params.get('menu_type')
        ot = self.request.query_params.get('outlet_type')
        if mt:
            qs = qs.filter(menu_type=mt)
        if ot:
            qs = qs.filter(outlet_type=ot)
        return qs


class FnbMenuItemViewSet(viewsets.ModelViewSet):
    serializer_class = FnbMenuItemSerializer

    def get_queryset(self):
        qs = FnbMenuItem.objects.select_related('item', 'menu').all()
        menu = self.request.query_params.get('menu')
        return qs.filter(menu_id=menu) if menu else qs


class FnbEventViewSet(_HotelDefaultMixin, viewsets.ModelViewSet):
    serializer_class = FnbEventSerializer

    def get_queryset(self):
        qs = FnbEvent.objects.select_related('menu').all()
        st = self.request.query_params.get('status')
        upcoming = self.request.query_params.get('upcoming')
        if st:
            qs = qs.filter(status=st)
        if upcoming == '1':
            qs = qs.filter(event_date__gte=timezone.localdate())
        return qs


class HaccpCheckViewSet(_HotelDefaultMixin, viewsets.ModelViewSet):
    serializer_class = HaccpCheckSerializer

    def get_queryset(self):
        qs = HaccpCheck.objects.select_related('area').all()
        ct = self.request.query_params.get('check_type')
        return qs.filter(check_type=ct) if ct else qs


class WasteRecordViewSet(_HotelDefaultMixin, viewsets.ModelViewSet):
    serializer_class = WasteRecordSerializer

    def get_queryset(self):
        qs = WasteRecord.objects.select_related('area', 'item', 'uom').all()
        reason = self.request.query_params.get('reason')
        return qs.filter(reason=reason) if reason else qs


class QualityCheckViewSet(_HotelDefaultMixin, viewsets.ModelViewSet):
    serializer_class = QualityCheckSerializer

    def get_queryset(self):
        qs = QualityCheck.objects.select_related('area').all()
        res = self.request.query_params.get('result')
        return qs.filter(result=res) if res else qs


# ------------------------- Endpoints agregados -------------------------

def _pos_outlet_kpis(outlet_type=None):
    """KPIs por outlet a partir do POS (vendas/tickets/tempo de serviço hoje).
    Tolerante: se o POS não existir, devolve lista vazia."""
    try:
        from pos.models import Outlet, POSTicket, CashSession
    except Exception:
        return []
    today = timezone.localdate()
    outlets = Outlet.objects.filter(is_active=True)
    if outlet_type:
        outlets = outlets.filter(outlet_type=outlet_type)
    rows = []
    for o in outlets.order_by('name'):
        tickets = POSTicket.objects.filter(outlet=o, opened_at__date=today)
        closed = tickets.filter(status='CLOSED')
        sales = closed.aggregate(s=Sum('grand_total'))['s'] or Decimal('0')
        n_closed = closed.count()
        open_now = tickets.filter(status='OPEN').count()
        sessions = CashSession.objects.filter(outlet=o, status='OPEN').count() if hasattr(CashSession, 'outlet') else 0
        # tempo médio de serviço (abertura -> fecho) em minutos
        durations = [
            (t.closed_at - t.opened_at).total_seconds() / 60
            for t in closed.exclude(closed_at__isnull=True)
        ]
        avg_service = round(sum(durations) / len(durations), 1) if durations else None
        rows.append({
            'id': o.id, 'code': o.code, 'name': o.name, 'outlet_type': o.outlet_type,
            'sales_today': float(sales), 'tickets_today': n_closed, 'open_tickets': open_now,
            'open_sessions': sessions, 'avg_ticket': round(float(sales) / n_closed, 2) if n_closed else 0,
            'avg_service_mins': avg_service,
        })
    return rows


class FnbOutletsView(APIView):
    """GET /api/production/fnb/outlets/?type=RESTAURANT — outlets F&B do tipo + KPIs de hoje."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        otype = request.query_params.get('type')
        rows = _pos_outlet_kpis(otype)
        return Response({
            'type': otype,
            'type_label': dict(FNB_OUTLET_TYPES).get(otype, otype),
            'outlets': rows,
            'totals': {
                'count': len(rows),
                'sales_today': round(sum(r['sales_today'] for r in rows), 2),
                'tickets_today': sum(r['tickets_today'] for r in rows),
                'open_tickets': sum(r['open_tickets'] for r in rows),
            },
        })


class FnbTimingView(APIView):
    """GET /api/production/fnb/timing/ — tempos de serviço por outlet (hoje)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = [r for r in _pos_outlet_kpis() if r['avg_service_mins'] is not None or r['tickets_today']]
        rows.sort(key=lambda r: (r['avg_service_mins'] or 0), reverse=True)
        served = [r['avg_service_mins'] for r in rows if r['avg_service_mins'] is not None]
        return Response({
            'outlets': rows,
            'global_avg_mins': round(sum(served) / len(served), 1) if served else None,
            'target_mins': 20,   # alvo de referência de serviço
        })


class FnbDashboardView(APIView):
    """GET /api/production/fnb/dashboard/ — visão geral do Centro F&B."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        month_start = today.replace(day=1)

        # Outlets por tipo (a partir do POS, se existir)
        outlets_by_type = {}
        try:
            from pos.models import Outlet
            for key, label in FNB_OUTLET_TYPES:
                outlets_by_type[key] = {
                    'label': label,
                    'count': Outlet.objects.filter(outlet_type=key, is_active=True).count(),
                }
        except Exception:
            pass

        # Vendas F&B hoje (todos os outlets F&B)
        sales_today = 0.0
        for r in _pos_outlet_kpis():
            sales_today += r['sales_today']

        # HACCP: conformidade dos últimos 7 dias
        wk = timezone.now() - timedelta(days=7)
        haccp_qs = HaccpCheck.objects.filter(checked_at__gte=wk)
        haccp_total = haccp_qs.count()
        haccp_ok = haccp_qs.filter(compliant=True).count()
        haccp_rate = round(haccp_ok / haccp_total * 100, 1) if haccp_total else None

        # Desperdício do mês (custo)
        waste_month = WasteRecord.objects.filter(recorded_at__date__gte=month_start)
        waste_cost = float(waste_month.aggregate(s=Sum('estimated_cost'))['s'] or 0)

        # Qualidade: média de score (30 dias)
        q30 = QualityCheck.objects.filter(checked_at__gte=timezone.now() - timedelta(days=30))
        quality_avg = round(float(q30.aggregate(a=Avg('score'))['a'] or 0), 1) if q30.exists() else None

        return Response({
            'sales_today': round(sales_today, 2),
            'outlets_by_type': outlets_by_type,
            'recipes': Recipe.objects.count(),
            'menus': FnbMenu.objects.filter(is_active=True).count(),
            'events_upcoming': FnbEvent.objects.filter(event_date__gte=today).exclude(status='CANCELLED').count(),
            'events_today': FnbEvent.objects.filter(event_date=today).exclude(status='CANCELLED').count(),
            'haccp': {'rate': haccp_rate, 'checks_7d': haccp_total, 'non_compliant_7d': haccp_total - haccp_ok},
            'waste_month_cost': round(waste_cost, 2),
            'quality_avg': quality_avg,
            'production_areas': ProductionArea.objects.filter(is_active=True).count(),
        })


class FnbReportsView(APIView):
    """GET /api/production/fnb/reports/ — relatórios de produção (custo/margem/desperdício/qualidade)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        month_start = today.replace(day=1)

        # Menu engineering: pratos com maior/menor margem (dos artigos ligados)
        menu_items = []
        for mi in FnbMenuItem.objects.select_related('item', 'menu').filter(item__isnull=False)[:500]:
            m = mi.margin
            if m is not None:
                menu_items.append({'name': mi.name, 'menu': mi.menu.name, 'price': float(mi.price),
                                   'cost': float(mi.cost), 'margin': float(m)})
        menu_items.sort(key=lambda x: x['margin'])
        low_margin = menu_items[:8]
        high_margin = list(reversed(menu_items[-8:]))

        # Desperdício por motivo (mês)
        waste_by_reason = list(
            WasteRecord.objects.filter(recorded_at__date__gte=month_start)
            .values('reason').annotate(cost=Sum('estimated_cost'), n=Count('id')).order_by('-cost')
        )
        reason_map = dict(WasteRecord.REASONS)
        for w in waste_by_reason:
            w['reason_label'] = reason_map.get(w['reason'], w['reason'])
            w['cost'] = float(w['cost'] or 0)

        # Receitas mais caras
        top_recipes = list(
            Recipe.objects.order_by('-theoretical_cost')[:8]
            .values('code', 'name', 'theoretical_cost', 'yield_quantity')
        )
        for r in top_recipes:
            r['theoretical_cost'] = float(r['theoretical_cost'] or 0)
            r['yield_quantity'] = float(r['yield_quantity'] or 0)

        # Qualidade por resultado (30 dias)
        quality = list(
            QualityCheck.objects.filter(checked_at__gte=timezone.now() - timedelta(days=30))
            .values('result').annotate(n=Count('id')).order_by('-n')
        )
        qmap = dict(QualityCheck.RESULTS)
        for q in quality:
            q['result_label'] = qmap.get(q['result'], q['result'])

        return Response({
            'high_margin': high_margin, 'low_margin': low_margin,
            'waste_by_reason': waste_by_reason,
            'waste_month_total': round(sum(w['cost'] for w in waste_by_reason), 2),
            'top_recipes': top_recipes,
            'quality': quality,
        })
