"""
Configuração POS — Módulos, Terminais e Parâmetros.
"""
from django.db import models
from rest_framework import viewsets, serializers
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import (PosModule, PosTerminal, TerminalPrinter, TerminalHardware,
                     PosParameter, PosSector, POSTable, PosKeyboard, PosKeyboardKey,
                     TimeBand, TimeBandSlot, PosSchedule, PosScheduleLine,
                     PosRight, PosUserGroup, PosUser, PosUserCommission,
                     HRType, HumanResource, HRScheduleLine, HRCommission, PosDiscount,
                     PmsHotelLink, PmsExternalLink, Outlet)


def _licensed_modules():
    from django.conf import settings
    from licensing.offline_validator import get_active_modules
    return set(get_active_modules(settings.BASE_DIR) or [])


class PosModuleSerializer(serializers.ModelSerializer):
    # "Licenciado" NÃO é uma caixa que o cliente marca: vem da licença assinada.
    is_licensed = serializers.SerializerMethodField()

    class Meta:
        model = PosModule
        fields = '__all__'

    def get_is_licensed(self, o):
        return (not o.license_key) or (o.license_key in _licensed_modules())


class PosModuleViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = PosModule.objects.all()
    serializer_class = PosModuleSerializer


class PosParameterSerializer(serializers.ModelSerializer):
    class Meta:
        model = PosParameter
        fields = '__all__'


class PosParameterViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = PosParameter.objects.all()
    serializer_class = PosParameterSerializer


class TerminalPrinterSerializer(serializers.ModelSerializer):
    printer_code = serializers.CharField(source='printer.code', read_only=True)
    printer_name = serializers.CharField(source='printer.name', read_only=True)

    class Meta:
        model = TerminalPrinter
        fields = ('id', 'printer', 'printer_code', 'printer_name', 'port', 'location',
                  'one_item_per_ticket', 'kds_monitor', 'is_active')
        extra_kwargs = {'terminal': {'required': False}}


class TerminalHardwareSerializer(serializers.ModelSerializer):
    hw_type_display = serializers.CharField(source='get_hw_type_display', read_only=True)

    class Meta:
        model = TerminalHardware
        fields = ('id', 'code', 'description', 'hw_type', 'hw_type_display', 'port', 'is_active')


class PosTerminalSerializer(serializers.ModelSerializer):
    printers = TerminalPrinterSerializer(many=True, required=False)
    hardware = TerminalHardwareSerializer(many=True, required=False)
    terminal_type_display = serializers.CharField(source='get_terminal_type_display', read_only=True)
    outlet_name = serializers.CharField(source='outlet.name', read_only=True, default=None)

    class Meta:
        model = PosTerminal
        fields = '__all__'

    def _sync(self, t, printers, hardware):
        if printers is not None:
            t.printers.all().delete()
            for p in printers:
                p.pop('terminal', None)
                TerminalPrinter.objects.create(terminal=t, **p)
        if hardware is not None:
            t.hardware.all().delete()
            for h in hardware:
                h.pop('terminal', None)
                TerminalHardware.objects.create(terminal=t, **h)

    def create(self, validated):
        p = validated.pop('printers', [])
        h = validated.pop('hardware', [])
        t = PosTerminal.objects.create(**validated)
        self._sync(t, p, h)
        return t

    def update(self, instance, validated):
        p = validated.pop('printers', None)
        h = validated.pop('hardware', None)
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        self._sync(instance, p, h)
        return instance


class PosTerminalViewSet(viewsets.ModelViewSet):
    """Terminais. O nº de terminais é limitado pela LICENÇA — não se contorna aqui."""
    permission_classes = [IsAuthenticated]
    queryset = PosTerminal.objects.prefetch_related('printers__printer', 'hardware').all()
    serializer_class = PosTerminalSerializer

    def perform_create(self, serializer):
        from licensing.limits import enforce
        enforce('pos')          # mais um terminal do que os licenciados = recusado
        serializer.save()

    @action(detail=False, methods=['get'])
    def license_status(self, request):
        from licensing.limits import status
        s = status()['pos']
        return Response({'licensed': s['licensed'], 'used': s['used'], 'available': s['available']})


# ==========================================================================
# SETORES + PLANTA DE MESAS
# ==========================================================================
class SectorTableSerializer(serializers.ModelSerializer):
    """A mesa, como aparece na planta da sala."""
    class Meta:
        model = POSTable
        fields = ('id', 'table_number', 'name', 'seats', 'shape', 'pos_x', 'pos_y',
                  'width', 'height', 'color', 'text_color', 'status',
                  'online_reservation', 'min_seats', 'max_seats', 'preferred_seats')


class PosSectorSerializer(serializers.ModelSerializer):
    tables = SectorTableSerializer(many=True, read_only=True)
    tables_count = serializers.IntegerField(source='tables.count', read_only=True)
    outlet_name = serializers.CharField(source='outlet.name', read_only=True, default=None)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True, default=None)
    happy_hour_name = serializers.CharField(source='happy_hour.name', read_only=True, default=None)

    class Meta:
        model = PosSector
        fields = '__all__'


class PosSectorViewSet(viewsets.ModelViewSet):
    """Setores (salas de venda) e a planta das suas mesas."""
    permission_classes = [IsAuthenticated]
    queryset = PosSector.objects.select_related('outlet', 'warehouse', 'happy_hour').prefetch_related('tables')
    serializer_class = PosSectorSerializer

    @action(detail=True, methods=['get', 'post'])
    def tables(self, request, pk=None):
        """GET: a planta. POST: grava a planta inteira (posições, formas, lugares).

        A planta grava-se de uma vez — arrastar 14 mesas e gravar uma a uma seria
        14 pedidos e um mapa inconsistente se um deles falhasse.
        """
        sector = self.get_object()
        if request.method == 'GET':
            return Response(SectorTableSerializer(sector.tables.all(), many=True).data)

        rows = request.data.get('tables', [])
        keep = []
        for r in rows:
            tid = r.get('id')
            data = {k: r.get(k) for k in (
                'table_number', 'name', 'seats', 'shape', 'pos_x', 'pos_y', 'width', 'height',
                'color', 'text_color', 'online_reservation', 'min_seats', 'max_seats',
                'preferred_seats') if k in r}
            if tid and POSTable.objects.filter(pk=tid, sector=sector).exists():
                POSTable.objects.filter(pk=tid).update(**data)
                keep.append(tid)
            else:
                data.setdefault('table_number', r.get('table_number') or 'M')
                t = POSTable.objects.create(sector=sector, outlet=sector.outlet, **data)
                keep.append(t.id)
        # Mesas removidas da planta: só se apagam as que NÃO têm conta aberta.
        removed = sector.tables.exclude(pk__in=keep)
        blocked = [t.table_number for t in removed if t.tickets.filter(status__in=['OPEN', 'SUSPENDED']).exists()]
        removed.exclude(tickets__status__in=['OPEN', 'SUSPENDED']).delete()
        return Response({
            'tables': SectorTableSerializer(sector.tables.all(), many=True).data,
            'blocked': blocked,   # mesas que não se apagaram por terem conta aberta
        })


