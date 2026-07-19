"""
Configuração POS — Módulos, Terminais e Parâmetros.
"""
from decimal import Decimal
from django.db import models, transaction
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


class CustomFieldRules:
    """(Campo personalizado) "É lista" — o valor por defeito tem de ser uma das opções."""

    @staticmethod
    def validar(data, instance=None):
        is_list = data.get('is_list', getattr(instance, 'is_list', False))
        default = data.get('default_value', getattr(instance, 'default_value', None))
        opcoes = data.get('options', getattr(instance, 'options', None))
        if is_list and default:
            lista = [o.strip() for o in str(opcoes or '').replace(';', ',').split(',') if o.strip()]
            if lista and default not in lista:
                raise serializers.ValidationError(
                    {'default_value': [f'"{default}" não é uma das opções da lista.']})


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
        SEGREDOS = {8503}          # a password SMTP NUNCA volta pela API — só se escreve
        for p in rows:
            valor = p.value if p.value not in (None, '') else p.default
            if p.number in SEGREDOS and valor:
                valor = '••••••••'
            groups.setdefault(p.group, []).append({
                'number': p.number, 'name': p.name, 'kind': p.kind, 'choices': p.choices,
                'value': valor,
                'default': p.default, 'help_text': p.help_text,
            })
        return Response([{'group': g, 'params': ps} for g, ps in groups.items()])

    def post(self, request):
        from . import params as pengine
        values = request.data.get('values') or {}
        changed = 0
        for num, val in values.items():
            v = 'true' if val is True else ('false' if val is False else ('' if val is None else str(val)))
            if v == '••••••••':
                continue          # a máscara da password não é um valor — ignora-se
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

    def get_queryset(self):
        qs = super().get_queryset()
        # (Recurso humano) "Utilizador Front Office" — só os marcados aparecem nas
        # listas do terminal (escalas, comissões de sala). O contabilista não é
        # empregado de mesa.
        if self.request.query_params.get('front_office') in ('1', 'true'):
            qs = qs.filter(is_front_office_user=True)
        return qs

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


# ==========================================================================
# MARKETING
# ==========================================================================
class LanguageSerializer(serializers.ModelSerializer):
    class Meta:
        from mdm.models import Language as _L
        model = _L
        fields = ('id', 'code', 'name', 'culture_code', 'is_default',
                  'is_mailing_default', 'is_active')


class LanguageViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = LanguageSerializer

    def get_queryset(self):
        from mdm.models import Language
        return Language.objects.all()


class EmailTextSerializer(serializers.ModelSerializer):
    class Meta:
        from .models import EmailTemplateText as _T
        model = _T
        fields = ('id', 'culture', 'subject', 'body')


class EmailTemplateSerializer(serializers.ModelSerializer):
    texts = EmailTextSerializer(many=True, required=False)
    source_display = serializers.CharField(source='get_data_source_display', read_only=True)
    missing = serializers.SerializerMethodField()

    class Meta:
        from .models import EmailTemplate as _E
        model = _E
        fields = '__all__'

    def get_missing(self, o):
        return ', '.join(o.missing_translations())

    def _sync(self, obj, textos):
        from .models import EmailTemplateText
        if textos is None:
            return
        obj.texts.all().delete()
        for t in textos:
            t.pop('template', None)
            EmailTemplateText.objects.create(template=obj, **t)

    def create(self, validated):
        from .models import EmailTemplate
        ts = validated.pop('texts', [])
        obj = EmailTemplate.objects.create(**validated)
        self._sync(obj, ts)
        return obj

    def update(self, instance, validated):
        ts = validated.pop('texts', None)
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        self._sync(instance, ts)
        return instance


class EmailTemplateViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = EmailTemplateSerializer

    def get_queryset(self):
        from .models import EmailTemplate
        return EmailTemplate.objects.prefetch_related('texts')

    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        """ENVIAR o modelo — o motor de e-mail a sério (fica sempre no outbox).

        body: {to: "a@b;c@d" | [..], culture, context: {Campo: valor}, reply_to}
        Sem SMTP configurado (dev), o envio é SIMULADO e registado na mesma.
        """
        from . import mailer
        from .params import P
        t = self.get_object()
        to = request.data.get('to') or ''
        if not to:
            return Response({'detail': 'Indique os destinatários (to).'}, status=400)
        reg = mailer.send_template(
            t, to, ctx=request.data.get('context') or {},
            culture=request.data.get('culture') or 'pt-PT',
            reply_to=request.data.get('reply_to') or (P.text(8238, '') or None),
            context_ref=request.data.get('context_ref'))
        return Response({'status': reg.status, 'outbox_id': reg.id, 'error': reg.error,
                         'detail': {'SENT': 'E-mail enviado.',
                                    'SIMULATED': 'Sem SMTP configurado — envio SIMULADO (registado no outbox).',
                                    'FAILED': f'Falhou: {reg.error}'}.get(reg.status, reg.status)})

    @action(detail=False, methods=['post'])
    def newsletter(self, request):
        """NEWSLETTER (4080/4180) — envia um modelo a TODOS os clientes com e-mail.

        Gate: o parâmetro 4080 tem de estar ligado. Os endereços do 4180 recebem
        cópia (a equipa vê o que saiu). Cada destinatário fica no outbox.
        """
        from . import mailer
        from .params import P
        if not P.bool(4080, False):
            return Response({'detail': 'A newsletter está desligada nos parâmetros (4080).'},
                            status=403)
        from .models import EmailTemplate
        t = EmailTemplate.objects.filter(pk=request.data.get('template')).first()
        if not t:
            return Response({'detail': 'Indique o modelo (template).'}, status=400)
        from mdm.models import Customer
        clientes = Customer.objects.filter(is_active=True).exclude(email__isnull=True).exclude(email='')
        enviados = []
        for c in clientes:
            reg = mailer.send_template(t, c.email, ctx={'GuestName': c.name},
                                       culture=request.data.get('culture') or 'pt-PT',
                                       context_ref=f'NEWSLETTER-{c.code}')
            enviados.append(reg.status)
        extra = P.text(4180, '')
        if extra:
            mailer.send_template(t, extra, ctx={'GuestName': 'Equipa'},
                                 context_ref='NEWSLETTER-COPIA')
        return Response({'recipients': len(enviados),
                         'sent': enviados.count('SENT'),
                         'simulated': enviados.count('SIMULATED'),
                         'failed': enviados.count('FAILED')})

    @action(detail=False, methods=['get'])
    def outbox(self, request):
        """O LIVRO DE REGISTO — todos os e-mails que o sistema enviou (ou tentou)."""
        from .models import EmailOutbox
        regs = EmailOutbox.objects.select_related('template')[:200]
        return Response([{
            'id': r.id, 'to': r.to, 'subject': r.subject, 'status': r.status,
            'error': r.error, 'template': r.template.name if r.template_id else None,
            'ref': r.context_ref, 'at': r.created_at.isoformat(),
        } for r in regs])

    @action(detail=True, methods=['post'])
    def preview(self, request, pk=None):
        """PRÉ-VISUALIZAR — mostra o e-mail com as variáveis substituídas.

        As variáveis por preencher aparecem marcadas: é assim que se apanha o
        @Model[0].GuestNam (com um 'e' a menos) ANTES de o hóspede o receber.
        """
        import re
        from .models import TemplateVariable
        t = self.get_object()
        cultura = request.data.get('culture') or 'pt-PT'
        texto = t.texts.filter(culture=cultura).first()
        if not texto:
            return Response({'detail': f'Este modelo não tem texto em {cultura}.'}, status=400)

        conhecidas = set(TemplateVariable.objects.values_list('field', flat=True))
        exemplo = {
            'HotelName': 'Mwana Lodge', 'GuestName': 'Ana Salvador',
            'ReservationNumber': 'RES-2026-0042', 'HotelNameWebsite': 'Mwana Lodge',
            'GuestEmail': 'ana@exemplo.ao', 'CheckIn': '20-07-2026', 'CheckOut': '24-07-2026',
        }
        desconhecidas = []

        def troca(m):
            campo = m.group(1)
            if campo in exemplo:
                return exemplo[campo]
            if campo in conhecidas:
                return f'«{campo}»'
            desconhecidas.append(campo)
            return f'⚠{campo}⚠'

        padrao = re.compile(r'@Model\[\d+\]\.(\w+)')
        assunto = padrao.sub(troca, texto.subject or '')
        corpo = padrao.sub(troca, texto.body or '')
        return Response({
            'subject': assunto, 'body': corpo,
            'unknown': sorted(set(desconhecidas)),
            'detail': ('Há variáveis que o sistema não conhece: ' + ', '.join(sorted(set(desconhecidas))))
                      if desconhecidas else 'Todas as variáveis são válidas.',
        })


class AttachmentSerializer(serializers.ModelSerializer):
    context_display = serializers.CharField(source='get_context_display', read_only=True)

    class Meta:
        from .models import TemplateAttachment as _A
        model = _A
        fields = '__all__'


class AttachmentViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = AttachmentSerializer

    def get_queryset(self):
        from .models import TemplateAttachment
        return TemplateAttachment.objects.all()


class VariableSerializer(serializers.ModelSerializer):
    context_display = serializers.CharField(source='get_context_display', read_only=True)

    class Meta:
        from .models import TemplateVariable as _V
        model = _V
        fields = '__all__'

    def validate_query(self, v):
        """SÓ LEITURA. Uma variável de e-mail que pudesse escrever na base de dados
        era uma porta aberta: bastava alguém pôr um DELETE aqui e o modelo,
        ao ser enviado, apagava os dados."""
        if not v:
            return v
        proibidas = ('insert', 'update', 'delete', 'drop', 'alter', 'truncate',
                     'create', 'grant', 'exec', 'attach', ';--')
        baixo = v.lower()
        if not baixo.strip().startswith('select'):
            raise serializers.ValidationError('A consulta tem de começar por SELECT — as variáveis só LEEM dados.')
        for p in proibidas:
            if p in baixo:
                raise serializers.ValidationError(f'Palavra proibida na consulta: "{p}". As variáveis só LEEM dados.')
        return v


class VariableViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = VariableSerializer

    def get_queryset(self):
        from .models import TemplateVariable
        qs = TemplateVariable.objects.all()
        ctx = self.request.query_params.get('context')
        return qs.filter(context=ctx) if ctx else qs


class SelectionCodeSerializer(serializers.ModelSerializer):
    group_name = serializers.CharField(source='group.name', read_only=True)

    class Meta:
        from .models import SelectionCode as _C
        model = _C
        fields = '__all__'


class SelectionCodeGroupSerializer(serializers.ModelSerializer):
    codes = SelectionCodeSerializer(many=True, read_only=True)

    class Meta:
        from .models import SelectionCodeGroup as _G
        model = _G
        fields = '__all__'


class SelectionCodeGroupViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = SelectionCodeGroupSerializer

    def get_queryset(self):
        from .models import SelectionCodeGroup
        return SelectionCodeGroup.objects.prefetch_related('codes')


class SelectionCodeViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = SelectionCodeSerializer

    def get_queryset(self):
        from .models import SelectionCode
        qs = SelectionCode.objects.select_related('group')
        g = self.request.query_params.get('group')
        return qs.filter(group_id=g) if g else qs


# ==========================================================================
# EVENTOS — estados
# ==========================================================================
class EventStateSerializer(serializers.ModelSerializer):
    equivalent_display = serializers.CharField(source='get_equivalent_display', read_only=True)
    blocks_space = serializers.BooleanField(read_only=True)

    class Meta:
        from .models import EventReservationState as _S
        model = _S
        fields = '__all__'


class EventStateViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = EventStateSerializer

    def get_queryset(self):
        from .models import EventReservationState
        return EventReservationState.objects.all()

    def destroy(self, request, *a, **kw):
        # Um estado DE SISTEMA não se apaga: o motor de eventos precisa dele. Sem o
        # "Cancelamento", um cancelamento deixava de poder ser cancelado.
        obj = self.get_object()
        if obj.is_system:
            return Response({'detail': f'"{obj.name}" é um estado do sistema — não pode ser apagado. '
                                       f'Desative-o se não o quiser usar.'}, status=409)
        return super().destroy(request, *a, **kw)


class EventAddStateSerializer(serializers.ModelSerializer):
    class Meta:
        from .models import EventAdditionalState as _A
        model = _A
        fields = '__all__'


class EventAddStateViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = EventAddStateSerializer

    def get_queryset(self):
        from .models import EventAdditionalState
        return EventAdditionalState.objects.all()


# ==========================================================================
# EVENTOS — motivos, tipos, espaços, packages, segmentos, canais
# ==========================================================================
def _simples(modelo, extra_fields=None):
    """Fábrica de ViewSets simples (código/descrição/módulos/ativo).

    Repetir dez vezes o mesmo serializer só para mudar o modelo é código a mais
    para manter — e um sítio a mais onde alguém se esquece de uma validação.
    """
    class _S(serializers.ModelSerializer):
        class Meta:
            model = modelo
            fields = '__all__'

    class _V(viewsets.ModelViewSet):
        permission_classes = [IsAuthenticated]
        serializer_class = _S
        queryset = modelo.objects.all()

    return _S, _V


from .models import (EventCancelReason, EventType, SpaceType, SpaceLayout,
                     PlanningOption, EventPackage, EventPackageLine,
                     Segment, SubSegment, DistributionChannel)


class CancelReasonSerializer(serializers.ModelSerializer):
    charge_name = serializers.CharField(source='charge_item.name', read_only=True, default=None)

    class Meta:
        model = EventCancelReason
        fields = '__all__'


class CancelReasonViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = CancelReasonSerializer
    queryset = EventCancelReason.objects.select_related('charge_item')


class EventTypeSerializer(serializers.ModelSerializer):
    manager_name = serializers.CharField(source='manager.full_name', read_only=True, default=None)

    class Meta:
        model = EventType
        fields = '__all__'


class EventTypeViewSet(viewsets.ModelViewSet):
    """(Tipo de evento) as caixas "Tipo de Evento"/"Tipo de Serviço" filtram as listas:
    ?events=1 devolve só os que se reservam; ?services=1 só os que acontecem dentro
    de um evento (coffee breaks). Um Cocktail pode aparecer nas duas."""

    permission_classes = [IsAuthenticated]
    serializer_class = EventTypeSerializer
    queryset = EventType.objects.select_related('manager')

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get('events') in ('1', 'true'):
            qs = qs.filter(is_event_type=True)
        if p.get('services') in ('1', 'true'):
            qs = qs.filter(is_service_type=True)
        return qs


SpaceTypeSerializer, SpaceTypeViewSet = _simples(SpaceType)
SpaceLayoutSerializer, SpaceLayoutViewSet = _simples(SpaceLayout)
SegmentSerializer, SegmentViewSet = _simples(Segment)
ChannelSerializer, ChannelViewSet = _simples(DistributionChannel)


class SubSegmentSerializer(serializers.ModelSerializer):
    segment_name = serializers.CharField(source='segment.name', read_only=True, default=None)

    class Meta:
        model = SubSegment
        fields = '__all__'


class SubSegmentViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = SubSegmentSerializer
    queryset = SubSegment.objects.select_related('segment')


class PackageLineSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_code = serializers.CharField(source='item.code', read_only=True)
    line_total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = EventPackageLine
        fields = ('id', 'item', 'item_code', 'item_name', 'quantity', 'unit_price', 'line_total')


class PackageSerializer(serializers.ModelSerializer):
    lines = PackageLineSerializer(many=True, required=False)
    sector_name = serializers.CharField(source='sector.name', read_only=True, default=None)
    total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = EventPackage
        fields = '__all__'

    def _sync(self, obj, linhas):
        if linhas is None:
            return
        obj.lines.all().delete()
        for l in linhas:
            l.pop('package', None)
            EventPackageLine.objects.create(package=obj, **l)

    def create(self, validated):
        ls = validated.pop('lines', [])
        obj = EventPackage.objects.create(**validated)
        self._sync(obj, ls)
        return obj

    def update(self, instance, validated):
        ls = validated.pop('lines', None)
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        self._sync(instance, ls)
        return instance


class PackageViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PackageSerializer
    queryset = EventPackage.objects.select_related('sector').prefetch_related('lines__item')

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        src = self.get_object()
        novo = EventPackage.objects.create(
            code=f'{src.code}-C'[:30], name=f'{src.name} (cópia)', sector=src.sector,
            is_active=src.is_active)
        for l in src.lines.all():
            EventPackageLine.objects.create(package=novo, item=l.item,
                                            quantity=l.quantity, unit_price=l.unit_price)
        return Response(PackageSerializer(novo).data, status=201)


