"""
RELATÓRIOS DO PMS no mesmo sítio dos do POS.

O ecrã de Relatórios (pastas, filtro universal, exportação, impressão) já existe
e é bom — está em `pos/reports.py`. O que faltava era o alojamento aparecer lá:
o dono abria "Relatórios" e via as vendas do restaurante, o IVA, a caixa… e nem
uma linha sobre quartos, estadias ou ocupação, apesar de o PMS já ter os dados
todos. Para os ver tinha de ir a outro ecrã, com outro aspecto e outro filtro.

Este módulo acrescenta as PASTAS do PMS ao catálogo existente, em vez de montar
um segundo motor de relatórios. Mesmo contrato de uma função de relatório:

    fn(params) -> {'columns': [(chave, etiqueta)…], 'rows': [...], 'totals': {…}}

e por isso herda de graça tudo o que o motor já sabe fazer — o filtro por
período, o "incluir detalhes", a exportação e a impressão com o cabeçalho da
empresa.

Independência dos módulos: estas pastas só entram no catálogo quando a app `pms`
está instalada (ver o fim de `pos/reports.py`). Um cliente que comprou só o POS
não vê pastas de alojamento, e um que comprou só o PMS vê as suas.


QUE UNIDADE É QUE CADA RELATÓRIO CONTA  (regra desta ficha, lê-se uma vez)
─────────────────────────────────────────────────────────────────────────
Estas funções recebem só `params` — não há `request` aqui dentro. Enquanto o
hotel não vinha nos `params`, consultavam `Reservation.objects` / `Folio.objects`
sem filtro nenhum: num grupo com dois hotéis, o relatório de ocupação, de
receita e o ADR/RevPAR do Hotel A traziam as noites do Hotel B. O director de
unidade recebia números que não eram da sua unidade, a ocupação do Hotel A
passava dos 100% (porque dividia as noites dos dois pelo número de quartos de
um) e o consolidado do grupo contava tudo em dobro quando se somavam as
unidades. Para quem vende a grupos hoteleiros isto não é um detalhe.

A unidade passou a viajar NOS PARÂMETROS, resolvida uma única vez por
`pos/reports.run` com `core.tenancy` (`allowed_hotel_ids` / `current_hotel_id`):

  · `params['hotel'] = <id>`  → o relatório é DESTA unidade e só desta;
  · `params['hotel'] = None`  → CONSOLIDADO do grupo (soma das unidades), e o
    motor marca-o como tal em `dados['hotel_scope']`, para ninguém confundir o
    total do grupo com o total de uma casa;
  · `params['hotels'] = [ids]` → os hotéis a que quem pede tem acesso; aplica-se
    SEMPRE, mesmo no consolidado, senão o consolidado de um director de duas
    unidades mostrava as cinco do grupo.

Porque não se usa `core.tenancy.scope_qs` directamente: `scope_qs` precisa do
`request`, e um relatório também corre sem pedido HTTP nenhum — na comparação
de períodos (`pos/reports.compare` corre a mesma função outra vez), na sondagem
de colunas e em tarefas agendadas. A DECISÃO de qual é o hotel continua a ser a
do `core.tenancy`; o que muda é só o transporte. E não se usa
`default_hotel_id`: esse serve para CRIAR registos e, em último recurso, escolhe
"o primeiro hotel do sistema" — num relatório isso seria apresentar os números
do Hotel B sob o cabeçalho do Hotel A, que é pior do que não filtrar nada.
"""
from datetime import date, timedelta
from decimal import Decimal


def hotel_do_relatorio(p):
    """A unidade que este relatório conta, ou None = consolidado do grupo.

    Vazio/ausente é consolidado de propósito: é assim que o dono do grupo pede o
    total das suas casas. Um valor que não seja um número é um erro de quem
    chama (o motor normaliza isto antes de chegar aqui), e nesse caso vale mais
    assumir o consolidado assumido do que adivinhar uma unidade errada.
    """
    v = p.get('hotel')
    if v in (None, '', 0, '0', 'all', 'ALL', 'todos', 'TODOS'):
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _so_do_hotel(qs, p, caminho='hotel'):
    """Recorta um queryset à unidade pedida e aos hotéis permitidos.

    É a mesma regra de `core.tenancy.scope_qs` (primeiro os permitidos, depois a
    unidade activa); só a origem do hotel é diferente — ver o cabeçalho.
    `caminho` é o percurso ORM até ao hotel, porque nem tudo o tem directamente:
    o folio é 'reservation__hotel' e o lançamento é 'folio__reservation__hotel'.
    """
    permitidos = p.get('hotels')
    if permitidos:
        qs = qs.filter(**{f'{caminho}__in': list(permitidos)})
    hid = hotel_do_relatorio(p)
    if hid:
        qs = qs.filter(**{caminho: hid})
    return qs