class GlobalParamsView(APIView):
    """
    PARÂMETROS DO SISTEMA — o que liga e desliga funções no POS.

    GET  → o catálogo agrupado, com o valor em vigor.
    POST → grava os valores e limpa a cache (entram em vigor em segundos).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from collections import OrderedDict
        rows = PosParameter.objects.filter(scope='GLOBAL').order_by('group', 'number')
        groups = OrderedDict()
        for p in rows:
            groups.setdefault(p.group, []).append({
                'number': p.number, 'name': p.name, 'kind': p.kind, 'choices': p.choices,
                'value': p.value if p.value not in (None, '') else p.default,
                'default': p.default, 'help_text': p.help_text,
            })
        return Response([{'group': g, 'params': ps} for g, ps in groups.items()])

    def post(self, request):
        from . import params as pengine
        values = request.data.get('values') or {}
        changed = 0
        for num, val in values.items():
            v = 'true' if val is True else ('false' if val is False else ('' if val is None else str(val)))
            if PosParameter.objects.filter(number=int(num)).exclude(value=v).update(value=v):
                changed += 1
        pengine.invalidate()      # sem isto, o sistema continuava a usar os valores antigos
        return Response({'changed': changed, 'detail': f'{changed} parâmetro(s) alterado(s).'})


# ==========================================================================
# TECLADOS
# ==========================================================================
class KeyboardKeySerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True, default=None)
    item_code = serializers.CharField(source='item.code', read_only=True, default=None)
    item_price = serializers.SerializerMethodField()

    class Meta:
        model = PosKeyboardKey
        fields = ('id', 'parent', 'kind', 'label', 'item', 'item_name', 'item_code',
                  'item_price', 'color', 'text_color', 'sort_order', 'span')

    def get_item_price(self, o):
        if not o.item_id:
            return None
        lvl = self.context.get('price_level', 1)
        p = o.item.prices.filter(level=lvl).first()
        return str(p.price if p else (o.item.sale_price or 0))


class PosKeyboardSerializer(serializers.ModelSerializer):
    keys = serializers.SerializerMethodField()
    keys_count = serializers.IntegerField(source='keys.count', read_only=True)

    class Meta:
        model = PosKeyboard
        fields = '__all__'

    def get_keys(self, o):
        return KeyboardKeySerializer(o.keys.select_related('item').all(), many=True,
                                     context={'price_level': o.price_level}).data


class PosKeyboardViewSet(viewsets.ModelViewSet):
    """Teclados do POS. É este desenho que o terminal mostra ao operador."""
    permission_classes = [IsAuthenticated]
    queryset = PosKeyboard.objects.prefetch_related('keys__item')
    serializer_class = PosKeyboardSerializer

    @action(detail=True, methods=['post'])
    def save_keys(self, request, pk=None):
        """Grava o teclado INTEIRO de uma vez (páginas, pastas e teclas).

        Um teclado é uma árvore: gravar tecla a tecla deixaria pais sem filhos se
        um pedido falhasse a meio. Grava-se tudo ou nada.
        """
        kb = self.get_object()
        rows = request.data.get('keys', [])
        kb.keys.all().delete()

        # 1ª passagem: cria tudo sem pai (o pai pode ainda não existir).
        temp = {}
        for r in rows:
            k = PosKeyboardKey.objects.create(
                keyboard=kb, kind=r.get('kind', 'FOLDER'), label=r.get('label') or '',
                item_id=r.get('item') or None, color=r.get('color') or '#1565c0',
                text_color=r.get('text_color') or '#ffffff',
                sort_order=r.get('sort_order') or 0, span=r.get('span') or 1)
            temp[r.get('tmp_id') or r.get('id')] = k

        # 2ª passagem: liga cada tecla ao seu pai.
        for r in rows:
            pid = r.get('parent')
            if pid and (child := temp.get(r.get('tmp_id') or r.get('id'))) and (parent := temp.get(pid)):
                child.parent = parent
                child.save(update_fields=['parent'])

        return Response(PosKeyboardSerializer(kb).data)

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        src = self.get_object()
        n = (PosKeyboard.objects.order_by('-number').first().number or 0) + 1
        new = PosKeyboard.objects.create(
            number=n, name=f'{src.name} (cópia)', price_level=src.price_level,
            cols=src.cols, rows=src.rows, show_codes=src.show_codes, show_prices=src.show_prices)
        mapping = {}
        for k in src.keys.all():
            mapping[k.id] = PosKeyboardKey.objects.create(
                keyboard=new, kind=k.kind, label=k.label, item=k.item, color=k.color,
                text_color=k.text_color, sort_order=k.sort_order, span=k.span)
        for k in src.keys.exclude(parent=None):
            mapping[k.id].parent = mapping.get(k.parent_id)
            mapping[k.id].save(update_fields=['parent'])
        return Response(PosKeyboardSerializer(new).data, status=201)


# ==========================================================================
# HORÁRIOS - PERÍODOS
# ==========================================================================
def _keyboard_toggle_item(self, request, pk=None):
    """Põe/tira um ARTIGO deste teclado.

    É o que a caixa do separador "Teclados" da ficha do artigo faz: ligar cria a
    tecla na primeira página do teclado; desligar apaga todas as teclas desse
    artigo. Assim o artigo aparece (ou desaparece) do terminal a sério.
    """
    from inventory.models import Item
    kb = self.get_object()
    item = Item.objects.filter(pk=request.data.get('item')).first()
    if not item:
        return Response({'detail': 'Artigo inválido.'}, status=400)
    if request.data.get('on'):
        page = kb.keys.filter(parent__isnull=True).order_by('sort_order', 'id').first()
        if not page:
            page = PosKeyboardKey.objects.create(keyboard=kb, kind='PAGE', label='Página 1', sort_order=0)
        if not kb.keys.filter(item=item).exists():
            PosKeyboardKey.objects.create(
                keyboard=kb, parent=page, kind='ITEM', label=item.name, item=item,
                sort_order=(kb.keys.filter(parent=page).count()))
    else:
        kb.keys.filter(item=item).delete()
    return Response({'on': kb.keys.filter(item=item).exists()})


_keyboard_toggle_item.__name__ = 'toggle_item'
PosKeyboardViewSet.toggle_item = action(detail=True, methods=['post'])(_keyboard_toggle_item)


class TimeBandSlotSerializer(serializers.ModelSerializer):
    class Meta:
        model = TimeBandSlot
        fields = ('id', 'time_from', 'time_to')


class TimeBandSerializer(serializers.ModelSerializer):
    slots = TimeBandSlotSerializer(many=True, required=False)

    class Meta:
        model = TimeBand
        fields = '__all__'

    def _sync(self, band, slots):
        if slots is None:
            return
        band.slots.all().delete()
        for s in slots:
            s.pop('band', None)
            TimeBandSlot.objects.create(band=band, **s)

    def create(self, validated):
        slots = validated.pop('slots', [])
        band = TimeBand.objects.create(**validated)
        self._sync(band, slots)
        return band

    def update(self, instance, validated):
        slots = validated.pop('slots', None)
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        self._sync(instance, slots)
        return instance


class TimeBandViewSet(viewsets.ModelViewSet):
    """Faixas horárias — usadas nos relatórios, no happy hour e nos turnos."""
    permission_classes = [IsAuthenticated]
    queryset = TimeBand.objects.prefetch_related('slots')
    serializer_class = TimeBandSerializer


# ==========================================================================
# HORÁRIOS
# ==========================================================================
class ScheduleLineSerializer(serializers.ModelSerializer):
    band_name = serializers.CharField(source='band.name', read_only=True)
    band_color = serializers.CharField(source='band.color', read_only=True)
    weekday_display = serializers.CharField(source='get_weekday_display', read_only=True)

    class Meta:
        model = PosScheduleLine
        fields = ('id', 'weekday', 'weekday_display', 'band', 'band_name', 'band_color')


class PosScheduleSerializer(serializers.ModelSerializer):
    lines = ScheduleLineSerializer(many=True, required=False)

    class Meta:
        model = PosSchedule
        fields = '__all__'

    def _sync(self, sch, lines):
        if lines is None:
            return
        sch.lines.all().delete()
        for l in lines:
            l.pop('schedule', None)
            PosScheduleLine.objects.create(schedule=sch, weekday=l['weekday'], band_id=l['band'])

    def create(self, validated):
        lines = validated.pop('lines', [])
        sch = PosSchedule.objects.create(**validated)
        self._sync(sch, lines)
        return sch

    def update(self, instance, validated):
        lines = validated.pop('lines', None)
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        self._sync(instance, lines)
        return instance


class PosScheduleViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = PosSchedule.objects.prefetch_related('lines__band')
    serializer_class = PosScheduleSerializer


# ==========================================================================
# GRUPOS DE UTILIZADORES + PERMISSÕES
# ==========================================================================
class PosRightSerializer(serializers.ModelSerializer):
    class Meta:
        model = PosRight
        fields = ('id', 'number', 'name', 'parent', 'module', 'group')


class PosUserGroupSerializer(serializers.ModelSerializer):
    right_ids = serializers.PrimaryKeyRelatedField(source='rights', many=True,
                                                   queryset=PosRight.objects.all(), required=False)
    rights_count = serializers.IntegerField(source='rights.count', read_only=True)

    class Meta:
        model = PosUserGroup
        exclude = ('rights',)


class PosUserGroupViewSet(viewsets.ModelViewSet):
    """Grupos de utilizadores. As permissões dão-se ao GRUPO, não à pessoa."""
    permission_classes = [IsAuthenticated]
    queryset = PosUserGroup.objects.prefetch_related('rights')
    serializer_class = PosUserGroupSerializer

    @action(detail=False, methods=['get'])
    def rights_catalog(self, request):
        """A árvore de permissões numeradas + as funções do POS por separador."""
        rights = PosRight.objects.all()
        mod = request.query_params.get('module')
        if mod:
            rights = rights.filter(module=mod)
        return Response({
            'rights': PosRightSerializer(rights, many=True).data,
            'modules': sorted(set(PosRight.objects.values_list('module', flat=True))),
            # As caixas dos separadores da esquerda (funções concretas do terminal).
            'pos_tables': ['Estados de mesa', 'Consulta de Mesa', 'Pagamentos', 'Funções Parciais',
                           'Transferências', 'Documentos', 'Mapa de Refeições', 'Juntar mesas',
                           'Dividir conta', 'Abrir mesa', 'Anular mesa'],
            'pos_documents': ['Fatura Electrónica', 'Reimprimir', 'Imprimir modelo específico',
                              'Reimprimir A4', 'Listagem Documentos', 'Pré-visualizar', 'Anular',
                              'Nota de Crédito', 'Consulta de conta'],
            'pos_shortcuts': ['Pesquisa artigos', 'Alterar Quantidade', 'Mensagens', 'Ler cartão',
                              'Código QR', 'Conta - Ordenar', 'Desconto', 'Teclado táctil'],
            'data_protection': [
                {'code': '2000', 'name': 'Profile personal data',
                 'info': 'Ler ou escrever dados pessoais. Sem a permissão de leitura, os dados aparecem mascarados.'},
                {'code': '2005', 'name': 'Data protection settings', 'info': 'Aceder às definições de proteção de dados.'},
                {'code': '2010', 'name': 'Profile Consents', 'info': 'Ver os consentimentos dados pelo hóspede.'},
                {'code': '2025', 'name': 'Profile Data Portability', 'info': 'Exportar os dados pessoais do hóspede.'},
                {'code': '2030', 'name': 'Profile Logs', 'info': 'Ver quem consultou a ficha do hóspede.'},
            ],
        })


# ==========================================================================
# UTILIZADORES
# ==========================================================================
class CommissionSerializer(serializers.ModelSerializer):
    target = serializers.SerializerMethodField()
    code = serializers.SerializerMethodField()

    class Meta:
        model = PosUserCommission
        fields = ('id', 'subfamily', 'item', 'code', 'target', 'commission_type', 'value')

    def get_target(self, o):
        return o.item.name if o.item_id else (o.subfamily.name if o.subfamily_id else '—')

    def get_code(self, o):
        return o.item.code if o.item_id else (o.subfamily.code if o.subfamily_id else '')


class PosUserSerializer(serializers.ModelSerializer):
    commissions = CommissionSerializer(many=True, required=False)
    sector_ids = serializers.PrimaryKeyRelatedField(source='sectors', many=True,
                                                    queryset=PosSector.objects.all(), required=False)
    group_name = serializers.CharField(source='group.name', read_only=True, default=None)
    pos_group_name = serializers.CharField(source='pos_group.name', read_only=True, default=None)
    full_name = serializers.CharField(read_only=True)
    # A password NUNCA sai da API. Entra (write_only) e é logo transformada em hash.
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    pin = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = PosUser
        exclude = ('sectors', 'pos_pin', 'auth_user')

    def _apply_secrets(self, user, password, pin):
        from django.contrib.auth.hashers import make_password
        from django.contrib.auth.models import User
        from django.utils import timezone
        if password:
            # O utilizador do POS é também um utilizador do sistema — uma só identidade.
            au = user.auth_user or User.objects.filter(username=user.code).first()
            if not au:
                au = User.objects.create(username=user.code, email=user.email or '')
            au.set_password(password)
            au.email = user.email or au.email
            au.save()
            user.auth_user = au
            user.password_changed_at = timezone.now()
        if pin:
            user.pos_pin = make_password(pin)     # o PIN do terminal também é guardado em hash
        if password or pin:
            user.save()

    def create(self, validated):
        comms = validated.pop('commissions', [])
        sectors = validated.pop('sectors', [])
        pw = validated.pop('password', None)
        pin = validated.pop('pin', None)
        user = PosUser.objects.create(**validated)
        user.sectors.set(sectors)
        self._sync_commissions(user, comms)
        self._apply_secrets(user, pw, pin)
        return user

    def update(self, instance, validated):
        comms = validated.pop('commissions', None)
        sectors = validated.pop('sectors', None)
        pw = validated.pop('password', None)
        pin = validated.pop('pin', None)
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        if sectors is not None:
            instance.sectors.set(sectors)
        if comms is not None:
            self._sync_commissions(instance, comms)
        self._apply_secrets(instance, pw, pin)
        return instance

    def _sync_commissions(self, user, comms):
        user.commissions.all().delete()
        for c in comms:
            c.pop('user', None)
            PosUserCommission.objects.create(user=user, **c)


class PosUserViewSet(viewsets.ModelViewSet):
    """Utilizadores do POS. O nº de utilizadores é limitado pela LICENÇA."""
    permission_classes = [IsAuthenticated]
    serializer_class = PosUserSerializer

    def get_queryset(self):
        qs = (PosUser.objects.select_related('group', 'pos_group')
              .prefetch_related('sectors', 'commissions__item', 'commissions__subfamily'))
        st = self.request.query_params.get('status')
        if st == 'ACTIVE':
            qs = qs.filter(is_active=True, is_blocked=False)
        elif st == 'BLOCKED':
            qs = qs.filter(is_blocked=True)
        elif st == 'INACTIVE':
            qs = qs.filter(is_active=False)
        return qs

    def perform_create(self, serializer):
        from licensing.limits import enforce
        enforce('users')       # mais um utilizador do que os licenciados = recusado
        serializer.save()


# ==========================================================================
# TIPO R.H. / RECURSOS HUMANOS
# ==========================================================================
class HRTypeSerializer(serializers.ModelSerializer):
    resources_count = serializers.IntegerField(source='resources.count', read_only=True)

    class Meta:
        model = HRType
        fields = '__all__'


class HRTypeViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = HRTypeSerializer
    queryset = HRType.objects.all()

    def destroy(self, request, *a, **kw):
        # Nunca apagar um tipo que ainda tem pessoas: ficariam órfãs e o POS
        # deixava de saber a quem atribuir o serviço.
        obj = self.get_object()
        if obj.resources.exists():
            return Response(
                {'detail': f'Este tipo tem {obj.resources.count()} pessoa(s). Desative-o em vez de o apagar.'},
                status=409)
        return super().destroy(request, *a, **kw)


class HRScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = HRScheduleLine
        fields = ('id', 'weekday', 'time_from', 'time_to')


class HRCommissionSerializer(serializers.ModelSerializer):
    target = serializers.SerializerMethodField()
    code = serializers.SerializerMethodField()

    class Meta:
        model = HRCommission
        fields = ('id', 'subfamily', 'item', 'code', 'target', 'commission_type', 'value')

    def get_target(self, o):
        return o.item.name if o.item_id else (o.subfamily.name if o.subfamily_id else '—')

    def get_code(self, o):
        return o.item.code if o.item_id else (o.subfamily.code if o.subfamily_id else '')


class HumanResourceSerializer(serializers.ModelSerializer):
    schedule = HRScheduleSerializer(many=True, required=False)
    commissions = HRCommissionSerializer(many=True, required=False)
    service_ids = serializers.PrimaryKeyRelatedField(
        source='services', many=True, required=False,
        queryset=__import__('inventory.models', fromlist=['Item']).Item.objects.all())
    type_name = serializers.CharField(source='hr_type.name', read_only=True, default=None)
    space_name = serializers.CharField(source='space.name', read_only=True, default=None)
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = HumanResource
        exclude = ('services',)

    def _sync(self, obj, schedule, comms, services):
        if services is not None:
            obj.services.set(services)
        if schedule is not None:
            obj.schedule.all().delete()
            for s in schedule:
                s.pop('resource', None)
                HRScheduleLine.objects.create(resource=obj, **s)
        if comms is not None:
            obj.commissions.all().delete()
            for c in comms:
                c.pop('resource', None)
                HRCommission.objects.create(resource=obj, **c)

    def create(self, validated):
        sch = validated.pop('schedule', [])
        com = validated.pop('commissions', [])
        srv = validated.pop('services', [])
        obj = HumanResource.objects.create(**validated)
        self._sync(obj, sch, com, srv)
        return obj

    def update(self, instance, validated):
        sch = validated.pop('schedule', None)
        com = validated.pop('commissions', None)
        srv = validated.pop('services', None)
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        self._sync(instance, sch, com, srv)
        return instance


class HumanResourceViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = HumanResourceSerializer

    def get_queryset(self):
        qs = (HumanResource.objects.select_related('hr_type', 'space')
              .prefetch_related('services', 'schedule',
                                'commissions__item', 'commissions__subfamily'))
        t = self.request.query_params.get('hr_type')
        if t:
            qs = qs.filter(hr_type_id=t)
        return qs


# ==========================================================================
# FINANCEIRO — MOEDAS
# ==========================================================================
class CurrencyHistorySerializer(serializers.ModelSerializer):
    class Meta:
        from mdm.models import CurrencyRateHistory as _H
        model = _H
        fields = ('id', 'changed_at', 'changed_by', 'code', 'name',
                  'rate_to_base', 'buy_rate', 'sell_rate', 'is_active')


class PosCurrencySerializer(serializers.ModelSerializer):
    margin_charge_name = serializers.CharField(source='margin_charge.name', read_only=True, default=None)
    commission_charge_name = serializers.CharField(source='commission_charge.name', read_only=True, default=None)

    class Meta:
        from mdm.models import Currency as _C
        model = _C
        fields = '__all__'

    def _snapshot(self, obj):
        """Cada gravação deixa rasto — é o que responde 'com que taxa foi convertida
        aquela fatura de Novembro?' numa auditoria."""
        from mdm.models import CurrencyRateHistory
        req = self.context.get('request')
        who = getattr(getattr(req, 'user', None), 'username', None) or 'sistema'
        CurrencyRateHistory.objects.create(
            currency=obj, changed_by=who, code=obj.code, name=obj.name,
            rate_to_base=obj.rate_to_base, buy_rate=obj.buy_rate,
            sell_rate=obj.sell_rate, is_active=obj.is_active)

    def create(self, validated):
        obj = super().create(validated)
        self._snapshot(obj)
        return obj

    def update(self, instance, validated):
        obj = super().update(instance, validated)
        self._snapshot(obj)
        return obj


class PosCurrencyViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PosCurrencySerializer

    def get_queryset(self):
        from mdm.models import Currency
        return Currency.objects.select_related('margin_charge', 'commission_charge')

    def destroy(self, request, *a, **kw):
        obj = self.get_object()
        if obj.is_local:
            return Response({'detail': 'A moeda local não pode ser apagada — é nela que a contabilidade fecha.'},
                            status=409)
        return super().destroy(request, *a, **kw)

    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        """Histórico de taxas desta moeda. Só de leitura — não se apaga pelo ecrã."""
        return Response(CurrencyHistorySerializer(self.get_object().history.all(), many=True).data)


# ==========================================================================
# FINANCEIRO — DESCONTOS e IMPOSTOS
# ==========================================================================
class PosDiscountSerializer(serializers.ModelSerializer):
    group_ids = serializers.PrimaryKeyRelatedField(source='user_groups', many=True, required=False,
                                                   queryset=PosUserGroup.objects.all())
    item_ids = serializers.PrimaryKeyRelatedField(
        source='items', many=True, required=False,
        queryset=__import__('inventory.models', fromlist=['Item']).Item.objects.all())
    base_display = serializers.CharField(source='get_base_display', read_only=True)

    class Meta:
        model = PosDiscount
        exclude = ('user_groups', 'items')


class PosDiscountViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PosDiscountSerializer

    def get_queryset(self):
        return PosDiscount.objects.prefetch_related('user_groups', 'items')

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        """Copiar — 22 descontos iguais só mudam no valor; não se escrevem à mão."""
        src = self.get_object()
        novo = PosDiscount.objects.create(
            number=src.number, code=f'{src.code}-COPIA'[:40], name=f'{src.name} (cópia)',
            base=src.base, value=src.value, valid_from=src.valid_from, valid_to=src.valid_to,
            for_pms=src.for_pms, for_ems=src.for_ems, for_pos=src.for_pos,
            allow_manual=src.allow_manual, calc_mode=src.calc_mode, calc_base=src.calc_base,
            set_nights=src.set_nights, stay_nights=src.stay_nights, paid_nights=src.paid_nights,
            use_intervals=src.use_intervals, is_active=src.is_active)
        novo.user_groups.set(src.user_groups.all())
        novo.items.set(src.items.all())
        return Response(PosDiscountSerializer(novo).data, status=201)


class TaxVersionSerializer(serializers.ModelSerializer):
    class Meta:
        from fiscal.models import TaxRateVersion as _V
        model = _V
        fields = ('id', 'valid_from', 'valid_to', 'percentage')


class PosTaxSerializer(serializers.ModelSerializer):
    versions = TaxVersionSerializer(many=True, required=False)
    current_rate = serializers.SerializerMethodField()

    class Meta:
        from fiscal.models import TaxRate as _T
        model = _T
        fields = ('id', 'code', 'name', 'tax_type', 'percentage', 'accounting_account', 'tax_class',
                  'is_default', 'is_exempt', 'is_active', 'versions', 'current_rate')

    def get_current_rate(self, o):
        return o.rate_on()

    def _sync(self, obj, versions):
        from fiscal.models import TaxRateVersion
        if versions is None:
            return
        obj.versions.all().delete()
        for v in versions:
            v.pop('tax_rate', None)
            TaxRateVersion.objects.create(tax_rate=obj, **v)

    def create(self, validated):
        vs = validated.pop('versions', [])
        from fiscal.models import TaxRate
        obj = TaxRate.objects.create(**validated)
        self._sync(obj, vs)
        return obj

    def update(self, instance, validated):
        vs = validated.pop('versions', None)
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        self._sync(instance, vs)
        return instance