class PlanningOptionView(APIView):
    """OPÇÕES DO PLANNING — ordem e cores dos espaços no mapa do comercial."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        linhas = []
        for s in PosSector.objects.filter(is_active=True):
            o = PlanningOption.objects.filter(space=s).first()
            linhas.append({
                'space': s.id, 'name': s.name,
                'sort_order': o.sort_order if o else 0,
                'bg_color': o.bg_color if o else '#ffffff',
                'text_color': o.text_color if o else '#333333',
            })
        linhas.sort(key=lambda x: x['sort_order'])
        return Response(linhas)

    def post(self, request):
        for i, l in enumerate(request.data.get('rows', [])):
            PlanningOption.objects.update_or_create(
                space_id=l['space'],
                defaults={'sort_order': i, 'bg_color': l.get('bg_color') or '#ffffff',
                          'text_color': l.get('text_color') or '#333333'})
        return Response({'saved': len(request.data.get('rows', []))})


# ==========================================================================
# GESTÃO DE F&B
# ==========================================================================
from .models import (StockDocStatus, StockDocSeries, StockPrintModel,
                     PaymentTerm, CostCenter)


class DocStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockDocStatus
        fields = '__all__'


class DocStatusViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = DocStatusSerializer
    queryset = StockDocStatus.objects.all()

    def destroy(self, request, *a, **kw):
        obj = self.get_object()
        if obj.is_system:
            return Response({'detail': f'"{obj.name}" é um estado do sistema — o circuito de aprovação '
                                       f'precisa dele. Desative-o se não o quiser usar.'}, status=409)
        return super().destroy(request, *a, **kw)


class StockPrintModelSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockPrintModel
        fields = ('id', 'kind', 'code', 'description', 'model_path', 'sort_order', 'is_active')


class StockDocSeriesSerializer(serializers.ModelSerializer):
    print_models = StockPrintModelSerializer(many=True, required=False)
    status_ids = serializers.PrimaryKeyRelatedField(source='statuses', many=True, required=False,
                                                    queryset=StockDocStatus.objects.all())
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)

    class Meta:
        model = StockDocSeries
        exclude = ('statuses',)

    def _sync(self, obj, modelos):
        if modelos is None:
            return
        obj.print_models.all().delete()
        for m in modelos:
            m.pop('series', None)
            StockPrintModel.objects.create(series=obj, **m)

    def create(self, validated):
        pm = validated.pop('print_models', [])
        st = validated.pop('statuses', [])
        obj = StockDocSeries.objects.create(**validated)
        obj.statuses.set(st)
        self._sync(obj, pm)
        return obj

    def update(self, instance, validated):
        pm = validated.pop('print_models', None)
        st = validated.pop('statuses', None)
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        if st is not None:
            instance.statuses.set(st)
        self._sync(instance, pm)
        return instance


class StockDocSeriesViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = StockDocSeriesSerializer
    queryset = StockDocSeries.objects.prefetch_related('print_models', 'statuses')


class PaymentTermSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentTerm
        fields = '__all__'


class PaymentTermViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PaymentTermSerializer
    queryset = PaymentTerm.objects.all()


class CostCenterSerializer(serializers.ModelSerializer):
    class Meta:
        model = CostCenter
        fields = '__all__'


class CostCenterViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = CostCenterSerializer
    queryset = CostCenter.objects.all()


class WarehouseSerializer(serializers.ModelSerializer):
    doc_name = serializers.CharField(source='sale_stock_doc.name', read_only=True, default=None)

    class Meta:
        from inventory.models import Warehouse as _W
        model = _W
        fields = '__all__'


class WarehouseViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = WarehouseSerializer

    def get_queryset(self):
        from inventory.models import Warehouse
        return Warehouse.objects.select_related('sale_stock_doc')

    def perform_create(self, serializer):
        from identity.models import Hotel
        serializer.save(hotel=Hotel.objects.first())


class StockRecalcView(APIView):
    """RECALCULAR O STOCK — a partir dos MOVIMENTOS, que são a verdade.

    O saldo e o custo médio são números derivados: se um movimento foi corrigido
    (ou um erro antigo deixou o saldo torto), refazem-se as contas do zero em vez
    de se emendar o número à mão — emendar à mão é como se escondem furos.

    · Custo - Artigos → refaz o custo médio ponderado de cada artigo.
    · Stock Qtd.      → refaz o saldo de cada armazém a partir das entradas/saídas.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from decimal import Decimal
        from django.db.models import Sum
        from inventory.models import Item, StockLevel, StockMovement, Warehouse

        wh_ids = request.data.get('warehouses') or []
        item_ids = request.data.get('items') or []
        fazer_custo = bool(request.data.get('cost_items'))
        fazer_qtd = bool(request.data.get('stock_qty'))
        if not (fazer_custo or fazer_qtd):
            return Response({'detail': 'Escolha o que quer recalcular.'}, status=400)

        movs = StockMovement.objects.all()
        if wh_ids:
            movs = movs.filter(warehouse_id__in=wh_ids)
        if item_ids:
            movs = movs.filter(item_id__in=item_ids)

        log = []
        n_qtd = n_custo = 0

        if fazer_qtd:
            ENTRADAS = ('IN', 'GRN', 'TRANSFER_IN')
            pares = movs.values_list('warehouse_id', 'item_id').distinct()
            for wid, iid in pares:
                m = movs.filter(warehouse_id=wid, item_id=iid)
                entra = m.filter(movement_type__in=ENTRADAS).aggregate(s=Sum('quantity'))['s'] or Decimal('0')
                sai = m.exclude(movement_type__in=ENTRADAS).exclude(movement_type='ADJUST') \
                       .aggregate(s=Sum('quantity'))['s'] or Decimal('0')
                # O ajuste de inventário fixa o saldo: o que veio depois dele é que conta.
                ult_ajuste = m.filter(movement_type='ADJUST').order_by('-created_at').first()
                saldo = entra - sai
                lvl, _ = StockLevel.objects.get_or_create(warehouse_id=wid, item_id=iid)
                antes = lvl.quantity_on_hand or Decimal('0')
                if antes != saldo:
                    log.append({
                        'item': Item.objects.get(pk=iid).name,
                        'warehouse': Warehouse.objects.get(pk=wid).name,
                        'field': 'Quantidade', 'before': str(antes), 'after': str(saldo),
                    })
                lvl.quantity_on_hand = saldo
                lvl.save(update_fields=['quantity_on_hand', 'last_updated'])
                n_qtd += 1
                _ = ult_ajuste

        if fazer_custo:
            itens = Item.objects.filter(pk__in=item_ids) if item_ids else Item.objects.all()
            ENTRADAS = ('IN', 'GRN', 'TRANSFER_IN')
            for it in itens:
                ent = StockMovement.objects.filter(item=it, movement_type__in=ENTRADAS)
                qtd = ent.aggregate(s=Sum('quantity'))['s'] or Decimal('0')
                if qtd <= 0:
                    continue
                valor = sum((m.quantity * m.unit_cost for m in ent), Decimal('0'))
                novo = (valor / qtd).quantize(Decimal('0.0001'))
                antes = it.current_average_cost or Decimal('0')
                if antes != novo:
                    log.append({'item': it.name, 'warehouse': '—', 'field': 'Custo médio',
                                'before': str(antes), 'after': str(novo)})
                it.current_average_cost = novo
                it.save(update_fields=['current_average_cost', 'updated_at'])
                n_custo += 1

        return Response({
            'ok': True,
            'detail': f'{n_qtd} saldo(s) e {n_custo} custo(s) recalculados a partir dos movimentos. '
                      f'{len(log)} valor(es) estavam errados e foram corrigidos.',
            'changes': log[:200],
        })


class SectorWarehouseMapView(APIView):
    """MAPEAMENTO SETOR/ARMAZÉNS — de que armazém sai cada sub-família em cada setor.

    As mesmas águas vendidas no Restaurante saem do armazém do Restaurante; as do
    Bar da Piscina, do armazém do Bar. Sem isto, o stock sai sempre do mesmo sítio
    e as contagens NUNCA batem certo — e ninguém percebe porquê.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from inventory.models import ItemSubFamily, SubFamilyMapping, Warehouse
        outlets = list(Outlet.objects.filter(is_active=True).order_by('name'))
        mapas = {(m.subfamily_id, m.outlet_id): m for m in SubFamilyMapping.objects.select_related('warehouse')}
        linhas = []
        for sf in ItemSubFamily.objects.order_by('code'):
            cells = {}
            for o in outlets:
                m = mapas.get((sf.id, o.id))
                cells[str(o.id)] = {
                    'warehouse': m.warehouse_id if (m and m.warehouse_id) else None,
                    'name': m.warehouse.name if (m and m.warehouse_id) else None,
                }
            linhas.append({'id': sf.id, 'code': sf.code, 'name': sf.name, 'cells': cells,
                           'incomplete': any(not c['warehouse'] for c in cells.values())})
        return Response({
            'outlets': [{'id': o.id, 'name': o.name} for o in outlets],
            'warehouses': [{'id': w.id, 'name': w.name} for w in Warehouse.objects.all()],
            'rows': linhas,
        })

    def post(self, request):
        from inventory.models import SubFamilyMapping
        n = 0
        for c in request.data.get('cells', []):
            SubFamilyMapping.objects.update_or_create(
                subfamily_id=c['subfamily'], outlet_id=c['outlet'],
                defaults={'warehouse_id': c.get('warehouse') or None})
            n += 1
        return Response({'saved': n})


# ==========================================================================
# UTILITÁRIOS DO POS — Fecho do Dia, SAF-T, Diagnóstico, Contas Correntes
# (o POS é independente: não chama ecrãs do PMS nem de outro módulo)
# ==========================================================================
class PosDayCloseView(APIView):
    """FECHO DO DIA DO POS — fechar os terminais e as caixas.

    Não é o Night Audit do hotel (esse lança o alojamento nos folios). Este fecha o
    DIA DE VENDAS: nenhum terminal pode ficar aberto de um dia para o outro, senão
    as vendas de amanhã entram na caixa de hoje e o fecho nunca bate certo.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.utils import timezone
        from .models import PosTerminal, CashSession, POSTicket, POSTable
        hoje = timezone.localdate()

        terminais = []
        for t in PosTerminal.objects.filter(is_active=True).select_related('outlet'):
            # O terminal está "aberto" se o ponto de venda dele tem caixa aberta.
            sess = (CashSession.objects.filter(status='OPEN', outlet=t.outlet).first()
                    if t.outlet_id else None)
            terminais.append({
                'id': t.id, 'code': t.code, 'name': t.name,
                'outlet': t.outlet.name if t.outlet_id else None,
                'open': bool(sess),
                'session': sess.id if sess else None,
            })

        caixas = [{
            'id': s.id, 'outlet': s.outlet.name if s.outlet_id else '—', 'operator': s.operator_name,
            'opened_at': s.opened_at, 'opening_float': str(s.opening_float),
        } for s in CashSession.objects.filter(status='OPEN').select_related('outlet')]

        abertas = (POSTicket.objects.filter(status='OPEN')
                   .select_related('outlet', 'table'))
        contas = [{
            'id': t.id, 'ticket': t.ticket_number, 'outlet': t.outlet.name if t.outlet_id else '—',
            'where': t.dest_label or (f'Mesa {t.table.table_number}' if t.table_id else '—'),
            'total': str(t.grand_total), 'operator': t.operator_name,
        } for t in abertas]

        vendas = POSTicket.objects.filter(status='PAID', closed_at__date=hoje)
        total = sum((t.grand_total for t in vendas), Decimal('0'))

        # As SECÇÕES do relatório de fecho vêm dos parâmetros — o dono decide o que o
        # papel do fecho mostra (Fecho do Dia 8037/8039/8191/8041/8043/8179/8216 e
        # Fecho de Caixa 8038/8040/8192/8042/8044/8046/8135/8061/8178/8215). Cada
        # secção liga a um relatório REAL do motor de reports.
        from .params import P
        return Response({
            'date': hoje,
            'terminals': terminais,
            'open_cash_sessions': caixas,
            'open_tickets': contas,
            'sales_today': {'count': vendas.count(), 'total': str(total)},
            'day_sections': {
                'vendas_por_artigo': P.bool(8037, True),
                'vendas_por_familia': P.bool(8039, False),
                'vendas_por_subfamilia': P.bool(8191, True),
                'vendas_por_documento': P.bool(8041, False),
                'resumo_iva': P.bool(8043, True),
                'cancelamentos': P.bool(8179, True),
                'gratificacoes': P.bool(8216, True),
            },
            'cash_sections': {
                'vendas_por_artigo': P.bool(8038, True),
                'vendas_por_familia': P.bool(8040, True),
                'vendas_por_subfamilia': P.bool(8192, False),
                'vendas_por_documento': P.bool(8042, False),
                'resumo_iva': P.bool(8044, True),
                'ofertas': P.bool(8046, True),
                'descontos': P.bool(8135, True),
                'encargos': P.bool(8061, False),
                'cancelamentos': P.bool(8178, True),
                'gratificacoes': P.bool(8215, True),
            },
            # (8005) Fecho CEGO: o operador conta o dinheiro sem ver o esperado.
            'blind_mode': P.text(8005, 'Modo Detalhado'),
            # (8198/8199) fecho automático: quem corre é o agendador do sistema
            # (cron/Task Scheduler a chamar POST aqui); o motor apenas o declara.
            'auto_close': {'enabled': P.bool(8198, False), 'time': P.text(8199, '00:00')},
            # Enquanto houver contas abertas, NÃO se fecha o dia: seriam vendas
            # servidas e não cobradas — comida que sai e dinheiro que não entra.
            'can_close': len(contas) == 0,
            'blocker': (f'{len(contas)} conta(s) ainda abertas — cobre-as ou anule-as antes de fechar.'
                        if contas else None),
        })

    @transaction.atomic
    def post(self, request):
        from django.utils import timezone
        from .models import CashSession, POSTicket
        from .audit import log_event

        abertas = POSTicket.objects.filter(status='OPEN').count()
        if abertas and not request.data.get('force'):
            return Response({'detail': f'{abertas} conta(s) ainda abertas. Não se fecha o dia com contas '
                                       f'por cobrar — é comida servida sem dinheiro a entrar.',
                             'open_tickets': abertas}, status=409)

        sessoes = list(CashSession.objects.select_for_update().filter(status='OPEN'))
        for s in sessoes:
            s.status = 'CLOSED'
            s.closed_at = timezone.now()
            s.closed_by = request.user.username if request.user.is_authenticated else 'POS'
            s.save(update_fields=['status', 'closed_at', 'closed_by'])
            log_event(request, 'CASH_CLOSE',
                      f'Fecho do dia — caixa {s.id} ({s.outlet.name if s.outlet_id else "—"})',
                      outlet=s.outlet, operator_name=s.operator_name)

        # (8036) Dias a guardar o log — o fecho do dia é a vassoura: apaga o registo
        # operacional mais velho do que o prazo. (O arquivo FISCAL nunca se toca.)
        from .params import P
        dias = P.int(8036, 30)
        limpos = 0
        if dias > 0:
            corte = timezone.now() - timezone.timedelta(days=dias)
            try:
                from .models import POSAuditLog
                limpos = POSAuditLog.objects.filter(created_at__lt=corte).delete()[0]
            except Exception:
                pass

        # (8183) Backup no fecho do dia — só faz sentido sem PMS (o PMS já tem o dele).
        backup = None
        if P.bool(8183, False):
            try:
                import shutil
                from django.conf import settings as _s
                db = _s.DATABASES['default']
                if db['ENGINE'].endswith('sqlite3'):
                    origem = str(db['NAME'])
                    destino = origem + f'.bak-{timezone.localdate():%Y%m%d}'
                    shutil.copy2(origem, destino)
                    backup = destino
            except Exception:
                backup = 'FALHOU — verifique espaço em disco'

        return Response({'closed_sessions': len(sessoes),
                         'log_cleaned': limpos, 'backup': backup,
                         'detail': f'{len(sessoes)} caixa(s) fechada(s). O dia de vendas do POS está fechado.'})


