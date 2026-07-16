"""
CENTRO DE ALERTAS — o sistema procura os problemas; o dono não tem de os procurar.

Ninguém abre o relatório de anulações todos os dias. Ninguém repara que um operador
anula cinco vezes mais do que os outros, que houve três logins falhados às 02h no
terminal do bar, ou que o whisky está a ser vendido abaixo do custo desde que o
fornecedor subiu o preço.

Cada alerta aqui responde a três perguntas: O QUE se passa, PORQUE é que isso é grave,
e O QUE fazer a seguir. Um alerta que não diz o que fazer é ruído — e ruído ensina-se
a ignorar.

Severidade:
  CRITICO — dinheiro a sair, ou a lei a ser quebrada. Trata-se hoje.
  AVISO   — vai custar dinheiro se ninguém mexer.
  INFO    — vale a pena saber.
"""
from decimal import Decimal
from datetime import timedelta

from django.db.models import Sum, Count, Avg
from django.utils import timezone


def _n(v):
    return Decimal(str(v or 0))


def _alerta(codigo, sev, titulo, detalhe, porque, accao, valor=None, ecra=None):
    return {
        'code': codigo, 'severity': sev, 'title': titulo, 'detail': detalhe,
        'why': porque, 'action': accao,
        'amount': str(valor) if valor is not None else None,
        'screen': ecra,
    }


# ─────────────────────────────────────────── FRAUDE / DESVIOS
def a_anulacoes_operador(dias=7):
    """Um operador que anula muito mais do que os colegas é o padrão clássico do desvio:
    lança, cobra, anula, e o dinheiro fica no bolso."""
    from .models import POSTicketLine
    fim = timezone.localdate()
    ini = fim - timedelta(days=dias)
    por_op = {}
    for l in (POSTicketLine.objects.filter(
            is_void=True, ticket__opened_at__date__gte=ini)
            .select_related('ticket')):
        op = l.ticket.operator_name if l.ticket_id else '—'
        d = por_op.setdefault(op, {'n': 0, 'valor': Decimal('0')})
        d['n'] += 1
        d['valor'] += _n(l.line_total)

    if len(por_op) < 2:
        return []
    media = sum(d['n'] for d in por_op.values()) / len(por_op)
    out = []
    for op, d in por_op.items():
        if media and d['n'] >= 5 and d['n'] > media * 2.5:
            out.append(_alerta(
                'VOID_OP', 'CRITICO',
                f'{op} anulou {d["n"]} artigos em {dias} dias',
                f'{d["n"]} anulações ({d["valor"]} Kz) — a média dos outros operadores é '
                f'{media:.1f}.',
                'Anular depois de cobrar é a forma mais simples de tirar dinheiro da caixa: '
                'o cliente paga, a venda desaparece, e o troco fica no bolso.',
                'Abra o relatório "Artigos anulados", veja os motivos e as horas, e confirme '
                'com o chefe de sala.',
                d['valor'], 'x_reports'))
    return out


def a_logins_falhados(horas=24):
    """Tentativas falhadas fora de horas não são esquecimentos de password."""
    from auth_engine.models import AuthEventLog
    desde = timezone.now() - timedelta(hours=horas)
    qs = AuthEventLog.objects.filter(timestamp__gte=desde,
                                     event_type__startswith='LOGIN_FAILED')
    n = qs.count()
    if n < 3:
        return []
    noite = sum(1 for a in qs if timezone.localtime(a.timestamp).hour in range(0, 6))
    sev = 'CRITICO' if noite >= 3 else 'AVISO'
    quem = ', '.join(sorted({a.identity_attempt or '?' for a in qs})[:4])
    return [_alerta(
        'LOGIN_FAIL', sev,
        f'{n} tentativas de login falhadas nas últimas {horas}h',
        f'Identidades tentadas: {quem}.' + (f' {noite} entre a meia-noite e as 6h.' if noite else ''),
        'Três falhas seguidas de madrugada não são um lapso de memória — são alguém a tentar '
        'entrar com a conta de outra pessoa.',
        'Veja "Entradas e saídas" no Reporting e, se não reconhecer, mude as passwords desses utilizadores.',
        None, 'x_reports')]


