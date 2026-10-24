# -*- coding: utf-8 -*-
"""AS DUAS TRAVAS DE CONCORRÊNCIA DA CONTA DO HÓSPEDE — e a limpeza do que já lá está.

Uma constraint nova não se aplica a uma base de dados que já tem duplicados: a
migração falhava e a casa não conseguia actualizar. Antes de cada constraint,
arruma-se o que o defeito já deixou feito:

· DUAS CONTAS PRINCIPAIS na mesma reserva — fica principal a mais antiga (ou a
  que tem lançamentos); as outras passam a contas secundárias. Não se perde nada:
  os lançamentos ficam onde estão e continuam a aparecer na reserva.

· O MESMO LANÇAMENTO DUAS VEZES na mesma conta — NÃO se apaga nem se estorna
  nada. A migração não pode decidir qual das duas noites o hotel pode cobrar;
  acrescenta um sufixo à REFERÊNCIA de origem da repetida (`…#2`), que a deixa
  identificável e deixa a constraint entrar. O dinheiro fica exactamente como
  estava — e quem conferir a conta vê logo quais são as linhas a confirmar.
"""
from django.db import migrations, models


def arrumar_contas_principais(apps, schema_editor):
    Folio = apps.get_model('pms', 'Folio')
    por_reserva = {}
    for f in Folio.objects.filter(is_primary=True).order_by('opened_at', 'id'):
        por_reserva.setdefault(f.reservation_id, []).append(f)
    for _res, folios in por_reserva.items():
        if len(folios) < 2:
            continue
        # Fica principal a que tem lançamentos; em caso de empate, a mais antiga.
        folios.sort(key=lambda f: (-f.charges.count(), f.opened_at, f.id))
        for f in folios[1:]:
            f.is_primary = False
            f.save(update_fields=['is_primary'])


def arrumar_lancamentos_repetidos(apps, schema_editor):
    FolioCharge = apps.get_model('pms', 'FolioCharge')
    vistos = set()
    qs = (FolioCharge.objects
          .filter(is_void=False)
          .exclude(charge_type='FNB')
          .exclude(source_reference__isnull=True)
          .exclude(source_reference='')
          .order_by('created_at', 'id'))
    for c in qs:
        chave = (c.folio_id, c.source_reference)
        if chave not in vistos:
            vistos.add(chave)
            continue
        n = 2
        while (c.folio_id, '%s#%s' % (c.source_reference, n)) in vistos:
            n += 1
        nova = '%s#%s' % (c.source_reference, n)
        vistos.add((c.folio_id, nova))
        c.source_reference = nova[:60]
        c.save(update_fields=['source_reference'])


def nao_fazer_nada(apps, schema_editor):
    """Reverter não desfaz a arrumação — e não precisa: sem a constraint, nada falha."""


class Migration(migrations.Migration):

    dependencies = [
        ("pms", "0012_chatbotsettings_bridge_token_and_more"),
    ]

    operations = [
        migrations.RunPython(arrumar_contas_principais, nao_fazer_nada),
        migrations.AddConstraint(
            model_name="folio",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_primary", True)),
                fields=("reservation",),
                name="folio_uma_conta_principal_por_reserva",
            ),
        ),
        migrations.RunPython(arrumar_lancamentos_repetidos, nao_fazer_nada),
        migrations.AddConstraint(
            model_name="foliocharge",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    ("is_void", False),
                    models.Q(("charge_type", "FNB"), _negated=True),
                    ("source_reference__isnull", False),
                    models.Q(("source_reference", ""), _negated=True),
                ),
                fields=("folio", "source_reference"),
                name="folio_um_lancamento_por_origem",
            ),
        ),
    ]