def _periodo(p):
    """Mesmo contrato do motor: 'from'/'to' em ISO; por omissão, o mês corrente."""
    hoje = date.today()
    def _d(v, omissao):
        try:
            return date.fromisoformat(v) if v else omissao
        except (TypeError, ValueError):
            return omissao
    return _d(p.get('from'), hoje.replace(day=1)), _d(p.get('to'), hoje)


def _dias(ini, fim):
    d = ini
    while d <= fim:
        yield d
        d += timedelta(days=1)


VIVAS = ('OPTION', 'BOOKED', 'CHECKED_IN', 'CHECKED_OUT')


def r_reservas(p):
    """RESERVAS DO PERÍODO — quem vem, para que quarto, por quanto.

    "Do período" é toda a reserva que TOCA o intervalo, não só as que começam
    nele: uma estadia de 10 a 20 conta na semana de 15 a 17, que é justamente a
    semana sobre a qual o dono está a perguntar.
    """
    from .models import Reservation
    ini, fim = _periodo(p)
    qs = (_so_do_hotel(Reservation.objects, p)
          .filter(check_in__lte=fim, check_out__gte=ini)
          .select_related('guest', 'room', 'room_type', 'rate_plan', 'block')
          .order_by('check_in'))
    linhas = []
    # OS TOTAIS SÓ SOMAM O QUE SE VENDEU. As linhas mostram tudo (uma reserva
    # cancelada à vista é informação útil — mostra o que se perdeu), mas somar
    # as canceladas e os no-shows no total em dinheiro era mostrar ao dono
    # receita que nunca entrou: num mês com cancelamentos, o total deste
    # relatório não batia com nenhum outro e ninguém sabia qual estava certo.
    noites_vendidas = 0
    receita_vendida = 0.0
    for r in qs:
        tarifa = r.effective_rate or Decimal('0')
        if r.status in VIVAS:
            noites_vendidas += r.nights
            receita_vendida += float(tarifa * r.nights)
        linhas.append({
            'confirmation': r.confirmation,
            'guest': r.guest.name if r.guest_id else '',
            'room': r.room.number if r.room_id else '(por atribuir)',
            'category': r.room_type.name if r.room_type_id else '',
            'check_in': r.check_in.strftime('%d/%m/%Y'),
            'check_out': r.check_out.strftime('%d/%m/%Y'),
            'nights': r.nights,
            'pax': f"{r.adults}+{r.children}" if r.children else str(r.adults),
            'source': r.get_source_display(),
            'status': r.get_status_display(),
            'rate': float(tarifa),
            'total': float(tarifa * r.nights),
            # O peso com que esta linha entra no rodapé do ECRÃ. A grelha
            # recalcula os totais sobre as linhas filtradas, e sem isto voltava
            # a somar as canceladas e os no-shows — exactamente a receita que o
            # comentário acima explica que não pode entrar.
            '_peso': (1 if r.status in VIVAS else 0),
        })
    return {
        'columns': [('confirmation', 'Reserva'), ('guest', 'Hóspede'), ('room', 'Quarto'),
                    ('category', 'Categoria'), ('check_in', 'Entrada'), ('check_out', 'Saída'),
                    ('nights', 'Noites'), ('pax', 'Pax'), ('source', 'Origem'),
                    ('status', 'Estado'), ('rate', 'Tarifa/noite', 'money'), ('total', 'Total', 'money')],
        'rows': linhas,
        'totals': {'nights': noites_vendidas, 'total': round(receita_vendida, 2)},
    }


