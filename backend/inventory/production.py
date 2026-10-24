"""
PRODUÇÃO POR FICHA TÉCNICA — o que transforma ingredientes em produto.

Isto faltava por inteiro. A ficha técnica existia só para CALCULAR o custo de um
prato; nada no sistema consumia os ingredientes nem formava o custo do produzido.
O resultado era um armazém que comprava farinha e ovos e tinha bolos a custo zero:
a margem do prato, a valorização das existências e o custo do mês saíam todos
errados, sempre para o lado de parecer que a casa ganha mais do que ganha.

Há dois caminhos para o mesmo motor, e são precisos os dois:

  · a ORDEM DE PRODUÇÃO (`executar`) — 20 litros de molho de manhã, de uma vez.
    Há uma pessoa ao ecrã: se faltar um ingrediente, RECUSA-SE e diz o que falta;
  · o CONSUMO NA VENDA (`consumir_por_ficha`) — vender um bitoque tira do armazém
    o bife e as batatas, não "um bitoque". Aqui NÃO se trava nada: ao balcão, com
    o cliente à frente, o saldo vai a negativo de propósito e o ecrã de
    existências assinala-o a vermelho para alguém corrigir depois.
"""
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from . import stock as stock_engine
from .models import (ProductionOrder, ProductionOrderConsumption, Recipe, StockLevel)


class ProducaoInvalida(Exception):
    """Não se pode produzir isto — e a mensagem diz porquê, ao ecrã de quem produz."""


def ficha_ativa(item):
    """A ficha técnica em vigor do artigo — ou None se ele não é um produzido.

    É por aqui que o resto do sistema pergunta "este artigo faz-se a partir de
    outros?". Um artigo de revenda (uma cerveja) não tem ficha: quem chama isto
    recebe None e dá saída do próprio artigo, como deve ser.
    """
    if item is None:
        return None
    ficha = (Recipe.objects.filter(final_item=item)
             .prefetch_related('ingredients__ingredient_item').first())
    if ficha is None or not ficha.ingredients.exists():
        return None
    return ficha


def necessidades(ficha, quantidade):
    """O que sai do armazém para produzir `quantidade` doses desta ficha.

    A ficha é escrita para o LOTE INTEIRO e rende `doses` doses (é assim que o
    ecrã da ficha calcula o custo por dose): para fazer uma dose gasta-se a
    quantidade da linha a dividir pelas doses. E o que sai do armazém é a
    quantidade EFETIVA — com o desperdício incluído: das aparas do bife perde-se,
    e quem paga as aparas é o armazém, não a receita.
    """
    quantidade = Decimal(str(quantidade))
    doses = Decimal(str(ficha.doses or 1))
    linhas = []
    for ing in ficha.ingredients.select_related('ingredient_item').all():
        efetiva = ing.quantity * (Decimal('1') + (ing.waste_percentage or Decimal('0')) / Decimal('100'))
        linhas.append((ing.ingredient_item, (efetiva / doses) * quantidade))
    return linhas


def consumir_por_ficha(warehouse, item, quantidade, reference='', note='', by=None,
                       permitir_negativo=False, mtype='CONSUMPTION'):
    """Dá saída dos INGREDIENTES de um artigo produzido, em vez do próprio artigo.

    Devolve a lista de movimentos feitos, ou None se o artigo não tem ficha
    técnica — e nesse caso é o chamador que dá saída do artigo (revenda).
    """
    ficha = ficha_ativa(item)
    if ficha is None:
        return None
    movimentos = []
    for ingrediente, qtd in necessidades(ficha, quantidade):
        if qtd <= 0:
            continue
        movimentos.append(stock_engine.move_out(
            warehouse, ingrediente, qtd, reference=reference,
            note=note or f'Consumo p/ {item.code}', by=by, mtype=mtype,
            permitir_negativo=permitir_negativo))
    return movimentos


def _numero(prefixo='OP'):
    n = ProductionOrder.objects.count() + 1
    while ProductionOrder.objects.filter(number=f'{prefixo}{n:05d}').exists():
        n += 1
    return f'{prefixo}{n:05d}'