class PosTaxViewSet(viewsets.ModelViewSet):
    """IMPOSTOS — a MESMA taxa que o motor fiscal usa na fatura (fiscal.TaxRate).
    Não é um cadastro paralelo: mexer aqui muda o IVA que sai no documento."""
    permission_classes = [IsAuthenticated]
    serializer_class = PosTaxSerializer

    def get_queryset(self):
        from fiscal.models import TaxRate
        return TaxRate.objects.prefetch_related('versions')

    def destroy(self, request, *a, **kw):
        from inventory.models import Item
        obj = self.get_object()
        usados = Item.objects.filter(tax_percentage=obj.percentage).count()
        if usados:
            return Response({'detail': f'{usados} artigo(s) usam esta taxa. Desative-a em vez de a apagar '
                                       f'— apagá-la deixava faturas antigas sem imposto.'}, status=409)
        return super().destroy(request, *a, **kw)


# ==========================================================================
# FINANCEIRO — ISENÇÕES IVA e MODOS DE PAGAMENTO
# ==========================================================================
class ExemptionSerializer(serializers.ModelSerializer):
    class Meta:
        from fiscal.models import TaxExemptionReason as _E
        model = _E
        fields = ('id', 'code', 'text', 'description', 'is_active')


class ExemptionViewSet(viewsets.ModelViewSet):
    """ISENÇÕES DE IVA — o texto legal que sai na fatura e vai no SAF-T.

    Editar isto é mexer no que a AGT lê. Por isso o ecrã pede a password: não é
    teatro — é o servidor que a confirma (`verify_password`) antes de deixar abrir
    a ficha, e a alteração fica na auditoria com o nome de quem a fez.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = ExemptionSerializer

    def get_queryset(self):
        from fiscal.models import TaxExemptionReason
        return TaxExemptionReason.objects.all()

    @action(detail=False, methods=['post'])
    def verify_password(self, request):
        """Confirma a password de QUEM está a mexer. Nunca a devolve, só diz sim/não."""
        pw = request.data.get('password') or ''
        ok = request.user.is_authenticated and request.user.check_password(pw)
        if not ok:
            return Response({'detail': 'Password incorreta.'}, status=403)
        return Response({'ok': True})


class PosPaymentMethodSerializer(serializers.ModelSerializer):
    tip_item_name = serializers.CharField(source='tip_item.name', read_only=True, default=None)
    internal_item_name = serializers.CharField(source='internal_item.name', read_only=True, default=None)
    document_display = serializers.CharField(source='get_document_type_display', read_only=True)

    class Meta:
        from mdm.models import PaymentMethod as _P
        model = _P
        fields = '__all__'


class PosPaymentMethodViewSet(viewsets.ModelViewSet):
    """MODOS DE PAGAMENTO — o mesmo cadastro que o POS usa a pagar (mdm.PaymentMethod).
    Cada caixa desta ficha muda o pagamento no servidor (ver pos/views.pay)."""
    permission_classes = [IsAuthenticated]
    serializer_class = PosPaymentMethodSerializer

    def get_queryset(self):
        from mdm.models import PaymentMethod
        return PaymentMethod.objects.select_related('tip_item', 'internal_item')

    def destroy(self, request, *a, **kw):
        obj = self.get_object()
        from .models import POSTicketPayment
        usados = POSTicketPayment.objects.filter(payment_method=obj).count()
        if usados:
            return Response({'detail': f'{usados} pagamento(s) já foram feitos com "{obj.name}". '
                                       f'Desative-o em vez de o apagar — apagá-lo deixava vendas sem meio de pagamento.'},
                            status=409)
        return super().destroy(request, *a, **kw)

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        from mdm.models import PaymentMethod
        src = self.get_object()
        src.pk = None
        src.code = f'{src.code}-C'[:20]
        src.name = f'{src.name} (cópia)'
        src.save()
        return Response(PosPaymentMethodSerializer(src).data, status=201)


# ==========================================================================
# FINANCEIRO — DOCUMENTOS (séries fiscais)
# ==========================================================================
class PrintModelSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)

    class Meta:
        from fiscal.models import DocPrintModel as _M
        model = _M
        fields = ('id', 'kind', 'kind_display', 'code', 'description', 'model_name',
                  'copies', 'max_copies', 'sort_order', 'is_default', 'is_active')


class DocumentSeriesSerializer(serializers.ModelSerializer):
    """A SÉRIE FISCAL — a única numeração do sistema.

    É a mesma que assina, encadeia por hash e vai no SAF-T. Não há uma "série do POS"
    à parte: se houvesse, sairiam documentos com número que a AGT não reconhece.
    """
    print_models = PrintModelSerializer(many=True, required=False)
    type_code = serializers.CharField(source='doc_type.code', read_only=True)
    type_name = serializers.CharField(source='doc_type.name', read_only=True)

    class Meta:
        from fiscal.models import FiscalSeries as _S
        model = _S
        fields = '__all__'
        # O que a série JÁ emitiu não se reescreve pelo ecrã: mexer no contador
        # partia a sequência (e a sequência é o que a AGT confere).
        read_only_fields = ('current_number', 'key_version', 'certified', 'environment')

    def _sync(self, obj, models_):
        from fiscal.models import DocPrintModel
        if models_ is None:
            return
        obj.print_models.all().delete()
        for m in models_:
            m.pop('series', None)
            DocPrintModel.objects.create(series=obj, **m)

    def create(self, validated):
        pm = validated.pop('print_models', [])
        from fiscal.models import FiscalSeries
        obj = FiscalSeries.objects.create(**validated)
        self._sync(obj, pm)
        return obj

    def update(self, instance, validated):
        pm = validated.pop('print_models', None)
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        self._sync(instance, pm)
        return instance


class DocumentSeriesViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = DocumentSeriesSerializer

    def get_queryset(self):
        from fiscal.models import FiscalSeries
        return FiscalSeries.objects.select_related('doc_type').prefetch_related('print_models')

    def destroy(self, request, *a, **kw):
        # Uma série com documentos emitidos NUNCA se apaga: apagá-la deixava faturas
        # órfãs e um buraco na sequência — que é exatamente o que a AGT procura.
        from fiscal.models import FiscalDocument
        obj = self.get_object()
        n = FiscalDocument.objects.filter(series=obj).count()
        if n:
            return Response({'detail': f'A série {obj.code} já emitiu {n} documento(s). '
                                       f'Feche-a ("Série fechada") em vez de a apagar.'}, status=409)
        return super().destroy(request, *a, **kw)

    @action(detail=False, methods=['get'])
    def doc_types(self, request):
        """Os tipos de documento (FR, FT, NC, Talão…) — regras fiscais, não escolhas."""
        from fiscal.models import FiscalDocType
        return Response([{
            'id': t.id, 'code': t.code, 'name': t.name, 'saft_type': t.saft_type,
            'signable': t.signable, 'is_rectifying': t.is_rectifying, 'is_active': t.is_active,
        } for t in FiscalDocType.objects.all()])

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        from fiscal.models import FiscalSeries
        src = self.get_object()
        novo = FiscalSeries.objects.create(
            code=f'{src.code}-C'[:20], doc_type=src.doc_type, year=src.year, prefix=src.prefix,
            name=f'{src.name or src.doc_type.name} (cópia)', current_number=0,
            establishment=src.establishment, is_active=src.is_active,
            copy_texts=src.copy_texts, start_date=src.start_date)
        for m in src.print_models.all():
            m.pk = None
            m.series = novo
            m.save()
        return Response(DocumentSeriesSerializer(novo).data, status=201)


# ==========================================================================
# FINANCEIRO — CONTA ANALÍTICA
# ==========================================================================
class AnalyticAccountSerializer(serializers.ModelSerializer):
    class Meta:
        from accounting.models import AnalyticAccount as _A
        model = _A
        fields = ('id', 'code', 'name', 'is_active')


class AnalyticAccountViewSet(viewsets.ModelViewSet):
    """CONTAS ANALÍTICAS — os centros de custo (Restaurante, Bar, Spa…).

    Não são um cadastro decorativo: no fecho do POS, a receita é REPARTIDA por elas
    (`cost_center` do lançamento). É o que responde a "quanto ganhou o bar este mês?".
    """
    permission_classes = [IsAuthenticated]
    serializer_class = AnalyticAccountSerializer

    def get_queryset(self):
        from accounting.models import AnalyticAccount
        return AnalyticAccount.objects.all()

    def destroy(self, request, *a, **kw):
        from accounting.models import JournalEntryLine
        from inventory.models import Item
        obj = self.get_object()
        usada = JournalEntryLine.objects.filter(cost_center=obj.code).count()
        artigos = Item.objects.filter(analytic_account_sale=obj.code).count()
        if usada or artigos:
            return Response({'detail': f'"{obj.name}" está em uso ({usada} lançamento(s), {artigos} artigo(s)). '
                                       f'Desative-a em vez de a apagar — apagá-la partia os relatórios por centro de custo.'},
                            status=409)
        return super().destroy(request, *a, **kw)


# ==========================================================================
# OUTROS — INTERFACE COM PMS
# ==========================================================================
def _test_tcp(host, port=1433, timeout=3):
    """Testa a ligação A SÉRIO (TCP ao servidor). Não devolve um 'OK' de mentira:
    se o servidor não responder, diz-se que não responde."""
    import socket
    if not host:
        return False, 'Sem servidor indicado.'
    host = host.strip()
    if ',' in host:
        host, _, p = host.partition(',')
        try:
            port = int(p)
        except ValueError:
            pass
    try:
        with socket.create_connection((host.strip(), port), timeout=timeout):
            return True, f'Servidor {host}:{port} respondeu.'
    except Exception as e:
        return False, f'Sem resposta de {host}:{port} — {e}'


class PmsSectorSerializer(serializers.ModelSerializer):
    class Meta:
        model = PosSector
        fields = ('id', 'code', 'name', 'pms_department', 'pms_default_account',
                  'pms_paymaster', 'pms_visible')


class PmsHotelLinkSerializer(serializers.ModelSerializer):
    # A password entra, fica guardada e NUNCA volta a sair pela API.
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    has_password = serializers.SerializerMethodField()

    class Meta:
        model = PmsHotelLink
        fields = '__all__'
        read_only_fields = ('last_test_at', 'last_test_ok', 'last_test_detail')

    def get_has_password(self, o):
        return bool(o.password)


class PmsHotelLinkViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PmsHotelLinkSerializer
    queryset = PmsHotelLink.objects.all()

    @action(detail=True, methods=['post'])
    def test(self, request, pk=None):
        from django.utils import timezone
        link = self.get_object()
        ok, detail = _test_tcp(link.server)
        link.last_test_ok, link.last_test_detail, link.last_test_at = ok, detail[:250], timezone.now()
        link.save(update_fields=['last_test_ok', 'last_test_detail', 'last_test_at'])
        return Response({'ok': ok, 'detail': detail})


class PmsExternalLinkSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    has_password = serializers.SerializerMethodField()
    sector_name = serializers.CharField(source='sector.name', read_only=True)
    status = serializers.SerializerMethodField()

    class Meta:
        model = PmsExternalLink
        fields = '__all__'
        read_only_fields = ('last_test_at', 'last_test_ok', 'last_test_detail')

    def get_has_password(self, o):
        return bool(o.password)

    def get_status(self, o):
        if not o.last_test_at:
            return 'Desconhecido'
        return 'Ligado' if o.last_test_ok else 'Sem resposta'


class PmsExternalLinkViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PmsExternalLinkSerializer

    def get_queryset(self):
        return PmsExternalLink.objects.select_related('sector')

    @action(detail=False, methods=['get'])
    def by_sector(self, request):
        """Um setor sem ligação ainda não tem registo: cria-o vazio para aparecer na lista."""
        for s in PosSector.objects.filter(is_active=True):
            PmsExternalLink.objects.get_or_create(sector=s)
        return Response(PmsExternalLinkSerializer(self.get_queryset(), many=True).data)

    @action(detail=True, methods=['post'])
    def test(self, request, pk=None):
        from django.utils import timezone
        link = self.get_object()
        ok, detail = _test_tcp(link.server)
        link.last_test_ok, link.last_test_detail, link.last_test_at = ok, detail[:250], timezone.now()
        link.save(update_fields=['last_test_ok', 'last_test_detail', 'last_test_at'])
        return Response({'ok': ok, 'detail': detail, 'status': 'Ligado' if ok else 'Sem resposta'})


class PmsMappingView(APIView):
    """MAPEAMENTOS — a matriz sub-família x ponto de venda.

    Diz com que ENCARGO o consumo entra no folio do quarto. As mesmas águas lançadas
    no Restaurante entram como REST_BEB_N; no Bar, como BAR_BEB_NA. Sem isto, o
    consumo do hóspede entra no encargo errado — e leva a taxa errada.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from inventory.models import ItemSubFamily, SubFamilyMapping
        outlets = list(Outlet.objects.filter(is_active=True).order_by('name'))
        mapas = {(m.subfamily_id, m.outlet_id): m for m in SubFamilyMapping.objects.all()}
        linhas = []
        for sf in ItemSubFamily.objects.order_by('code'):
            cells = {}
            for o in outlets:
                m = mapas.get((sf.id, o.id))
                cells[str(o.id)] = {
                    'charge': m.pms_charge_code if m else None,
                    'tax': str(m.pms_charge_tax) if (m and m.pms_charge_tax is not None) else None,
                }
            linhas.append({
                'id': sf.id, 'code': sf.code, 'name': sf.name, 'cells': cells,
                # Sem encargo nalgum ponto de venda, o lançamento no quarto vai falhar lá.
                'incomplete': any(not c['charge'] for c in cells.values()),
            })
        return Response({
            'outlets': [{'id': o.id, 'name': o.name} for o in outlets],
            'sectors': PmsSectorSerializer(PosSector.objects.filter(is_active=True), many=True).data,
            'rows': linhas,
        })

    def post(self, request):
        """Grava os setores e as células alteradas (ou aplica um encargo à seleção)."""
        from inventory.models import SubFamilyMapping
        for s in request.data.get('sectors', []):
            PosSector.objects.filter(pk=s.get('id')).update(
                pms_department=s.get('pms_department') or None,
                pms_default_account=s.get('pms_default_account') or None,
                pms_paymaster=s.get('pms_paymaster') or None,
                pms_visible=bool(s.get('pms_visible')))
        n = 0
        for c in request.data.get('cells', []):
            SubFamilyMapping.objects.update_or_create(
                subfamily_id=c['subfamily'], outlet_id=c['outlet'],
                defaults={'pms_charge_code': c.get('charge') or None,
                          'pms_charge_tax': c.get('tax') or None})
            n += 1
        return Response({'saved': n})


