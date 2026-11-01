# -*- coding: utf-8 -*-
"""O DINHEIRO DO HÓSPEDE DÁ ENTRADA NA TESOURARIA QUANDO ELE PAGA.

─── PORQUE É QUE É AQUI E NÃO NO CHECK-OUT ────────────────────────────────
O check-out exige que a conta esteja a zero — ou seja, quando ele acontece o
dinheiro já entrou. O momento em que o hóspede paga é o lançamento de PAGAMENTO
no folio, e pode ser no primeiro dia, a meio da estadia ou à saída. É aí que o
dinheiro muda de mãos, e é aí que a tesouraria tem de o ver.

─── PORQUE É QUE A CONTRAPARTIDA É O CLIENTE, E NÃO A CAIXA POS ───────────
A factura do hotel é lançada como DÍVIDA do hóspede (`post_pms_invoice`:
clientes a débito, alojamento e IVA a crédito) — o hóspede pode pagar no dia
seguinte, ou a empresa dele ao fim do mês. O pagamento é o segundo momento:
entra dinheiro, baixa a dívida.

É o contrário do POS, onde a venda é a pronto e o dinheiro já nasce na conta
"Caixa POS" (ver `pos/tesouraria.py`). Dois negócios diferentes, dois
lançamentos diferentes — e é por isso que o recebimento traz a origem escrita.

─── O QUE NÃO ENTRA ───────────────────────────────────────────────────────
Um pagamento anulado (`is_void`) não é dinheiro; e um meio de pagamento sem
conta de tesouraria configurada não inventa conta nenhuma — devolve-se para
quem chamou o poder dizer.
"""
from datetime import date
from decimal import Decimal

from django.db import transaction


@transaction.atomic
def lancar_pagamento_de_folio(encargo, by=None):
    """Dá entrada, na tesouraria, de um pagamento lançado num folio.

    Devolve `(recebimento, motivo)`. Sem recebimento, `motivo` diz porquê — e
    nunca é silêncio: dinheiro que não entra em conta nenhuma tem de deixar
    rasto em algum sítio.
    """
    from finance.models import Receipt

    if encargo.charge_type != 'PAYMENT' or encargo.is_void:
        return None, 'não é um pagamento válido'

    valor = Decimal(str(encargo.amount or 0))
    if valor <= 0:
        return None, 'valor zero ou negativo'

    metodo = encargo.payment_method
    if metodo is None:
        return None, 'o pagamento não diz como foi pago'
    if not metodo.treasury_account_id:
        return None, ('o meio de pagamento "%s" não tem conta de tesouraria '
                      'configurada' % metodo.name)

    # A chave de origem impede repetir: um duplo clique a lançar o pagamento, ou
    # uma reposição que volte a correr isto, não pode dar entrada ao mesmo
    # dinheiro duas vezes.
    ref = 'FOLIO-%s' % encargo.id
    ja = Receipt.objects.filter(source_module='pms', source_ref=ref).first()
    if ja:
        return ja, 'já tinha dado entrada'

    folio = encargo.folio
    hospede = getattr(getattr(folio, 'reservation', None), 'guest', None)
    nome = getattr(hospede, 'name', None) or folio.label or 'Hóspede'

    recebimento = Receipt.objects.create(
        number=ref,
        account=metodo.treasury_account,
        party_name=nome,
        description='Pagamento de conta · %s' % (folio.label or 'folio'),
        amount=valor,
        method=metodo.code or metodo.method_type,
        reference=encargo.source_reference or ('Folio %s' % folio.id),
        date=(encargo.created_at.date() if encargo.created_at else date.today()),
        status='CONFIRMED',
        source_module='pms',
        source_ref=ref,
    )

    # A contabilidade lança a seguir, e nunca antes. Falhar aqui não pode
    # desfazer o pagamento: o hóspede pagou, e o razão apanha-se depois (o lote
    # automático volta a passar por ele).
    try:
        from accounting.posting import post_receipt
        post_receipt(recebimento, by=by)
    except Exception:
        pass

    return recebimento, None
