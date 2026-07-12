"""Motivos de isenção de IVA (AGT / CIVA Angola).

O texto é o que sai IMPRESSO na fatura e o que vai no SAF-T. Sem ele, uma linha
isenta torna a fatura inválida.
"""
from django.core.management.base import BaseCommand
from fiscal.models import TaxExemptionReason

DADOS = [
    ('M01', 'Artigo 16.º, n.º 6 do CIVA', 'Artigo 16.º, n.º 6, alíneas a) a d) do CIVA'),
    ('M02', 'Artigo 6.º do Decreto-Lei n.º 198/90, de 19 de Junho', 'Artigo 6.º do Decreto-Lei n.º 198/90'),
    ('M04', 'Isento Artigo 13.º do CIVA', 'Artigo 13.º do CIVA'),
    ('M05', 'Isento Artigo 14.º do CIVA', 'Artigo 14.º do CIVA'),
    ('M06', 'Isento Artigo 15.º do CIVA', 'Artigo 15.º do CIVA'),
    ('M07', 'Isento Artigo 9.º do CIVA', 'Artigo 9.º do CIVA'),
    ('M09', 'IVA - não confere direito a dedução', 'IVA - não confere direito a dedução / Artigo 62.º alínea b) do CIVA'),
    ('M10', 'IVA - Regime de isenção', 'IVA - Regime de isenção / Artigo 57.º do CIVA'),
    ('M11', 'Regime particular do tabaco', 'Regime particular do tabaco / Decreto-Lei n.º 346/85'),
    ('M12', 'Regime da margem de lucro - Agências de viagens', 'Regime da margem de lucro - Agências de viagens'),
    ('M13', 'Regime da margem de lucro - Bens em segunda mão', 'Regime da margem de lucro - Bens em segunda mão'),
    ('M14', 'Regime da margem de lucro - Objetos de arte', 'Regime da margem de lucro - Objetos de arte'),
    ('M15', 'Regime da margem de lucro - Objetos de coleção e antiguidades',
            'Regime da margem de lucro - Objetos de coleção e antiguidades'),
    ('M16', 'Isento Artigo 14.º do RITI', 'Artigo 14.º do RITI'),
    ('M19', 'Outras isenções', 'Outras isenções / Isenções temporárias determinadas em diploma próprio'),
    ('M20', 'IVA - Regime forfetário', 'IVA - Regime forfetário / Artigo 59.º-B do CIVA'),
    ('M21', 'IVA - não confere direito à dedução (ou expressão similar)',
            'IVA - não confere direito à dedução / Artigo 72.º n.º 4 do CIVA'),
    ('M25', 'Mercadorias à consignação', 'Mercadorias à consignação / Artigo 38.º n.º 1 alínea a) do CIVA'),
    ('M30', 'IVA - autoliquidação', 'IVA - autoliquidação / Artigo 2.º n.º 1 alínea i) do CIVA'),
    ('M40', 'IVA - autoliquidação', 'IVA - autoliquidação / Artigo 6.º n.º 6 alínea a) do CIVA, a contrário'),
    ('M99', 'Não sujeito ou não tributado', 'Outras situações de não liquidação do imposto'),
]


class Command(BaseCommand):
    help = 'Semeia os motivos de isenção de IVA (AGT).'

    def handle(self, *a, **kw):
        n = 0
        for code, text, desc in DADOS:
            _, criado = TaxExemptionReason.objects.update_or_create(
                code=code, defaults={'text': text, 'description': desc, 'is_active': True})
            n += 1 if criado else 0
        self.stdout.write(self.style.SUCCESS(
            f'{len(DADOS)} isenções ({n} novas). É este texto que sai na fatura e no SAF-T.'))
