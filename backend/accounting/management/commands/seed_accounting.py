"""
Seed do plano de contas PGC-AO (Plano Geral de Contabilidade de Angola),
diários e exercício. Parametrizável — o cliente ajusta as contas sem tocar no código.

Uso: python manage.py seed_accounting
"""
import datetime
from django.core.management.base import BaseCommand
from accounting.models import Account, Journal, FiscalPeriod

# (código, nome, classe, tipo, lado_normal, é_movimento)
ACCOUNTS = [
    # Classe 1 — Meios Circulantes Financeiros
    ('1', 'Meios Circulantes Financeiros', '1', 'ASSET', 'D', False),
    ('11', 'Caixa', '1', 'ASSET', 'D', False),
    ('111', 'Caixa Geral', '1', 'ASSET', 'D', True),
    ('112', 'Caixa POS', '1', 'ASSET', 'D', True),
    ('12', 'Depósitos à Ordem', '1', 'ASSET', 'D', False),
    ('121', 'Banco BAI', '1', 'ASSET', 'D', True),
    ('122', 'Banco BFA', '1', 'ASSET', 'D', True),
    # Classe 2 — Terceiros
    ('2', 'Terceiros', '2', 'ASSET', 'D', False),
    ('21', 'Clientes', '2', 'ASSET', 'D', False),
    ('211', 'Clientes Gerais', '2', 'ASSET', 'D', True),
    ('212', 'Clientes Hóspedes', '2', 'ASSET', 'D', True),
    ('22', 'Fornecedores', '2', 'LIABILITY', 'C', False),
    ('221', 'Fornecedores Gerais', '2', 'LIABILITY', 'C', True),
    ('24', 'Estado', '2', 'LIABILITY', 'C', False),
    ('2431', 'IVA a Pagar (liquidado)', '2', 'LIABILITY', 'C', True),
    ('2432', 'IVA a Recuperar (dedutível)', '2', 'ASSET', 'D', True),
    ('26', 'Outros Terceiros', '2', 'LIABILITY', 'C', False),
    ('261', 'Pessoal', '2', 'LIABILITY', 'C', True),
    # Classe 3 — Existências
    ('3', 'Existências', '3', 'ASSET', 'D', False),
    ('31', 'Mercadorias', '3', 'ASSET', 'D', True),
    ('32', 'Matérias-Primas', '3', 'ASSET', 'D', True),
    ('36', 'Produtos Acabados', '3', 'ASSET', 'D', True),
    # Classe 4 — Imobilizações
    ('4', 'Imobilizações', '4', 'ASSET', 'D', False),
    ('41', 'Imobilizações Corpóreas', '4', 'ASSET', 'D', False),
    ('411', 'Edifícios', '4', 'ASSET', 'D', True),
    ('412', 'Equipamento', '4', 'ASSET', 'D', True),
    ('419', 'Amortizações Acumuladas', '4', 'ASSET', 'C', True),
    # Classe 5 — Fundos Próprios
    ('5', 'Fundos Próprios', '5', 'EQUITY', 'C', False),
    ('51', 'Capital', '5', 'EQUITY', 'C', True),
    ('55', 'Reservas', '5', 'EQUITY', 'C', True),
    ('59', 'Resultados Transitados', '5', 'EQUITY', 'C', True),
    # Classe 6 — Proveitos e Ganhos
    ('6', 'Proveitos e Ganhos', '6', 'INCOME', 'C', False),
    ('61', 'Vendas', '6', 'INCOME', 'C', False),
    ('611', 'Vendas de Mercadorias', '6', 'INCOME', 'C', True),
    ('62', 'Prestações de Serviços', '6', 'INCOME', 'C', False),
    ('621', 'Alojamento', '6', 'INCOME', 'C', True),
    ('622', 'Restauração (F&B)', '6', 'INCOME', 'C', True),
    ('623', 'Bar', '6', 'INCOME', 'C', True),
    ('63', 'Proveitos Suplementares', '6', 'INCOME', 'C', True),
    # Classe 7 — Custos e Perdas
    ('7', 'Custos e Perdas', '7', 'EXPENSE', 'D', False),
    ('71', 'Custo das Mercadorias Vendidas', '7', 'EXPENSE', 'D', True),
    ('72', 'Fornecimentos e Serviços de Terceiros', '7', 'EXPENSE', 'D', False),
    ('721', 'Água e Eletricidade', '7', 'EXPENSE', 'D', True),
    ('722', 'Rendas', '7', 'EXPENSE', 'D', True),
    ('723', 'Comunicações', '7', 'EXPENSE', 'D', True),
    ('73', 'Custos com Pessoal', '7', 'EXPENSE', 'D', False),
    ('731', 'Remunerações', '7', 'EXPENSE', 'D', True),
    ('75', 'Amortizações do Exercício', '7', 'EXPENSE', 'D', True),
    # Classe 8 — Resultados
    ('8', 'Resultados', '8', 'RESULT', 'C', False),
    ('88', 'Resultado Líquido do Exercício', '8', 'RESULT', 'C', True),
]

JOURNALS = [
    ('VD', 'Diário de Vendas', 'SALES'),
    ('CP', 'Diário de Compras', 'PURCHASES'),
    ('CX', 'Diário de Caixa', 'CASH'),
    ('BC', 'Diário de Banco', 'BANK'),
    ('OD', 'Operações Diversas', 'GENERAL'),
    ('AB', 'Diário de Abertura', 'OPENING'),
]


class Command(BaseCommand):
    help = 'Seed do Plano de Contas PGC-AO, diários e exercício contabilístico.'

    def handle(self, *args, **opts):
        for code, name, cls, typ, side, mov in ACCOUNTS:
            Account.objects.update_or_create(
                code=code,
                defaults=dict(name=name, account_class=cls, account_type=typ,
                              normal_side=side, is_movement=mov, is_active=True))
        # Ligar parents pelo prefixo mais longo
        codes = sorted([a[0] for a in ACCOUNTS], key=len)
        for code, *_ in ACCOUNTS:
            parent = None
            for i in range(len(code) - 1, 0, -1):
                cand = code[:i]
                if Account.objects.filter(code=cand).exists():
                    parent = Account.objects.get(code=cand)
                    break
            acc = Account.objects.get(code=code)
            if acc.parent_id != (parent.id if parent else None):
                acc.parent = parent
                acc.save(update_fields=['parent'])
        self.stdout.write(self.style.SUCCESS(f'{len(ACCOUNTS)} contas PGC-AO criadas/atualizadas.'))

        for code, name, jt in JOURNALS:
            Journal.objects.update_or_create(code=code, defaults=dict(name=name, journal_type=jt, is_active=True))
        self.stdout.write(self.style.SUCCESS(f'{len(JOURNALS)} diários criados.'))

        year = datetime.date.today().year
        FiscalPeriod.objects.get_or_create(
            year=year, name=str(year),
            defaults=dict(start_date=datetime.date(year, 1, 1), end_date=datetime.date(year, 12, 31)))
        self.stdout.write(self.style.SUCCESS(f'Exercício {year} criado.'))