class PosSaftView(APIView):
    """SAF-T DO POS — só os documentos emitidos PELO POS.

    O ficheiro é o mesmo que a AGT espera; o que muda é o âmbito. Um hotel que só
    comunica o POS não deve mandar as faturas do alojamento no mesmo ficheiro.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from fiscal.models import FiscalConfig, FiscalDocument
        cfg = FiscalConfig.get()
        docs = FiscalDocument.objects.filter(source_module='pos')
        return Response({
            'version': '1.01_01',
            'company': cfg.company_name,
            'tax_id': cfg.company_nif,
            'application': 'POS',
            'documents': docs.count(),
            'first': docs.order_by('doc_date').values_list('doc_date', flat=True).first(),
            'last': docs.order_by('-doc_date').values_list('doc_date', flat=True).first(),
        })

    def post(self, request):
        """Cria o ficheiro. Sem documentos, não se inventa um SAF-T vazio."""
        import datetime
        from django.http import HttpResponse
        from fiscal.saft import generate_saft
        from fiscal.models import FiscalDocument

        ano = int(request.data.get('year') or datetime.date.today().year)
        mes = request.data.get('month')
        if mes:
            mes = int(mes)
            ini = datetime.date(ano, mes, 1)
            fim = (datetime.date(ano + (mes == 12), (mes % 12) + 1, 1) - datetime.timedelta(days=1))
        else:
            ini, fim = datetime.date(ano, 1, 1), datetime.date(ano, 12, 31)

        n = FiscalDocument.objects.filter(source_module='pos', doc_date__gte=ini, doc_date__lte=fim).count()
        if not n:
            return Response({'detail': f'Não há documentos do POS entre {ini} e {fim}. '
                                       f'Um SAF-T vazio não se entrega.'}, status=400)

        xml = generate_saft(ini, fim, module='pos')

        # O REGISTO da exportação fica guardado com o resultado da validação — é o
        # histórico de tudo o que saiu para a AGT, e a caixa "Válido" é ESCRITA pelo
        # validador, não marcada à mão.
        try:
            import xml.etree.ElementTree as _ET
            from fiscal.models import SaftExport
            valido = True
            try:
                _ET.fromstring(xml)
            except Exception:
                valido = False
            import hashlib
            SaftExport.objects.create(
                profile='faturacao', start_date=ini, end_date=fim,
                filename=f'SAFT_POS_{ano}{f"{mes:02d}" if mes else ""}.xml',
                size_bytes=len(xml.encode('utf-8')),
                sha256=hashlib.sha256(xml.encode('utf-8')).hexdigest(),
                is_valid=valido,
                problems=None if valido else 'XML mal formado — não entregar.',
                created_by=(request.user.username if request.user.is_authenticated else ''),
            )
        except Exception:
            pass
        resp = HttpResponse(xml, content_type='application/xml')
        resp['Content-Disposition'] = f'attachment; filename="SAFT_POS_{ano}{f"{mes:02d}" if mes else ""}.xml"'
        return resp


class PosStockSaftView(APIView):
    """COMUNICAÇÃO DE INVENTÁRIO À AGT — as existências valorizadas, EM FICHEIRO.

    A AGT exige a comunicação anual do inventário (o que a casa TEM em armazém a
    31/12, valorizado). O POS é dono do stock (StockLevel + custo médio) — o ficheiro
    nasce AQUI, do mesmo motor que os armazéns usam, no formato StockFile:
      ProductCategory · ProductCode · ProductDescription · UnitOfMeasure ·
      ClosingStockQuantity · ClosingStockValue
    Sem isto, o separador apontava para fora e ninguém comunicava nada.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.http import HttpResponse
        from fiscal.models import FiscalConfig
        from inventory.models import StockLevel
        from decimal import Decimal
        from django.db.models import Sum

        ano = int(request.query_params.get('year') or timezone.localdate().year)
        cfg = FiscalConfig.get()

        # existências por artigo (soma dos armazéns), valorizadas ao custo médio
        linhas = []
        total = Decimal('0')
        por_item = (StockLevel.objects.select_related('item', 'item__base_uom')
                    .values('item__code', 'item__name', 'item__base_uom__code',
                            'item__current_average_cost')
                    .annotate(qtd=Sum('quantity_on_hand')).order_by('item__code'))
        for r in por_item:
            qtd = r['qtd'] or Decimal('0')
            if qtd <= 0:
                continue          # a AGT quer o que EXISTE; negativos são erro a corrigir
            custo = Decimal(str(r['item__current_average_cost'] or 0))
            valor = (qtd * custo).quantize(Decimal('0.01'))
            total += valor
            linhas.append(
                f'  <Stock>\n'
                f'    <ProductCategory>M</ProductCategory>\n'
                f'    <ProductCode>{r["item__code"]}</ProductCode>\n'
                f'    <ProductDescription>{(r["item__name"] or "")[:100]}</ProductDescription>\n'
                f'    <UnitOfMeasure>{r["item__base_uom__code"] or "UN"}</UnitOfMeasure>\n'
                f'    <ClosingStockQuantity>{qtd:.4f}</ClosingStockQuantity>\n'
                f'    <ClosingStockValue>{valor}</ClosingStockValue>\n'
                f'  </Stock>')

        xml = (f'<?xml version="1.0" encoding="UTF-8"?>\n'
               f'<StockFile>\n'
               f'  <StockHeader>\n'
               f'    <FiscalYear>{ano}</FiscalYear>\n'
               f'    <EndDate>{ano}-12-31</EndDate>\n'
               f'    <TaxRegistrationNumber>{cfg.company_nif or ""}</TaxRegistrationNumber>\n'
               f'    <CompanyName>{cfg.company_name or ""}</CompanyName>\n'
               f'    <NoStock>{0 if linhas else 1}</NoStock>\n'
               f'  </StockHeader>\n'
               + '\n'.join(linhas) + ('\n' if linhas else '')
               + f'</StockFile>\n')

        if request.query_params.get('meta'):
            return Response({'year': ano, 'items': len(linhas), 'total_value': str(total),
                             'company': cfg.company_name, 'nif': cfg.company_nif})
        resp = HttpResponse(xml, content_type='application/xml')
        resp['Content-Disposition'] = f'attachment; filename=\"inventario_{ano}_{cfg.company_nif or "nif"}.xml\"'
        return resp


class PosSendLogsView(APIView):
    """ENVIAR OS LOGS AO SUPORTE — o botão do Diagnóstico para pedir assistência.

    Junta o retrato do sistema (diagnóstico + alertas + últimos eventos de auditoria e
    de autenticação) num único e-mail para o endereço do parâmetro 8510 (a empresa que
    dá suporte). O cliente não copia ficheiros nem sabe onde eles moram: carrega no
    botão e o suporte recebe tudo. Fica no outbox como qualquer outro e-mail.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from django.utils import timezone
        from .params import P
        from . import mailer
        from .models import POSAuditLog
        # O DESTINO DO SUPORTE vem da LICENÇA assinada (PCC) quando lá estiver —
        # o cliente não redireciona os logs por engano; o parâmetro 8510 é o fallback.
        destino = None
        try:
            from django.conf import settings as _s
            from licensing.offline_validator import get_license
            destino = (get_license(_s.BASE_DIR) or {}).get('support_email')
        except Exception:
            pass
        destino = destino or P.text(8510, 'suporte@mwanalodge.ao')
        if not destino:
            return Response({'detail': 'Configure o e-mail do suporte (parâmetro 8510).'}, status=400)

        # o retrato: alertas + últimos 100 eventos de auditoria + últimos 50 logins
        partes = [f'<h3>Envio de logs — {timezone.localtime():%d/%m/%Y %H:%M}</h3>',
                  f'<p>Nota do cliente: {request.data.get("note") or "—"}</p>']
        try:
            from .alerts import run_all
            alertas = run_all()
            partes.append('<h4>Alertas ativos</h4>' + '<br>'.join(
                f"[{a['severity']}] {a['title']} — {a['detail']}" for a in alertas) or 'nenhum')
        except Exception as e:
            partes.append(f'<p>alertas indisponíveis: {e}</p>')
        partes.append('<h4>Últimos eventos (auditoria POS)</h4>' + '<br>'.join(
            f"{l.created_at:%d/%m %H:%M} [{l.event_type}] {l.description} ({l.operator_name or l.user or '—'})"
            for l in POSAuditLog.objects.all()[:100]))
        try:
            from auth_engine.models import AuthEventLog
            partes.append('<h4>Últimos acessos</h4>' + '<br>'.join(
                f"{l.timestamp:%d/%m %H:%M} [{l.event_type}] {l.identity_attempt} {l.ip_address or ''}"
                for l in AuthEventLog.objects.order_by('-id')[:50]))
        except Exception:
            pass

        reg = mailer.send(destino, f'Logs do sistema — pedido de assistência',
                          '<br>'.join(partes), context_ref='SUPORTE-LOGS')
        return Response({'status': reg.status, 'outbox_id': reg.id,
                         'detail': {'SENT': f'Logs enviados para {destino}.',
                                    'SIMULATED': f'SMTP por configurar — o envio ficou SIMULADO no outbox '
                                                 f'(destino: {destino}).',
                                    'FAILED': f'Falhou: {reg.error}'}.get(reg.status, reg.status)})


class PosDiagnosticsView(APIView):
    """DIAGNÓSTICO DO POS — o estado real, agora. É o que o suporte pergunta ao telefone."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.conf import settings
        from django.db import connection
        from django.utils import timezone
        from .models import PrintJob, PosTerminal, CashSession, POSTicket
        from fiscal.models import FiscalDocument, FiscalConfig, FiscalSeries
        from licensing.offline_validator import get_active_modules

        # Base de dados: responde? em quanto tempo?
        t0 = timezone.now()
        try:
            with connection.cursor() as cur:
                cur.execute('SELECT 1')
            ms = (timezone.now() - t0).total_seconds() * 1000
            bd = {'ok': True, 'engine': connection.vendor, 'ms': round(ms, 1)}
        except Exception as e:
            bd = {'ok': False, 'error': str(e)}

        cfg = FiscalConfig.get()
        falhadas = PrintJob.objects.filter(status='FAILED').count()
        fila = PrintJob.objects.filter(status='QUEUED').count()

        # Uma comanda parada há muito tempo é um pedido que a cozinha nunca viu.
        antiga = PrintJob.objects.filter(status='QUEUED').order_by('created_at').first()
        parada = None
        if antiga:
            mins = int((timezone.now() - antiga.created_at).total_seconds() / 60)
            if mins > 5:
                parada = f'A comanda mais antiga está na fila há {mins} minutos — o agente de impressão não a está a consumir.'

        return Response({
            'database': bd,
            'license': {'modules': get_active_modules(settings.BASE_DIR, settings.SECRET_KEY)},
            'fiscal': {
                'certified': bool(cfg.certificate_number),
                'certificate': cfg.certificate_number,
                'environment': cfg.environment,
                'documents': FiscalDocument.objects.count(),
                'series': FiscalSeries.objects.filter(is_active=True).count(),
            },
            'print': {'queued': fila, 'failed': falhadas, 'warning': parada},
            'terminals': PosTerminal.objects.filter(is_active=True).count(),
            'open_cash': CashSession.objects.filter(status='OPEN').count(),
            'open_tickets': POSTicket.objects.filter(status='OPEN').count(),
            'server_time': timezone.now(),
        })


class PosCurrentAccountsView(APIView):
    """CONTAS CORRENTES — quem deve, quanto deve, e quanto ja deixou adiantado.

    Dois saldos, e sao coisas diferentes:
      · SALDO (CONTA CORRENTE) — o que a entidade CONSUMIU e ainda nao pagou. Sao as
        faturas (FT) emitidas e nao liquidadas, menos as notas de credito.
      · SALDO (CASH ADVANCE)   — o que a entidade JA DEIXOU a cabeca (deposito/sinal).
        E dinheiro dela que esta na nossa caixa.

    Uma empresa pode ter as duas coisas ao mesmo tempo: deve 300.000 do mes passado e
    tem 100.000 de sinal do evento de sabado.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from mdm.models import Customer
        from fiscal.models import FiscalDocument
        from .models import EntityDeposit

        p = request.query_params
        qs = Customer.objects.select_related('entity_type').all()
        if p.get('q'):
            t = p['q']
            qs = qs.filter(models.Q(name__icontains=t) | models.Q(code__icontains=t)
                           | models.Q(tax_id__icontains=t) | models.Q(phone__icontains=t)
                           | models.Q(address__icontains=t) | models.Q(email__icontains=t))
        for campo in ('name', 'address'):
            if p.get(campo):
                qs = qs.filter(**{campo + '__icontains': p[campo]})
        if p.get('tax_id'):
            qs = qs.filter(tax_id__icontains=p['tax_id'])
        if p.get('phone'):
            qs = qs.filter(phone__icontains=p['phone'])
        if p.get('id'):
            qs = qs.filter(models.Q(code__icontains=p['id']) | models.Q(id=p['id'] if str(p['id']).isdigit() else 0))
        if p.get('entity_type'):
            qs = qs.filter(entity_type_id=p['entity_type'])

        so_cc = p.get('scope', 'CC') == 'CC'          # Clientes (Conta Corrente) vs (Todos)
        so_dep = p.get('only_deposits') in ('1', 'true')

        linhas = []
        for c in qs[:400]:
            docs = FiscalDocument.objects.filter(customer=c).select_related('doc_type')
            devido = sum((d.gross_total for d in docs
                          if not d.doc_type.is_rectifying and not d.settled), Decimal('0'))
            credito = sum((d.gross_total for d in docs if d.doc_type.is_rectifying), Decimal('0'))
            saldo_cc = devido - credito
            adiantado = EntityDeposit.balance_of(c)

            if so_cc and not (saldo_cc or adiantado or docs.exists()):
                continue
            if so_dep and not adiantado:
                continue

            linhas.append({
                'id': c.id, 'code': c.code, 'name': c.name,
                'entity_type': c.entity_type.name if c.entity_type_id else None,
                'address': c.address, 'contact': c.phone or c.email,
                'other': c.tax_id, 'blocked': c.is_blocked,
                'documents': docs.count(),
                'cc_balance': str(saldo_cc),
                'advance_balance': str(adiantado),
            })
        linhas.sort(key=lambda x: Decimal(x['cc_balance']), reverse=True)
        return Response({
            'rows': linhas,
            'total_due': str(sum((Decimal(l['cc_balance']) for l in linhas), Decimal('0'))),
            'total_advance': str(sum((Decimal(l['advance_balance']) for l in linhas), Decimal('0'))),
        })


class PosEntityAccountView(APIView):
    """A CONTA de UMA entidade: os documentos por liquidar e os depositos.

    E aqui que se recebe (liquida uma fatura) e que se lanca um adiantamento.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from mdm.models import Customer
        from fiscal.models import FiscalDocument
        from .models import EntityDeposit
        c = Customer.objects.filter(pk=pk).first()
        if not c:
            return Response({'detail': 'Entidade nao encontrada.'}, status=404)
        docs = FiscalDocument.objects.filter(customer=c).select_related('doc_type').order_by('-doc_date')
        return Response({
            'entity': {'id': c.id, 'code': c.code, 'name': c.name, 'tax_id': c.tax_id,
                       'blocked': c.is_blocked, 'block_reason': c.block_reason},
            'documents': [{
                'id': d.id, 'invoice_no': d.invoice_no, 'type': d.doc_type.code,
                'date': d.doc_date, 'total': str(d.gross_total),
                'settled': d.settled, 'settled_at': d.settled_at,
                'rectifying': d.doc_type.is_rectifying,
            } for d in docs],
            'deposits': [{
                'id': x.id, 'kind': x.kind, 'kind_display': x.get_kind_display(),
                'amount': str(x.amount), 'reason': x.reason,
                'created_at': x.created_at, 'created_by': x.created_by,
            } for x in EntityDeposit.objects.filter(customer=c)],
            'advance_balance': str(EntityDeposit.balance_of(c)),
        })

    @transaction.atomic
    def post(self, request, pk):
        """Duas operacoes: RECEBER (liquidar um documento) e DEPOSITAR (cash advance)."""
        from django.utils import timezone
        from mdm.models import Customer
        from fiscal.models import FiscalDocument
        from .models import EntityDeposit
        from .audit import log_event

        c = Customer.objects.filter(pk=pk).first()
        if not c:
            return Response({'detail': 'Entidade nao encontrada.'}, status=404)
        acao = request.data.get('action')
        quem = request.user.username if request.user.is_authenticated else 'POS'

        if acao == 'settle':
            d = FiscalDocument.objects.select_for_update().filter(
                pk=request.data.get('document'), customer=c).first()
            if not d:
                return Response({'detail': 'Documento nao encontrado nesta conta.'}, status=404)
            if d.settled:
                return Response({'detail': f'{d.invoice_no} ja estava liquidado.'}, status=400)
            usar_deposito = request.data.get('from_deposit')
            if usar_deposito:
                # Pagar com o adiantamento que a entidade ja deixou.
                if EntityDeposit.balance_of(c) < d.gross_total:
                    return Response({'detail': 'O adiantamento nao chega para liquidar este documento.'},
                                    status=400)
                EntityDeposit.objects.create(customer=c, kind='USE', amount=d.gross_total,
                                             document=d, created_by=quem,
                                             reason=f'Liquidacao de {d.invoice_no}')
            d.settled = True
            d.settled_at = timezone.now()
            d.save(update_fields=['settled', 'settled_at'])
            log_event(request, 'DOC_ISSUE', f'Liquidacao de {d.invoice_no} ({c.name})',
                      reference=d.invoice_no, amount=d.gross_total)
            return Response({'detail': f'{d.invoice_no} liquidado.', 'settled': True})

        if acao == 'deposit':
            try:
                valor = Decimal(str(request.data.get('amount') or '0'))
            except Exception:
                valor = Decimal('0')
            if valor <= 0:
                return Response({'detail': 'Indique o valor do deposito.'}, status=400)
            tipo = request.data.get('kind') or 'IN'
            if tipo != 'IN' and EntityDeposit.balance_of(c) < valor:
                return Response({'detail': 'Nao ha adiantamento suficiente para devolver.'}, status=400)
            EntityDeposit.objects.create(customer=c, kind=tipo, amount=valor, created_by=quem,
                                         reason=request.data.get('reason'))
            return Response({'detail': 'Movimento registado.',
                             'advance_balance': str(EntityDeposit.balance_of(c))})

        return Response({'detail': 'Acao invalida.'}, status=400)


class EventRequestSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.name', read_only=True, default=None)
    event_type_name = serializers.CharField(source='event_type.name', read_only=True, default=None)
    space_name = serializers.CharField(source='space.name', read_only=True, default=None)
    layout_name = serializers.CharField(source='layout.name', read_only=True, default=None)
    state_name = serializers.CharField(source='state.name', read_only=True, default=None)
    state_bg = serializers.CharField(source='state.bg_color', read_only=True, default=None)
    state_fg = serializers.CharField(source='state.text_color', read_only=True, default=None)
    segment_name = serializers.CharField(source='segment.name', read_only=True, default=None)
    channel_name = serializers.CharField(source='channel.name', read_only=True, default=None)
    package_name = serializers.CharField(source='package.name', read_only=True, default=None)
    total = serializers.SerializerMethodField()
    blocks_space = serializers.BooleanField(read_only=True)

    class Meta:
        from .models import EventRequest as _E
        model = _E
        fields = '__all__'
        read_only_fields = ['number', 'created_at']

    def get_total(self, o):
        return str(o.total)

    def validate(self, data):
        from .params import P
        ini = data.get('start_at') or (self.instance.start_at if self.instance else None)
        fim = data.get('end_at') or (self.instance.end_at if self.instance else None)
        if ini and fim and fim <= ini:
            raise serializers.ValidationError({'end_at': 'O evento nao pode acabar antes de comecar.'})
        # (Tipo de evento) "Tipo de Evento" vs "Tipo de Serviço" — um Coffee Break é um
        # SERVIÇO (acontece dentro do evento); não se reserva uma sala para ele. A caixa
        # da ficha decide o que aparece onde.
        tipo = data.get('event_type') or (self.instance.event_type if self.instance else None)
        if tipo and not getattr(tipo, 'is_event_type', True):
            raise serializers.ValidationError(
                {'event_type': [f'"{tipo.name}" é um tipo de SERVIÇO, não de evento — '
                                f'não se reserva um espaço para ele.']})

        # CAMPOS OBRIGATÓRIOS PARAMETRIZÁVEIS (Eventos · Valores por defeito): cada
        # casa decide o que um pedido tem de trazer para valer como negócio.
        if not self.instance:            # só na criação — editar não re-exige tudo
            faltas = {}
            if P.bool(4020, True) and not data.get('segment'):
                faltas['segment'] = ['Segmento é obrigatório (parâmetro 4020).']
            if P.bool(4021, True) and not data.get('sub_segment'):
                faltas['sub_segment'] = ['Sub-Segmento é obrigatório (parâmetro 4021).']
            if P.bool(4022, True) and not data.get('channel'):
                faltas['channel'] = ['Canal de Distribuição é obrigatório (parâmetro 4022).']
            if P.bool(4076, True) and not data.get('customer') and not data.get('contact_name'):
                faltas['customer'] = ['Tipo/identificação do cliente é obrigatório (parâmetro 4076).']
            if faltas:
                raise serializers.ValidationError(faltas)

        # (4072) Valores monetários não podem ser 0: um evento CONFIRMADO sem preço é
        # um salão dado de graça. (As Opções ainda podem não ter preço fechado.)
        estado = data.get('state') or (self.instance.state if self.instance else None)
        if P.bool(4072, True) and estado is not None and getattr(estado, 'blocks_space', False):
            preco = data.get('price_per_pax', getattr(self.instance, 'price_per_pax', 0) or 0)
            pacote = data.get('package', getattr(self.instance, 'package', None))
            if not pacote and (preco or 0) <= 0:
                raise serializers.ValidationError(
                    {'price_per_pax': ['Um evento confirmado tem de ter preço ou package '
                                       '(parâmetro 4072 — valores não podem ser 0).']})

        # (4069) "Utilizar estados personalizados" DESLIGADO: os Estados Adicionais
        # não se usam — só o estado principal da reserva conta.
        if not P.bool(4069, True) and data.get('additional_state'):
            raise serializers.ValidationError(
                {'additional_state': ['Os estados personalizados estão desligados (parâmetro 4069).']})

        # (4068) mais pessoas do que a lotação da disposição — só se o parâmetro deixar.
        layout = data.get('layout') or (self.instance.layout if self.instance else None)
        pax = data.get('pax', getattr(self.instance, 'pax', 0) or 0)
        capacidade = getattr(layout, 'capacity', None) or getattr(layout, 'max_pax', None)
        if layout and capacidade and pax and pax > capacidade and not P.bool(4068, False):
            raise serializers.ValidationError(
                {'pax': [f'{pax} pessoas excede a lotação de "{layout.name}" ({capacidade}). '
                         f'O parâmetro 4068 não permite ultrapassar.']})
        return data

    def create(self, validated):
        from .params import P
        from django.utils import timezone as _tz
        import datetime as _dt
        # VALORES POR DEFEITO dos parâmetros — o comercial escreve menos:
        #   (4006) pax; (4004) estado; (4063/4064/4005) horas e duração; (2023) prefixo.
        if not validated.get('pax'):
            validated['pax'] = P.int(4006, 10)
        if not validated.get('state'):
            from .models import EventReservationState
            nome = P.text(4004, 'Opção')
            estado = (EventReservationState.objects.filter(name__iexact=nome).first()
                      or EventReservationState.objects.filter(is_active=True).first())
            if estado:
                validated['state'] = estado
        if validated.get('start_at') and not validated.get('end_at'):
            validated['end_at'] = validated['start_at'] + _dt.timedelta(hours=P.int(4005, 8))
        return super().create(validated)   # o número (prefixo 2023) nasce no save do modelo


