# -*- coding: utf-8 -*-
"""AS DUAS TRAVAS DE CONCORRÊNCIA DO MOTOR FISCAL.

Aqui NÃO se arruma nada automaticamente, e é de propósito.

Um documento fiscal é imutável: está assinado, encadeado no anterior pelo hash e
já pode ter sido comunicado à AGT. Se a base de dados já tem dois documentos com
o mesmo número na mesma série, ou duas facturas para a MESMA venda, isso não é um
registo desalinhado — é uma declaração errada ao Estado, que só se corrige da
maneira legal: nota de crédito a uma delas, feita por quem responde pela
contabilidade da casa.

Por isso a migração PARA e diz exactamente quais são os documentos. Mexer-lhes
aqui — renumerar, apagar, marcar — seria falsificar o arquivo fiscal para a
actualização poder seguir, que é precisamente o que o encadeamento de hash existe
para impedir.
"""
from django.db import migrations, models

MODULOS = ['pos', 'pms', 'finance', 'commercial', 'void']


def exigir_arquivo_fiscal_coerente(apps, schema_editor):
    FiscalDocument = apps.get_model('fiscal', 'FiscalDocument')

    numeros, repetidos = set(), []
    for d in FiscalDocument.objects.order_by('id').values('id', 'series_id', 'number', 'invoice_no'):
        chave = (d['series_id'], d['number'])
        if chave in numeros:
            repetidos.append(d['invoice_no'] or '#%s' % d['id'])
        numeros.add(chave)
    if repetidos:
        raise RuntimeError(
            'Há documentos fiscais com o MESMO número na mesma série: %s. A sequência de uma '
            'série é contínua e única — dois números iguais partem a cadeia que a AGT verifica '
            'primeiro numa inspeção. Resolva-os (nota de crédito ao que não deve valer) antes '
            'de actualizar: esta migração não mexe no arquivo fiscal.'
            % ', '.join(repetidos[:20]))

    origens, duplicadas = set(), []
    qs = (FiscalDocument.objects
          .filter(status='N', credited=False, source_module__in=MODULOS)
          .exclude(source_ref__isnull=True)
          .order_by('id').values('id', 'source_module', 'source_ref', 'invoice_no'))
    for d in qs:
        chave = (d['source_module'], d['source_ref'])
        if chave in origens:
            duplicadas.append('%s (origem %s/%s)' % (d['invoice_no'] or '#%s' % d['id'],
                                                     d['source_module'], d['source_ref']))
        origens.add(chave)
    if duplicadas:
        raise RuntimeError(
            'Há DUAS facturas válidas para a MESMA venda: %s. É a mesma venda declarada duas '
            'vezes à AGT — IVA liquidado a dobrar e receita que não existiu no SAF-T. Emita '
            'nota de crédito à que não deve valer (o Centro Fiscal faz isso, e o original fica '
            'marcado como regularizado) e volte a actualizar.' % ', '.join(duplicadas[:20]))


def nao_fazer_nada(apps, schema_editor):
    """Não há nada para reverter: esta verificação não altera dados."""


class Migration(migrations.Migration):

    dependencies = [
        ("fiscal", "0015_fiscaldocument_credited"),
        ("mdm", "0018_customer_newsletter_interests"),
    ]

    operations = [
        migrations.RunPython(exigir_arquivo_fiscal_coerente, nao_fazer_nada),
        migrations.AddConstraint(
            model_name="fiscaldocument",
            constraint=models.UniqueConstraint(
                fields=("series", "number"), name="fis_numero_unico_na_serie"
            ),
        ),
        migrations.AddConstraint(
            model_name="fiscaldocument",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    ("status", "N"),
                    ("credited", False),
                    ("source_ref__isnull", False),
                    (
                        "source_module__in",
                        ["pos", "pms", "finance", "commercial", "void"],
                    ),
                ),
                fields=("source_module", "source_ref"),
                name="fis_um_documento_por_origem",
            ),
        ),
    ]
