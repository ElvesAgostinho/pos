"""Tarefas de fundo transversais — hoje só a entrega do relatório de erro ao PCC."""
import logging

from celery import shared_task

log = logging.getLogger(__name__)


@shared_task
def send_error_report_task(payload):
    """Entrega ao PCC um erro já filtrado (core.error_reporting) — reaproveita a
    MESMA prova de posse da sincronização de licença (LicenseSyncView), sem
    segredo novo nenhum para gerir. Sem licença instalada, sem internet, ou com
    o PCC em baixo: falha em silêncio — um relatório perdido nunca pode travar
    o sistema do cliente."""
    import os
    import socket

    from django.conf import settings

    path = os.path.join(settings.BASE_DIR, 'license.key')
    if not os.path.exists(path):
        return
    try:
        raw = open(path, 'r', encoding='utf-8').read().strip()
    except Exception:
        return
    if not raw:
        return

    try:
        from core.support import APP_VERSION
    except Exception:
        APP_VERSION = ''

    body = dict(payload)
    body['license_key'] = raw
    body.setdefault('hostname', socket.gethostname())
    body['app_version'] = APP_VERSION

    pcc = os.environ.get('PCC_URL', getattr(settings, 'PCC_URL', ''))
    if not pcc:
        return
    try:
        import requests
        requests.post(f'{pcc.rstrip("/")}/api/clm/error-reports/report/', json=body, timeout=10)
    except Exception:
        log.debug('send_error_report_task: falha a entregar ao PCC (silenciosa por desenho)')