def a_descontos(dias=7, limite_pct=Decimal('10')):
    """Desconto é dinheiro que se oferece. Acima de um limite, é preciso saber a quem."""
    from .models import POSTicket
    fim = timezone.localdate()
    ini = fim - timedelta(days=dias)
    qs = POSTicket.objects.filter(status='PAID', closed_at__date__gte=ini)
    total = _n(qs.aggregate(t=Sum('grand_total'))['t'])
    desc = _n(qs.aggregate(t=Sum('discount_total'))['t'])
    if not total or not desc:
        return []
    pct = desc / (total + desc) * 100
    if pct < limite_pct:
        return []
    return [_alerta(
        'DISCOUNT', 'AVISO',
        f'Descontos de {pct:.1f}% das vendas nos últimos {dias} dias',
        f'{desc} Kz oferecidos em {total + desc} Kz de vendas.',
        'Um décimo da receita a sair em descontos, sem campanha nenhuma, é dinheiro que '
        'alguém está a decidir dar — e normalmente não é o dono.',
        'Abra "Vendas por operador": a coluna "Descontos dados" diz quem os deu.',
        desc, 'x_reports')]


# ─────────────────────────────────────────── DINHEIRO / OPERAÇÃO
def a_contas_abertas():
    """Uma conta aberta há horas é comida servida que ninguém cobrou."""
    from .models import POSTicket
    agora = timezone.now()
    velhas = [t for t in POSTicket.objects.filter(status='OPEN').select_related('outlet')
              if (agora - t.opened_at).total_seconds() > 4 * 3600]
    if not velhas:
        return []
    total = sum((_n(t.grand_total) for t in velhas), Decimal('0'))
    return [_alerta(
        'OPEN_TICKETS', 'CRITICO' if len(velhas) > 3 else 'AVISO',
        f'{len(velhas)} conta(s) abertas há mais de 4 horas',
        f'{total} Kz por cobrar. A mais antiga está aberta há '
        f'{int((agora - min(t.opened_at for t in velhas)).total_seconds() / 3600)}h.',
        'Uma conta que fica aberta de um dia para o outro é comida que saiu da cozinha e '
        'dinheiro que nunca entrou na caixa.',
        'Vá a "Fecho do Dia": estão todas listadas, com a mesa e o operador.',
        total, 'x_dayclose')]


def a_caixas_abertas():
    from .models import CashSession
    agora = timezone.now()
    velhas = [s for s in CashSession.objects.filter(status='OPEN')
              if (agora - s.opened_at).days >= 1]
    if not velhas:
        return []
    return [_alerta(
        'CASH_OPEN', 'AVISO',
        f'{len(velhas)} caixa(s) aberta(s) de dias anteriores',
        'Sessões de caixa que nunca foram fechadas.',
        'As vendas de hoje entram na caixa de ontem — e o fecho nunca bate certo.',
        'Feche o dia no ecrã "Fecho do Dia".',
        None, 'x_dayclose')]


def a_impressao():
    """Uma comanda parada na fila é um prato que a cozinha nunca viu."""
    from .models import PrintJob
    fila = PrintJob.objects.filter(status='QUEUED').order_by('created_at')
    falhadas = PrintJob.objects.filter(status='FAILED').count()
    out = []
    antiga = fila.first()
    if antiga:
        mins = int((timezone.now() - antiga.created_at).total_seconds() / 60)
        if mins > 10:
            out.append(_alerta(
                'PRINT_STUCK', 'CRITICO',
                f'Comandas paradas na fila há {mins} minutos',
                f'{fila.count()} comanda(s) por imprimir.',
                'O pedido foi lançado, o cliente está à espera — e a cozinha nunca o viu.',
                'Verifique o agente de impressão no Diagnóstico.',
                None, 'x_diag'))
    if falhadas:
        out.append(_alerta(
            'PRINT_FAIL', 'AVISO', f'{falhadas} comanda(s) falharam',
            'Trabalhos de impressão em erro.',
            'Cada uma é um pedido que não chegou à produção.',
            'No Diagnóstico, use "Reenviar comandas falhadas".',
            None, 'x_diag'))
    return out


# ─────────────────────────────────────────── STOCK / MARGEM
def a_stock_negativo():
    from inventory.models import StockLevel
    negativos = [n for n in StockLevel.objects.select_related('item', 'warehouse')
                 if (n.quantity_on_hand or 0) < 0]
    if not negativos:
        return []
    nomes = ', '.join(f'{n.item.name} ({n.quantity_on_hand})' for n in negativos[:3])
    return [_alerta(
        'STOCK_NEG', 'AVISO',
        f'{len(negativos)} artigo(s) com stock NEGATIVO',
        nomes + ('…' if len(negativos) > 3 else ''),
        'Stock negativo é sempre um erro: vendeu-se o que o sistema não sabia que existia. '
        'Ou faltou dar entrada de uma compra, ou a ficha técnica está errada.',
        'Faça um inventário ao armazém e use "Recalcular o stock" nas Existências.',
        None, 'x_stock')]


