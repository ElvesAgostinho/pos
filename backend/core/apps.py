from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'core'

    def ready(self):
        # Trilho de auditoria universal: liga a captura automática (post_save/post_delete
        # em TODOS os modelos). Um módulo novo fica auditado sem escrever uma linha.
        from . import audit_signals  # noqa: F401
