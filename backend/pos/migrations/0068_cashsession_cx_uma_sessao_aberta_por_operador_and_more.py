# -*- coding: utf-8 -*-
"""AS DUAS TRAVAS DE CONCORRÊNCIA DO POS — e a limpeza do que já lá está.

Uma constraint nova não se aplica a uma base de dados que já tem duplicados: a
migração falha e a casa não consegue actualizar. Por isso, antes de cada
constraint, esta migração olha para o que existe:

· CAIXAS ABERTAS A DOBRAR — fecham-se as de mais, com nota a dizer porquê, e
  fica aberta a que tem vendas (ou a mais recente). Uma sessão duplicada é uma
  sessão esquecida: fechá-la é o que o supervisor do turno faria, e deixá-la
  aberta era deixar as vendas a repartir-se por duas caixas que nunca batem.

· DOCUMENTOS DE STOCK COM O MESMO NÚMERO — aqui NÃO se mexe. O número de um
  documento é o que está escrito nos movimentos de stock que ele gerou
  (`StockMovement.reference`): renumerá-lo à socapa desligava a mercadoria do
  documento que a entrou. A migração PARA e diz quais são — é uma correcção com
  o fornecedor pelo meio, não é trabalho de uma migração.
"""
from django.db import migrations, models


def fechar_caixas_duplicadas(apps, schema_editor):
    from django.utils import timezone
    CashSession = apps.get_model('pos', 'CashSession')
    vistas = {}
    for s in CashSession.objects.filter(status='OPEN').order_by('opened_at'):
        vistas.setdefault((s.outlet_id, s.operator_name), []).append(s)
    for (_outlet, _op), sessoes in vistas.items():
        if len(sessoes) < 2:
            continue
        # Fica a que tem mais vendas; em caso de empate, a mais recente.
        sessoes.sort(key=lambda s: (s.tickets.count(), s.opened_at))
        fica = sessoes[-1]
        for s in sessoes:
            if s.pk == fica.pk:
                continue
            s.status = 'CLOSED'
            s.closed_at = timezone.now()
            s.closed_by = 'migração'
            s.closing_notes = ((s.closing_notes or '') +
                               '\nFechada automaticamente: havia duas caixas abertas para o '
                               'mesmo operador neste ponto de venda, e com duas abertas as '
                               'vendas repartem-se entre elas e nenhum dos fechos bate. '
                               'A caixa que ficou aberta foi a #%s. Esta NÃO foi contada — '
                               'confirme o dinheiro antes de dar o turno por fechado.'
                               % fica.pk).strip()
            s.save(update_fields=['status', 'closed_at', 'closed_by', 'closing_notes'])


def nao_fazer_nada(apps, schema_editor):
    """Reverter não reabre caixas: uma caixa fechada fica fechada."""


def exigir_numeros_de_stock_unicos(apps, schema_editor):
    StockDoc = apps.get_model('pos', 'StockDoc')
    repetidos = []
    vistos = set()
    for d in StockDoc.objects.exclude(number='').order_by('id').values('id', 'series_id', 'number'):
        chave = (d['series_id'], d['number'])
        if chave in vistos:
            repetidos.append('#%s %s' % (d['id'], d['number']))
        vistos.add(chave)
    if repetidos:
        raise RuntimeError(
            'Há documentos de stock com o MESMO número na mesma série: %s. '
            'Dois documentos com o mesmo número não se podem conferir com o fornecedor '
            'nem lançar sem ambiguidade. Corrija-os (anular e refazer um deles) antes de '
            'actualizar — renumerá-los aqui desligava-os dos movimentos de stock que já '
            'geraram.' % ', '.join(repetidos[:20]))


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0017_alter_stocklot_options_item_shelf_life_days_and_more"),
        ("mdm", "0018_customer_newsletter_interests"),
        ("pos", "0067_posticket_customer"),
    ]

    operations = [
        migrations.RunPython(fechar_caixas_duplicadas, nao_fazer_nada),
        migrations.AddConstraint(
            model_name="cashsession",
            constraint=models.UniqueConstraint(
                condition=models.Q(("status", "OPEN")),
                fields=("outlet", "operator_name"),
                name="cx_uma_sessao_aberta_por_operador",
            ),
        ),
        migrations.RunPython(exigir_numeros_de_stock_unicos, nao_fazer_nada),
        migrations.AddConstraint(
            model_name="stockdoc",
            # ESCRITO SEM `NOT`, e isto nao e cosmetica.
            #
            # `~Q(...)` da `NOT ([coluna] = 'valor')`, e o SQL Server recusa
            # `NOT` no predicado de um indice filtrado — no parser, antes de
            # qualquer verificacao. Uma instalacao nova parava aqui.
            #
            # `__ne` da `<>` (ver core/lookups.py) e `__gt=''` da `> ''`, que
            # ja exclui o nulo (NULL > '' e NULL). A regra e a mesma nos tres
            # motores; a forma e a que os tres aceitam.
            constraint=models.UniqueConstraint(
                condition=models.Q(("number__gt", "")),
                fields=("series", "number"),
                name="stockdoc_numero_unico_na_serie",
            ),
        ),
    ]