@transaction.atomic
def executar(order, by=None):
    """PRODUZIR: consome os ingredientes e mete o produzido no armazém.

    O custo do produzido é a soma do que saiu — nem o preço de venda, nem uma
    estimativa: o custo médio real de cada ingrediente no dia em que se produziu.
    É daqui que a margem do prato passa a poder ser verdade.

    Recusa-se se faltar stock de um ingrediente (`StockInsuficiente`): aqui há uma
    pessoa ao ecrã, que pode receber a mercadoria ou corrigir a contagem. Produzir
    com saldo negativo estragava o custo médio do ingrediente e, com ele, o custo
    de todos os pratos que o levem.
    """
    if order.status != 'DRAFT':
        raise ProducaoInvalida(f'A ordem {order.number} já está {order.get_status_display().lower()}.')
    quantidade = Decimal(str(order.quantity or 0))
    if quantidade <= 0:
        raise ProducaoInvalida('A quantidade a produzir tem de ser maior do que zero.')
    ficha = ficha_ativa(order.item)
    if ficha is None:
        raise ProducaoInvalida(
            f'"{order.item.name}" não tem ficha técnica com ingredientes: '
            f'sem ela não há o que consumir nem como formar o custo do produzido.')

    total = Decimal('0')
    order.consumptions.all().delete()
    for ingrediente, qtd in necessidades(ficha, quantidade):
        if qtd <= 0:
            continue
        mov = stock_engine.move_out(order.warehouse, ingrediente, qtd, reference=order.number,
                                    note=f'Produção de {order.item.code}', by=by,
                                    mtype='CONSUMPTION')
        custo_unit = mov.unit_cost or Decimal('0')
        linha = (qtd * custo_unit).quantize(Decimal('0.0001'))
        ProductionOrderConsumption.objects.create(order=order, item=ingrediente, quantity=qtd,
                                                  unit_cost=custo_unit, total_cost=linha)
        total += linha

    unitario = (total / quantidade).quantize(Decimal('0.0001'))
    # O produzido entra como ENTRADA normal ('IN'): é mercadoria que passa a estar
    # no armazém, e é assim que os relatórios de movimentos a contam. O lote do
    # produzido é o da ordem (o "molho de 23/10"), com a validade que lhe derem —
    # é o que vai no rótulo do tabuleiro e o que a HACCP pede.
    stock_engine.move_in(order.warehouse, order.item, quantidade, unitario,
                         reference=order.number, note=f'Produção {order.number}', by=by,
                         mtype='IN', lote=order.lot_number or order.number,
                         validade=order.expiry_date)

    order.status = 'DONE'
    order.unit_cost = unitario
    order.total_cost = total.quantize(Decimal('0.0001'))
    order.produced_at = timezone.now()
    order.save(update_fields=['status', 'unit_cost', 'total_cost', 'produced_at'])
    return order


# --------------------------------------------------------------------------
# API — o ecrã das ordens de produção
# --------------------------------------------------------------------------
class ProductionOrderConsumptionSerializer(serializers.ModelSerializer):
    item_code = serializers.CharField(source='item.code', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)

    class Meta:
        model = ProductionOrderConsumption
        fields = ['id', 'item', 'item_code', 'item_name', 'quantity', 'unit_cost', 'total_cost']