def r_ocupacao(p):
    """OCUPAÇÃO POR DIA — quantos quartos ocupados, a que taxa, com que ADR.

    ADR (tarifa média) e RevPAR (receita por quarto disponível) são as duas
    medidas por que um hotel se julga: a primeira diz a que preço se vendeu, a
    segunda diz quanto rendeu CADA quarto da casa, vendido ou não — é essa que
    denuncia um hotel cheio a preço de saldo.
    """
    from .models import Reservation, Room
    ini, fim = _periodo(p)
    # OS QUARTOS TÊM DE SER OS DA MESMA UNIDADE QUE AS NOITES. Quando os
    # quartos eram contados sem filtro e as noites também, a conta até "batia"
    # por acidente; mas pedir o Hotel A (noites só de A) contra os quartos dos
    # dois hotéis dava ocupação a metade do real, e o contrário — noites dos
    # dois sobre os quartos de um — dava ocupação acima dos 100%.
    total_quartos = _so_do_hotel(Room.objects.filter(is_active=True), p).count()
    reservas = list(_so_do_hotel(Reservation.objects, p).filter(
        status__in=VIVAS, check_in__lte=fim, check_out__gt=ini)
        .select_related('room_type', 'rate_plan'))

    linhas = []
    for d in _dias(ini, fim):
        doDia = [r for r in reservas if r.check_in <= d < r.check_out]
        ocupados = len(doDia)
        receita = sum((r.effective_rate or Decimal('0')) for r in doDia)
        linhas.append({
            'day': d.strftime('%d/%m/%Y'),
            'rooms': total_quartos,
            'occupied': ocupados,
            'free': max(total_quartos - ocupados, 0),
            'occupancy': round(ocupados / total_quartos * 100, 1) if total_quartos else 0,
            'revenue': round(float(receita), 2),
            'adr': round(float(receita) / ocupados, 2) if ocupados else 0,
            'revpar': round(float(receita) / total_quartos, 2) if total_quartos else 0,
        })
    noites = sum(l['occupied'] for l in linhas)
    receita_total = sum(l['revenue'] for l in linhas)
    disponiveis = total_quartos * len(linhas)
    return {
        'columns': [('day', 'Dia'), ('rooms', 'Quartos'), ('occupied', 'Ocupados'),
                    ('free', 'Livres'), ('occupancy', 'Ocupação %'), ('revenue', 'Receita', 'money'),
                    ('adr', 'ADR', 'money'), ('revpar', 'RevPAR', 'money')],
        'rows': linhas,
        'totals': {
            'occupied': noites, 'revenue': round(receita_total, 2),
            'occupancy': round(noites / disponiveis * 100, 1) if disponiveis else 0,
            'adr': round(receita_total / noites, 2) if noites else 0,
            'revpar': round(receita_total / disponiveis, 2) if disponiveis else 0,
        },
    }


def r_entradas_saidas(p):
    """ENTRADAS E SAÍDAS — a lista de trabalho da recepção, dia a dia."""
    from .models import Reservation
    ini, fim = _periodo(p)
    daUnidade = _so_do_hotel(Reservation.objects, p)
    linhas = []
    for d in _dias(ini, fim):
        entram = daUnidade.filter(check_in=d, status__in=VIVAS).count()
        saem = daUnidade.filter(check_out=d, status__in=VIVAS).count()
        ficam = daUnidade.filter(
            status__in=VIVAS, check_in__lt=d, check_out__gt=d).count()
        noshow = daUnidade.filter(check_in=d, status='NO_SHOW').count()
        cancel = daUnidade.filter(check_in=d, status='CANCELLED').count()
        linhas.append({'day': d.strftime('%d/%m/%Y'), 'arrivals': entram, 'departures': saem,
                       'stayovers': ficam, 'noshow': noshow, 'cancelled': cancel})
    return {
        'columns': [('day', 'Dia'), ('arrivals', 'Entradas'), ('departures', 'Saídas'),
                    ('stayovers', 'Ficam'), ('noshow', 'No-show'), ('cancelled', 'Canceladas')],
        'rows': linhas,
        'totals': {k: sum(l[k] for l in linhas)
                   for k in ('arrivals', 'departures', 'noshow', 'cancelled')},
    }