# ==========================================================================
# OUTROS — STOCKS (ERP externo), UNIDADES, HAPPY HOUR, MOTIVOS DE ANULAÇÃO
# ==========================================================================
class StockErpLinkSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    has_password = serializers.SerializerMethodField()

    class Meta:
        from .models import StockErpLink as _L
        model = _L
        fields = '__all__'
        read_only_fields = ('last_sync_at', 'last_test_at', 'last_test_ok', 'last_test_detail')

    def get_has_password(self, o):
        return bool(o.password)


class StockErpLinkViewSet(viewsets.ModelViewSet):
    """Ligação a um ERP externo de stocks. DESLIGADA, manda o motor de stock interno."""
    permission_classes = [IsAuthenticated]
    serializer_class = StockErpLinkSerializer

    def get_queryset(self):
        from .models import StockErpLink
        return StockErpLink.objects.all()

    @action(detail=False, methods=['get'])
    def current(self, request):
        from .models import StockErpLink
        obj, _ = StockErpLink.objects.get_or_create(pk=1, defaults={'name': 'ERP Externo'})
        return Response(StockErpLinkSerializer(obj).data)

    @action(detail=True, methods=['post'])
    def test(self, request, pk=None):
        """Testa a ligação A SÉRIO: chama o URL. Não devolve um 'OK' de conforto."""
        import urllib.request
        from django.utils import timezone
        link = self.get_object()
        if not link.url:
            return Response({'ok': False, 'detail': 'Sem URL indicado.'})
        try:
            with urllib.request.urlopen(link.url, timeout=5) as r:
                ok, detail = True, f'{link.url} respondeu (HTTP {r.status}).'
        except Exception as e:
            ok, detail = False, f'Sem resposta de {link.url} — {e}'
        link.last_test_ok, link.last_test_detail, link.last_test_at = ok, detail[:250], timezone.now()
        link.save(update_fields=['last_test_ok', 'last_test_detail', 'last_test_at'])
        return Response({'ok': ok, 'detail': detail})

    @action(detail=True, methods=['post'])
    def sync(self, request, pk=None):
        """Stocks - Atualizar. Sem ligação ativa, não inventa: diz que não está ligado."""
        link = self.get_object()
        if not link.is_active:
            return Response({'detail': 'A interface está desligada — o stock é gerido pelo motor interno '
                                       'do sistema. Ligue-a só se a verdade do stock estiver no ERP externo.'},
                            status=400)
        if not link.url:
            return Response({'detail': 'Sem URL do ERP. Preencha a ligação e teste-a primeiro.'}, status=400)
        return Response({'detail': 'Ligação configurada mas ainda sem conector para este ERP. '
                                   'Diga-me qual é (Primavera, SAP, Sage) e escrevo o conector.'},
                        status=501)


