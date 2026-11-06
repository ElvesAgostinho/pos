# -*- coding: utf-8 -*-
"""OS MÓDULOS DA LICENÇA TÊM DE FICAR CARREGADOS, SEM NINGUÉM REINICIAR NADA À MÃO.

Um módulo só entra em INSTALLED_APPS quando o processo arranca. Na instalação ainda
não há licença, por isso o serviço arranca só com o que está sempre instalado, e aí
está o POS. Depois ativava-se no ecrã, a licença ficava gravada, e o cliente que
comprou tudo via só o POS até alguém se lembrar de reiniciar o serviço.

Isto vive ao lado do servidor e olha para o ficheiro, não para quem o escreveu: assim
cobre as quatro formas de uma licença chegar (ativação, ficheiro carregado,
sincronização com o PCC, cópia à mão).

Reinicia UMA vez por licença. Se um módulo não conseguir carregar, reiniciar outra vez
não o resolve: só deixaria o hotel sem servidor em ciclo, a meio do serviço.
"""
import hashlib
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

# O servidor reinicia sozinho: o WinSW volta a arrancá-lo quando ele sai com erro
# (servidor.xml, <onfailure>). Estes dois não saem sozinhos, e também carregam módulos.
OUTROS_SERVICOS = ('MwanaLodgeCelery', 'MwanaLodgeAgendador')

# A ativação grava a licença e só depois aplica a empresa e a certificação. Reiniciar
# nesse intervalo deixava a ativação a meio.
SEGUNDOS_DE_FOLGA = 10


def por_carregar(base_dir=None, instaladas=None):
    """Os módulos que a licença autoriza e que este processo não carregou."""
    from django.conf import settings

    from core.modules import resolve_active
    from licensing.offline_validator import get_active_modules

    base = base_dir or settings.BASE_DIR
    apps = set(settings.INSTALLED_APPS if instaladas is None else instaladas)
    return sorted(resolve_active(get_active_modules(str(base))) - apps)


def _impressao_digital(caminho):
    return hashlib.sha256(Path(caminho).read_bytes()).hexdigest()


def recarga_pendente(base_dir, instaladas=None):
    """Há módulos por carregar e ainda não se reiniciou por esta licença?

    Depois de uma tentativa responde que não, mesmo que falte um módulo: o ecrã não pode
    ficar preso à espera de um reinício que já não vai acontecer.
    """
    licenca = Path(base_dir) / 'license.key'
    if not licenca.exists() or not por_carregar(base_dir, instaladas):
        return False
    marca = Path(base_dir) / '.licenca_ja_recarregada'
    try:
        return marca.read_text(encoding='ascii').strip() != _impressao_digital(licenca)
    except OSError:
        return True


def deve_reiniciar(base_dir, instaladas=None, agora=None):
    """A recarga está pendente e a licença já assentou?"""
    licenca = Path(base_dir) / 'license.key'
    if not licenca.exists():
        return False
    if (agora if agora is not None else time.time()) - licenca.stat().st_mtime < SEGUNDOS_DE_FOLGA:
        return False
    return recarga_pendente(base_dir, instaladas)


def marcar_tentativa(base_dir):
    licenca = Path(base_dir) / 'license.key'
    (Path(base_dir) / '.licenca_ja_recarregada').write_text(_impressao_digital(licenca), encoding='ascii')


def _reiniciar(base_dir):
    for nome in OUTROS_SERVICOS:
        subprocess.run(['sc', 'stop', nome], capture_output=True)
    time.sleep(3)
    for nome in OUTROS_SERVICOS:
        subprocess.run(['sc', 'start', nome], capture_output=True)
    sys.stderr.write('[recarga] licença com módulos novos: a reiniciar o servidor.\n')
    sys.stderr.flush()
    # Só agora: marcar antes fazia o ecrã julgar que já tinha acabado.
    marcar_tentativa(base_dir)
    os._exit(1)      # código de erro: é isso que faz o WinSW voltar a arrancá-lo


def vigiar(base_dir, intervalo=5):
    """Corre numa thread do servidor. Nunca pode derrubar o servidor por si mesma."""
    def ciclo():
        while True:
            time.sleep(intervalo)
            try:
                if deve_reiniciar(base_dir):
                    _reiniciar(base_dir)
            except Exception as e:
                sys.stderr.write(f'[recarga] {e}\n')

    threading.Thread(target=ciclo, name='recarga-de-modulos', daemon=True).start()
