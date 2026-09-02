# -*- coding: utf-8 -*-
from django.core.management.base import BaseCommand

from inventory.models import UnitOfMeasure

# code, name, rounding (casas decimais)
UOMS = [
    ('UN', 'Unidade', 0),
    ('CX', 'Caixa', 0),
    ('PC', 'Pacote', 0),
    ('GRF', 'Garrafa', 0),
    ('KG', 'Quilograma', 3),
    ('G', 'Grama', 0),
    ('L', 'Litro', 3),
    ('ML', 'Mililitro', 0),
    ('DOSE', 'Dose', 0),
]


class Command(BaseCommand):
    help = 'Semeia as Unidades de Medida de base (Configuração POS → Artigos precisa de pelo menos uma).'

    def handle(self, *args, **opts):
        # SEM ISTO, uma instalação nova arranca com ZERO Unidades de Medida — e
        # Item.base_uom é um campo OBRIGATÓRIO do modelo (sem ele nenhum artigo se
        # grava). Achado a investigar "não consigo criar artigo" num cliente real: a
        # ficha do artigo (Configuração POS → Artigos) nem pergunta a Unidade Base —
        # só pergunta Compra/Stock/Venda — e sem nenhuma UoM cadastrada não há de
        # onde a derivar. update_or_create: idempotente, nunca apaga o que o dono
        # já tenha mudado (nome, casas decimais).
        for code, name, rounding in UOMS:
            UnitOfMeasure.objects.update_or_create(
                code=code, defaults={'name': name, 'rounding': rounding, 'is_active': True})
        self.stdout.write(self.style.SUCCESS(f'{len(UOMS)} unidades de medida OK.'))