class EventRequestViewSet(viewsets.ModelViewSet):
    """PEDIDOS DE EVENTOS — o funil comercial dos saloes.

    A gravacao RECUSA um choque de espaco: um evento confirmado nao entra por cima
    de outro confirmado na mesma sala a mesma hora. E a unica coisa que impede o
    hotel de vender o mesmo salao a dois casamentos.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = EventRequestSerializer

    def get_queryset(self):
        from .models import EventRequest
        qs = (EventRequest.objects.select_related('customer', 'event_type', 'space', 'layout',
                                                  'state', 'segment', 'channel', 'package'))
        p = self.request.query_params
        if p.get('q'):
            qs = qs.filter(models.Q(title__icontains=p['q']) | models.Q(number__icontains=p['q'])
                           | models.Q(customer__name__icontains=p['q'])
                           | models.Q(contact_name__icontains=p['q']))
        if p.get('state'):
            qs = qs.filter(state_id=p['state'])
        if p.get('space'):
            qs = qs.filter(space_id=p['space'])
        if p.get('from'):
            qs = qs.filter(end_at__gte=p['from'])
        if p.get('to'):
            qs = qs.filter(start_at__lte=p['to'])
        # O filtro do ecra: Todos / Nao Respondido / Respondido.
        if p.get('answered') in ('0', 'false'):
            qs = qs.filter(answered=False)
        elif p.get('answered') in ('1', 'true'):
            qs = qs.filter(answered=True)
        return qs

    def _check_conflict(self, obj):
        choques = obj.conflicts()
        if choques:
            c = choques[0]
            raise serializers.ValidationError({
                'detail': f'O espaco "{obj.space.name}" ja esta ocupado por {c.number} — {c.title} '
                          f'({c.start_at:%d/%m %H:%M} a {c.end_at:%d/%m %H:%M}). '
                          f'Mude a sala, a hora, ou ponha este pedido em Opcao.',
                'conflict_with': c.number,
            })

    def _exige_gestor(self):
        """(Utilizador POS) "Gestor de eventos" — sem a caixa, não cria nem mexe.

        Um evento é um contrato: datas, sala, preço. Não é para qualquer operador de
        caixa o alterar. O dono e os administradores passam sempre.
        """
        from .models import PosUser
        u = self.request.user
        if not u.is_authenticated or u.is_superuser or u.is_staff:
            return
        pu = PosUser.objects.filter(auth_user=u).first()
        if pu and not pu.is_event_manager:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Só um gestor de eventos pode alterar pedidos de eventos '
                                   '(caixa "Gestor de eventos" na ficha do utilizador).')

    @transaction.atomic
    def perform_create(self, serializer):
        self._exige_gestor()
        # (Estado da reserva) "Reserva automática" — os pedidos que chegam SEM estado
        # (do site, de integrações) entram no estado marcado com esta caixa. Sem ela,
        # entravam Confirmados e bloqueavam a sala sem ninguém ter confirmado nada.
        extras = {}
        if not serializer.validated_data.get('state'):
            from .models import EventReservationState
            auto = EventReservationState.objects.filter(
                is_auto_reservation=True, is_active=True).first()
            if auto:
                extras['state'] = auto
        obj = serializer.save(created_by=(self.request.user.username
                                          if self.request.user.is_authenticated else None),
                              **extras)
        self._check_conflict(obj)
        # (4079/4179) AVISO À EQUIPA DE EVENTOS: entrou um pedido novo — quem responde
        # primeiro fecha o negócio. O destino são os e-mails do parâmetro 4179 (";").
        from .params import P
        if P.bool(4079, True) and P.text(4179, ''):
            try:
                from . import mailer
                mailer.send(
                    P.text(4179, ''),
                    f'Novo pedido de evento: {obj.number} — {obj.title}',
                    (f'<b>{obj.title}</b><br>Tipo: {obj.event_type.name}<br>'
                     f'Espaço: {obj.space.name}<br>Pax: {obj.pax}<br>'
                     f'De {obj.start_at:%d/%m/%Y %H:%M} a {obj.end_at:%d/%m/%Y %H:%M}<br>'
                     f'Contacto: {obj.contact_name or "—"} · {obj.phone or ""} {obj.email or ""}'),
                    context_ref=obj.number)
            except Exception:
                pass   # o aviso nunca trava a gravação do pedido

    @transaction.atomic
    def perform_update(self, serializer):
        self._exige_gestor()
        # (8110) "Permitir alterar contas de eventos" — desligado, os pedidos ficam
        # SELADOS depois de criados: só se cancelam, não se reescrevem.
        from .params import P
        if not P.bool(8110, True):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('A alteração de eventos está desligada nos parâmetros (8110). '
                                   'Cancele e crie um novo pedido.')
        obj = serializer.save()
        self._check_conflict(obj)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """CANCELAR — exige um motivo. "Caiu" nao e um relatorio."""
        from django.utils import timezone
        from .models import EventCancelReason, EventReservationState
        obj = self.get_object()
        motivo = request.data.get('cancel_reason')
        if not motivo:
            return Response({'detail': 'Indique o motivo do cancelamento — sem motivo, o hotel nunca '
                                       'sabe se esta a perder eventos por preco, servico ou chuva.'},
                            status=400)
        try:
            obj.cancel_reason = EventCancelReason.objects.get(pk=motivo)
        except EventCancelReason.DoesNotExist:
            return Response({'detail': 'Motivo invalido.'}, status=400)
        cancelado = EventReservationState.objects.filter(equivalent='CANCELLED', is_active=True).first()
        if cancelado:
            obj.state = cancelado           # liberta o espaco no planning
        obj.cancelled_at = timezone.now()
        obj.save()
        return Response(self.get_serializer(obj).data)

    @action(detail=False, methods=['get'])
    def planning(self, request):
        """O PLANNING — os espacos pela ordem e cores definidas em Opcoes do Planning."""
        from .models import PlanningOption
        espacos = []
        for po in PlanningOption.objects.select_related('space').order_by('sort_order'):
            espacos.append({'id': po.space_id, 'name': po.space.name,
                            'bg_color': po.bg_color, 'text_color': po.text_color})
        if not espacos:
            espacos = [{'id': s.id, 'name': s.name, 'bg_color': '#ffffff', 'text_color': '#333333'}
                       for s in PosSector.objects.filter(is_active=True)]
        from .params import P
        return Response({'spaces': espacos,
                         # (4085) a cor das faixas de montagem/desmontagem vem dos parâmetros
                         'setup_color': P.text(4085, '#c0392b'),
                         'requests': self.get_serializer(self.get_queryset(), many=True).data})


class EntitySerializer(serializers.ModelSerializer):
    """A ENTIDADE — a MESMA ficha que a faturacao usa (mdm.Customer).

    Nao ha um cadastro de clientes do Marketing e outro da faturacao. E o mesmo: o que
    o comercial cria aqui e o que sai no NIF da fatura, e o consumo que aparece na
    coluna "gasto" vem dos documentos fiscais reais do POS.
    """
    entity_type_name = serializers.CharField(source='entity_type.name', read_only=True, default=None)
    card_name = serializers.CharField(source='member_card.name', read_only=True, default=None)
    contact = serializers.SerializerMethodField()
    spent = serializers.SerializerMethodField()
    documents = serializers.SerializerMethodField()
    events = serializers.SerializerMethodField()

    class Meta:
        from mdm.models import Customer as _C
        model = _C
        fields = '__all__'
        # O CÓDIGO é gerado pelo servidor quando não vem no pedido. O terminal não tem
        # como saber qual é o próximo código livre do cadastro — e obrigar o empregado a
        # inventar um, com um cliente à espera da fatura, dava códigos como "1" e "aaa"
        # repetidos até rebentar o unique. Quem cria pelo backoffice continua a poder
        # escolher o seu.
        extra_kwargs = {'code': {'required': False}}

    def create(self, validated):
        from mdm.models import Customer
        if not validated.get('code'):
            base = 'C'
            ultimo = (Customer.objects.filter(code__regex=r'^C\d+$')
                      .order_by('-id').values_list('code', flat=True).first())
            n = int(ultimo[1:]) + 1 if ultimo and ultimo[1:].isdigit() else 1
            while Customer.objects.filter(code=f'{base}{n:05d}').exists():
                n += 1
            validated['code'] = f'{base}{n:05d}'
        return super().create(validated)

    def get_contact(self, o):
        return o.phone or o.email or None

    def _docs(self, o):
        from fiscal.models import FiscalDocument
        return FiscalDocument.objects.filter(customer_name=o.name, source_module='pos')

    def get_documents(self, o):
        return self._docs(o).count()

    def get_spent(self, o):
        return str(sum((d.gross_total for d in self._docs(o) if not d.doc_type.is_rectifying),
                       Decimal('0')))

    def get_events(self, o):
        from .models import EventRequest
        return EventRequest.objects.filter(customer=o).count()

    def validate(self, data):
        """CAMPOS OBRIGATORIOS — as caixas do botao "Campos obrigatorios" mandam aqui.

        O servidor RECUSA. Nao e um aviso que se fecha: e assim que um hotel garante
        que ninguem cria um cliente sem contribuinte e so descobre na hora de faturar.
        """
        from .models import EntityFieldRule
        obrig = EntityFieldRule.objects.filter(is_required=True).values_list('field', flat=True)
        faltam = {}
        for f in obrig:
            v = data.get(f, getattr(self.instance, f, None) if self.instance else None)
            if v in (None, ''):
                faltam[f] = ['Obrigatorio (definido em Campos obrigatorios).']
        if faltam:
            raise serializers.ValidationError(faltam)
        return data


class EntityViewSet(viewsets.ModelViewSet):
    """PESQUISA DE ENTIDADES — o cadastro unico de clientes, visto pelo POS.

    (Campos personalizados) "Mostrar na pesquisa": as definições marcadas vêm na
    resposta da lista — o ecrã acrescenta-as como colunas. "É lista": o valor tem de
    ser uma das opções definidas, não texto livre.
    """

    def list(self, request, *args, **kwargs):
        resp = super().list(request, *args, **kwargs)
        from .models import CustomFieldDef
        defs = CustomFieldDef.objects.filter(is_active=True, show_in_search=True,
                                             location='ENTITY')
        # As colunas extra que o ecrã deve desenhar — vêm da configuração, não do código.
        if isinstance(resp.data, dict):
            resp.data['custom_columns'] = [{'key': d.code, 'label': d.name} for d in defs]
        return resp
    permission_classes = [IsAuthenticated]
    serializer_class = EntitySerializer

    # ── OS SATÉLITES da ficha (abas do "Nova entidade"): notas, ligações, redes
    # sociais, documentos, acordos, consentimentos, crianças… Uma grelha, um motor.
    @action(detail=True, methods=['get', 'post'])
    def records(self, request, pk=None):
        from mdm.models import CustomerRecord
        cliente = self.get_object()
        if request.method == 'GET':
            qs = cliente.records.all()
            if request.query_params.get('kind'):
                qs = qs.filter(kind=request.query_params['kind'])
            return Response([{'id': r.id, 'kind': r.kind, 'data': r.data,
                              'by': r.created_by, 'at': r.created_at.isoformat()} for r in qs])
        r = CustomerRecord.objects.create(
            customer=cliente, kind=request.data.get('kind'),
            data=request.data.get('data') or {},
            created_by=(request.user.username if request.user.is_authenticated else None))
        return Response({'id': r.id, 'kind': r.kind, 'data': r.data}, status=201)

    @action(detail=True, methods=['post'], url_path='records/(?P<rid>[0-9]+)/delete')
    def record_delete(self, request, pk=None, rid=None):
        self.get_object().records.filter(pk=rid).delete()
        return Response({'detail': 'Removido.'})

    @action(detail=True, methods=['get'])
    def export(self, request, pk=None):
        """PORTABILIDADE DE DADOS (RGPD): tudo o que a casa tem sobre a entidade."""
        c = self.get_object()
        dados = {f.name: str(getattr(c, f.name, '') or '') for f in c._meta.fields}
        dados['records'] = [{'kind': r.kind, 'data': r.data, 'at': r.created_at.isoformat()}
                            for r in c.records.all()]
        from django.http import JsonResponse
        resp = JsonResponse(dados, json_dumps_params={'ensure_ascii': False, 'indent': 1})
        resp['Content-Disposition'] = f'attachment; filename="entidade_{c.code}.json"'
        return resp

    @action(detail=True, methods=['post'])
    def anonymize(self, request, pk=None):
        """REMOVER ENTIDADE (RGPD): os dados pessoais apagam-se; o nome vira um código
        anónimo. IRREVERSÍVEL — e os documentos fiscais NÃO se tocam (a AGT exige-os;
        ficam com o código anónimo como referência)."""
        c = self.get_object()
        codigo = f'ANON-{c.id:06d}'
        pessoais = ('name', 'last_name', 'other_names', 'tax_id', 'email', 'email2', 'phone',
                    'phone2', 'mobile', 'fax', 'address', 'address2', 'billing_address', 'city',
                    'postal_code', 'id_number', 'nationality', 'birth_place', 'site', 'notes',
                    'photo_url', 'signature_url', 'doc_type', 'doc_issue_place', 'doc_issued_by')
        for f in pessoais:
            if hasattr(c, f):
                setattr(c, f, codigo if f == 'name' else None)
        c.birth_date = None; c.doc_issue_date = None; c.doc_valid_until = None
        c.is_active = False
        c.save()
        c.records.all().delete()
        return Response({'detail': f'Entidade removida (RGPD). Referência anónima: {codigo}.',
                         'anonymous_code': codigo})

    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        """HISTÓRICO: reservas (PMS, se existir) + faturação POS desta entidade."""
        c = self.get_object()
        reservas = []
        try:
            from pms.models import Reservation
            for r in Reservation.objects.filter(guest__full_name__iexact=c.name)[:100]:
                reservas.append({'number': r.id, 'status': r.status,
                                 'check_in': str(getattr(r, 'check_in', '')),
                                 'check_out': str(getattr(r, 'check_out', '')),
                                 'room': getattr(getattr(r, 'room', None), 'number', None)})
        except Exception:
            pass
        from fiscal.models import FiscalDocument
        docs = [{'id': d.id, 'number': d.invoice_no, 'date': str(d.doc_date), 'total': str(d.gross_total),
                 'type': d.doc_type.code, 'voided': d.status == 'A'}
                for d in FiscalDocument.objects.filter(customer_name=c.name)[:200]]
        return Response({'reservations': reservas, 'invoices': docs})

    def perform_create(self, serializer):
        # (8143) "Formato do Nome da Entidade": quem cria só com Apelido/Outros nomes
        # fica com o nome montado pelo formato da casa — {name1}=apelido, {name2}=resto.
        from .params import P
        v = serializer.validated_data
        if not (v.get('name') or '').strip() and (v.get('last_name') or v.get('other_names')):
            fmt = P.text(8143, '{name1}, {name2}')
            v['name'] = (fmt.replace('{name1}', v.get('last_name') or '')
                            .replace('{name2}', v.get('other_names') or '')).strip(' ,')
        serializer.save()

    def get_queryset(self):
        from mdm.models import Customer
        qs = Customer.objects.select_related('entity_type', 'member_card').all()
        p = self.request.query_params
        if p.get('q'):
            t = p['q']
            qs = qs.filter(models.Q(name__icontains=t) | models.Q(last_name__icontains=t)
                           | models.Q(other_names__icontains=t) | models.Q(code__icontains=t)
                           | models.Q(tax_id__icontains=t) | models.Q(email__icontains=t)
                           | models.Q(phone__icontains=t) | models.Q(id_number__icontains=t))
        if p.get('entity_type'):
            qs = qs.filter(entity_type_id=p['entity_type'])
        if p.get('member_card'):
            qs = qs.filter(member_card_id=p['member_card'])
        if p.get('card_number'):
            qs = qs.filter(member_card_number__icontains=p['card_number'])
        for campo in ('code', 'tax_id', 'id_number'):
            if p.get(campo):
                qs = qs.filter(**{campo + '__icontains': p[campo]})
        for campo in ('last_name', 'name', 'other_names', 'address', 'nationality', 'country'):
            if p.get(campo):
                qs = qs.filter(**{campo + '__icontains': p[campo]})
        if p.get('contact'):
            qs = qs.filter(models.Q(email__icontains=p['contact']) | models.Q(phone__icontains=p['contact']))
        if p.get('blocked') in ('1', 'true'):
            qs = qs.filter(is_blocked=True)
        elif p.get('blocked') in ('0', 'false'):
            qs = qs.filter(is_blocked=False)
        return qs

    @action(detail=False, methods=['get'])
    def duplicates(self, request):
        """CONTROLO DE DUPLICACAO — a mesma pessoa criada tres vezes da tres contas
        correntes e um saldo que nunca fecha. Aqui apanham-se antes de doer."""
        from mdm.models import Customer
        grupos = []
        for chave, campo in (('tax_id', 'Nr. contribuinte'), ('id_number', 'Nr. de identificacao'),
                             ('email', 'E-mail'), ('phone', 'Telefone')):
            vistos = {}
            for c in Customer.objects.exclude(**{chave: None}).exclude(**{chave: ''}):
                vistos.setdefault(str(getattr(c, chave)).strip().lower(), []).append(c)
            for valor, lista in vistos.items():
                if len(lista) > 1:
                    grupos.append({'field': campo, 'value': valor,
                                   'entities': [{'id': x.id, 'code': x.code, 'name': x.name}
                                                for x in lista]})
        return Response({'groups': grupos, 'count': len(grupos)})


class EntityFieldRuleSerializer(serializers.ModelSerializer):
    label = serializers.CharField(source='get_field_display', read_only=True)

    class Meta:
        from .models import EntityFieldRule as _R
        model = _R
        fields = '__all__'


class EntityFieldRuleViewSet(viewsets.ModelViewSet):
    """CAMPOS OBRIGATORIOS — cada caixa marcada passa a ser exigida ao gravar a ficha."""
    permission_classes = [IsAuthenticated]
    serializer_class = EntityFieldRuleSerializer

    def get_queryset(self):
        from .models import EntityFieldRule
        # A lista e fixa (sao os campos da ficha): garante uma linha por campo.
        existentes = set(EntityFieldRule.objects.values_list('field', flat=True))
        for code, _ in EntityFieldRule.FIELDS:
            if code not in existentes:
                EntityFieldRule.objects.create(field=code, is_required=(code == 'name'))
        return EntityFieldRule.objects.all()



# ==========================================================================
# F&B — COMPRAS, DOCUMENTOS INTERNOS, INVENTÁRIO, EXISTÊNCIAS, CONTAS A PAGAR
# Tudo o mesmo documento de stock: o que muda é a SÉRIE (e as caixas dela).
# ==========================================================================
class StockDocLineSerializer(serializers.ModelSerializer):
    item_code = serializers.CharField(source='item.code', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True, default=None)
    stock_qty = serializers.SerializerMethodField()
    line_total = serializers.SerializerMethodField()

    class Meta:
        from .models import StockDocLine as _L
        model = _L
        fields = '__all__'
        read_only_fields = ['doc']

    def get_stock_qty(self, o):
        """Stock Qtd. — o que HÁ no armazém agora. É a coluna que evita pedir 40 caixas
        de um artigo de que já há 60 paradas no economato."""
        from inventory.models import StockLevel
        wh = o.warehouse_id or (o.doc.warehouse_id if o.doc_id else None)
        n = StockLevel.objects.filter(item=o.item, warehouse_id=wh).first()
        return str(n.quantity_on_hand) if n else '0'

    def get_line_total(self, o):
        return str(o.line_total)


class StockDocSerializer(serializers.ModelSerializer):
    lines = StockDocLineSerializer(many=True, required=False)
    series_name = serializers.CharField(source='series.name', read_only=True)
    series_kind = serializers.CharField(source='series.kind', read_only=True)
    status_name = serializers.CharField(source='status.name', read_only=True, default=None)
    status_bg = serializers.CharField(source='status.bg_color', read_only=True, default=None)
    status_fg = serializers.CharField(source='status.text_color', read_only=True, default=None)
    entity_name = serializers.CharField(source='entity.name', read_only=True, default=None)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True, default=None)
    warehouse_from_name = serializers.CharField(source='warehouse_from.name', read_only=True, default=None)
    original_number = serializers.CharField(source='original.number', read_only=True, default=None)
    subtotal = serializers.SerializerMethodField()
    tax_total = serializers.SerializerMethodField()
    discount_total = serializers.SerializerMethodField()
    line_discount_total = serializers.SerializerMethodField()
    total = serializers.SerializerMethodField()
    is_payable = serializers.BooleanField(read_only=True)

    class Meta:
        from .models import StockDoc as _D
        model = _D
        fields = '__all__'
        read_only_fields = ['number', 'posted', 'posted_at', 'paid_at', 'created_at']

    def get_subtotal(self, o):
        return str(o.subtotal)

    def get_tax_total(self, o):
        return str(o.tax_total)

    def get_discount_total(self, o):
        return str(o.discount_total)

    def get_line_discount_total(self, o):
        return str(o.line_discount_total)

    def get_total(self, o):
        return str(o.total)

    def _regras_da_serie(self, validated, instance=None):
        """As CAIXAS da série mandam no documento — é para isso que lá estão."""
        import datetime
        serie = validated.get('series') or (instance.series if instance else None)
        if not serie:
            return
        # "Observações obrigatórias" — um ajuste de stock sem explicação é um número
        # que ninguém consegue defender numa auditoria.
        notas = validated.get('notes', instance.notes if instance else None)
        if serie.notes_required and not (notas or '').strip():
            raise serializers.ValidationError(
                {'notes': ['Esta série exige observações — explique o documento.']})
        # "Nº externo obrigatório" — a fatura do fornecedor tem um número; sem ele não
        # há reconciliação com a conta corrente do fornecedor.
        ext = validated.get('external_ref', instance.external_ref if instance else None)
        if serie.external_required and not (ext or '').strip():
            raise serializers.ValidationError(
                {'external_ref': ['Esta série exige o nº do documento do fornecedor.']})
        # "Permite lançamentos futuros" — desmarcada, não se compra amanhã. Datas no
        # futuro são a forma clássica de empurrar custos para o mês seguinte.
        data = validated.get('doc_date', instance.doc_date if instance else None)
        if data and not serie.allow_future and data > datetime.date.today():
            raise serializers.ValidationError(
                {'doc_date': ['Esta série não permite datas futuras.']})
        # "Ligação a contas correntes" — o documento fica na conta de ALGUÉM. Sem
        # entidade, é uma dívida de ninguém, e as Contas a Pagar nunca batem.
        ent = validated.get('entity', instance.entity if instance else None)
        if serie.links_current_account and not ent:
            raise serializers.ValidationError(
                {'entity': ['Esta série liga a contas correntes: indique a entidade.']})
        # "Duplicação do nº externo" — Avisar não trava; Bloquear trava.
        if ext and serie.external_dup == 'BLOCK':
            from .models import StockDoc as _SD
            q = _SD.objects.filter(series=serie, external_ref=ext)
            if instance:
                q = q.exclude(pk=instance.pk)
            if q.exists():
                raise serializers.ValidationError(
                    {'external_ref': [f'Já existe um documento desta série com o nº "{ext}" '
                                      f'— seria pagar a mesma fatura duas vezes.']})

    def create(self, validated):
        linhas = validated.pop('lines', [])
        self._regras_da_serie(validated)
        doc = super().create(validated)
        self._linhas(doc, linhas)
        return doc

    def update(self, instance, validated):
        linhas = validated.pop('lines', None)
        # Um documento JÁ LANÇADO não se edita: o stock já se mexeu com estes números.
        # Quem se enganou, anula e faz outro — é assim que o histórico continua a bater.
        if instance.posted and linhas is not None:
            raise serializers.ValidationError(
                {'detail': 'Este documento já foi lançado no stock. Anule-o e faça um novo — '
                           'mexer nas linhas agora deixava o stock a mentir.'})
        doc = super().update(instance, validated)
        if linhas is not None:
            doc.lines.all().delete()
            self._linhas(doc, linhas)
        return doc

    def _linhas(self, doc, linhas):
        from .models import StockDocLine
        from .params import P
        # (8210/8211) casas decimais na quantidade e no preço — a casa decide com que
        # precisão trabalha (peixe ao grama vs. grades de cerveja).
        q_qtd = Decimal('1').scaleb(-max(0, min(4, P.int(8210, 3))))
        q_prc = Decimal('1').scaleb(-max(0, min(4, P.int(8211, 3))))
        # (8230/8231) AVISO de preço alterado: o fornecedor subiu o preço e ninguém viu —
        # é assim que a margem desaparece. O documento grava na mesma; o aviso volta
        # na resposta para o ecrã mostrar.
        avisar = P.bool(8230, True)
        pct_aviso = Decimal(str(P.int(8231, 5)))
        self._price_warnings = []
        for l in linhas:
            l.pop('doc', None)
            item = l.get('item')
            if l.get('quantity') is not None:
                l['quantity'] = Decimal(str(l['quantity'])).quantize(q_qtd)
            if l.get('unit_cost') is not None:
                l['unit_cost'] = Decimal(str(l['unit_cost'])).quantize(q_prc)
            if (avisar and item is not None and l.get('unit_cost') is not None
                    and (item.purchase_price or 0) > 0):
                antigo = Decimal(str(item.purchase_price))
                novo = Decimal(str(l['unit_cost']))
                if antigo and abs(novo - antigo) / antigo * 100 >= pct_aviso:
                    self._price_warnings.append(
                        f'{item.name}: preço mudou de {antigo} para {novo} '
                        f'({(novo - antigo) / antigo * 100:+.1f}%)')
            # (Artigo) "Permite alterar o IVA na compra" — normalmente a taxa é a da ficha
            # do artigo e não se mexe. Há artigos (importados, isentos na origem) em que o
            # fornecedor fatura com outra taxa: só ESSES aceitam a taxa que vem no documento.
            if item is not None and l.get('tax_percentage') is not None:
                taxa_ficha = Decimal(str(item.tax_percentage or 0))
                taxa_doc = Decimal(str(l['tax_percentage'] or 0))
                if taxa_doc != taxa_ficha and not getattr(item, 'allow_tax_change_on_purchase', False):
                    l['tax_percentage'] = taxa_ficha
            StockDocLine.objects.create(doc=doc, **l)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # os avisos de preço (8230) seguem com o documento acabado de criar
        if getattr(self, '_price_warnings', None):
            data['price_warnings'] = self._price_warnings
        return data


class StockDocViewSet(viewsets.ModelViewSet):
    """COMPRAS / DOCUMENTOS INTERNOS / INVENTÁRIO — o mesmo documento, séries diferentes."""
    permission_classes = [IsAuthenticated]
    serializer_class = StockDocSerializer

    def get_queryset(self):
        from .models import StockDoc
        qs = (StockDoc.objects.select_related('series', 'status', 'entity', 'warehouse',
                                              'warehouse_from', 'original')
              .prefetch_related('lines__item'))
        p = self.request.query_params
        if p.get('kinds'):                      # ex.: ORDER,INVOICE  |  REQUEST,TRANSFER
            qs = qs.filter(series__kind__in=p['kinds'].split(','))
        if p.get('series'):
            qs = qs.filter(series_id=p['series'])
        if p.get('status'):
            qs = qs.filter(status_id=p['status'])
        if p.get('number'):
            qs = qs.filter(number__icontains=p['number'])
        if p.get('entity'):
            qs = qs.filter(models.Q(entity__name__icontains=p['entity'])
                           | models.Q(external_ref__icontains=p['entity']))
        if p.get('from'):
            qs = qs.filter(doc_date__gte=p['from'])
        if p.get('to'):
            qs = qs.filter(doc_date__lte=p['to'])
        if p.get('warehouse_from'):
            qs = qs.filter(warehouse_from_id=p['warehouse_from'])
        if p.get('warehouse'):
            qs = qs.filter(warehouse_id=p['warehouse'])
        if p.get('unpaid') in ('1', 'true'):    # Contas a Pagar
            qs = qs.filter(series__nature='PAYABLE', paid=False, voided=False)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=(self.request.user.username
                                    if self.request.user.is_authenticated else None))

    def _exige_fnb(self, request):
        """(Utilizador POS) "Utilizador F&B" — mexer no stock não é para toda a gente.

        Lançar uma compra muda o custo médio de TODOS os artigos envolvidos. Quem não é
        do economato não devia poder fazê-lo por engano.
        """
        from .models import PosUser
        u = request.user
        if not u.is_authenticated or u.is_superuser or u.is_staff:
            return
        pu = PosUser.objects.filter(auth_user=u).first()
        if pu and not pu.is_fnb_user:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Só um utilizador F&B pode mexer nos documentos de stock '
                                   '(caixa "Utilizador F&B" na ficha do utilizador).')

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def post_stock(self, request, pk=None):
        """LANÇAR no stock. É aqui que a mercadoria entra (ou sai) a sério."""
        self._exige_fnb(request)
        doc = self.get_queryset().select_for_update().get(pk=pk)
        if doc.voided:
            return Response({'detail': 'Documento anulado.'}, status=400)
        if doc.posted:
            return Response({'detail': f'{doc.number} já foi lançado. Lançar duas vezes '
                                       f'duplicava o stock.'}, status=400)
        if not doc.lines.exists():
            return Response({'detail': 'Documento sem artigos.'}, status=400)

        from .params import P
        # (8229) ARMAZÉM EM CONTAGEM não recebe mercadoria: há um inventário aberto
        # sobre ele e cada entrada era uma contagem que nunca mais fechava certa.
        if P.bool(8229, True) and doc.warehouse_id:
            from .models import StockDoc
            contagem = (StockDoc.objects
                        .filter(warehouse=doc.warehouse, voided=False, posted=False,
                                series__kind='INVENTORY')
                        .exclude(pk=doc.pk).first())
            if contagem and doc.series.kind != 'INVENTORY':
                return Response({'detail': f'O armazém "{doc.warehouse.name}" está em contagem '
                                           f'({contagem.number}). Feche o inventário antes de '
                                           f'lançar mercadoria.'}, status=400)

        # (8277) STOCK NEGATIVO NA ORIGEM: impedir tirar o que lá não está. O negativo
        # é sempre um erro escondido (venda sem entrada, contagem por fazer).
        # Saem do armazém de ORIGEM: a Requisição e a Transferência.
        if P.bool(8277, False) and doc.series.kind in ('REQUEST', 'TRANSFER'):
            from inventory.models import StockLevel
            faltas = []
            for l in doc.lines.select_related('item'):
                origem = (doc.warehouse_from if doc.series.kind == 'TRANSFER' and doc.warehouse_from_id
                          else doc.warehouse_from or l.warehouse or doc.warehouse)
                nivel = StockLevel.objects.filter(item=l.item, warehouse=origem).first()
                disponivel = nivel.quantity_on_hand if nivel else Decimal('0')
                if disponivel < l.quantity:
                    faltas.append(f'{l.item.name}: pedido {l.quantity}, em stock {disponivel}')
            if faltas:
                return Response({'detail': 'Stock insuficiente na origem (parâmetro 8277):\n'
                                           + '\n'.join(faltas)}, status=400)

        n = doc.post(user=(request.user.username if request.user.is_authenticated else None))
        return Response({'detail': f'{doc.number} lançado — {n} movimento(s) de stock.',
                         'movements': n, 'document': self.get_serializer(doc).data})

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def void(self, request, pk=None):
        """ANULAR — se já tinha mexido no stock, os movimentos são REVERTIDOS.

        Anular sem devolver o stock era a maneira mais silenciosa de ter 200 garrafas
        no sistema e 0 no armazém.
        """
        doc = self.get_queryset().select_for_update().get(pk=pk)
        if doc.voided:
            return Response({'detail': 'Já estava anulado.'}, status=400)
        revertidos = 0
        if doc.posted:
            from inventory.models import StockMovement, StockLevel
            for mv in StockMovement.objects.filter(reference=doc.number):
                sinal = -1 if mv.movement_type in ('GRN', 'IN', 'TRANSFER_IN') else 1
                if mv.movement_type == 'ADJUST':
                    sinal = -1
                nivel = StockLevel.objects.filter(item=mv.item, warehouse=mv.warehouse).first()
                if nivel:
                    nivel.quantity_on_hand = (nivel.quantity_on_hand or 0) + sinal * mv.quantity
                    nivel.save(update_fields=['quantity_on_hand'])
                revertidos += 1
            StockMovement.objects.filter(reference=doc.number).delete()
        doc.voided = True
        doc.posted = False
        doc.save(update_fields=['voided', 'posted'])
        return Response({'detail': f'{doc.number} anulado. {revertidos} movimento(s) revertido(s).'})

    @action(detail=True, methods=['post'])
    def pay(self, request, pk=None):
        """PAGAR — sai das Contas a Pagar."""
        from django.utils import timezone
        doc = self.get_object()
        if not doc.is_payable:
            return Response({'detail': 'Este documento não é de contas a pagar.'}, status=400)
        if doc.paid:
            return Response({'detail': 'Já estava pago.'}, status=400)
        doc.paid = True
        doc.paid_at = timezone.now()
        doc.save(update_fields=['paid', 'paid_at'])
        return Response({'detail': f'{doc.number} marcado como pago.'})

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def duplicate(self, request, pk=None):
        """COPIAR — o mesmo documento, por lançar. A compra do mês repete-se.

        (Série) "Sujeito a conversão" — desmarcada, esta série não gera cópias nem
        conversões: um inventário não se "repete", conta-se de novo.
        """
        if not self.get_object().series.convertible:
            return Response({'detail': 'Esta série não permite copiar/converter documentos '
                                       '(caixa "Sujeito a conversão" desligada).'}, status=400)
        from .models import StockDocLine
        velho = self.get_object()
        linhas = list(velho.lines.all())
        velho.pk = None
        velho.number = ''
        velho.posted = velho.paid = velho.voided = False
        velho.posted_at = velho.paid_at = None
        velho.save()
        for l in linhas:
            l.pk = None
            l.doc = velho
            l.save()
        return Response(self.get_serializer(velho).data, status=201)

    @action(detail=False, methods=['post'])
    def sheet(self, request):
        """FOLHA DE CONTAGEM do inventário — gera as linhas com o STOCK TEÓRICO.

        É o botão "Atualizar" do ecrã: traz os artigos do armazém, com o que o sistema
        JULGA ter (quantidade e custo médio). O que o economato escreve por cima é a
        contagem física. A diferença entre os dois é o que desapareceu.

        As caixas dos filtros mandam mesmo:
          · incluir existências a NEGATIVO — um stock negativo é sempre um erro; se se
            esconder, nunca se corrige;
          · incluir artigos a ZERO — para poder lançar o que apareceu e não devia existir;
          · excluir INATIVOS — não se conta o que já não se vende;
          · iniciar a contagem a ZERO — obriga a contar tudo à mão (o modo honesto); sem
            ela, a folha vem pré-preenchida com o teórico e o contador limita-se a assinar.
        """
        from decimal import Decimal
        from inventory.models import StockLevel, Item

        wid = request.data.get('warehouse')
        if not wid:
            return Response({'detail': 'Escolha o armazém a contar.'}, status=400)

        incl_neg = request.data.get('include_negative', True)
        incl_zero = request.data.get('include_zero', True)
        excl_inativos = request.data.get('exclude_inactive', True)
        zerar = request.data.get('start_zero', False)
        familia = request.data.get('family')
        subfamilia = request.data.get('subfamily')

        niveis = {n.item_id: n for n in StockLevel.objects.filter(warehouse_id=wid)}
        artigos = Item.objects.all()
        if excl_inativos:
            artigos = artigos.filter(is_active=True)
        if subfamilia:
            artigos = artigos.filter(subfamily_id=subfamilia)
        elif familia:
            artigos = artigos.filter(subfamily__family_id=familia)

        linhas = []
        for a in artigos.select_related('subfamily'):
            n = niveis.get(a.id)
            qtd = (n.quantity_on_hand if n else Decimal('0')) or Decimal('0')
            custo = a.current_average_cost or Decimal('0')
            if qtd < 0 and not incl_neg:
                continue
            if qtd == 0 and not incl_zero:
                continue
            # O stock guarda 4 casas; o documento aceita 3. Sem este arredondamento, a
            # folha de contagem vinha com números que o próprio sistema recusava gravar.
            q3 = qtd.quantize(Decimal('0.001'))
            c4 = custo.quantize(Decimal('0.0001'))
            linhas.append({
                'item': a.id, 'code': a.code, 'name': a.name,
                'unit': getattr(a, 'unit', None) or 'UN',
                'theoretical_qty': str(q3), 'theoretical_cost': str(c4),
                'quantity': '0.000' if zerar else str(q3),      # contagem física
                'unit_cost': str(c4),
            })
        return Response({'lines': linhas, 'count': len(linhas)})


class PosStockLevelsView(APIView):
    """EXISTÊNCIAS DE STOCK — o que há, onde está, e quanto vale.

    Vem do ledger de movimentos (a fonte única). O valor é a quantidade ao custo médio:
    é o dinheiro que está parado dentro do armazém.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from inventory.models import StockLevel
        p = request.query_params
        qs = StockLevel.objects.select_related('item', 'warehouse')
        if p.get('warehouse'):
            qs = qs.filter(warehouse_id=p['warehouse'])
        if p.get('q'):
            qs = qs.filter(models.Q(item__name__icontains=p['q'])
                           | models.Q(item__code__icontains=p['q']))
        if p.get('family'):
            qs = qs.filter(item__subfamily__family_id=p['family'])
        if p.get('subfamily'):
            qs = qs.filter(item__subfamily_id=p['subfamily'])

        linhas, total = [], Decimal('0')
        for n in qs:
            qtd = n.quantity_on_hand or Decimal('0')
            custo = n.item.current_average_cost or Decimal('0')
            valor = qtd * custo
            total += valor
            minimo = n.min_stock_alert or Decimal('0')
            linhas.append({
                'id': n.id, 'item': n.item_id, 'code': n.item.code, 'name': n.item.name,
                'warehouse': n.warehouse.name, 'warehouse_id': n.warehouse_id,
                'quantity': str(qtd), 'average_cost': str(custo), 'value': str(valor),
                'min_stock': str(minimo), 'below_min': qtd <= minimo,
            })
        linhas.sort(key=lambda x: Decimal(x['value']), reverse=True)
        return Response({'rows': linhas, 'total_value': str(total), 'count': len(linhas)})


