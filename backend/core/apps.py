from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'core'

    def ready(self):
        # Trilho de auditoria universal: liga a captura automática (post_save/post_delete
        # em TODOS os modelos). Um módulo novo fica auditado sem escrever uma linha.
        from . import audit_signals  # noqa: F401

        # ── SQLite em modo WAL ────────────────────────────────────────────────
        # Por omissão o SQLite bloqueia a base INTEIRA enquanto alguém escreve, e quem
        # lê fica à espera. Num POS isso é o pior caso possível: o mapa de mesas relê-se
        # de 8 em 8 segundos, o sino da produção pergunta pela cozinha, e no meio disso
        # alguém carrega em "pagar" — resultado, "database is locked" durante uma venda.
        #
        # WAL separa leitura de escrita: quem lê nunca trava quem escreve. É uma linha
        # que o SQLite guarda no ficheiro, mas põe-se a cada ligação para valer também
        # em bases criadas de novo (e em cada worker).
        from django.db.backends.signals import connection_created
        from django.dispatch import receiver

        @receiver(connection_created)
        def _sqlite_wal(sender, connection, **kwargs):
            if connection.vendor != 'sqlite':
                return
            with connection.cursor() as c:
                c.execute('PRAGMA journal_mode=WAL;')
                # NORMAL: rápido e seguro contra falha da aplicação (só perde em falha
                # de energia). FULL a cada escrita punha o terminal a esperar pelo disco.
                c.execute('PRAGMA synchronous=NORMAL;')
                # Se ainda assim houver disputa, espera em vez de desistir.
                c.execute('PRAGMA busy_timeout=20000;')
