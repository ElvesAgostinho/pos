"""
Contabilidade Geral — motor de partidas dobradas (PGC-AO).

Princípios enterprise:
- Plano de Contas hierárquico e PARAMETRIZÁVEL (dados, não código).
- Todo o movimento é um Lançamento (JournalEntry) com linhas a débito/crédito que
  TÊM de saldar (soma débitos = soma créditos) antes de ser lançado (POSTED).
- Lançamentos lançados são imutáveis; correções fazem-se por estorno/novo lançamento.
- Os saldos e relatórios (Razão, Balancete, Balanço, DR) derivam sempre das linhas
  (fonte única), nunca de saldos guardados à mão.
"""
from decimal import Decimal
from django.db import models
from django.core.exceptions import ValidationError


# Classes do Plano Geral de Contabilidade de Angola (PGC-AO).
ACCOUNT_CLASSES = [
    ('1', 'Classe 1 — Meios Circulantes Financeiros'),
    ('2', 'Classe 2 — Terceiros'),
    ('3', 'Classe 3 — Existências'),
    ('4', 'Classe 4 — Imobilizações'),
    ('5', 'Classe 5 — Fundos Próprios'),
    ('6', 'Classe 6 — Proveitos e Ganhos por Natureza'),
    ('7', 'Classe 7 — Custos e Perdas por Natureza'),
    ('8', 'Classe 8 — Resultados'),
]

ACCOUNT_TYPES = [
    ('ASSET', 'Ativo'),
    ('LIABILITY', 'Passivo'),
    ('EQUITY', 'Fundos Próprios'),
    ('INCOME', 'Proveitos'),
    ('EXPENSE', 'Custos'),
    ('RESULT', 'Resultados'),
]


class Account(models.Model):
    """Conta do Plano de Contas. Contas 'de movimento' aceitam lançamentos;
    as agregadoras (títulos) só somam as filhas nos relatórios."""
    SIDE = [('D', 'Devedora'), ('C', 'Credora')]
    code = models.CharField(max_length=20, unique=True)          # 11, 111, 11101…
    name = models.CharField(max_length=160)
    account_class = models.CharField(max_length=1, choices=ACCOUNT_CLASSES)
    account_type = models.CharField(max_length=10, choices=ACCOUNT_TYPES)
    parent = models.ForeignKey('self', on_delete=models.SET_NULL, blank=True, null=True, related_name='children')
    is_movement = models.BooleanField(default=True)              # aceita lançamentos (folha)
    normal_side = models.CharField(max_length=1, choices=SIDE, default='D')
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'acc_account'
        ordering = ['code']

    def __str__(self):
        return f"{self.code} · {self.name}"

    def balance(self, period=None, up_to=None):
        """Saldo da conta (e das filhas) a partir das linhas de lançamentos LANÇADOS."""
        lines = JournalEntryLine.objects.filter(entry__status='POSTED')
        # inclui a própria conta e a subárvore por prefixo de código
        lines = lines.filter(account__code__startswith=self.code)
        if period is not None:
            lines = lines.filter(entry__period=period)
        if up_to is not None:
            lines = lines.filter(entry__entry_date__lte=up_to)
        agg = lines.aggregate(d=models.Sum('debit'), c=models.Sum('credit'))
        d = agg['d'] or Decimal('0')
        c = agg['c'] or Decimal('0')
        # Saldo com sinal do lado normal da conta
        return (d - c) if self.normal_side == 'D' else (c - d)


class Journal(models.Model):
    """Diário — agrupa lançamentos por natureza (vendas, compras, caixa, banco…)."""
    TYPES = [
        ('SALES', 'Diário de Vendas'), ('PURCHASES', 'Diário de Compras'),
        ('CASH', 'Diário de Caixa'), ('BANK', 'Diário de Banco'),
        ('GENERAL', 'Diário de Operações Diversas'), ('OPENING', 'Diário de Abertura'),
    ]
    code = models.CharField(max_length=10, unique=True)
    name = models.CharField(max_length=120)
    journal_type = models.CharField(max_length=12, choices=TYPES, default='GENERAL')
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'acc_journal'
        ordering = ['code']

    def __str__(self):
        return f"[{self.code}] {self.name}"


