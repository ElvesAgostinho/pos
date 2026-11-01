# -*- coding: utf-8 -*-
"""O DINHEIRO DO POS DÁ ENTRADA NA TESOURARIA AO FECHAR A CAIXA.

─── O BURACO QUE ISTO FECHA ───────────────────────────────────────────────
Havia 340 talões vendidos, 61 caixas fechadas e 185 documentos fiscais — e na
tesouraria quatro recebimentos, todos escritos à mão. Nenhuma venda do POS lá
chegava.

Não era um relatório em falta: o ecrã Financeiro mostra "Total Receitas /
Despesas / Saldo" com ar de resumo financeiro da casa, e o que mostrava era o
saldo de um caderno. Quem olhasse tirava a conclusão errada sobre o hotel.

─── PORQUE É QUE ISTO NÃO É UMA RECEITA NOVA ──────────────────────────────
A venda JÁ foi lançada na contabilidade quando o talão fechou
(`accounting.posting.post_pos_ticket`), e o dinheiro já está na conta "Caixa
POS" do razão. O que o fecho faz é TRANSFERIR dessa conta para o caixa físico
ou para o banco.

Tratar isto como um recebimento normal de cliente contaria a mesma venda duas
vezes — por isso o recebimento sai marcado com a origem (`source_module='pos'`)
e a contabilidade escolhe a contrapartida a partir dela.

─── PORQUE É QUE PODE NÃO LANÇAR NADA ─────────────────────────────────────
Cada meio de pagamento diz em que conta de tesouraria o dinheiro cai, e só a
casa sabe quais são: o numerário vai ao caixa, o TPA à conta do banco onde a
operação aterra. Sem essa configuração NÃO se inventa uma conta — devolve-se a
lista do que ficou por lançar, para o fecho a poder mostrar.

Dinheiro posto na conta errada é pior do que dinheiro por lançar: o segundo
vê-se no ecrã, o primeiro só aparece na reconciliação bancária, meses depois.
"""
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum


# Meios de pagamento que NÃO são dinheiro a entrar na tesouraria agora.
#
# Uma conta-quarto passa para o folio do hóspede e é cobrada no check-out; uma
# conta-empresa vira dívida a receber. Nos dois casos o dinheiro ainda não entrou
# em caixa nenhuma, e dar-lhe entrada aqui era inventar um recebimento que não
# houve — e depois voltar a recebê-lo quando o hóspede pagar mesmo.
NAO_ENTRAM = ('ROOM', 'COMPANY', 'CREDIT')


def _numero(sessao, metodo):
    """O número do recebimento, derivado da origem.

    É também a chave de unicidade (`source_ref`): fechar a mesma caixa duas
    vezes — duplo clique, retry de rede, o agendador a correr em cima de alguém
    — não pode dar entrada ao mesmo dinheiro duas vezes.
    """
    return 'CX%s-%s' % (sessao.id, (metodo.code or metodo.id))


@transaction.atomic
def lancar_fecho_de_caixa(sessao, by=None):
    """Dá entrada, na tesouraria, do que esta caixa recebeu.

    Devolve `(lancados, por_configurar)`:
      · `lancados` — os recebimentos criados agora (lista de Receipt);
      · `por_configurar` — [(nome do meio, total)] dos meios sem conta de
        tesouraria, para o fecho poder dizer o que ficou de fora.
    """
    from datetime import date
    from finance.models import Receipt
    from .models import POSTicketPayment

    totais = (POSTicketPayment.objects
              .filter(ticket__cash_session=sessao, ticket__status='PAID')
              .exclude(payment_method__method_type__in=NAO_ENTRAM)
              .values('payment_method')
              .annotate(total=Sum('amount')))

    lancados, por_configurar = [], []
    quando = (sessao.closed_at.date() if getattr(sessao, 'closed_at', None) else date.today())

    from mdm.models import PaymentMethod
    for linha in totais:
        valor = Decimal(str(linha['total'] or 0))
        if valor <= 0:
            continue
        metodo = PaymentMethod.objects.filter(pk=linha['payment_method']).first()
        if metodo is None:
            continue
        if not metodo.treasury_account_id:
            por_configurar.append((metodo.name, valor))
            continue

        ref = _numero(sessao, metodo)
        if Receipt.objects.filter(source_module='pos', source_ref=ref).exists():
            continue   # esta caixa já deu entrada — ver a nota em `_numero`

        lancados.append(Receipt.objects.create(
            number=ref,
            account=metodo.treasury_account,
            party_name='Vendas POS · %s' % (sessao.outlet.name if sessao.outlet_id else 'POS'),
            description='Fecho de caixa %s · %s' % (sessao.id, metodo.name),
            amount=valor,
            method=metodo.code or metodo.method_type,
            reference='Caixa %s' % sessao.id,
            date=quando,
            status='CONFIRMED',
            source_module='pos',
            source_ref=ref,
        ))

    # A CONTABILIDADE LANÇA A SEGUIR, e nunca antes: um recebimento que ainda não
    # existe não se lança. Falhar aqui não pode desfazer o fecho da caixa — o
    # dinheiro foi contado e a caixa está fechada; o razão apanha-se depois.
    for r in lancados:
        try:
            from accounting.posting import post_receipt
            post_receipt(r, by=by)
        except Exception:
            pass

    return lancados, por_configurar
