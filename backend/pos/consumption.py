"""
Consumo de stock na venda do POS (fecha o ciclo comprar→stock→vender→consumir).
Quando o ticket é pago, dá SAÍDA de stock no armazém do outlet:
- artigo PRODUZIDO (com ficha técnica) → consome os ingredientes proporcionalmente;
- artigo de REVENDA → consome o próprio artigo.
Idempotente (só uma vez por ticket).
"""
from decimal import Decimal


def _active_recipe(item):   # noqa: mantido por compatibilidade de chamadas
    """A ficha técnica do artigo, se o sistema a tiver.

    Isto devolvia `None` sempre, com um comentário a dizer que o POS se vende
    sozinho e que sem módulo de produção um hambúrguer sai do stock como
    hambúrguer. A intenção estava certa; a implementação é que procurava a ficha
    numa app `production` que NÃO EXISTE neste sistema — por isso nunca a
    encontrava, mesmo quando ela lá estava.

    A ficha vive em `inventory` (Recipe), que faz parte do stock e vem com o POS.
    Agora procura-se onde ela está. Quem não tiver ficha nenhuma continua a sair
    como revenda, que é o comportamento certo para quem só comprou o POS.
    """
    try:
        from inventory.production import ficha_ativa
    except Exception:
        return None
    return ficha_ativa(item)

def _stock_control_on(outlet):
    """(Interface Stock) "Controlo de stock" — desmarcada, a venda NÃO consome stock.

    Há casas que só usam o POS para faturar e gerem o stock noutro sistema. Consumir
    aqui também era abater duas vezes.
    """
    try:
        from .models import StockErpLink
        link = StockErpLink.objects.first()
        if link is not None and hasattr(link, 'stock_control'):
            return bool(link.stock_control)
    except Exception:
        pass
    return True


def _warehouse_for(item, outlet):
    """De que armazém sai este artigo NESTE ponto de venda.

    As polpas vendidas no Restaurante saem do armazém do Restaurante; as mesmas
    polpas vendidas no Bar da Piscina saem do armazém do Bar. É o mapeamento por
    sub-família que manda — só se não houver é que se usa o armazém do outlet.

    SEM mapeamento por sub-família E SEM armazém configurado no outlet, devolve
    None — NÃO se adivinha um armazém qualquer. Isto tinha `or Warehouse.objects.
    first()`: um outlet sem armazém escolhido (o ecrã "Outlets" trata "— nenhum —"
    como opção válida) ia consumir stock de QUALQUER OUTRO armazém do sistema — o
    primeiro por ordem, sem relação nenhuma com este ponto de venda — corrompendo
    o stock de um armazém que a venda nem tocou. O chamador já sabe lidar com None
    (salta a linha, "sem armazém configurado, não há stock a mover").
    """
    from inventory.models import SubFamilyMapping
    if item.subfamily_id:
        m = SubFamilyMapping.objects.filter(subfamily_id=item.subfamily_id, outlet=outlet).first()
        if m and m.warehouse_id:
            return m.warehouse
    return outlet.warehouse


def consume_ticket_stock(ticket, by=None):
    # (Interface Stock) 'Controlo de stock' desligado: a venda fatura, o stock
    # vive noutro sistema. Consumir aqui também era abater duas vezes.
    if not _stock_control_on(getattr(ticket, 'outlet', None)):
        return 0
    if ticket.stock_consumed:
        return
    from inventory import stock as stock_engine

    # Linhas anuladas não consomem: o cliente não levou nada.
    for line in ticket.lines.select_related('item', 'item__subfamily').filter(is_void=False):
        item = line.item
        # (Artigo) "Não movimenta stock" — serviços, taxas, couvert: vendem-se mas
        # não têm existência física. Sem esta caixa, o stock ficava negativo para sempre.
        if getattr(item, 'no_stock_movement', False):
            continue
        wh = _warehouse_for(item, ticket.outlet)
        if not wh:
            continue  # sem armazém configurado, não há stock a mover
        sold = Decimal(str(line.quantity))

        # UM BIFE VENDIDO TIRA DO STOCK A CARNE, NÃO O BIFE.
        #
        # Vender um produzido abatia o PRÓPRIO produzido — um artigo que nunca
        # entrou em armazém nenhum, porque não se compra: faz-se. O stock do
        # bife ia a negativo para sempre e os ingredientes que saíram mesmo da
        # arca ficavam lá, no papel, até a contagem os desmentir. A margem do
        # prato era calculada contra um custo que não tinha nada a ver.
        #
        # `consumir_por_ficha` desconta pela ficha técnica (com desperdício e
        # doses) e devolve None quando o artigo não tem ficha — a revenda, que
        # sai como ela própria. `permitir_negativo` mantém a regra do balcão:
        # falte o que faltar no armazém, a venda não se trava.
        from inventory.production import consumir_por_ficha
        movidos = consumir_por_ficha(wh, item, sold, reference=ticket.ticket_number,
                                     note=f'Consumo p/ {item.code}', by=by,
                                     permitir_negativo=True, mtype='CONSUMPTION')
        if movidos is None:
            stock_engine.move_out(wh, item, sold, permitir_negativo=True,
                                  reference=ticket.ticket_number,
                                  note='Venda POS', by=by, mtype='CONSUMPTION')

    ticket.stock_consumed = True
    ticket.save(update_fields=['stock_consumed'])
