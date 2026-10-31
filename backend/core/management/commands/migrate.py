# -*- coding: utf-8 -*-
"""O `migrate` do sistema, com uma reparação antes de arrancar.

─── O QUE CORREU MAL ──────────────────────────────────────────────────────
Para o SQL Server foi preciso largar uma restrição ANTES de o simplejwt alargar
as chaves (ver `core/migrations/0006_sqlserver_antes_do_token_blacklist.py`).
Isso escreve-se com `run_before`, que diz ao Django: "esta migração vem antes
daquela".

Numa instalação NOVA está certo: a história toca-se do princípio e a ordem
respeita-se. Numa instalação QUE JÁ EXISTE, a migração do simplejwt foi aplicada
há meses — e as nossas duas ainda não. O Django vê uma migração aplicada antes
de uma dependência que não está, e PÁRA, antes de escrever o que quer que seja:

    InconsistentMigrationHistory: Migration token_blacklist.0008 is applied
    before its dependency core.0006_sqlserver_antes_do_token_blacklist

Resultado: quem já tem o sistema instalado não consegue actualizar. Não é um
ecrã torto — é a actualização inteira que não arranca. Foi assim que apareceu:
a correcção foi pensada e ensaiada numa base criada de raiz, que é precisamente
o caso onde o defeito não se vê.

─── PORQUE É QUE REGISTAR AS DUAS É VERDADE, E NÃO UM TRUQUE ──────────────
As duas migrações só fazem alguma coisa em SQL Server (`vendor == 'microsoft'`);
em SQLite e PostgreSQL o corpo delas começa por `return`. Numa base que já
passou a `0008`, a coluna já foi alargada com sucesso — logo não há restrição
nenhuma para largar nem para repor, e o trabalho que elas teriam para fazer está
feito. Marcá-las como aplicadas não salta trabalho nenhum: diz o que já é
verdade na base.

Por isso a reparação é estreita de propósito, e só acontece com as três
condições ao mesmo tempo:
  · a `token_blacklist.0008` JÁ está aplicada (é o caso do bloqueio);
  · a nossa `0006`/`0007` AINDA não está;
  · o motor NÃO é SQL Server (onde elas têm mesmo trabalho para fazer).

No SQL Server não se inventa nada: avisa-se e pára, porque aí marcar sem correr
deixaria a tabela sem a restrição única da blacklist — e essa é a que garante
que um token só entra na lista negra uma vez.
"""
from django.core.management.commands.migrate import Command as MigrateOriginal
from django.db import connections
from django.db.migrations.recorder import MigrationRecorder

# A que o simplejwt aplica e que cria o bloqueio.
DEPOIS = ('token_blacklist', '0008_migrate_to_bigautofield')

# As nossas duas, que ficam penduradas à frente dela.
NOSSAS = [
    ('core', '0006_sqlserver_antes_do_token_blacklist'),
    ('core', '0007_sqlserver_depois_do_token_blacklist'),
]


class Command(MigrateOriginal):

    def handle(self, *args, **options):
        self._reparar_historia(options.get('database') or 'default')
        return super().handle(*args, **options)

    def _reparar_historia(self, alias):
        try:
            ligacao = connections[alias]
            registo = MigrationRecorder(ligacao)
            if not registo.has_table():
                return                      # base vazia: nada para reparar
            aplicadas = set(registo.applied_migrations())
        except Exception:
            # Uma base inacessível não é problema desta função: quem o há-de
            # dizer, com a mensagem certa, é o `migrate` a seguir.
            return

        if DEPOIS not in aplicadas:
            return                          # instalação nova: a ordem respeita-se

        em_falta = [m for m in NOSSAS if m not in aplicadas]
        if not em_falta:
            return

        if ligacao.vendor == 'microsoft':
            self.stderr.write(
                'ATENÇÃO: esta base de SQL Server passou pela migração do '
                'simplejwt sem as migrações core.0006/0007. A restrição única '
                'da blacklist de tokens pode estar em falta — contacte o '
                'suporte antes de continuar.')
            return

        for app, nome in em_falta:
            registo.record_applied(app, nome)
            self.stdout.write(
                f'  Histórico reparado: {app}.{nome} registada como aplicada '
                f'(não faz nada em {ligacao.vendor}).')
