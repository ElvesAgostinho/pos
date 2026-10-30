# -*- coding: utf-8 -*-
"""Repõe a restrição única que a migração anterior teve de largar.

A `0006` larga a restrição única de `BlacklistedToken.token_id` para o SQL
Server poder alargar a coluna. Aqui volta a pôr-se — com um nome NOSSO, em vez
do `UQ__...` que o SQL Server inventava, para a próxima vez não ser preciso
andar à procura dela.

Porque é que não se repõe logo na `0006`: ela tem de estar AUSENTE enquanto as
migrações do simplejwt correm, e são várias (0008, 0010, 0011, 0012). Só depois
da última é que se pode voltar a pô-la.

O que a restrição garante: **um token só se põe na lista negra uma vez**. Sem
ela, sair da sessão duas vezes criava duas linhas para o mesmo token — e a
contagem de sessões activas, que o diagnóstico mostra, passava a mentir.
"""
from django.db import migrations

TABELA = 'token_blacklist_blacklistedtoken'
COLUNA = 'token_id'
NOME = 'blacklistedtoken_token_id_unico'


def repor(apps, schema_editor):
    if schema_editor.connection.vendor != 'microsoft':
        return
    with schema_editor.connection.cursor() as cursor:
        # Se o Django ou o simplejwt já a repuseram pelo caminho, não se põe
        # uma segunda — duas restrições iguais na mesma coluna é ruído que
        # confunde quem for lá ver.
        cursor.execute("""
            SELECT COUNT(*)
              FROM sys.indexes i
              JOIN sys.tables t ON t.object_id = i.object_id
              JOIN sys.index_columns ic ON ic.object_id = i.object_id
                                       AND ic.index_id = i.index_id
              JOIN sys.columns c ON c.object_id = i.object_id
                                AND c.column_id = ic.column_id
             WHERE t.name = %s AND c.name = %s AND i.is_unique = 1
        """, [TABELA, COLUNA])
        if cursor.fetchone()[0]:
            return
        cursor.execute(
            f'CREATE UNIQUE INDEX [{NOME}] ON [{TABELA}] ([{COLUNA}])')


def largar(apps, schema_editor):
    if schema_editor.connection.vendor != 'microsoft':
        return
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(f"""
            IF EXISTS (SELECT 1 FROM sys.indexes
                        WHERE name = '{NOME}'
                          AND object_id = OBJECT_ID('{TABELA}'))
                DROP INDEX [{NOME}] ON [{TABELA}]
        """)


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0006_sqlserver_antes_do_token_blacklist'),
        ('token_blacklist', '0012_alter_outstandingtoken_user'),
    ]

    operations = [
        migrations.RunPython(repor, largar),
    ]
