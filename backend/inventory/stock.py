"""
Motor de Stock — fonte única do saldo, do custo E DO LOTE. Toda a entrada/saída passa por aqui:
- atualiza o StockLevel do armazém,
- regista o movimento no ledger (StockMovement),
- nas entradas, recalcula o CUSTO MÉDIO PONDERADO MÓVEL do artigo (estilo enterprise),
- cria e abate os LOTES (StockLot) por FEFO, para o saldo e os lotes contarem a mesma coisa.

PORQUE É QUE OS LOTES VIVEM AQUI E NÃO SÓ NUM ECRÃ À PARTE: o saldo do artigo e as
quantidades dos lotes eram dois números sem ligação nenhuma — o motor nunca tocava
nos lotes. Uma venda baixava o saldo e deixava o lote intacto, e à primeira saída a
soma dos lotes já não batia com o stock do artigo. Os ecrãs de validade mostravam
mercadoria que já tinha sido consumida, e a rastreabilidade do lote — a que serve
para responder a uma intoxicação alimentar ou a uma recolha do fornecedor — não
existia de facto. Agora quem mexe no saldo mexe no lote, no mesmo sítio e na mesma
transação.
"""
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import F, Sum
from django.utils import timezone

from .models import StockLevel, StockLot, StockMovement


def _level(warehouse, item):
    lvl, _ = StockLevel.objects.get_or_create(warehouse=warehouse, item=item)
    return lvl


def _recompute_avg_cost(item, qty_in, unit_cost):
    """Custo médio móvel ponderado sobre o total do artigo (todos os armazéns)."""
    total_qty = StockLevel.objects.filter(item=item).aggregate(s=Sum('quantity_on_hand'))['s'] or Decimal('0')
    qty_in = Decimal(str(qty_in)); unit_cost = Decimal(str(unit_cost))
    old_qty = total_qty - qty_in                       # quantidade antes desta entrada
    old_cost = item.current_average_cost or Decimal('0')
    denom = old_qty + qty_in
    if denom > 0:
        new_cost = ((old_qty * old_cost) + (qty_in * unit_cost)) / denom
        item.current_average_cost = new_cost.quantize(Decimal('0.0001'))
        item.save(update_fields=['current_average_cost', 'updated_at'])


# --------------------------------------------------------------------------
# LOTES — onde a validade passa a existir sem ninguém a escrever à mão
# --------------------------------------------------------------------------
def _validade_de(item, validade=None):
    """A data de validade do lote que nasce nesta entrada.

    Quem recebe a mercadoria pode dizê-la (vem na guia do fornecedor); se não
    disser, usa-se a validade do artigo em dias (ficha do artigo, "Validade").
    Sem nenhuma das duas o lote fica sem data — e, por causa do `nulls_last` do
    FEFO, sai DEPOIS de tudo o que tem prazo a correr, que é o seu lugar.
    """
    if validade:
        return validade
    dias = getattr(item, 'shelf_life_days', None)
    return timezone.localdate() + timedelta(days=int(dias)) if dias else None


def _entrar_no_lote(warehouse, item, qty, lote=None, validade=None):
    """Põe a quantidade DENTRO de um lote — no mesmo, se ele já existir.

    Receber duas vezes mercadoria do mesmo lote (mesma guia, mesma validade) não
    cria dois lotes: soma ao que lá está. É o que o empregado conta na prateleira,
    e é também o que mantém a lista de validades curta e legível.
    """
    numero = ((lote or '').strip()[:60]) or 'S/LOTE-%s' % timezone.localdate().strftime('%Y%m%d')
    existente = StockLot.objects.filter(warehouse=warehouse, item=item, lot_number=numero,
                                        expiry_date=validade).first()
    if existente is not None:
        existente.quantity = (existente.quantity or Decimal('0')) + qty
        existente.is_active = True
        existente.save(update_fields=['quantity', 'is_active'])
        return existente
    return StockLot.objects.create(warehouse=warehouse, item=item, lot_number=numero,
                                   quantity=qty, expiry_date=validade,
                                   received_at=timezone.localdate())