def a_margem_negativa(dias=30):
    """Vender abaixo do custo — normalmente porque o fornecedor subiu o preço e ninguém
    mexeu na tabela de venda."""
    from . import reports
    fim = timezone.localdate()
    ini = fim - timedelta(days=dias)
    d = reports.r_margem({'from': str(ini), 'to': str(fim)})
    maus = [r for r in d['rows'] if Decimal(r['profit']) < 0]
    if not maus:
        return []
    perda = sum((Decimal(r['profit']) for r in maus), Decimal('0'))
    nomes = ', '.join(r['name'] for r in maus[:3])
    return [_alerta(
        'MARGIN_NEG', 'CRITICO',
        f'{len(maus)} artigo(s) vendidos ABAIXO DO CUSTO',
        f'{nomes}{"…" if len(maus) > 3 else ""} — perda de {abs(perda):.2f} Kz em {dias} dias.',
        'Cada unidade vendida faz o hotel perder dinheiro. Quanto mais vender, pior fica.',
        'Abra "MARGEM por artigo" e suba o preço de venda — ou renegoceie a compra.',
        abs(perda), 'x_reports')]


def a_quebras(dias=30, limite=Decimal('20000')):
    from .models import StockDoc
    fim = timezone.localdate()
    ini = fim - timedelta(days=dias)
    perda = Decimal('0')
    for d in StockDoc.objects.filter(series__kind='INVENTORY', posted=True, voided=False,
                                     doc_date__gte=ini).prefetch_related('lines'):
        for l in d.lines.all():
            dif = _n(l.quantity) - _n(l.theoretical_qty)
            if dif < 0:
                perda += abs(dif) * _n(l.theoretical_cost)
    if perda < limite:
        return []
    return [_alerta(
        'SHRINK', 'CRITICO',
        f'Quebras de inventário de {perda:.2f} Kz em {dias} dias',
        'Diferença entre o que se contou e o que devia lá estar.',
        'Isto é mercadoria que foi comprada, paga, e nunca vendida. Ou se partiu, ou saiu pela porta.',
        'Veja "Quebras de inventário" — tem o artigo, o armazém e o responsável pela contagem.',
        perda, 'x_reports')]


def a_por_pagar():
    from .models import StockDoc
    hoje = timezone.localdate()
    vencidas = [d for d in StockDoc.objects.filter(
        series__nature='PAYABLE', paid=False, voided=False, due_date__lt=hoje)
        .select_related('entity')]
    if not vencidas:
        return []
    total = sum((d.total for d in vencidas), Decimal('0'))
    return [_alerta(
        'PAYABLE_LATE', 'AVISO',
        f'{len(vencidas)} fatura(s) de fornecedor vencidas',
        f'{total} Kz já passaram do vencimento.',
        'Fornecedor que não recebe, deixa de entregar — e um restaurante sem mercadoria fecha.',
        'Veja "Contas a pagar".',
        total, 'x_payables')]


# ─────────────────────────────────────────── FISCAL
def a_fiscal():
    from fiscal.models import FiscalConfig, FiscalSeries, FiscalDocument
    out = []
    cfg = FiscalConfig.get()
    if not cfg.certificate_number:
        out.append(_alerta(
            'NO_CERT', 'CRITICO', 'O sistema não está certificado pela AGT',
            'Não há número de certificação configurado.',
            'Emitir faturas sem certificação é ilegal em Angola — e as faturas emitidas '
            'não são aceites.',
            'Contacte o fornecedor do software para provisionar a certificação.',
            None, 'x_diag'))
    fechadas = FiscalSeries.objects.filter(is_active=True, is_closed=True).count()
    if fechadas:
        out.append(_alerta(
            'SERIES_CLOSED', 'AVISO', f'{fechadas} série(s) fiscais fechadas mas ativas',
            'Séries encerradas que ainda aparecem como ativas.',
            'Uma série fechada não volta a numerar — a próxima venda vai falhar no balcão.',
            'Abra uma série nova em Configuração POS › Documentos.',
            None, None))
    return out


REGRAS = [
    a_anulacoes_operador, a_logins_falhados, a_descontos,
    a_contas_abertas, a_caixas_abertas, a_impressao,
    a_stock_negativo, a_margem_negativa, a_quebras, a_por_pagar,
    a_fiscal,
]

ORDEM = {'CRITICO': 0, 'AVISO': 1, 'INFO': 2}


def run_all():
    """Corre todas as regras. Uma regra que rebente não pode deixar o painel em branco."""
    out, erros = [], []
    for regra in REGRAS:
        try:
            out.extend(regra() or [])
        except Exception as e:
            erros.append(f'{regra.__name__}: {e}')
    out.sort(key=lambda a: ORDEM.get(a['severity'], 9))
    return {
        'alerts': out,
        'critical': sum(1 for a in out if a['severity'] == 'CRITICO'),
        'warning': sum(1 for a in out if a['severity'] == 'AVISO'),
        'checked': len(REGRAS),
        'errors': erros,
        'at': timezone.now(),
    }