class UomConversionSerializer(serializers.ModelSerializer):
    to_code = serializers.CharField(source='to_uom.code', read_only=True)
    to_name = serializers.CharField(source='to_uom.name', read_only=True)

    class Meta:
        from inventory.models import UomConversion as _C
        model = _C
        fields = ('id', 'to_uom', 'to_code', 'to_name', 'factor')


class UomSerializer(serializers.ModelSerializer):
    conversions = UomConversionSerializer(many=True, required=False)

    class Meta:
        from inventory.models import UnitOfMeasure as _U
        model = _U
        fields = ('id', 'code', 'name', 'rounding', 'is_active', 'conversions')

    def _sync(self, obj, convs):
        from inventory.models import UomConversion
        if convs is None:
            return
        obj.conversions.all().delete()
        for c in convs:
            c.pop('uom', None)
            UomConversion.objects.create(uom=obj, **c)

    def create(self, validated):
        cs = validated.pop('conversions', [])
        from inventory.models import UnitOfMeasure
        obj = UnitOfMeasure.objects.create(**validated)
        self._sync(obj, cs)
        return obj

    def update(self, instance, validated):
        cs = validated.pop('conversions', None)
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        self._sync(instance, cs)
        return instance


class UomViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = UomSerializer

    def get_queryset(self):
        from inventory.models import UnitOfMeasure
        return UnitOfMeasure.objects.prefetch_related('conversions__to_uom')

    def destroy(self, request, *a, **kw):
        from inventory.models import Item
        obj = self.get_object()
        n = Item.objects.filter(models.Q(purchase_uom=obj) | models.Q(stock_uom=obj) | models.Q(sale_uom=obj)).count()
        if n:
            return Response({'detail': f'{n} artigo(s) usam "{obj.name}". Desative-a em vez de a apagar.'},
                            status=409)
        return super().destroy(request, *a, **kw)


class HappyHourSerializer(serializers.ModelSerializer):
    active_now = serializers.SerializerMethodField()

    class Meta:
        from .models import HappyHour as _H
        model = _H
        fields = '__all__'

    def get_active_now(self, o):
        return o.value_now()


class HappyHourViewSet(viewsets.ModelViewSet):
    """HAPPY HOUR — a grelha hora × dia que MUDA O PREÇO no terminal, sozinha."""
    permission_classes = [IsAuthenticated]
    serializer_class = HappyHourSerializer

    def get_queryset(self):
        from .models import HappyHour
        return HappyHour.objects.all()


class VoidReasonSerializer(serializers.ModelSerializer):
    class Meta:
        from .models import VoidReason as _V
        model = _V
        fields = '__all__'


class VoidReasonViewSet(viewsets.ModelViewSet):
    """MOTIVOS DE ANULAÇÃO — sem eles, o relatório de anulações não explica nada."""
    permission_classes = [IsAuthenticated]
    serializer_class = VoidReasonSerializer

    def get_queryset(self):
        from .models import VoidReason
        return VoidReason.objects.all()


# ==========================================================================
# OUTROS — HARDWARE
# ==========================================================================
class PosHardwareSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source='get_hw_type_display', read_only=True)

    class Meta:
        from .models import PosHardware as _H
        model = _H
        fields = '__all__'


class PosHardwareViewSet(viewsets.ModelViewSet):
    """Catálogo de aparelhos: impressoras, gavetas, balanças, TPA, monitores."""
    permission_classes = [IsAuthenticated]
    serializer_class = PosHardwareSerializer

    def get_queryset(self):
        from .models import PosHardware
        qs = PosHardware.objects.all()
        t = self.request.query_params.get('hw_type')
        return qs.filter(hw_type=t) if t else qs

    def destroy(self, request, *a, **kw):
        from inventory.models import Printer
        obj = self.get_object()
        n = Printer.objects.filter(device=obj).count()
        if n:
            return Response({'detail': f'{n} impressora(s) usam "{obj.name}". '
                                       f'Desative-o em vez de o apagar.'}, status=409)
        return super().destroy(request, *a, **kw)


# ==========================================================================
# OUTROS — MONITORES DE COZINHA
# ==========================================================================
class KdsMonitorSerializer(serializers.ModelSerializer):
    printer_ids = serializers.PrimaryKeyRelatedField(
        source='printers', many=True, required=False,
        queryset=__import__('inventory.models', fromlist=['Printer']).Printer.objects.all())
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)
    station_display = serializers.CharField(source='get_station_display', read_only=True)
    buttons_label = serializers.SerializerMethodField()

    class Meta:
        from .models import KdsMonitor as _M
        model = _M
        exclude = ('printers',)

    def get_buttons_label(self, o):
        nomes = {'PRODUCTION': 'Produção', 'FINISHED': 'Finalizado',
                 'DELIVERED': 'Entregue', 'PRINT': 'Imprimir'}
        return ', '.join(nomes.get(b, b) for b in (o.buttons or []))


class KdsMonitorViewSet(viewsets.ModelViewSet):
    """Monitores de cozinha. O ecrã do cozinheiro lê daqui a sua configuração."""
    permission_classes = [IsAuthenticated]
    serializer_class = KdsMonitorSerializer

    def get_queryset(self):
        from .models import KdsMonitor
        qs = KdsMonitor.objects.prefetch_related('printers')
        st = self.request.query_params.get('station')
        return qs.filter(station=st, is_active=True) if st else qs


