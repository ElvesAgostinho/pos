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
"""
from datetime import date, timedelta
from decimal import Decimal


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
    qs = (Reservation.objects
          .filter(check_in__lte=fim, check_out__gte=ini)
          .select_related('guest', 'room', 'room_type', 'rate_plan', 'block')
          .order_by('check_in'))
    linhas = []
    for r in qs:
        tarifa = r.effective_rate or Decimal('0')
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
        })
    return {
        'columns': [('confirmation', 'Reserva'), ('guest', 'Hóspede'), ('room', 'Quarto'),
                    ('category', 'Categoria'), ('check_in', 'Entrada'), ('check_out', 'Saída'),
                    ('nights', 'Noites'), ('pax', 'Pax'), ('source', 'Origem'),
                    ('status', 'Estado'), ('rate', 'Tarifa/noite', 'money'), ('total', 'Total', 'money')],
        'rows': linhas,
        'totals': {'nights': sum(l['nights'] for l in linhas),
                   'total': round(sum(l['total'] for l in linhas), 2)},
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
    total_quartos = Room.objects.filter(is_active=True).count()
    reservas = list(Reservation.objects.filter(
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
    linhas = []
    for d in _dias(ini, fim):
        entram = Reservation.objects.filter(check_in=d, status__in=VIVAS).count()
        saem = Reservation.objects.filter(check_out=d, status__in=VIVAS).count()
        ficam = Reservation.objects.filter(
            status__in=VIVAS, check_in__lt=d, check_out__gt=d).count()
        noshow = Reservation.objects.filter(check_in=d, status='NO_SHOW').count()
        cancel = Reservation.objects.filter(check_in=d, status='CANCELLED').count()
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
    for r in Reservation.objects.filter(
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
    for r in Reservation.objects.filter(
            status__in=VIVAS, check_in__lte=fim, check_out__gte=ini):
        nome = r.get_source_display()
        linha = porOrigem.setdefault(nome, {'source': nome, 'reservations': 0,
                                            'nights': 0, 'revenue': 0.0})
        linha['reservations'] += 1
        linha['nights'] += r.nights
        linha['revenue'] += float((r.effective_rate or Decimal('0')) * r.nights)
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
    for f in (Folio.objects.filter(status='OPEN')
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
    qs = FolioCharge.objects.filter(
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
    for q in Room.objects.filter(is_active=True).select_related('room_type', 'floor'):
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
    for d in (BookingPayment.objects.filter(created_at__date__gte=ini, created_at__date__lte=fim)
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
    total = Room.objects.filter(is_active=True).count()
    reservas = list(Reservation.objects.filter(
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
