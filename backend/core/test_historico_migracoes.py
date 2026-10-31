# -*- coding: utf-8 -*-
"""O HISTÓRICO DE MIGRAÇÕES DE UMA INSTALAÇÃO QUE JÁ EXISTE.

Porque é que este ficheiro existe: a correcção do SQL Server trouxe duas
migrações com `run_before` apontado a uma migração do simplejwt. Numa base
criada de raiz corre bem — e foi só aí que foi ensaiada. Numa base que já
existia, a do simplejwt está aplicada há meses e as nossas não, e o Django
recusa-se a continuar:

    InconsistentMigrationHistory: Migration token_blacklist.0008 is applied
    before its dependency core.0006_sqlserver_antes_do_token_blacklist

Ou seja: quem já tinha o sistema instalado não conseguia actualizar. Nenhum
teste apanhou isto porque todos eles correm sobre uma base criada no momento,
que é exactamente o caso onde o defeito não aparece.

O que se testa aqui é o caminho de QUEM JÁ TEM: põe-se o histórico no estado em
que ele fica numa instalação antiga e verifica-se que o `migrate` o repara
sozinho, em vez de parar.
"""
from django.db import connection
from django.db.migrations.recorder import MigrationRecorder
from django.test import TestCase

from core.management.commands.migrate import Command, DEPOIS, NOSSAS


class ActualizarInstalacaoExistente(TestCase):
    """O estado de uma base antiga: a do simplejwt aplicada, as nossas não."""

    def _por_no_estado_antigo(self):
        registo = MigrationRecorder(connection)
        registo.ensure_schema()
        for app, nome in NOSSAS:
            registo.migration_qs.filter(app=app, name=nome).delete()
        if DEPOIS not in set(registo.applied_migrations()):
            registo.record_applied(*DEPOIS)
        return registo

    def test_o_historico_e_reparado_e_a_actualizacao_segue(self):
        registo = self._por_no_estado_antigo()

        Command()._reparar_historia('default')

        aplicadas = set(registo.applied_migrations())
        for m in NOSSAS:
            self.assertIn(
                m, aplicadas,
                f'{m[0]}.{m[1]} continua por registar — a actualização de uma '
                f'instalação existente volta a parar com '
                f'InconsistentMigrationHistory.')

    def test_numa_base_nova_nao_se_mexe_em_nada(self):
        """A reparação é estreita: sem o bloqueio, não toca no histórico.

        Uma reparação que corresse sempre acabaria por marcar como aplicada uma
        migração que ainda tem trabalho para fazer — e aí o estrago seria silencioso.
        """
        registo = MigrationRecorder(connection)
        registo.ensure_schema()
        registo.migration_qs.filter(app=DEPOIS[0], name=DEPOIS[1]).delete()
        for app, nome in NOSSAS:
            registo.migration_qs.filter(app=app, name=nome).delete()

        Command()._reparar_historia('default')

        aplicadas = set(registo.applied_migrations())
        for m in NOSSAS:
            self.assertNotIn(
                m, aplicadas,
                f'{m[0]}.{m[1]} foi marcada como aplicada numa base onde a '
                f'migração do simplejwt ainda nem corre — a reparação está a '
                f'disparar fora do caso que lhe compete.')
