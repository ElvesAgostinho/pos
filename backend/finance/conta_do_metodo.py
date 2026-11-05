# -*- coding: utf-8 -*-
"""EM QUE CONTA DE TESOURARIA ENTRA O DINHEIRO DESTE MODO DE PAGAMENTO.

─── O BURACO QUE ISTO TAPA ────────────────────────────────────────────────
O circuito da tesouraria ficou pronto: o fecho de caixa do POS e o check-out
do PMS lançam o dinheiro na conta que a ficha do modo de pagamento indica.

Só que NADA, em lado nenhum do sistema, preenchia essa ficha. Nem o
`seed_demo`, nem o instalador, nem o primeiro arranque. Numa instalação
acabada de fazer, todos os modos de pagamento nascem sem conta — e o circuito
inteiro fica inerte: o hotel vende o dia todo, fecha a caixa, e a tesouraria
continua a zero. Com um aviso no fim do fecho, que ninguém lê.

Uma funcionalidade que só funciona depois de alguém adivinhar que tem de a
configurar é uma funcionalidade que não existe.

─── A REGRA, E PORQUE É ESTA ──────────────────────────────────────────────
 1. A conta da FICHA, se lá estiver. Quem configurou, mandou — e manda sempre.

 2. Senão, se o hotel tiver UMA ÚNICA conta activa do tipo certo, é essa. Numa
    casa com uma caixa só, o dinheiro da caixa vai obviamente para a caixa:
    obrigar alguém a dizê-lo é pedir-lhe que repita o óbvio para o sistema
    funcionar.

 3. Se houver DUAS OU MAIS, não se escolhe. Pôr o dinheiro numa de três contas
    à sorte é pior do que não o pôr: uma reconciliação que não bate manda
    alguém procurar um erro que nunca existiu, e a conta certa fica a faltar
    sem que ninguém perceba porquê. Aí sim, diz-se que falta configurar.

O tipo da conta sai do tipo do MÉTODO (dinheiro → caixa, cartão e
transferência → banco), que é a mesma correspondência que a contabilidade já
usa em accounting/posting.py.
"""

# Do que o método é, para onde o dinheiro entra.
#
# ROOM, COMPANY e CREDIT não estão aqui de propósito: não são dinheiro
# recebido, é dívida que muda de sítio, e já são recusados antes de chegarem
# aqui (ver pos/tesouraria.py).
TIPO_DE_CONTA = {
    'CASH': 'CASH',
    'CARD': 'BANK',
    'TRANSFER': 'BANK',
    'CHEQUE': 'BANK',
    'MOBILE': 'BANK',
}


def garantir_caixa(hotel):
    """Cria a caixa do hotel se ele ainda não tiver conta de dinheiro activa.

    Numa instalação real o hotel nasce na ATIVAÇÃO, depois de o instalador ter
    corrido os seeds: só o `seed_tesouraria` deixava esse hotel sem caixa nenhuma.
    Devolve True se criou.
    """
    from .models import FinanceAccount
    if FinanceAccount.objects.filter(hotel=hotel, account_type='CASH', is_active=True).exists():
        return False
    FinanceAccount.objects.create(hotel=hotel, code='CAIXA', name='Caixa', account_type='CASH',
                                  currency='AOA', opening_balance=0, is_active=True)
    return True


def conta_para(metodo, hotel_id=None):
    """A conta de tesouraria deste método, ou None se não se puder decidir."""
    if metodo is None:
        return None
    if metodo.treasury_account_id:
        return metodo.treasury_account

    from .models import FinanceAccount
    tipo = TIPO_DE_CONTA.get((metodo.method_type or '').upper())
    if not tipo:
        return None

    contas = FinanceAccount.objects.filter(is_active=True, account_type=tipo)
    if hotel_id:
        contas = contas.filter(hotel_id=hotel_id)

    # EXACTAMENTE UMA. Com duas, não se adivinha — ver o cabeçalho.
    encontradas = list(contas[:2])
    return encontradas[0] if len(encontradas) == 1 else None