def r_receita_categoria(p):
    """RECEITA POR CATEGORIA — que tipo de quarto paga a casa."""
    from .models import Reservation
    ini, fim = _periodo(p)
    porCategoria = {}
    for r in _so_do_hotel(Reservation.objects, p).filter(
            status__in=VIVAS, check_in__lte=fim, check_out__gt=ini).select_related('room_type'):
        noites = sum(1 for d in _dias(ini, fim) if r.check_in <= d < r.check_out)
        if not noites:
            continue
        nome = r.room_type.name if r.room_type_id else '—'
        linha = porCategoria.setdefault(nome, {'category': nome, 'reservations': 0,
                                               'nights': 0, 'revenue': 0.0})
        linha['reservations'] += 1
        linha['nights'] += noites
        linha['revenue'] += float((r.effective_rate or Decimal('0')) * noites)

    linhas = sorted(porCategoria.values(), key=lambda x: -x['revenue'])
    total = sum(l['revenue'] for l in linhas) or 1
    for l in linhas:
        l['revenue'] = round(l['revenue'], 2)
        l['adr'] = round(l['revenue'] / l['nights'], 2) if l['nights'] else 0
        l['share'] = round(l['revenue'] / total * 100, 1)
    return {
        'columns': [('category', 'Categoria'), ('reservations', 'Reservas'),
                    ('nights', 'Noites'), ('adr', 'ADR', 'money'), ('revenue', 'Receita', 'money'),
                    ('share', '% do total')],
        'rows': linhas,
        'totals': {'nights': sum(l['nights'] for l in linhas),
                   'revenue': round(sum(l['revenue'] for l in linhas), 2)},
    }


def r_origem(p):
    """DE ONDE VEM O NEGÓCIO — recepção, site, OTAs, grupos.

    É o relatório que diz se vale a pena a comissão que se paga: a mesma noite
    vendida pela recepção e pela OTA não rende o mesmo ao hotel.
    """
    from .models import Reservation
    ini, fim = _periodo(p)
    porOrigem = {}
    for r in _so_do_hotel(Reservation.objects, p).filter(
            status__in=VIVAS, check_in__lte=fim, check_out__gt=ini):
        # SÓ AS NOITES QUE CAEM NESTE PERÍODO — a mesma conta de
        # `r_receita_categoria`. Somavam-se as noites TODAS da estadia, por isso
        # uma estadia de 28/01 a 03/02 era contada por inteiro no relatório de
        # Janeiro E por inteiro no de Fevereiro: a mesma receita aparecia duas
        # vezes e a soma dos meses não dava o ano.
        noites = sum(1 for d in _dias(ini, fim) if r.check_in <= d < r.check_out)
        if not noites:
            continue
        nome = r.get_source_display()
        linha = porOrigem.setdefault(nome, {'source': nome, 'reservations': 0,
                                            'nights': 0, 'revenue': 0.0})
        linha['reservations'] += 1
        linha['nights'] += noites
        linha['revenue'] += float((r.effective_rate or Decimal('0')) * noites)
    linhas = sorted(porOrigem.values(), key=lambda x: -x['revenue'])
    total = sum(l['revenue'] for l in linhas) or 1
    for l in linhas:
        l['revenue'] = round(l['revenue'], 2)
        l['share'] = round(l['revenue'] / total * 100, 1)
    return {
        'columns': [('source', 'Origem'), ('reservations', 'Reservas'), ('nights', 'Noites'),
                    ('revenue', 'Receita', 'money'), ('share', '% do total')],
        'rows': linhas,
        'totals': {'reservations': sum(l['reservations'] for l in linhas),
                   'revenue': round(sum(l['revenue'] for l in linhas), 2)},
    }


def r_contas_abertas(p):
    """CONTAS EM ABERTO — quem está cá dentro e quanto deve neste momento.

    Não leva período de propósito: a pergunta é "agora", não "no mês passado".
    É o papel que o chefe de recepção leva para o turno da noite.
    """
    from .models import Folio
    linhas = []
    # A conta não tem hotel: pertence à reserva, e é a reserva que o tem.
    for f in (_so_do_hotel(Folio.objects, p, 'reservation__hotel').filter(status='OPEN')
              .select_related('reservation', 'reservation__guest', 'reservation__room')
              .prefetch_related('charges')):
        r = f.reservation
        linhas.append({
            'folio': f.number, 'label': f.label,
            'confirmation': r.confirmation,
            'guest': r.guest.name if r.guest_id else '',
            'room': r.room.number if r.room_id else '—',
            'check_out': r.check_out.strftime('%d/%m/%Y'),
            'charges': float(f.charges_total),
            'payments': float(f.payments_total),
            'balance': float(f.balance),
        })
    linhas.sort(key=lambda x: -x['balance'])
    return {
        'columns': [('folio', 'Conta'), ('label', 'Tipo'), ('confirmation', 'Reserva'),
                    ('guest', 'Hóspede'), ('room', 'Quarto'), ('check_out', 'Saída prevista'),
                    ('charges', 'Consumos', 'money'), ('payments', 'Pago', 'money'),
                    ('balance', 'Saldo', 'money')],
        'rows': linhas,
        'totals': {'charges': round(sum(l['charges'] for l in linhas), 2),
                   'payments': round(sum(l['payments'] for l in linhas), 2),
                   'balance': round(sum(l['balance'] for l in linhas), 2)},
    }