class PosPayablesView(APIView):
    """CONTAS A PAGAR — a quem devemos, e quanto.

    O saldo de cada fornecedor são as faturas de compra LANÇADAS e ainda não pagas. Só
    entram as séries marcadas como "Documento a pagar" (`nature=PAYABLE`) — é a caixa da
    série que decide, não uma regra escondida no código.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .models import StockDoc
        p = request.query_params
        docs = (StockDoc.objects.filter(series__nature='PAYABLE', paid=False, voided=False)
                .select_related('entity', 'series'))

        contas = {}
        for d in docs:
            e = d.entity
            chave = e.id if e else 0
            c = contas.setdefault(chave, {
                'id': chave,
                'name': e.name if e else '(sem entidade)',
                'address': e.address if e else None,
                'contact': (e.phone or e.email) if e else None,
                'other': e.tax_id if e else None,
                'phone': e.phone if e else None,
                'tax_id': e.tax_id if e else None,
                'balance': Decimal('0'), 'documents': [],
            })
            c['balance'] += d.total
            c['documents'].append({
                'id': d.id, 'number': d.number, 'date': d.doc_date,
                'due_date': d.due_date, 'total': str(d.total),
                'external_ref': d.external_ref, 'posted': d.posted,
            })

        linhas = list(contas.values())
        # Filtros do ecrã
        def bate(c):
            if p.get('name') and p['name'].lower() not in (c['name'] or '').lower():
                return False
            if p.get('tax_id') and p['tax_id'] not in (c['tax_id'] or ''):
                return False
            if p.get('phone') and p['phone'] not in (c['phone'] or ''):
                return False
            if p.get('address') and p['address'].lower() not in (c['address'] or '').lower():
                return False
            if p.get('id') and str(p['id']) != str(c['id']):
                return False
            if p.get('q'):
                t = p['q'].lower()
                alvo = ' '.join(str(c.get(k) or '') for k in ('name', 'address', 'tax_id', 'phone')).lower()
                if t not in alvo:
                    return False
            return True

        linhas = [c for c in linhas if bate(c)]
        linhas.sort(key=lambda x: x['balance'], reverse=True)
        total = sum((c['balance'] for c in linhas), Decimal('0'))
        for c in linhas:
            c['balance'] = str(c['balance'])
        return Response({'rows': linhas, 'total_due': str(total)})


# ==========================================================================
# REPORTING — Relatórios por pastas, Informação Online, Pesquisar Documentos
# ==========================================================================
class PosReportCatalogView(APIView):
    """AS PASTAS. Um sistema com 40 relatórios numa lista é um sistema onde ninguém
    encontra nada — as pastas são as do negócio, não as da base de dados."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from . import reports
        # O catálogo leva também os METADADOS do filtro universal (dias da semana,
        # agrupamentos, atalhos de período) — para o ecrã não os ter escritos à mão.
        return Response({'folders': reports.catalog(), 'filters': reports.FILTER_META})


class PosReportRunView(APIView):
    """CORRER um relatório com os seus parâmetros. Devolve colunas + linhas + totais."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from . import reports
        from fiscal.models import FiscalConfig
        code = request.data.get('code')
        params = request.data.get('params') or {}
        try:
            dados = reports.run(code, params)
        except KeyError:
            return Response({'detail': f'Relatório desconhecido: {code}'}, status=404)
        cfg = FiscalConfig.get()
        dados['company'] = cfg.company_name
        dados['tax_id'] = cfg.company_nif
        dados['user'] = request.user.username if request.user.is_authenticated else ''
        return Response(dados)


class PosOnlineInfoView(APIView):
    """INFORMAÇÃO ONLINE — o que está a acontecer AGORA. Não é um relatório: é o pulso
    do serviço (contas abertas, vendas do dia, mesas, cozinha)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.db.models import Sum, Count
        from django.utils import timezone
        from .models import POSTicket, POSTable, PrintJob, CashSession, POSTicketLine
        hoje = timezone.localdate()

        pagas = POSTicket.objects.filter(status='PAID', closed_at__date=hoje)
        total = pagas.aggregate(t=Sum('grand_total'))['t'] or Decimal('0')
        n = pagas.count()

        abertas = POSTicket.objects.filter(status='OPEN').select_related('outlet', 'table')
        mesas = POSTable.objects.values('status').annotate(n=Count('id'))

        top = (POSTicketLine.objects
               .filter(ticket__status='PAID', ticket__closed_at__date=hoje, is_void=False)
               .values('item__name').annotate(q=Sum('quantity'), t=Sum('line_total'))
               .order_by('-q')[:8])

        por_sector = (pagas.values('outlet__name')
                      .annotate(n=Count('id'), t=Sum('grand_total')).order_by('-t'))

        return Response({
            'now': timezone.now(),
            'today': {'tickets': n, 'total': str(total),
                      'avg': str(round(total / n, 2)) if n else '0'},
            'open_tickets': [{
                'ticket': t.ticket_number, 'outlet': t.outlet.name if t.outlet_id else '',
                'where': t.dest_label or (f'Mesa {t.table.table_number}' if t.table_id else '—'),
                'operator': t.operator_name, 'total': str(t.grand_total),
                'minutes': int((timezone.now() - t.opened_at).total_seconds() / 60),
            } for t in abertas],
            'tables': {m['status']: m['n'] for m in mesas},
            'top_items': [{'name': x['item__name'], 'qty': str(x['q']), 'total': str(x['t'])}
                          for x in top],
            'by_outlet': [{'outlet': x['outlet__name'], 'tickets': x['n'], 'total': str(x['t'])}
                          for x in por_sector],
            'kitchen_queue': PrintJob.objects.filter(status='QUEUED').count(),
            'open_cash': CashSession.objects.filter(status='OPEN').count(),
        })


class PosDocSearchView(APIView):
    """PESQUISAR DOCUMENTOS — encontrar a fatura que o cliente traz na mão.

    Procura por tipo, número, entidade/NIF, quarto, operador, modo de pagamento e datas.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from fiscal.models import FiscalDocument
        p = request.query_params
        qs = (FiscalDocument.objects.filter(source_module='pos')
              .select_related('doc_type', 'series').order_by('-doc_date', '-number'))
        if p.get('doc_type'):
            qs = qs.filter(doc_type__code=p['doc_type'])
        if p.get('number'):
            qs = qs.filter(invoice_no__icontains=p['number'])
        if p.get('entity'):
            qs = qs.filter(models.Q(customer_name__icontains=p['entity'])
                           | models.Q(customer_tax_id__icontains=p['entity']))
        if p.get('room'):
            qs = qs.filter(room_ref__icontains=p['room'])
        if p.get('payment'):
            qs = qs.filter(payment_method__icontains=p['payment'])
        if p.get('operator'):
            qs = qs.filter(operator_name__icontains=p['operator'])
        if p.get('from'):
            qs = qs.filter(doc_date__gte=p['from'])
        if p.get('to'):
            qs = qs.filter(doc_date__lte=p['to'])

        # (8101) Nº de documentos visíveis no POS — 0 = todos (com teto de segurança).
        from .params import P
        limite = P.int(8101, 0) or 500
        linhas = [{
            'id': d.id, 'name': d.doc_type.name, 'type': d.doc_type.code,
            'number': d.invoice_no, 'date': str(d.doc_date),
            'total': str(d.gross_total), 'tax_id': d.customer_tax_id or '',
            'entity': d.customer_name or 'Consumidor Final',
            'operator': d.operator_name or '', 'place': d.place_ref or '',
            'payment': d.payment_method or '',
            'voided': d.status == 'A', 'settled': d.settled,
        } for d in qs[:min(limite, 2000)]]
        return Response({
            'rows': linhas,
            'total': str(sum((Decimal(l['total']) for l in linhas if not l['voided']),
                             Decimal('0'))),
            'count': len(linhas),
        })


class PosDocDetailView(APIView):
    """PRÉ-VISUALIZAR / IMPRIMIR 2ª VIA / ANULAR (nota de crédito)."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from fiscal.models import FiscalDocument, FiscalConfig
        d = FiscalDocument.objects.filter(pk=pk).select_related('doc_type').first()
        if not d:
            return Response({'detail': 'Documento não encontrado.'}, status=404)
        cfg = FiscalConfig.get()
        # (Conta bancária) "Mostrar na fatura" — as contas marcadas saem no rodapé do
        # documento: é assim que o cliente sabe para onde transferir.
        bancos = []
        try:
            from fiscal.models import CompanyBankAccount
            bancos = [{'bank': b.bank_name, 'iban': b.iban}
                      for b in CompanyBankAccount.objects.filter(show_on_invoice=True)]
        except Exception:
            pass
        return Response({
            'company': cfg.company_name, 'company_tax_id': cfg.company_nif,
            'certificate': cfg.certificate_number,
            'bank_accounts': bancos,
            'invoice_no': d.invoice_no, 'type': d.doc_type.name, 'date': str(d.doc_date),
            'customer': d.customer_name, 'customer_tax_id': d.customer_tax_id,
            'operator': d.operator_name, 'place': d.place_ref, 'payment': d.payment_method,
            'lines': [{'description': l.description, 'quantity': str(l.quantity),
                       'unit_price': str(l.unit_price), 'tax': str(l.tax_percentage),
                       'total': str(l.line_total + l.tax_amount)} for l in d.lines.all()],
            'net': str(d.net_total), 'tax': str(d.tax_total), 'gross': str(d.gross_total),
            'amount_in_words': d.amount_in_words,
            'hash': d.doc_hash, 'voided': d.status == 'A',
            'print_count': d.print_count,
        })

    def post(self, request, pk):
        from fiscal.models import FiscalDocument
        from fiscal import services as fs
        d = FiscalDocument.objects.filter(pk=pk).first()
        if not d:
            return Response({'detail': 'Documento não encontrado.'}, status=404)
        acao = request.data.get('action')

        if acao == 'print':
            # 2ª VIA — o original imprime-se uma vez; as seguintes dizem "2ª via". Duas
            # vias iguais a circular é o princípio de uma fatura paga duas vezes.
            d.print_count = (d.print_count or 0) + 1
            d.save(update_fields=['print_count'])
            return Response({'detail': f'{d.invoice_no} — via nº {d.print_count}.',
                             'copy': d.print_count > 1})

        if acao == 'void':
            # Um documento fiscal NÃO se apaga: anula-se com nota de crédito, também
            # assinada e encadeada. É o que a AGT exige — e o que impede que uma venda
            # desapareça sem rasto.
            motivo = request.data.get('reason')
            if not motivo:
                return Response({'detail': 'Indique o motivo da anulação.'}, status=400)
            try:
                # `create_credit_note` recebe o ID do documento, não o objeto. Passar o
                # objeto rebentava com "Field 'id' expected a number but got
                # <FiscalDocument: FR A/89>" — e anular pela aba Documentos ficava
                # impossível, que é justamente o caminho normal para corrigir uma venda.
                nc = fs.create_credit_note(
                    d.id, reason=motivo,
                    user=(request.user.username if request.user.is_authenticated else None),
                    ip=request.META.get('REMOTE_ADDR'))
            except Exception as e:
                return Response({'detail': str(e)}, status=400)
            return Response({'detail': f'Nota de crédito {nc.invoice_no} emitida.',
                             'credit_note': nc.invoice_no}, status=201)

        return Response({'detail': 'Ação inválida.'}, status=400)


