"""
Arranque do serviço "Mwana Lodge — Servidor" — corre `migrate` sozinho antes
de servir, todas as vezes que o serviço arranca (reinício, reboot da máquina,
ou depois de uma licença nova ter desbloqueado um módulo).

Porquê: um módulo só entra em INSTALLED_APPS quando o PROCESSO reinicia (o
`/api/licensing/sync/` já avisa disso, "restart_needed"). Mas reiniciar por
si só não cria as tabelas da app nova — só `migrate` faz isso. Sem este
passo, o cliente reiniciava o serviço e continuava a ver "no such table"
para o módulo que acabou de licenciar. Isto fecha esse buraco de vez, sem
o técnico ter de lembrar-se de correr `manage.py migrate` à mão.

`migrate` é idempotente (não muda nada se já estiver tudo aplicado) — correr
a cada arranque é seguro e rápido; não é um passo extra a mais para o dia a dia.
"""
import os
import sys

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_server.settings')

import django  # noqa: E402
django.setup()

from django.core.management import call_command  # noqa: E402

try:
    call_command('migrate', '--noinput')
except Exception as e:
    # Falhar a arrancar o serviço todo por causa disto seria pior: o cliente
    # ficava sem NADA em vez de ficar só sem o módulo novo. Regista e continua.
    sys.stderr.write(f'[run_server] migrate falhou no arranque: {e}\n')

if __name__ == '__main__':
    from waitress import serve
    from erp_server.wsgi import application
    serve(application, listen='0.0.0.0:8000', threads=8)
