# -*- coding: utf-8 -*-
"""O SQL SERVER NÃO DEIXA ALTERAR UMA COLUNA DE QUE UMA RESTRIÇÃO DEPENDE.

A migração `token_blacklist.0008_migrate_to_bigautofield` — do simplejwt, não
nossa — alarga as chaves para BigAutoField. Em SQL Server pára com:

    ALTER TABLE ALTER COLUMN token_id failed because one or more objects
    access this column.  O objecto 'UQ__token_bl__CB3C9E16EFC9864D' é
    dependente da coluna 'token_id'.

A restrição é a de `BlacklistedToken.token`, que é um OneToOneField: o `unique`
nasce com a coluna, e o **SQL Server dá-lhe um nome automático** (`UQ__...`),
diferente em cada instalação.

Porque é que o Django não trata disto sozinho: ao alterar o tipo de uma coluna,
ele só larga as restrições únicas quando o `unique` MUDA — e aqui não muda
(era único antes, é único depois). No PostgreSQL e no SQLite isso está certo,
porque alterar o tipo não precisa de largar o índice. No SQL Server precisa.

Esta migração larga a restrição ANTES (`run_before`), e a seguinte volta a
pô-la com um nome nosso. Nos outros motores não faz nada — nem precisa.

A blacklist não se pode dispensar: é ela que invalida um token ao sair da
sessão (`auth_engine/views.py`) e é lida pelo diagnóstico e pelo licenciamento.
"""
from django.db import migrations

TABELA = 'token_blacklist_blacklistedtoken'
COLUNA = 'token_id'


def _restricoes_unicas(cursor, tabela, coluna):
    """Os nomes das restrições ÚNICAS que tocam nesta coluna.

    Procura-se pelo nome REAL em vez de se escrever o `UQ__...` à mão, porque o
    SQL Server gera um sufixo diferente em cada base — o nome desta instalação
    não é o da seguinte.
    """
    cursor.execute("""
        SELECT kc.name
          FROM sys.key_constraints kc
          JOIN sys.tables t  ON t.object_id = kc.parent_object_id
          JOIN sys.index_columns ic ON ic.object_id = t.object_id
                                   AND ic.index_id = kc.unique_index_id
          JOIN sys.columns c ON c.object_id = t.object_id
                            AND c.column_id = ic.column_id
         WHERE t.name = %s AND c.name = %s AND kc.type = 'UQ'
    """, [tabela, coluna])
    return [linha[0] for linha in cursor.fetchall()]


def largar(apps, schema_editor):
    if schema_editor.connection.vendor != 'microsoft':
        return
    with schema_editor.connection.cursor() as cursor:
        for nome in _restricoes_unicas(cursor, TABELA, COLUNA):
            cursor.execute(f'ALTER TABLE [{TABELA}] DROP CONSTRAINT [{nome}]')


def nao_fazer_nada(apps, schema_editor):
    """Desfazer não repõe a restrição: quem a repõe é a migração seguinte, e é
    ela que a sabe nomear."""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0005_delete_currency'),
        ('token_blacklist', '0007_auto_20171017_2214'),
    ]

    # ANTES de o simplejwt alargar as chaves.
    run_before = [
        ('token_blacklist', '0008_migrate_to_bigautofield'),
    ]

    operations = [
        migrations.RunPython(largar, nao_fazer_nada),
    ]
