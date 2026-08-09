# -*- coding: utf-8 -*-
"""
O ATUALIZADOR — aplica uma versão nova SEM passar pelo instalador completo outra vez
(sem senha, sem voltar a escolher base de dados, sem repetir a conta do dono — isso
só faz sentido na primeira instalação).

Corre FORA do processo do Django (é lançado pelo licensing.views.ApplyUpdateView como
um processo destacado) porque o próprio passo 2 abaixo mata o serviço que o lançou.

Passos: baixa o pacote leve (app/ + webapp/, sem Python nem instalador) -> para os
dois serviços -> guarda uma cópia de segurança de app/ -> substitui pelos ficheiros
novos -> corre migrate/collectstatic/seed_params -> reinicia os serviços.
Qualquer falha a meio REPÕE a cópia de segurança e volta a arrancar a versão antiga —
um cliente nunca deve ficar sem sistema por causa de uma atualização.
"""
import io
import shutil
import subprocess
import sys
import zipfile
from datetime import datetime
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent          # {instalação}\app
RAIZ = APP_DIR.parent                               # {instalação}
PYTHON = RAIZ / 'python' / 'python.exe'
SERVICOS = RAIZ / 'servicos'
DADOS = RAIZ / 'dados'
BACKUP = RAIZ / 'app.bak'
LOG_PATH = DADOS / 'logs' / 'atualizar.log'

# Nunca se apaga/substitui isto na atualização — são dados e segredos DESTA instalação,
# nunca vêm dentro do pacote de atualização (o build_atualizacao.ps1 já os exclui, isto
# é a segunda linha de defesa, dentro do próprio atualizador).
NUNCA_TOCAR = {'.env', 'license.key', 'license.key.bak', 'db.sqlite3'}


class Log:
    def __init__(self, path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.buf = io.StringIO()

    def write(self, msg):
        linha = f'{datetime.now().isoformat(timespec="seconds")}  {msg}'
        print(linha)
        self.buf.write(linha + '\n')

    def flush_to_disk(self):
        with open(self.path, 'a', encoding='utf-8') as f:
            f.write(f'\n=== {datetime.now().isoformat(timespec="seconds")} ===\n')
            f.write(self.buf.getvalue())


def _servico(nome, acao, log):
    exe = SERVICOS / f'{nome}.exe'
    if not exe.exists():
        log.write(f'AVISO: {exe} não encontrado — a saltar "{acao}".')
        return
    r = subprocess.run([str(exe), acao], capture_output=True, text=True)
    log.write(f'{nome}.exe {acao} -> {r.returncode} {(r.stdout or r.stderr or "").strip()[:200]}')


def _correr_manage(args, log):
    r = subprocess.run([str(PYTHON), str(APP_DIR / 'manage.py'), *args],
                       cwd=str(APP_DIR), capture_output=True, text=True)
    log.write(f'manage.py {" ".join(args)} -> {r.returncode}')
    if r.stdout:
        log.write(r.stdout.strip()[:2000])
    if r.returncode != 0:
        log.write((r.stderr or '').strip()[:2000])
        raise RuntimeError(f'manage.py {" ".join(args)} falhou (código {r.returncode})')


def _repor_backup(log):
    log.write('A repor a versão anterior (backup)...')
    if APP_DIR.exists():
        shutil.rmtree(APP_DIR, ignore_errors=True)
    shutil.copytree(BACKUP, APP_DIR)
    log.write('Versão anterior reposta.')


def aplicar(url: str):
    log = Log(LOG_PATH)
    log.write(f'=== Atualização a começar — pacote: {url} ===')
    try:
        import requests

        # 1) Descarregar ANTES de mexer em serviço nenhum — se a descarga falhar,
        #    o sistema atual nem chega a ser tocado.
        log.write('A descarregar o pacote...')
        r = requests.get(url, timeout=120)
        r.raise_for_status()
        pacote = io.BytesIO(r.content)
        log.write(f'Descarregado: {len(r.content)} bytes.')

        with zipfile.ZipFile(pacote) as zf:
            nomes = zf.namelist()
            if not any(n.startswith('app/') or n.startswith('webapp/') for n in nomes):
                raise RuntimeError('O pacote não parece ter a forma esperada (sem app/ nem webapp/).')

            # 2) Parar os serviços — só agora, com o pacote já validado e em memória.
            log.write('A parar os serviços...')
            _servico('servidor', 'stop', log)
            _servico('impressao', 'stop', log)

            # 3) Cópia de segurança da versão atual.
            if BACKUP.exists():
                shutil.rmtree(BACKUP, ignore_errors=True)
            log.write('A guardar cópia de segurança de app/...')
            shutil.copytree(APP_DIR, BACKUP)

            # 4) Extrair por cima — nunca apaga o que já lá está primeiro (o .env e a
            #    license.key não vêm no pacote, sobrevivem sempre).
            log.write('A aplicar os ficheiros novos...')
            for nome in nomes:
                if any(nome == f'app/{f}' or nome.endswith(f'/{f}') for f in NUNCA_TOCAR):
                    continue
                if nome.startswith('app/'):
                    destino = APP_DIR / nome[len('app/'):]
                elif nome.startswith('webapp/'):
                    destino = APP_DIR / 'webapp' / nome[len('webapp/'):]
                else:
                    continue
                if nome.endswith('/'):
                    destino.mkdir(parents=True, exist_ok=True)
                    continue
                destino.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(nome) as origem, open(destino, 'wb') as dest:
                    shutil.copyfileobj(origem, dest)

        # 5) Base de dados + estáticos + catálogo — mesma sequência do configurar.py.
        _correr_manage(['migrate', '--noinput'], log)
        _correr_manage(['collectstatic', '--noinput'], log)
        _correr_manage(['seed_params'], log)

        # 6) Arrancar outra vez.
        log.write('A reiniciar os serviços...')
        _servico('servidor', 'start', log)
        _servico('impressao', 'start', log)
        log.write('=== Atualização concluída com sucesso. ===')

    except Exception as e:
        log.write(f'ERRO: {e}')
        try:
            if BACKUP.exists():
                _repor_backup(log)
            log.write('A reiniciar os serviços com a versão anterior...')
            _servico('servidor', 'start', log)
            _servico('impressao', 'start', log)
            log.write('=== Atualização falhou — sistema reposto na versão anterior. ===')
        except Exception as e2:
            log.write(f'ERRO CRÍTICO ao repor o backup: {e2} — contacte o suporte, não tente sozinho.')
    finally:
        log.flush_to_disk()


if __name__ == '__main__':
    if '--url' not in sys.argv:
        print('Uso: atualizar.py --url <link-do-pacote.zip>')
        sys.exit(1)
    aplicar(sys.argv[sys.argv.index('--url') + 1])
