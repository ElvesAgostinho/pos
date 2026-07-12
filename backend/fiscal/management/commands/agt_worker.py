"""
Trabalhador de transmissão à AGT.

    python manage.py agt_worker            # corre continuamente (serviço)
    python manage.py agt_worker --once     # processa a fila uma vez e sai (cron)

Fica a correr como serviço no servidor do cliente. Enquanto a Internet estiver em baixo
não faz nada de mal: as faturas acumulam-se na fila e são enviadas quando a linha voltar.
"""
import time

from django.core.management.base import BaseCommand

from fiscal import agt_client


class Command(BaseCommand):
    help = 'Envia à AGT as faturas eletrónicas que estão em fila (store-and-forward).'

    def add_arguments(self, parser):
        parser.add_argument('--once', action='store_true', help='Processa uma vez e sai.')
        parser.add_argument('--interval', type=int, default=30, help='Segundos entre ciclos.')
        parser.add_argument('--limit', type=int, default=100, help='Documentos por ciclo.')

    def handle(self, *args, **o):
        while True:
            r = agt_client.process_queue(limit=o['limit'])
            if r['sent']:
                self.stdout.write(
                    f"AGT: {r['sent']} enviado(s) · {r['acked']} aceite(s) · "
                    f"{r['retry']} a reenviar · {r['rejected']} rejeitado(s) · {r['failed']} falhado(s)")
            if o['once']:
                return
            time.sleep(o['interval'])