class FiscalPeriod(models.Model):
    """Exercício/período contabilístico. O fecho impede novos lançamentos no período."""
    year = models.PositiveIntegerField()
    name = models.CharField(max_length=40)              # "2026", "2026-01"…
    start_date = models.DateField()
    end_date = models.DateField()
    is_closed = models.BooleanField(default=False)

    class Meta:
        db_table = 'acc_period'
        ordering = ['-start_date']
        unique_together = ('year', 'name')

    def __str__(self):
        return self.name


class JournalEntry(models.Model):
    """Lançamento contabilístico (cabeçalho). As linhas têm de saldar para lançar."""
    STATUS = [('DRAFT', 'Rascunho'), ('POSTED', 'Lançado'), ('REVERSED', 'Estornado')]
    SOURCES = [('MANUAL', 'Manual'), ('POS', 'POS/Vendas'), ('PURCHASE', 'Compras'),
               ('TREASURY', 'Tesouraria'), ('OPENING', 'Abertura'), ('CLOSING', 'Apuramento')]
    number = models.CharField(max_length=30, unique=True)
    journal = models.ForeignKey(Journal, on_delete=models.PROTECT, related_name='entries')
    period = models.ForeignKey(FiscalPeriod, on_delete=models.PROTECT, blank=True, null=True, related_name='entries')
    entry_date = models.DateField()
    description = models.CharField(max_length=255)
    reference = models.CharField(max_length=80, blank=True, null=True)     # doc de origem
    source = models.CharField(max_length=10, choices=SOURCES, default='MANUAL')
    status = models.CharField(max_length=10, choices=STATUS, default='DRAFT')
    created_by = models.CharField(max_length=100, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    posted_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'acc_entry'
        ordering = ['-entry_date', '-id']

    def __str__(self):
        return f"{self.number} · {self.description}"

    @property
    def total_debit(self):
        return sum((l.debit for l in self.lines.all()), Decimal('0'))

    @property
    def total_credit(self):
        return sum((l.credit for l in self.lines.all()), Decimal('0'))

    @property
    def is_balanced(self):
        return self.total_debit == self.total_credit and self.total_debit > 0

    def post(self, by=None):
        """Lança o movimento: valida partidas dobradas e torna-o imutável."""
        from django.utils import timezone
        if self.status == 'POSTED':
            raise ValidationError('Lançamento já está lançado.')
        if not self.lines.exists():
            raise ValidationError('Lançamento sem linhas.')
        if not self.is_balanced:
            raise ValidationError(
                f'Lançamento não salda: débito {self.total_debit} ≠ crédito {self.total_credit}.')
        if self.period and self.period.is_closed:
            raise ValidationError('O período está fechado.')
        self.status = 'POSTED'
        self.posted_at = timezone.now()
        if by:
            self.created_by = self.created_by or by
        self.save(update_fields=['status', 'posted_at', 'created_by'])


class JournalEntryLine(models.Model):
    """Linha de um lançamento — débito OU crédito numa conta."""
    entry = models.ForeignKey(JournalEntry, on_delete=models.CASCADE, related_name='lines')
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name='lines')
    description = models.CharField(max_length=255, blank=True, null=True)
    debit = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    credit = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    cost_center = models.CharField(max_length=30, blank=True, null=True)   # código do centro de custo

    class Meta:
        db_table = 'acc_entry_line'

    def __str__(self):
        return f"{self.account.code}: D{self.debit} C{self.credit}"

    def clean(self):
        if self.debit and self.credit:
            raise ValidationError('Uma linha não pode ter débito e crédito em simultâneo.')
        if not self.debit and not self.credit:
            raise ValidationError('Indique um valor a débito ou a crédito.')
