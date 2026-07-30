# -*- coding: utf-8 -*-
"""
O CONFIGURADOR — corre UMA vez, no fim do setup.exe, antes dos serviços arrancarem.

É o par de mãos que a Primavera esconde atrás da barra de progresso: pega na escolha
que o cliente fez no wizard (instalacao.ini), escreve o .env definitivo, cria a base
de dados (migrações) e prepara os estáticos. Quando os serviços arrancam a seguir,
encontram tudo pronto — o primeiro ecrã que o cliente vê é o onboarding da licença,
nunca um erro de configuração.

Idempotente de propósito: correr duas vezes não estraga nada — é o que permite ao
setup.exe de uma ATUALIZAÇÃO voltar a chamá-lo por cima de uma instalação existente
(as migrações novas aplicam-se, os dados ficam).
"""
import configparser
import os
import secrets
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent            # {app}
APP = RAIZ / 'app'                                # o backend Django
PYTHON = RAIZ / 'python' / 'python.exe'           # o Python embutido
DADOS = RAIZ / 'dados'                            # base, media, logs — sobrevive a updates


def ler_escolha(caminho_ini):
    cfg = configparser.ConfigParser()
    cfg.read(caminho_ini, encoding='utf-8')
    return cfg['bd'] if cfg.has_section('bd') else {'tipo': 'sqlite'}


def ler_dono(caminho_ini):
    cfg = configparser.ConfigParser()
    cfg.read(caminho_ini, encoding='utf-8')
    return cfg['dono'] if cfg.has_section('dono') else None


def escrever_env(bd):
    """O .env é escrito UMA vez e nunca por cima: a SECRET_KEY assina sessões e a
    license.key — regenerá-la numa atualização deslogava toda a gente e invalidava
    a licença ativada. Se já existe, respeita-se."""
    env = APP / '.env'
    if env.exists():
        return 'mantido (instalação existente)'
    linhas = [
        'DJANGO_DEBUG=False',
        f'DJANGO_SECRET_KEY={secrets.token_urlsafe(48)}',
        'DJANGO_ALLOWED_HOSTS=*',
        f'DJANGO_MEDIA_ROOT={DADOS / "media"}',
        f'DJANGO_STATIC_ROOT={DADOS / "staticfiles"}',
    ]
    if bd.get('tipo') == 'postgres':
        linhas += [
            'DB_ENGINE=postgresql',
            f'DB_HOST={bd.get("host", "localhost")}',
            f'DB_PORT={bd.get("porta", "5432")}',
            f'DB_NAME={bd.get("base", "mwanalodge")}',
            f'DB_USER={bd.get("utilizador", "mwana")}',
            f'DB_PASSWORD={bd.get("password", "")}',
        ]
    else:
        # SQLite na pasta de DADOS (não na de programa): o Program Files é só
        # binários; a base com as vendas vive onde os backups a encontram.
        linhas += [f'SQLITE_PATH={DADOS / "mwanalodge.sqlite3"}']

    # O ENDEREÇO DO PCC — sem isto, "Sincronizar com o PCC" no cliente aponta
    # sempre para 127.0.0.1:8000 (o PRÓPRIO servidor do cliente, nunca o do
    # fornecedor). O build_instalador.ps1 grava-o em pcc_url.txt na raiz do
    # pacote — é o MESMO endereço para todos os clientes (é a VPS do fornecedor).
    pcc_url_file = RAIZ / 'pcc_url.txt'
    if pcc_url_file.exists():
        pcc_url = pcc_url_file.read_text(encoding='utf-8').strip()
        if pcc_url:
            linhas += [f'PCC_URL={pcc_url}']

    env.write_text('\n'.join(linhas) + '\n', encoding='utf-8')
    return 'criado'


def correr(*args):
    """manage.py com o Python embutido — o cliente não tem (nem precisa de) Python."""
    r = subprocess.run([str(PYTHON), str(APP / 'manage.py'), *args],
                       cwd=str(APP), capture_output=True, text=True)
    if r.returncode != 0:
        # o instalador mostra isto se falhar — melhor um erro legível que um serviço
        # que arranca contra uma base a meio
        sys.stderr.write(r.stdout + '\n' + r.stderr)
        sys.exit(r.returncode)


def main():
    ini = sys.argv[sys.argv.index('--ini') + 1] if '--ini' in sys.argv else str(RAIZ / 'instalacao.ini')
    DADOS.mkdir(exist_ok=True)
    (DADOS / 'media').mkdir(exist_ok=True)
    (DADOS / 'logs').mkdir(exist_ok=True)
    bd = ler_escolha(ini)
    estado = escrever_env(bd)
    print(f'.env {estado}; base = {bd.get("tipo", "sqlite")}')
    correr('migrate', '--noinput')
    correr('collectstatic', '--noinput')
    # O CATÁLOGO DE PARÂMETROS (Configuração POS → Parâmetros) — sem isto, uma
    # instalação nova arranca com ZERO linhas na tabela; o motor (pos/params.py)
    # continua a funcionar (cai nos valores por omissão do próprio código), mas
    # o dono não vê nada para configurar, nem sabe que aqueles parâmetros
    # existem. update_or_create: idempotente, nunca apaga um valor que o dono já
    # tenha escolhido (só atualiza nome/grupo/texto de ajuda a cada versão nova).
    correr('seed_params')

    # A CONTA DO DONO — utilizador/password que o técnico introduziu no wizard
    # (gerados no PCC). Numa atualização, o wizard volta a perguntar; se a
    # password vier vazia por algum motivo, não se mexe na conta existente —
    # criar_dono.py exige --password preenchida, por isso falha alto em vez de
    # apagar silenciosamente o acesso do dono.
    dono = ler_dono(ini)
    if dono and dono.get('password'):
        correr('criar_dono', '--username', dono.get('utilizador', 'dono'),
               '--password', dono['password'])
        print('Conta do dono pronta.')

    print('Base de dados pronta. Os serviços podem arrancar.')


if __name__ == '__main__':
    main()
