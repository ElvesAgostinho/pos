"""
TAREFAS DE FUNDO DO FISCAL — fila da AGT e geração de SAF-T pesado.

`process_agt_queue_task` é o mesmo trabalho que `manage.py agt_worker --once`
já fazia manualmente; com CELERY_BEAT_SCHEDULE (erp_server/settings.py) passa
a correr sozinho a cada 30s enquanto o worker+beat estiverem de pé — o
comando de gestão continua a existir para quem não tem Celery a correr
(instalação pequena, cron, ou um técnico a testar à mão).

`generate_saft_task` embrulha a mesma `saft.generate_saft()` que os
endpoints síncronos já usam — fica disponível para chamar em fundo (`.delay`)
em exportações grandes (ano inteiro, hotel com muito movimento) sem prender
o pedido HTTP à espera.
"""
import logging

from celery import shared_task

log = logging.getLogger(__name__)


@shared_task
def process_agt_queue_task(limit=100):
    """Processa a fila de submissão AGT — store-and-forward, idempotente."""
    from . import agt_client
    resultado = agt_client.process_queue(limit=limit)
    if resultado.get('sent'):
        log.info("process_agt_queue_task: %s", resultado)
    return resultado


@shared_task
def generate_saft_task(start_iso, end_iso, module=None):
    """Gera o SAF-T do período em fundo. Datas em ISO (YYYY-MM-DD) — Celery serializa em JSON."""
    import datetime
    from . import saft

    start = datetime.date.fromisoformat(start_iso)
    end = datetime.date.fromisoformat(end_iso)
    xml = saft.generate_saft(start, end, module=module)
    return {'bytes': len(xml.encode('utf-8')), 'xml': xml}