def _abater_lotes(warehouse, item, qty, lote=None):
    """Tira `qty` dos lotes do armazém pela ordem do FEFO — o que expira primeiro.

    Devolve `(abatidos, sem_lote)`: o que saiu de cada lote (para quem precisar de
    o levar a outro armazém ou de o justificar) e o que não encontrou lote nenhum.

    NUNCA RECUSA, e é de propósito: quem decide se uma saída pode acontecer é o
    saldo do armazém (ver `move_out`), não os lotes. Numa casa que ainda não
    registava lotes, metade do stock não tem lote nenhum — travar aqui era travar
    o serviço por causa de registos que ninguém chegou a fazer. O que faltar fica
    marcado na nota do movimento, para alguém poder corrigir.
    """
    restante = Decimal(str(qty))
    abatidos = []
    fila = list(StockLot.objects
                .filter(warehouse=warehouse, item=item, is_active=True, quantity__gt=0)
                .order_by(F('expiry_date').asc(nulls_last=True), 'received_at', 'id'))
    if lote:
        # UM LOTE PEDIDO PASSA À FRENTE DO FEFO, e é de propósito: quem anula uma
        # entrada está a desfazer AQUELA entrada, não a consumir stock. Sem isto, o
        # estorno de uma guia saía pelo lote mais perto de expirar — o lote da guia
        # anulada ficava em armazém com a sua validade, e o que estava mesmo a
        # expirar desaparecia das contagens sem ninguém o ter consumido.
        #
        # Se o lote pedido não cobrir tudo (parte já foi consumida), o resto sai
        # por FEFO: a alternativa era recusar a anulação, e aí o documento errado
        # ficava lançado para sempre.
        numero = str(lote).strip()
        fila = ([l for l in fila if l.lot_number == numero]
                + [l for l in fila if l.lot_number != numero])
    for lote in fila:
        if restante <= 0:
            break
        tirar = min(lote.quantity or Decimal('0'), restante)
        if tirar <= 0:
            continue
        lote.quantity = (lote.quantity or Decimal('0')) - tirar
        campos = ['quantity']
        if lote.quantity <= 0:
            # Lote esgotado: sai das contagens de validade do painel. Se ficasse
            # activo, o dono via "3 lotes a expirar" de mercadoria já gasta.
            lote.is_active = False
            campos.append('is_active')
        lote.save(update_fields=campos)
        abatidos.append({'lote': lote.lot_number, 'validade': lote.expiry_date,
                         'quantidade': tirar})
        restante -= tirar
    return abatidos, restante


@transaction.atomic
def move_in(warehouse, item, quantity, unit_cost, reference='', note='', by=None, mtype='IN',
            lote=None, validade=None, criar_lote=True, atualizar_custo=True):
    """Entrada de stock — e o LOTE que ela cria.

    A entrada subia o saldo e recalculava o custo, mas não criava lote nenhum: os
    lotes só existiam se alguém os escrevesse à mão num ecrã à parte, DEPOIS de
    receber. Numa cozinha isso não acontece todos os dias — e a validade da
    mercadoria passava a não estar em sítio nenhum.

    O número do lote é o do fornecedor quando se sabe (`lote`); quando não se
    sabe, usa-se a referência do documento de entrada (a guia, o GRN), que é o que
    permite voltar atrás e descobrir de quem veio a mercadoria.
    """
    qty = Decimal(str(quantity))
    lvl = _level(warehouse, item)
    lvl.quantity_on_hand = (lvl.quantity_on_hand or Decimal('0')) + qty
    lvl.save(update_fields=['quantity_on_hand', 'last_updated'])
    if atualizar_custo:
        # `atualizar_custo` existe para as séries de documento que entram
        # mercadoria mas NÃO mandam recalcular o custo médio (a caixa "Atualiza
        # custo médio" desligada, numa entrada de regularização). Sem isto, quem
        # usasse o motor tinha de voltar a fazer o cálculo à mão só para o poder
        # saltar — que é como nasceu o segundo motor de stock que vivia no POS.
        _recompute_avg_cost(item, qty, unit_cost)
    if criar_lote and qty > 0:
        _entrar_no_lote(warehouse, item, qty, lote or reference, _validade_de(item, validade))
    return StockMovement.objects.create(
        warehouse=warehouse, item=item, movement_type=mtype, quantity=qty,
        unit_cost=Decimal(str(unit_cost)), reference=reference, note=note, created_by=by)


class StockInsuficiente(Exception):
    """Não há o que se quer tirar. Traz o que há, para a mensagem poder dizê-lo."""

    def __init__(self, item, armazem, pedido, existente):
        self.item, self.armazem = item, armazem
        self.pedido, self.existente = pedido, existente
        super().__init__(
            f'Não há {pedido} de "{item}" em {armazem} — existem {existente}. '
            f'Receba a mercadoria ou corrija o inventário antes de dar saída.')