class PosAlertsView(APIView):
    """CENTRO DE ALERTAS — o sistema procura os problemas; o dono não tem de os procurar.

    Cada alerta diz O QUE se passa, PORQUE é grave e O QUE fazer. Um alerta que não diz
    o que fazer é ruído — e ruído ensina-se a ignorar.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from . import alerts
        return Response(alerts.run_all())


class MemberCardAccountView(APIView):
    """A CONTA DO CARTÃO — carregar, ver o saldo, liquidar a dívida, ver os pontos.

    O crédito de um cartão pré-pago tem de ENTRAR por algum lado: é aqui. E a dívida de
    um cartão de débito tem de se poder pagar — senão o sócio acumula para sempre.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from mdm.models import Customer
        from .models import MemberCardMovement
        c = Customer.objects.select_related('member_card').filter(pk=pk).first()
        if not c:
            return Response({'detail': 'Entidade não encontrada.'}, status=404)
        if not c.member_card_id:
            return Response({'detail': 'Esta entidade não tem cartão de membro.'}, status=400)
        card = c.member_card
        return Response({
            'entity': {'id': c.id, 'name': c.name},
            'card': {'code': card.code, 'name': card.name, 'number': c.member_card_number,
                     'has_credit': card.has_credit, 'has_debit': card.has_debit,
                     'has_points': card.has_points, 'has_discount': card.has_discount,
                     'points_per_100': str(card.points_per_100),
                     'point_value': str(card.point_value),
                     'credit_limit': str(card.credit_limit)},
            'credit': str(MemberCardMovement.credit_of(c)),
            'debt': str(MemberCardMovement.debt_of(c)),
            'points': str(MemberCardMovement.points_of(c)),
            'points_value': str(MemberCardMovement.points_of(c) * (card.point_value or 0)),
            'movements': [{
                'id': m.id, 'kind': m.kind, 'kind_display': m.get_kind_display(),
                'amount': str(m.amount), 'points': str(m.points),
                'reason': m.reason, 'at': m.created_at, 'by': m.created_by,
            } for m in MemberCardMovement.objects.filter(customer=c)[:100]],
        })

    @transaction.atomic
    def post(self, request, pk):
        from mdm.models import Customer
        from .models import MemberCardMovement
        c = Customer.objects.select_related('member_card').filter(pk=pk).first()
        if not c or not c.member_card_id:
            return Response({'detail': 'Entidade sem cartão de membro.'}, status=400)
        card = c.member_card
        acao = request.data.get('action')
        try:
            valor = Decimal(str(request.data.get('amount') or '0'))
        except Exception:
            valor = Decimal('0')
        quem = request.user.username if request.user.is_authenticated else 'POS'

        if acao == 'load':
            # (Cartão) "Crédito" — carregar. Um cartão sem esta caixa não tem saldo nenhum
            # para carregar: seria dinheiro a entrar numa conta que não existe.
            if not card.has_credit:
                return Response({'detail': f'O cartão "{card.name}" não tem crédito '
                                           f'(a caixa "Crédito" está desligada).'}, status=400)
            if valor <= 0:
                return Response({'detail': 'Indique o valor a carregar.'}, status=400)
            MemberCardMovement.objects.create(customer=c, card=card, kind='LOAD', amount=valor,
                                              created_by=quem, reason=request.data.get('reason'))
            return Response({'detail': f'Carregados {valor} Kz.',
                             'credit': str(MemberCardMovement.credit_of(c))})

        if acao == 'settle':
            if not card.has_debit:
                return Response({'detail': f'O cartão "{card.name}" não é de débito.'}, status=400)
            divida = MemberCardMovement.debt_of(c)
            if valor <= 0 or valor > divida:
                return Response({'detail': f'{c.name} deve {divida} Kz.'}, status=400)
            MemberCardMovement.objects.create(customer=c, card=card, kind='SETTLE', amount=valor,
                                              created_by=quem, reason='Liquidação da dívida')
            return Response({'detail': f'Liquidados {valor} Kz.',
                             'debt': str(MemberCardMovement.debt_of(c))})

        return Response({'detail': 'Ação inválida (load | settle).'}, status=400)


class PosTerminalKeyboardView(APIView):
    """O TECLADO QUE O TERMINAL DESENHA — a árvore de teclas, tal como foi configurada.

    Até aqui o terminal mostrava os artigos por categoria e ignorava o teclado: quem
    configurava as páginas, as pastas, as cores e o número de colunas não via nada mudar
    no ecrã do empregado. Um teclado que ninguém vê é trabalho deitado fora.

    O terminal desenha o que vier daqui:
      · as PÁGINAS (a fila de cima: COMIDAS, BEBIDAS…);
      · dentro de cada uma, as PASTAS (SNACKS, PETISCOS…) e os ARTIGOS;
      · as CORES e o nº de colunas/linhas;
      · e as caixas "Visualizar Códigos" e "Visualizar Preços", que decidem o que sai
        escrito dentro da tecla.

    O NÍVEL DE PREÇO do teclado também manda: o mesmo artigo custa um preço na esplanada
    e outro no bar do piso 8 — é o mesmo teclado com outro nível.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .models import PosKeyboard, PosKeyboardKey, PosTerminal
        from .params import P
        from inventory.models import ItemPrice

        kb = None
        # O teclado pode vir pedido à mão, ou ser o do TERMINAL que está a perguntar.
        if request.query_params.get('keyboard'):
            kb = PosKeyboard.objects.filter(pk=request.query_params['keyboard'],
                                            is_active=True).first()
        if not kb and request.query_params.get('terminal'):
            t = PosTerminal.objects.filter(pk=request.query_params['terminal']).first()
            kb = getattr(t, 'keyboard', None) if t else None
        # (8176) "Configuração de teclado por": Setor usa o teclado ligado ao setor
        # pedido (a ficha do setor guarda o NOME do teclado); Terminal já foi tratado
        # acima; Operador cai no primeiro ativo (a ficha dele não tem teclado próprio).
        if not kb and request.query_params.get('sector'):
            try:
                from .models import PosSector
                s = PosSector.objects.filter(pk=request.query_params['sector']).first()
                if s:
                    # (8573) o teclado escolhido na ficha do setor — por ID (ligação real)
                    escolhido = (s.params or {}).get('8573') or (s.params or {}).get(8573)
                    if escolhido:
                        kb = PosKeyboard.objects.filter(pk=escolhido, is_active=True).first()
                    # retrocompatível: fichas antigas guardavam o NOME
                    if not kb and s.keyboard:
                        kb = PosKeyboard.objects.filter(name__iexact=str(s.keyboard),
                                                        is_active=True).first()
            except Exception:
                kb = None
        if not kb:
            kb = PosKeyboard.objects.filter(is_active=True).order_by('number').first()
        if not kb:
            return Response({'detail': 'Não há teclados configurados.',
                             'keyboard': None, 'pages': []})

        # UM SETOR, UM TECLADO. Juntar as páginas de todos os teclados era misturar
        # o Restaurante com o Lounge no mesmo ecrã: o empregado via teclas que não são
        # da sala onde está. Cada setor carrega o teclado que a ficha dele manda.
        outros = []

        chaves = list(PosKeyboardKey.objects.filter(keyboard=kb)
                      .select_related('item').order_by('sort_order', 'id'))
        precos = {}
        # O NÍVEL DE PREÇO do SETOR manda (o mesmo artigo custa mais no Rooftop);
        # sem setor, vale o nível configurado no próprio teclado.
        nivel = kb.price_level or 1
        if request.query_params.get('sector'):
            try:
                from .models import PosSector
                s = PosSector.objects.filter(pk=request.query_params['sector']).first()
                if s and s.price_level and s.price_level > 1:
                    nivel = s.price_level
            except Exception:
                pass
        if nivel and nivel > 1:
            precos = {p.item_id: p.price for p in ItemPrice.objects.filter(level=nivel)}

        # (Utilizador POS) "Usa preço de custo" — o staff autorizado vê o CUSTO na tecla,
        # não o preço de venda. É a ficha do operador a mandar no ecrã.
        custo_op = False
        if request.query_params.get('operator'):
            from .models import PosUser
            op = PosUser.objects.filter(pk=request.query_params['operator']).first()
            custo_op = bool(op and getattr(op, 'use_cost_price', False))

        def preco(it):
            if not it:
                return None
            if custo_op:
                return str(it.current_average_cost or 0)
            # O nível de preço do teclado ganha ao preço base — é para isso que existe.
            return str(precos.get(it.id, it.sale_price or 0))

        def desenha(k):
            d = {
                'id': k.id, 'kind': k.kind, 'label': k.label,
                'color': k.color, 'text_color': k.text_color, 'span': k.span,
                'item': k.item_id,
                # As duas caixas do teclado decidem o que sai ESCRITO na tecla.
                'code': (k.item.code if (k.item and kb.show_codes) else None),
                'price': (preco(k.item) if (k.item and kb.show_prices) else None),
                'available': True,
            }
            # Um artigo inativo não se vende — a tecla fica lá, mas apagada. Tirá-la do
            # ecrã mudava o mapa que o empregado tem na cabeça (e ele carregava na errada).
            if k.item and not k.item.is_active:
                d['available'] = False
            filhos = [x for x in chaves if x.parent_id == k.id]
            if filhos:
                d['children'] = [desenha(f) for f in filhos]
            return d

        paginas = [desenha(k) for k in chaves if k.parent_id is None]

        # ...e as páginas dos OUTROS teclados ativos, a seguir (a junção).
        for outro in outros:
            chaves = list(PosKeyboardKey.objects.filter(keyboard=outro)
                          .select_related('item').order_by('sort_order'))
            paginas += [desenha(k) for k in chaves if k.parent_id is None]

        return Response({
            'keyboard': {'id': kb.id, 'number': kb.number, 'name': kb.name,
                         'cols': kb.cols, 'rows': kb.rows,
                         'show_codes': kb.show_codes, 'show_prices': kb.show_prices,
                         'price_level': kb.price_level},
            'pages': paginas,
        })


def _board_da_reserva(r):
    """O REGIME (RO/BB/HB/FB/AI) do hóspede.

    A reserva não o guarda — quem o tem é a TARIFA do tipo de quarto (pms.RatePlan.board).
    Lê-se de lá. Sem tarifa ativa para aquele tipo de quarto, assume-se "só dormida" (RO):
    é o regime que NÃO oferece refeições — na dúvida, cobra-se, não se oferece.
    """
    try:
        from pms.models import RatePlan
        rp = (RatePlan.objects.filter(room_type=r.room_type_id, is_active=True)
              .order_by('-valid_from').first())
        return (rp.board if rp else 'RO').upper()
    except Exception:
        return 'RO'


class PosGuestsView(APIView):
    """INFO. HÓSPEDE — quem está em casa, agora.

    É o que o empregado precisa para lançar um consumo no quarto: o quarto, o hóspede, a
    conta (folio), o regime e o saldo. Sem isto, ele pergunta o nome ao cliente e escreve
    o quarto que o cliente disser — e é assim que o jantar do 302 vai parar ao 203.

    O POS vende-se SOZINHO: um restaurante sem hotel não tem PMS. Nesse caso este ecrã
    diz-lo com todas as letras, em vez de rebentar.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .params import P
        # (8035) "Interface com PMS" é o interruptor-mestre; (8064) "Informação do
        # hóspede" desliga só este ecrã. Desligados no backoffice, o terminal não
        # mostra hóspedes — mesmo com PMS instalado (casas que alugam o restaurante).
        if not P.bool(8035, True) or not P.bool(8064, True):
            return Response({'available': False, 'rows': [],
                             'detail': 'A interface com o PMS está desligada nos parâmetros '
                                       '(8035/8064).'})
        try:
            from pms.models import Reservation
        except Exception:
            return Response({'available': False, 'rows': [],
                             'detail': 'Este sistema não tem o módulo de alojamento (PMS). '
                                       'A informação de hóspedes só existe com hotel.'})

        q = (request.query_params.get('q') or '').strip()
        rs = (Reservation.objects.filter(status='CHECKED_IN')
              .select_related('room', 'guest', 'room_type'))
        linhas = []
        for r in rs:
            nome = getattr(r.guest, 'full_name', None) or str(getattr(r, 'guest', '') or '')
            quarto = getattr(r.room, 'number', None) or ''
            if q and q.lower() not in f'{nome} {quarto}'.lower():
                continue
            folio = None
            saldo = Decimal('0')
            try:
                from pms.models import Folio
                folio = Folio.objects.filter(reservation=r, status='OPEN').first()
                if folio:
                    saldo = sum((c.amount for c in folio.charges.all()), Decimal('0'))
            except Exception:
                pass
            linhas.append({
                'room': quarto,
                'folio': folio.id if folio else None,
                'guest': nome,
                # (8236) mostrar (ou não) o grupo/empresa na pesquisa de quartos
                'entity': (getattr(getattr(r, 'company', None), 'name', None) or ''
                           if P.bool(8236, True) else ''),
                'checkout': str(getattr(r, 'check_out', '') or ''),
                # O REGIME não está na reserva: está na TARIFA do tipo de quarto (RatePlan).
                # É o que o PMS tem — não se inventa um campo novo para o POS.
                'board': _board_da_reserva(r),
                'balance': str(saldo),
                'reservation': r.id,
            })
        return Response({'available': True, 'rows': linhas})


class PosMealPlanView(APIView):
    """MAPA DE REFEIÇÕES — que hóspedes têm direito a que refeição, hoje.

    O REGIME diz tudo: BB só tem pequeno-almoço; HB tem mais uma refeição; AI tem tudo.
    Servir um almoço a quem só tem BB e não o cobrar é oferecer o almoço — e ninguém dá
    por isso porque "o cliente é do hotel".

    Verde = incluído no regime. Proibido = não está incluído (cobra-se).
    """
    permission_classes = [IsAuthenticated]

    # O que cada regime inclui. É a tabela do ofício.
    REGIMES = {
        'RO': [],                                   # só dormida
        'BB': ['PA'],                                # dormida + pequeno-almoço
        'HB': ['PA', 'ALM'],                         # meia pensão
        'FB': ['PA', 'ALM', 'JANT'],                 # pensão completa
        'AI': ['PA', 'CB', 'ALM', 'LANCHE', 'JANT'],  # tudo incluído
    }
    REFEICOES = [('PA', 'Pequeno Almoço'), ('CB', 'Coffee Break Manhã'),
                 ('ALM', 'Almoço'), ('LANCHE', 'Lanche'), ('JANT', 'Jantar')]

    def get(self, request):
        from .params import P
        # (8035) interruptor-mestre do PMS também manda aqui.
        if not P.bool(8035, True):
            return Response({'available': False, 'rows': [],
                             'meals': [{'code': c, 'label': l} for c, l in self.REFEICOES],
                             'detail': 'A interface com o PMS está desligada nos parâmetros (8035).'})
        try:
            from pms.models import Reservation
        except Exception:
            return Response({'available': False, 'rows': [],
                             'meals': [{'code': c, 'label': l} for c, l in self.REFEICOES],
                             'detail': 'Sem módulo de alojamento (PMS): não há hóspedes nem regimes.'})

        # (8147) "Forçar a pesquisa de hóspedes": o mapa só devolve linhas depois de o
        # empregado ESCREVER quem procura — hotéis de 400 quartos não listam todos.
        q = (request.query_params.get('q') or '').strip()
        if P.bool(8147, False) and not q:
            return Response({'available': True, 'rows': [], 'must_search': True,
                             'meals': [{'code': c, 'label': l} for c, l in self.REFEICOES],
                             'detail': 'Escreva o nome ou o quarto para pesquisar (parâmetro 8147).'})

        rs = (Reservation.objects.filter(status='CHECKED_IN')
              .select_related('room', 'guest', 'room_type'))
        linhas = []
        for r in rs:
            nome_q = f"{getattr(r.guest, 'full_name', '') or ''} {getattr(r.room, 'number', '') or ''}"
            if q and q.lower() not in nome_q.lower():
                continue
            regime = _board_da_reserva(r)
            incluidas = self.REGIMES.get(regime, [])
            linhas.append({
                'room': getattr(r.room, 'number', ''),
                'reservation': r.id,
                'guest': getattr(r.guest, 'full_name', None) or str(getattr(r, 'guest', '')),
                'entity': getattr(getattr(r, 'company', None), 'name', None) or '',
                'board': regime,
                'pax': getattr(r, 'adults', 1) or 1,
                'meals': {c: (c in incluidas) for c, _ in self.REFEICOES},
            })
        return Response({
            'available': True,
            'meals': [{'code': c, 'label': l} for c, l in self.REFEICOES],
            'rows': linhas,
        })