def r_consumos(p):
    """CONSUMOS LANÇADOS NAS CONTAS, por tipo — alojamento, F&B, lavandaria…

    Mostra de onde vem o dinheiro de uma estadia: é aqui que se vê se o
    restaurante está a puxar a conta do quarto ou se o hóspede só dorme.
    """
    from .models import FolioCharge
    ini, fim = _periodo(p)
    porTipo = {}
    qs = _so_do_hotel(FolioCharge.objects, p, 'folio__reservation__hotel').filter(
        is_void=False, created_at__date__gte=ini, created_at__date__lte=fim)
    for c in qs:
        nome = c.get_charge_type_display()
        linha = porTipo.setdefault(nome, {'kind': nome, 'count': 0, 'amount': 0.0})
        linha['count'] += 1
        linha['amount'] += float(c.amount)
    linhas = sorted(porTipo.values(), key=lambda x: -x['amount'])
    for l in linhas:
        l['amount'] = round(l['amount'], 2)
    return {
        'columns': [('kind', 'Tipo'), ('count', 'Lançamentos'), ('amount', 'Valor', 'money')],
        'rows': linhas,
        'totals': {'count': sum(l['count'] for l in linhas),
                   'amount': round(sum(l['amount'] for l in linhas), 2)},
    }


def r_governanta(p):
    """GOVERNANTA — estado dos quartos e tarefas por fazer."""
    from .models import Room, HousekeepingTask
    linhas = []
    for q in _so_do_hotel(Room.objects.filter(is_active=True), p).select_related('room_type', 'floor'):
        # As tarefas vêm pelo quarto, e o quarto já é desta unidade — não é
        # preciso repetir o filtro de hotel (um quarto não existe em dois).
        pendentes = HousekeepingTask.objects.filter(room=q).exclude(status='DONE')
        linhas.append({
            'room': q.number,
            'category': q.room_type.name if q.room_type_id else '',
            'floor': q.floor.name if q.floor_id else '',
            'status': q.get_status_display(),
            'tasks': pendentes.count(),
            'detail': ' · '.join(t.title for t in pendentes[:3]),
        })
    linhas.sort(key=lambda x: x['room'])
    return {
        'columns': [('room', 'Quarto'), ('category', 'Categoria'), ('floor', 'Piso'),
                    ('status', 'Estado'), ('tasks', 'Tarefas por fazer'), ('detail', 'Quais')],
        'rows': linhas,
        'totals': {'tasks': sum(l['tasks'] for l in linhas)},
    }


def r_depositos(p):
    """DEPÓSITOS DE RESERVAS ONLINE — quem já pagou e quem falta."""
    from .models import BookingPayment
    ini, fim = _periodo(p)
    linhas = []
    for d in (_so_do_hotel(BookingPayment.objects, p, 'reservation__hotel')
              .filter(created_at__date__gte=ini, created_at__date__lte=fim)
              .select_related('reservation', 'reservation__guest')):
        r = d.reservation
        linhas.append({
            'confirmation': r.confirmation,
            'guest': r.guest.name if r.guest_id else '',
            'check_in': r.check_in.strftime('%d/%m/%Y'),
            'amount': float(d.amount),
            'status': d.get_status_display(),
            'method': d.get_method_display(),
            'reference': d.reference or '',
            'posted': 'Sim' if d.posted_to_folio else 'Não',
        })
    porReceber = sum(l['amount'] for l in linhas if l['status'] == 'Pendente')
    return {
        'columns': [('confirmation', 'Reserva'), ('guest', 'Hóspede'), ('check_in', 'Entrada'),
                    ('amount', 'Valor', 'money'), ('status', 'Situação'), ('method', 'Meio'),
                    ('reference', 'Referência'), ('posted', 'Na conta')],
        'rows': linhas,
        'totals': {'amount': round(sum(l['amount'] for l in linhas), 2),
                   'pendente': round(porReceber, 2)},
    }