class ProductionOrderSerializer(serializers.ModelSerializer):
    number = serializers.CharField(required=False)
    item_code = serializers.CharField(source='item.code', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    consumptions = ProductionOrderConsumptionSerializer(many=True, read_only=True)

    class Meta:
        model = ProductionOrder
        fields = '__all__'
        read_only_fields = ['status', 'unit_cost', 'total_cost', 'produced_at', 'created_at']

    def create(self, validated):
        if not validated.get('number'):
            validated['number'] = _numero()
        return ProductionOrder.objects.create(**validated)


class ProductionOrderViewSet(viewsets.ModelViewSet):
    """Centro de Inventário · Produção — ordens de fabrico da cozinha.

    Fluxo do ecrã: cria-se a ordem em rascunho (o que se vai fazer e quanto),
    vê-se em "necessidades" o que ela vai gastar e se há stock disso, e só depois
    se produz. Enquanto está em rascunho não mexeu em stock nenhum.
    """
    serializer_class = ProductionOrderSerializer
    search_fields = ['number', 'item__code', 'item__name']
    ordering_fields = ['created_at', 'number']

    def get_queryset(self):
        qs = (ProductionOrder.objects.select_related('item', 'warehouse')
              .prefetch_related('consumptions__item').all())
        for campo in ('warehouse', 'item'):
            valor = self.request.query_params.get(campo)
            if valor:
                qs = qs.filter(**{f'{campo}_id': valor})
        estado = self.request.query_params.get('status')
        return qs.filter(status=estado) if estado else qs

    def perform_destroy(self, instance):
        # Uma ordem já produzida consumiu ingredientes e meteu mercadoria no
        # armazém: apagá-la deixava o stock com movimentos sem documento nenhum
        # por trás. Anula-se o rascunho; o que já foi produzido fica no histórico.
        if instance.status == 'DONE':
            raise serializers.ValidationError(
                {'detail': 'Uma ordem já produzida não se apaga — mexeu no stock e tem de ficar no histórico.'})
        instance.delete()

    @action(detail=True, methods=['get'])
    def requirements(self, request, pk=None):
        """O que esta ordem vai gastar, e se há stock para isso.

        É a conferência que se faz ANTES de produzir: se faltar um ingrediente, o
        chefe vê-o aqui e não a meio da produção.
        """
        order = self.get_object()
        ficha = ficha_ativa(order.item)
        if ficha is None:
            return Response({'detail': f'"{order.item.name}" não tem ficha técnica com ingredientes.',
                             'lines': [], 'can_produce': False}, status=200)
        linhas, pode = [], True
        for ingrediente, qtd in necessidades(ficha, order.quantity):
            lvl = StockLevel.objects.filter(warehouse=order.warehouse, item=ingrediente).first()
            existe = (lvl.quantity_on_hand if lvl else Decimal('0')) or Decimal('0')
            falta = existe < qtd
            pode = pode and not falta
            linhas.append({'item': ingrediente.id, 'item_code': ingrediente.code,
                           'item_name': ingrediente.name,
                           'uom': ingrediente.base_uom.code if ingrediente.base_uom_id else '',
                           'needed': str(qtd.quantize(Decimal('0.0001'))),
                           'on_hand': str(existe),
                           'unit_cost': str(ingrediente.current_average_cost or 0),
                           'missing': falta})
        return Response({'order': order.number, 'quantity': str(order.quantity),
                         'lines': linhas, 'can_produce': pode})

    @action(detail=True, methods=['post'])
    def produce(self, request, pk=None):
        """Produzir — consome os ingredientes e mete o produzido no armazém."""
        order = self.get_object()
        try:
            executar(order, by=request.user.get_username() if request.user.is_authenticated else None)
        except ProducaoInvalida as erro:
            return Response({'detail': str(erro)}, status=400)
        except stock_engine.StockInsuficiente as erro:
            # 409 (conflito) e não 400: o pedido está bem feito, o armazém é que
            # não tem a mercadoria. O ecrã mostra a mensagem tal como vem.
            return Response({'detail': str(erro), 'item': erro.item.code,
                             'requested': str(erro.pedido), 'on_hand': str(erro.existente)},
                            status=409)
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Anula o RASCUNHO. O que já foi produzido não se "desproduz" por aqui.

        Desfazer uma produção é meter os ingredientes de volta e tirar o produzido
        — é uma operação com decisões por trás (o molho já foi feito, a carne já
        não volta a ser carne). Fica de fora de propósito: para corrigir, faz-se
        um ajuste de inventário, que deixa rasto de quem o fez.
        """
        order = self.get_object()
        if order.status == 'DONE':
            return Response({'detail': 'Ordem já produzida — corrija por ajuste de inventário.'},
                            status=400)
        order.status = 'CANCELLED'
        order.save(update_fields=['status'])
        return Response(self.get_serializer(order).data)