@transaction.atomic
def move_out(warehouse, item, quantity, reference='', note='', by=None, mtype='OUT',
             permitir_negativo=False, abater_lotes=True, lote=None):
    """Saída de stock — e a razão de ela poder ser RECUSADA.

    Isto subtraía o que lhe mandassem e deixava o saldo ir a negativo sem dizer
    nada. Cem garrafas no armazém, uma saída de cento e cinquenta, e ficava −50.

    Porque é grave e não só feio: o custo médio é recalculado contra a
    quantidade TOTAL do artigo. Com saldo negativo, a compra seguinte pondera
    contra uma quantidade que não existe, e o custo do artigo sai errado — sem
    forma de saber qual era o certo. Daí em diante, a margem de cada prato que
    leve esse artigo é uma invenção.

    `permitir_negativo` existe para UM caso, e é o do balcão: a venda do POS.
    Recusar aí seria pior do que o mal que evita — o empregado não conseguia
    vender uma cerveja porque alguém se esqueceu de registar a entrega, com o
    cliente à frente. Nesses sítios o saldo vai a negativo de propósito e o ecrã
    de existências assinala-o a vermelho ("negativo — é sempre um erro"), para
    alguém o corrigir sem travar o serviço.

    Em tudo o resto — saídas manuais, transferências, devoluções — há uma pessoa
    ao ecrã que pode resolver, e por isso recusa-se.

    O QUE SAI, SAI DE UM LOTE: a quantidade é abatida aos lotes por FEFO, o que
    expira primeiro à frente. É isto que faz o FEFO deixar de ser uma lista
    informativa e passar a ser o que acontece de facto ao stock. Isto nunca trava
    uma saída: se os lotes não cobrirem a quantidade, o movimento passa e diz na
    nota o que ficou sem lote.
    """
    qty = Decimal(str(quantity))
    lvl = _level(warehouse, item)
    existente = lvl.quantity_on_hand or Decimal('0')
    if not permitir_negativo and qty > existente:
        raise StockInsuficiente(item, warehouse, qty, existente)
    lvl.quantity_on_hand = existente - qty
    lvl.save(update_fields=['quantity_on_hand', 'last_updated'])

    abatidos, sem_lote = [], qty
    if abater_lotes and qty > 0:
        # `lote` nomeia UM lote para sair primeiro (o estorno de uma entrada tira o
        # lote que essa entrada criou). Sem ele, a saída é por FEFO, como no balcão.
        abatidos, sem_lote = _abater_lotes(warehouse, item, qty, lote=lote)
    nota = note or ''
    if sem_lote > 0 and abatidos:
        # Saiu mais do que havia nos lotes: fica dito no movimento, senão a
        # diferença entre o saldo e a soma dos lotes ficava sem explicação.
        nota = ('%s · sem lote identificado: %s' % (nota, sem_lote)).strip(' ·')[:255]

    mov = StockMovement.objects.create(
        warehouse=warehouse, item=item, movement_type=mtype, quantity=qty,
        unit_cost=item.current_average_cost or Decimal('0'), reference=reference, note=nota,
        created_by=by)
    # Para quem precisa de saber DE QUE lotes saiu (a transferência leva-os consigo).
    mov.lotes_abatidos = abatidos
    mov.sem_lote = sem_lote
    return mov


@transaction.atomic
def transfer(src, dst, item, quantity, reference='', by=None):
    # Transferir mais do que existe não é um caso de balcão: há alguém ao ecrã.
    # Sem isto, uma transferência de 200 de um armazém com 50 deixava a origem
    # a −150 e o destino com 200 que nunca lá entraram — inventário inventado
    # nos dois sítios ao mesmo tempo.
    saida = move_out(src, item, quantity, reference=reference, by=by, mtype='TRANSFER_OUT')
    # O LOTE VIAJA COM A MERCADORIA. Se o destino recebesse um lote novo sem data,
    # a mesma caixa de iogurtes mudava de validade só por ter mudado de armazém —
    # e a cadeia de frio da HACCP deixava de se poder seguir de ponta a ponta.
    move_in(dst, item, quantity, item.current_average_cost or Decimal('0'),
            reference=reference, by=by, mtype='TRANSFER_IN', criar_lote=False)
    for parte in saida.lotes_abatidos:
        _entrar_no_lote(dst, item, parte['quantidade'], parte['lote'], parte['validade'])
    if saida.sem_lote > 0:
        # A origem não tinha lotes para tudo: o que faltou entra no destino como
        # lote do documento de transferência, para a soma dos lotes bater com o saldo.
        _entrar_no_lote(dst, item, saida.sem_lote, reference, None)


@transaction.atomic
def adjust(warehouse, item, counted_qty, reference='', by=None):
    """Inventário físico: o que foi contado passa a ser a verdade — lotes incluídos.

    Um ajuste que mexesse só no saldo deixava os lotes a dizer outra coisa, e a
    contagem seguinte voltava a encontrar a mesma diferença. Por isso: contou-se
    menos, abate-se aos lotes por FEFO; contou-se mais, a sobra entra como lote do
    documento de contagem. Fica sempre a soma dos lotes igual ao saldo do armazém.
    """
    lvl = _level(warehouse, item)
    counted = Decimal(str(counted_qty))
    delta = counted - (lvl.quantity_on_hand or Decimal('0'))
    lvl.quantity_on_hand = counted
    lvl.save(update_fields=['quantity_on_hand', 'last_updated'])
    if delta < 0:
        _abater_lotes(warehouse, item, -delta)
    elif delta > 0:
        _entrar_no_lote(warehouse, item, delta, reference or 'AJUSTE', _validade_de(item))
    return StockMovement.objects.create(
        warehouse=warehouse, item=item, movement_type='ADJUST', quantity=abs(delta),
        unit_cost=item.current_average_cost or Decimal('0'), reference=reference,
        note=f'Ajuste de inventário (delta {delta})', created_by=by)
