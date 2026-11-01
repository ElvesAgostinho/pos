# -*- coding: utf-8 -*-
"""A CAIXA DA CASA — a conta de tesouraria que toda a gente tem e ninguém cria.

─── O BURACO ──────────────────────────────────────────────────────────────
O circuito da tesouraria está escrito e testado: o fecho de caixa do POS e o
pagamento de conta no PMS lançam o dinheiro na conta de tesouraria do modo de
pagamento. Mas numa instalação nova NÃO HÁ CONTA NENHUMA — nem o instalador,
nem os seeds, nem o primeiro arranque criavam uma.

O resultado é o mesmo de outras duas vezes em que isto aconteceu nesta casa
(ver core/test_instalacao.py): tudo verde na suite, e no cliente o dinheiro
não chega ao sítio. Vende-se o dia todo, fecha-se a caixa, e a tesouraria
continua a zero — com um aviso no fim do fecho que ninguém lê.

Uma funcionalidade que só funciona depois de alguém adivinhar que tem de a
configurar é uma funcionalidade que não existe.

─── O QUE SE CRIA, E O QUE NÃO SE CRIA ────────────────────────────────────
Cria-se UMA caixa por hotel, e mais nada. Toda a casa tem um sítio onde o
dinheiro do dia fica até ir ao banco — não é uma escolha de gestão, é o
mínimo para a operação existir. Com uma conta só, a escolha automática de
`finance/conta_do_metodo.py` resolve o resto sozinha.

NÃO se criam contas bancárias: essas têm IBAN, banco e titular, são decisões
do dono, e inventá-las encheria a lista dele de coisas que não reconhece. Um
hotel que receba por transferência cria a sua conta e o sistema passa a
usá-la.

Idempotente, como os outros seeds: numa actualização não mexe no que já
existe, e não cria uma segunda caixa a quem já tem a sua.
"""
from django.core.management.base import BaseCommand

from finance.models import FinanceAccount
from identity.models import Hotel


class Command(BaseCommand):
    help = 'Cria a caixa de tesouraria de cada hotel, se ainda não existir.'

    def handle(self, *args, **opts):
        criadas, existentes = 0, 0

        for hotel in Hotel.objects.all():
            # JÁ TEM UMA CAIXA? Não se mexe. E repare-se que a pergunta é "tem
            # alguma conta de dinheiro", não "tem uma com este código": quem
            # criou a sua à mão, com outro nome, tem a casa resolvida — criar
            # outra ao lado era dar-lhe duas e estragar a escolha automática,
            # que precisa de haver UMA só para poder decidir sozinha.
            if FinanceAccount.objects.filter(hotel=hotel, account_type='CASH',
                                             is_active=True).exists():
                existentes += 1
                continue

            FinanceAccount.objects.create(
                hotel=hotel, code='CAIXA', name='Caixa',
                account_type='CASH', currency='AOA', opening_balance=0,
                is_active=True)
            criadas += 1

        self.stdout.write(f'Tesouraria: {criadas} caixa(s) criada(s), '
                          f'{existentes} hotel(éis) já tinham a sua.')