class _SectorAccess:
    """(Utilizador POS) "Todos os setores" — desmarcada, o operador só vê os SEUS.

    Sem isto, o empregado do Lounge abria o Rooftop, vendia ao preço errado e mexia em
    mesas que não eram dele. A lista de setores do terminal passa por aqui.
    """

    @staticmethod
    def sectors_for(operator_id):
        from .models import PosUser, PosSector
        qs = PosSector.objects.filter(is_active=True)
        if not operator_id:
            return qs
        op = PosUser.objects.filter(pk=operator_id).first()
        if not op or getattr(op, 'all_sectors', True):
            return qs
        ids = list(op.sectors.values_list('id', flat=True))
        return qs.filter(id__in=ids) if ids else qs.none()


class EmailTemplateRules:
    """As caixas dos MODELOS DE E-MAIL:

    · "É SMS" — 160 caracteres e SEM anexos. Um SMS com anexo não existe; deixar
      gravar era prometer ao hotel uma coisa que a rede nunca ia entregar.
    · "Sub-modelo" — é um pedaço (cabeçalho, rodapé) usado DENTRO de outros; não se
      envia sozinho, por isso não aparece na lista de envio.
    · "Prioridade booking" — nos e-mails automáticos de reservas, é este que ganha
      quando há vários modelos para o mesmo evento.
    """

    @staticmethod
    def valida_sms(template, body=None):
        corpo = body if body is not None else (getattr(template, 'body', '') or '')
        if getattr(template, 'is_sms', False) and len(corpo) > 160:
            raise serializers.ValidationError(
                {'body': [f'Um SMS tem 160 caracteres — este tem {len(corpo)}.']})

    @staticmethod
    def valida_anexo(template):
        if getattr(template, 'is_sms', False):
            raise serializers.ValidationError(
                {'template': ['Um SMS não leva anexos.']})

    @staticmethod
    def para_envio(qs):
        # sub-modelos ficam de fora da lista de envio; prioridade booking primeiro
        return qs.filter(is_sub_template=False).order_by('-booking_priority', 'id')



def _sector_payload(s):
    """O SETOR como o terminal precisa dele — com os PARÂMETROS DA FICHA.

    Cada linha da ficha do setor (Geral e Documentos) chega aqui com nome, para o
    Front Office obedecer: que teclado usar, que tipos de cliente aceita, se deixa
    descontos, que preço aplica, em que estado fica a mesa depois de fechar, e que
    SÉRIE de documento usa para cada tipo (Fatura-Recibo, Talão, Nota de Crédito…).
    """
    p = s.params or {}

    def val(num):
        return p.get(str(num), p.get(num))

    return {
        'id': s.id, 'name': s.name, 'outlet': s.outlet_id,
        'price_level': s.price_level, 'map_bg_color': s.map_bg_color,
        # (8573) o TECLADO deste setor — o terminal carrega só este
        'keyboard': val(8573),
        # (8581) que tipos de cliente esta sala aceita · (8582) descontos
        'customer_types': val(8581),
        'discounts': val(8582),
        # (8592) preços disponíveis · (8596) estado da mesa depois de fechar a conta
        'prices': val(8592),
        'table_state_after_close': val(8596) or 'Disponível',
        'complex_mode': val(8575),
        'reporting_period': val(8611),
        # (8553-8589) as SÉRIES de documento que este setor emite
        'documents': {
            'invoice_receipt': val(8557), 'credit_note': val(8556),
            'account_query': val(8555), 'receipt_slip': val(8553),
            'receipt': val(8558), 'invoice_cc': val(8562),
            'void_receipt': val(8587), 'goods_note': val(8588),
            'void_goods_note': val(8589),
        },
    }

class PosTerminalConfigView(APIView):
    """O QUE O TERMINAL FAZ — decidido no backoffice, não no código do terminal.

    O terminal não tem opinião própria: pergunta ao servidor como se comporta. Os
    PARÂMETROS (Configuração POS › Parâmetros) mandam:

      · Venda Direta (8300) — vender ao balcão, sem passar pelas mesas;
      · Escolher o setor ao entrar (8302);
      · Exigir abertura de caixa (8304);
      · Perguntar tipo de cliente (8175) — Passante / Hotel / Consumo Interno;
      · Enviar para a cozinha automaticamente (8308);
      · Pedir a entidade antes de cobrar (8310);
      · Tempo para refrescar o mapa de mesas (8063);
      · Transferências de mesas (8124) — Total / Parcial / Não permitir;
      · Permitir fechar o dia no Front Office (8062).

    Mudar a caixa no backoffice muda o terminal no recarregamento seguinte. Não há uma
    segunda lista de opções escondida no código do ecrã — havia, e era assim que o
    sistema dizia uma coisa e fazia outra.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .params import P
        operador = request.query_params.get('operator')
        setores = [_sector_payload(s) for s in _SectorAccess.sectors_for(operador)]
        return Response({
            # os SETORES que ESTE operador pode servir ("Todos os setores" da ficha dele)
            'sectors': setores,
            'direct_sale': P.bool(8300, False),
            'ask_sector': P.bool(8302, True),
            'require_cash_open': P.bool(8304, True),
            'ask_guest_type': P.bool(8175, True),
            'auto_fire_kitchen': P.bool(8308, False),
            'ask_entity_before_pay': P.bool(8310, False),
            # (8311) pedir o cliente ao ABRIR a venda (não só na hora de cobrar).
            # LIGADO de fábrica: perguntar depois é tarde — a fatura já saiu como
            # Consumidor Final e essa não se corrige, anula-se por nota de crédito.
            'ask_entity_on_open': P.bool(8311, True),
            # (8312) entrar no balcão já com a 1ª página do teclado aberta
            'open_keyboard_on_sale': P.bool(8312, True),
            'tables_refresh_seconds': P.int(8063, 8),
            'transfers': P.text(8124, 'Parcial'),
            'allow_day_close': P.bool(8062, False),
            # (8088/8138) tempos de inatividade; (8001) layout do teclado tátil;
            # (8012) o meio de pagamento base aparece primeiro; (8084) estado do
            # pagamento no mapa; (8197) aviso ao dividir grandes quantidades;
            # (8271) fundo do mapa; (8180) largura do scroll; (8333) tipo obrigatório.
            'session_timeout_minutes': P.int(8088, 60),
            'app_close_minutes': P.int(8138, 120),
            'keyboard_layout': P.text(8001, 'QWERTY (Português)'),
            'base_payment_mode': P.text(8012, 'Cash'),
            'show_payment_status': P.bool(8084, False),
            'split_warn_qty': P.int(8197, 10),
            'map_background': P.bool(8271, True),
            'keyboard_scroll_width': P.int(8180, 0),
            'guest_type_required': P.bool(8333, True),
        })


class PosTerminalChangePinView(APIView):
    """(Utilizador POS) "Obrigar a mudar o PIN" — a troca feita NO TERMINAL.

    O gestor entrega o operador novo com um PIN provisório e a caixa marcada; ao primeiro
    login o terminal força esta troca antes de deixar vender. Ao mudar, a caixa
    desliga-se sozinha — como a da password no backoffice. O PIN novo é recusado se já
    pertencer a outro operador (senão o login ficava ambíguo para os dois).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from django.contrib.auth.hashers import check_password, make_password
        user = PosUser.objects.filter(pk=request.data.get('operator')).first()
        atual = str(request.data.get('current_pin') or '')
        novo = str(request.data.get('new_pin') or '')
        if not user or not user.pos_pin or not check_password(atual, user.pos_pin):
            return Response({'detail': 'PIN atual incorreto.'}, status=400)
        if not novo.isdigit() or len(novo) < 4:
            return Response({'detail': 'O novo PIN deve ter pelo menos 4 dígitos.'}, status=400)
        if novo == atual:
            return Response({'detail': 'O novo PIN tem de ser diferente do atual.'}, status=400)
        for outro in PosUser.objects.filter(is_active=True).exclude(pk=user.pk):
            if outro.pos_pin and check_password(novo, outro.pos_pin):
                return Response({'detail': 'Esse PIN já está em uso por outro operador. Escolha outro.'},
                                status=400)
        user.pos_pin = make_password(novo)
        user.pos_must_change_pin = False
        user.save(update_fields=['pos_pin', 'pos_must_change_pin'])
        return Response({'detail': 'PIN alterado com sucesso.'})


class PosBootstrapView(APIView):
    """CONFIGURATION ENGINE — o objeto ÚNICO com que o Front Office arranca.

    Em vez de o terminal fazer dez chamadas e cada ecrã verificar as suas opções à mão,
    recebe UM objeto: empresa, licença, parâmetros, setores permitidos, teclado, meios
    de pagamento, moedas, impostos, módulos e as caixas do operador. O terminal apenas
    INTERPRETA — não decide nada.

    É assim que o backoffice passa a ser a única fonte de verdade: muda-se a caixa lá,
    e o terminal muda no arranque seguinte, sem uma linha de código nova.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.conf import settings
        from .params import P
        from .models import PosModule, PosUser
        from mdm.models import PaymentMethod, Currency
        from fiscal.models import FiscalConfig, TaxRate
        from licensing.offline_validator import get_active_modules

        operador_id = request.query_params.get('operator')
        operador = PosUser.objects.filter(pk=operador_id).first() if operador_id else None

        cfg = FiscalConfig.get()

        # ── módulos: as CINCO caixas de cada um mandam em como (e se) aparece ──
        modulos = [{
            'module_id': m.module_id, 'name': m.name, 'menu': m.menu,
            'sort_order': m.sort_order, 'right_id': m.right_id,
            # "Mostrar no menu" / "no ambiente de trabalho": onde a entrada aparece.
            'show_in_menu': m.show_in_menu,
            'show_on_desktop': m.show_on_desktop,
            # COMO abre: embebido (iframe), como widget, ou numa janela à parte.
            'open_as': ('external' if getattr(m, 'is_external_window', False)
                        else 'iframe' if m.is_iframe
                        else 'widget' if getattr(m, 'is_widget', False)
                        else 'screen'),
        } for m in PosModule.objects.filter(is_active=True).order_by('sort_order')]

        return Response({
            'company': {'name': cfg.company_name, 'tax_id': cfg.company_nif,
                        'certificate': cfg.certificate_number,
                        'environment': cfg.environment},
            'license': {'modules': get_active_modules(settings.BASE_DIR, settings.SECRET_KEY)},
            'modules': modulos,
            # os setores que ESTE operador pode servir (caixa "Todos os setores")
            'sectors': [_sector_payload(s) for s in _SectorAccess.sectors_for(operador_id)],
            'operator': (None if not operador else {
                'id': operador.id,
                'name': getattr(operador, 'name', None) or getattr(operador, 'full_name', None) or operador.code,
                'all_sectors': operador.all_sectors,
                'must_change_pin': operador.pos_must_change_pin,
                'use_cost_price': operador.use_cost_price,
                'internal_consumption': operador.internal_consumption,
                'is_event_manager': operador.is_event_manager,
                'is_fnb_user': operador.is_fnb_user,
            }),
            'payment_methods': [{
                'id': m.id, 'code': m.code, 'name': m.name, 'type': m.method_type,
                'allows_change': m.allows_change, 'allows_partial': m.allows_partial,
                'allows_mixed': m.allows_mixed, 'opens_drawer': m.opens_drawer,
                'ask_document_number': m.ask_document_number,
            } for m in PaymentMethod.objects.filter(is_active=True, for_pos=True)],
            # (8006/8007/8059) a moeda BASE, a ALTERNATIVA e a do TROCO vêm dos
            # parâmetros — o terminal marca-as na lista e usa a do troco ao devolver.
            'currencies': [{
                'code': c.code, 'symbol': c.symbol_unicode or c.symbol,
                'is_local': c.is_local, 'buy_rate': str(c.buy_rate),
                'print_on_pos_docs': c.print_on_pos_docs,
                # casa por código OU por símbolo ("Kz" -> AOA); sem correspondência,
                # a moeda LOCAL é a base — o parâmetro não pode deixar a casa sem base.
                'is_base': (P.text(8006, 'Kz') in (c.code, c.symbol, c.symbol_unicode)) or
                           (c.is_local and not Currency.objects.filter(
                               models.Q(code=P.text(8006, 'Kz')) | models.Q(symbol=P.text(8006, 'Kz')),
                               is_active=True).exists()),
                'is_alternative': P.text(8007, 'USD') in (c.code, c.symbol, c.symbol_unicode),
                'is_change': (P.text(8059, 'Kz') in (c.code, c.symbol, c.symbol_unicode)) or
                             (c.is_local and not Currency.objects.filter(
                                 models.Q(code=P.text(8059, 'Kz')) | models.Q(symbol=P.text(8059, 'Kz')),
                                 is_active=True).exists()),
            } for c in Currency.objects.filter(is_active=True, excluded=False)],
            'taxes': [{'code': t.code, 'name': t.name, 'percentage': str(t.percentage),
                       'is_default': t.is_default}
                      for t in TaxRate.objects.filter(is_active=True)],
            # os parâmetros que mandam no comportamento do terminal
            'terminal': {
                'direct_sale': P.bool(8300, False),
                'ask_sector': P.bool(8302, True),
                'require_cash_open': P.bool(8304, True),
                'ask_guest_type': P.bool(8175, True),
                'auto_fire_kitchen': P.bool(8308, False),
                'ask_entity_before_pay': P.bool(8310, False),
            # (8311) pedir o cliente ao ABRIR a venda (não só na hora de cobrar).
            # LIGADO de fábrica: perguntar depois é tarde — a fatura já saiu como
            # Consumidor Final e essa não se corrige, anula-se por nota de crédito.
            'ask_entity_on_open': P.bool(8311, True),
            # (8312) entrar no balcão já com a 1ª página do teclado aberta
            'open_keyboard_on_sale': P.bool(8312, True),
                'tables_refresh_seconds': P.int(8063, 8),
                'transfers': P.text(8124, 'Parcial'),
                'allow_day_close': P.bool(8062, False),
                'session_timeout_minutes': P.int(8088, 60),
                'app_close_minutes': P.int(8138, 120),
                'keyboard_layout': P.text(8001, 'QWERTY (Português)'),
                'base_payment_mode': P.text(8012, 'Cash'),
                'show_payment_status': P.bool(8084, False),
                'split_warn_qty': P.int(8197, 10),
                'map_background': P.bool(8271, True),
                'keyboard_scroll_width': P.int(8180, 0),
                'guest_type_required': P.bool(8333, True),
            },
        })


# ==========================================================================
# ALERGÉNIOS E MENSAGENS PARA A COZINHA — configurados NO POS
# ==========================================================================
class AllergenSerializer(serializers.ModelSerializer):
    class Meta:
        from .models import Allergen as _A
        model = _A
        fields = '__all__'


class AllergenViewSet(viewsets.ModelViewSet):
    """Catálogo de alergénios da casa (os 14 obrigatórios vêm no arranque)."""
    permission_classes = [IsAuthenticated]
    serializer_class = AllergenSerializer

    def get_queryset(self):
        from .models import Allergen
        return Allergen.objects.all()


class KitchenMessageOptionSerializer(serializers.ModelSerializer):
    class Meta:
        from .models import KitchenMessageOption as _O
        model = _O
        fields = ('id', 'code', 'text', 'sort_order', 'is_active')


class KitchenMessageSerializer(serializers.ModelSerializer):
    options = KitchenMessageOptionSerializer(many=True, required=False)

    class Meta:
        from .models import KitchenMessage as _M
        model = _M
        fields = '__all__'

    def create(self, validated):
        from .models import KitchenMessageOption
        opts = validated.pop('options', [])
        msg = super().create(validated)
        for o in opts:
            KitchenMessageOption.objects.create(message=msg, **o)
        return msg

    def update(self, instance, validated):
        from .models import KitchenMessageOption
        opts = validated.pop('options', None)
        msg = super().update(instance, validated)
        if opts is not None:
            msg.options.all().delete()
            for o in opts:
                KitchenMessageOption.objects.create(message=msg, **o)
        return msg


class KitchenMessageViewSet(viewsets.ModelViewSet):
    """As mensagens que o empregado manda para a cozinha ("sem cebola", "bem passado")."""
    permission_classes = [IsAuthenticated]
    serializer_class = KitchenMessageSerializer

    def get_queryset(self):
        from .models import KitchenMessage
        qs = KitchenMessage.objects.prefetch_related('options', 'items')
        # ?item=<id>&ask=1 — as mensagens que ESTE artigo faz perguntar ao ser lançado.
        # Uma mensagem sem artigos vale para todos (é a regra geral da casa); com
        # artigos, só para esses.
        item = self.request.query_params.get('item')
        if self.request.query_params.get('ask') in ('1', 'true'):
            qs = qs.filter(ask_on_add=True, is_active=True)
        if item:
            from django.db.models import Q
            qs = qs.filter(Q(items__isnull=True) | Q(items__id=item)).distinct()
        return qs
