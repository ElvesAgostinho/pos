"""
FILA DE FUNDO — Celery a sério (não decoração).

Sem REDIS_URL configurada (instalação pequena, SQLite), CELERY_TASK_ALWAYS_EAGER
fica True: `.delay()` executa a tarefa na hora, na mesma linha, exatamente como
antes de o Celery existir. Nada muda para quem não configurou Redis.

Com REDIS_URL configurada (hotel grande, PostgreSQL), `.delay()` põe a tarefa
na fila a sério e um `celery -A erp_server worker` (processo à parte, serviço
Windows próprio) é que a processa — o pedido HTTP não fica à espera do SMTP
nem da geração do SAF-T.
"""
import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp_server.settings")

app = Celery("erp_server")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
