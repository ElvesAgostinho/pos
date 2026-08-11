"""
RELATÓRIO DE ERRO AUTOMÁTICO — o sistema avisa o fornecedor sozinho quando algo
rebenta, em vez de depender de o cliente ligar (era o maior buraco do suporte:
sem isto, um bug só se sabia se alguém reparasse e ligasse). Só factos de
diagnóstico (tipo de erro, traceback, versão, máquina) — NUNCA dados de negócio.

Liga-se ao logger 'django' (LOGGING, erp_server/settings.py) — apanha tanto as
exceções não tratadas de pedidos HTTP (django.request propaga para 'django')
como qualquer log.exception()/log.error() explícito no resto do código.
"""
import logging
import socket
import traceback as tb_module

log = logging.getLogger(__name__)


class PccErrorHandler(logging.Handler):
    """Nunca deixa um erro A REPORTAR um erro criar um SEGUNDO erro: tudo aqui
    dentro está protegido — pior caso, o relatório perde-se, o pedido original
    continua a funcionar na mesma."""

    def emit(self, record):
        try:
            from django.conf import settings
            if not getattr(settings, 'ERROR_REPORTING_ENABLED', False):
                return

            traceback_str = ''
            if record.exc_info:
                traceback_str = ''.join(tb_module.format_exception(*record.exc_info))

            path = ''
            request = getattr(record, 'request', None)
            if request is not None:
                path = getattr(request, 'path', '') or ''

            payload = {
                'level': record.levelname,
                'logger': record.name,
                'message': record.getMessage()[:2000],
                'traceback': traceback_str[:8000],
                'path': path[:300],
                'hostname': socket.gethostname(),
            }

            from core.tasks import send_error_report_task
            send_error_report_task.delay(payload)
        except Exception:
            pass