# ==========================================================================
# OUTROS — CAIXA INTELIGENTE, TIPOS DE CLIENTE, CAMPOS PERSONALIZADOS
# ==========================================================================
class SmartCashSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    has_password = serializers.SerializerMethodField()
    type_display = serializers.CharField(source='get_device_type_display', read_only=True)

    class Meta:
        from .models import SmartCash as _S
        model = _S
        fields = '__all__'
        read_only_fields = ('last_test_at', 'last_test_ok', 'last_test_detail')

    def get_has_password(self, o):
        return bool(o.password)


class SmartCashViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = SmartCashSerializer

    def get_queryset(self):
        from .models import SmartCash
        return SmartCash.objects.all()

    @action(detail=True, methods=['post'])
    def test(self, request, pk=None):
        """Testa a máquina A SÉRIO: chama a URL de operações."""
        import urllib.request
        from django.utils import timezone
        m = self.get_object()
        if not m.url_operations:
            return Response({'ok': False, 'detail': 'Sem URL de operações.'})
        try:
            with urllib.request.urlopen(m.url_operations, timeout=5) as r:
                ok, detail = True, f'A máquina respondeu (HTTP {r.status}).'
        except Exception as e:
            ok, detail = False, f'Sem resposta de {m.url_operations} — {e}'
        m.last_test_ok, m.last_test_detail, m.last_test_at = ok, detail[:250], timezone.now()
        m.save(update_fields=['last_test_ok', 'last_test_detail', 'last_test_at'])
        return Response({'ok': ok, 'detail': detail})


class CustomerTypeSerializer(serializers.ModelSerializer):
    class Meta:
        from .models import CustomerType as _C
        model = _C
        fields = '__all__'


class CustomerTypeViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = CustomerTypeSerializer

    def get_queryset(self):
        from .models import CustomerType
        return CustomerType.objects.all()


class CustomFieldSerializer(serializers.ModelSerializer):
    location_display = serializers.CharField(source='get_location_display', read_only=True)
    type_display = serializers.CharField(source='get_field_type_display', read_only=True)

    class Meta:
        from .models import CustomFieldDef as _F
        model = _F
        fields = '__all__'

    def validate_regex(self, v):
        # Um regex inválido guardado aqui rebentava a validação de TODOS os formulários
        # onde o campo aparece. Valida-se aqui, uma vez, e não em cada ecrã.
        import re
        if v:
            try:
                re.compile(v)
            except re.error as e:
                raise serializers.ValidationError(f'Expressão de validação inválida: {e}')
        return v


class CustomFieldViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = CustomFieldSerializer

    def get_queryset(self):
        from .models import CustomFieldDef
        qs = CustomFieldDef.objects.all()
        loc = self.request.query_params.get('location')
        return qs.filter(location=loc, is_active=True) if loc else qs


# ==========================================================================
# CARTÕES — TIPOS DE CARTÃO
# ==========================================================================
class CardTypeSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source='get_card_kind_display', read_only=True)

    class Meta:
        from .models import CardType as _C
        model = _C
        fields = '__all__'


class CardTypeViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = CardTypeSerializer

    def get_queryset(self):
        from .models import CardType
        return CardType.objects.all()

    @action(detail=True, methods=['post'])
    def test_read(self, request, pk=None):
        """TESTAR A LEITURA — passa-se uma pista e vê-se que número sai.

        É o que evita a instalação às cegas: o técnico encosta o cartão, cola aqui
        o que o leitor devolveu, e vê logo se as marcas e a posição estão certas.
        """
        t = self.get_object()
        numero, erro = t.read(request.data.get('raw') or '')
        return Response({'ok': not erro, 'number': numero, 'detail': erro or f'Número lido: {numero}'})


# ==========================================================================
# CARTÕES — CARTÕES DE MEMBRO
# ==========================================================================
class MemberCardDiscountSerializer(serializers.ModelSerializer):
    code = serializers.SerializerMethodField()
    target = serializers.SerializerMethodField()
    family = serializers.SerializerMethodField()
    subfamily_name = serializers.SerializerMethodField()

    class Meta:
        from .models import MemberCardDiscount as _D
        model = _D
        fields = ('id', 'item', 'subfamily', 'code', 'target', 'family',
                  'subfamily_name', 'discount_percent')

    def get_code(self, o):
        return o.item.code if o.item_id else (o.subfamily.code if o.subfamily_id else '')

    def get_target(self, o):
        return o.item.name if o.item_id else (o.subfamily.name if o.subfamily_id else '—')

    def get_family(self, o):
        sf = o.item.subfamily if o.item_id else o.subfamily
        return sf.family.name if (sf and sf.family_id) else ''

    def get_subfamily_name(self, o):
        return o.item.subfamily.name if (o.item_id and o.item.subfamily_id) else (
            o.subfamily.name if o.subfamily_id else '')


class MemberCardSerializer(serializers.ModelSerializer):
    discounts = MemberCardDiscountSerializer(many=True, required=False)
    package_ids = serializers.PrimaryKeyRelatedField(
        source='packages', many=True, required=False,
        queryset=__import__('inventory.models', fromlist=['Item']).Item.objects.all())
    packages_label = serializers.SerializerMethodField()
    happy_hour_name = serializers.CharField(source='happy_hour.name', read_only=True, default=None)

    class Meta:
        from .models import MemberCard as _M
        model = _M
        exclude = ('packages',)

    def get_packages_label(self, o):
        n = o.packages.count()
        return f'{n} artigo(s)' if n else ''

    def _sync(self, obj, descontos, pacotes):
        from .models import MemberCardDiscount
        if pacotes is not None:
            obj.packages.set(pacotes)
        if descontos is not None:
            obj.discounts.all().delete()
            for d in descontos:
                d.pop('card', None)
                MemberCardDiscount.objects.create(card=obj, **d)

    def create(self, validated):
        from .models import MemberCard
        ds = validated.pop('discounts', [])
        ps = validated.pop('packages', [])
        obj = MemberCard.objects.create(**validated)
        self._sync(obj, ds, ps)
        return obj

    def update(self, instance, validated):
        ds = validated.pop('discounts', None)
        ps = validated.pop('packages', None)
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        self._sync(instance, ds, ps)
        return instance


class MemberCardViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = MemberCardSerializer

    def get_queryset(self):
        from .models import MemberCard
        return MemberCard.objects.prefetch_related('packages', 'discounts__item', 'discounts__subfamily')

    @action(detail=True, methods=['post'])
    def simulate(self, request, pk=None):
        """SIMULAR — o que é que este cartão faz a um artigo, aqui e agora.

        Responde ao que o balcão pergunta: "o cliente tem o cartão All Inclusive;
        esta cerveja fica a quanto?".
        """
        from decimal import Decimal
        from inventory.models import Item
        card = self.get_object()
        item = Item.objects.filter(pk=request.data.get('item')).first()
        if not item:
            return Response({'detail': 'Artigo inválido.'}, status=400)

        base = Decimal(str(item.sale_price or 0))
        incluido = card.packages.filter(pk=item.pk).exists()
        desc = card.discount_for(item)
        happy = card.happy_hour.value_now() if card.happy_hour_id else None

        if incluido:
            final, porque = Decimal('0'), f'Incluído no pacote "{card.name}".'
        elif desc:
            final = (base - base * desc / Decimal('100')).quantize(Decimal('0.01'))
            porque = f'Desconto de cartão: {desc}%.'
        else:
            final, porque = base, 'O cartão não mexe no preço deste artigo.'

        return Response({
            'item': item.name, 'base_price': str(base), 'final_price': str(final),
            'in_package': incluido, 'discount_percent': str(desc),
            'happy_hour_now': happy, 'detail': porque,
        })