def r_previsao(p):
    """PREVISÃO — quartos já vendidos para os próximos dias.

    Olha para a frente a partir de HOJE (não do período), porque é isso que uma
    previsão é: o que já está reservado e ainda não aconteceu.
    """
    from .models import Reservation, Room
    hoje = date.today()
    try:
        dias = max(1, min(int(p.get('days') or 30), 180))
    except (TypeError, ValueError):
        dias = 30
    total = _so_do_hotel(Room.objects.filter(is_active=True), p).count()
    reservas = list(_so_do_hotel(Reservation.objects, p).filter(
        status__in=('OPTION', 'BOOKED', 'CHECKED_IN'), check_out__gt=hoje))
    linhas = []
    for d in _dias(hoje, hoje + timedelta(days=dias - 1)):
        doDia = [r for r in reservas if r.check_in <= d < r.check_out]
        receita = sum((r.effective_rate or Decimal('0')) for r in doDia)
        linhas.append({
            'day': d.strftime('%d/%m/%Y'),
            'sold': len(doDia),
            'free': max(total - len(doDia), 0),
            'occupancy': round(len(doDia) / total * 100, 1) if total else 0,
            'revenue': round(float(receita), 2),
        })
    return {
        'columns': [('day', 'Dia'), ('sold', 'Vendidos'), ('free', 'Por vender'),
                    ('occupancy', 'Ocupação %'), ('revenue', 'Receita prevista', 'money')],
        'rows': linhas,
        'totals': {'sold': sum(l['sold'] for l in linhas),
                   'revenue': round(sum(l['revenue'] for l in linhas), 2)},
    }


P_PERIODO = [
    {'key': 'from', 'label': 'De data', 'type': 'date'},
    {'key': 'to', 'label': 'A data', 'type': 'date'},
]

# A UNIDADE pergunta-se em TODOS os relatórios do alojamento, mesmo nos que não
# têm período (contas em aberto, governanta): num grupo hoteleiro, "quem deve
# agora" e "que quartos estão sujos" são perguntas de UMA casa, não do grupo.
# Acrescenta-se no fim, uma vez, em vez de em cada entrada — um relatório novo
# já nasce com a pergunta sem ninguém se lembrar de a escrever (é o mesmo que o
# motor faz com o "Incluir detalhes?").
P_UNIDADE = {'key': 'hotel', 'label': 'Unidade (vazio = grupo consolidado)', 'type': 'number'}

# As pastas que o PMS acrescenta ao catálogo. Os códigos começam por 'PM' para
# não chocarem com os numerados do POS e para o dono perceber, pela pasta, de
# que módulo vem o relatório.
PASTAS = [
    {'code': 'PM', 'name': 'Alojamento (PMS)', 'reports': [
        {'code': 'pms_reservas', 'name': 'Reservas do período (quem vem, que quarto, quanto)',
         'params': P_PERIODO, 'fn': r_reservas},
        {'code': 'pms_entradas_saidas', 'name': 'Entradas e saídas por dia (lista da recepção)',
         'params': P_PERIODO, 'fn': r_entradas_saidas},
        {'code': 'pms_governanta', 'name': 'Governanta — estado dos quartos e tarefas',
         'params': [], 'fn': r_governanta},
    ]},
    {'code': 'PO', 'name': 'Ocupação e Receita (PMS)', 'reports': [
        {'code': 'pms_ocupacao', 'name': 'Ocupação por dia (com ADR e RevPAR)',
         'params': P_PERIODO, 'fn': r_ocupacao},
        {'code': 'pms_receita_categoria', 'name': 'Receita por categoria de quarto',
         'params': P_PERIODO, 'fn': r_receita_categoria},
        {'code': 'pms_origem', 'name': 'De onde vem o negócio (recepção, site, OTAs)',
         'params': P_PERIODO, 'fn': r_origem},
        {'code': 'pms_previsao', 'name': 'Previsão de ocupação (próximos dias)',
         'params': [{'key': 'days', 'label': 'Quantos dias', 'type': 'number'}],
         'fn': r_previsao},
    ]},
    {'code': 'PC', 'name': 'Contas de Hóspedes (PMS)', 'reports': [
        {'code': 'pms_contas_abertas', 'name': 'Contas em aberto (quem deve, agora)',
         'params': [], 'fn': r_contas_abertas},
        {'code': 'pms_consumos', 'name': 'Consumos lançados por tipo',
         'params': P_PERIODO, 'fn': r_consumos},
        {'code': 'pms_depositos', 'name': 'Depósitos de reservas online',
         'params': P_PERIODO, 'fn': r_depositos},
    ]},
]

for _pasta in PASTAS:
    for _rep in _pasta['reports']:
        if not any(x.get('key') == 'hotel' for x in _rep['params']):
            _rep['params'] = [*_rep['params'], P_UNIDADE]
