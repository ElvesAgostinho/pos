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
_EMBUTIDO = RAIZ / 'python' / 'python.exe'         # o Python embutido no pacote


def _python():
    """O Python com que correr o `manage.py`.

    Normalmente é o EMBUTIDO no pacote (`python/python.exe`): o cliente não
    instala Python, e é esse que tem as dependências todas.

    Quando não está lá, usa-se o que está a correr este próprio ficheiro. Não é
    um remendo: se este script está a correr, há um Python a funcionar, e é com
    ele que o configurador foi lançado. Antes, sem o embutido, o
    `subprocess.run` estourava com um `FileNotFoundError` cru — um traceback no
    ecrã de quem está a instalar, a dizer "python.exe" e mais nada. E impedia
    que a instalação se testasse em qualquer sítio que não fosse Windows, que é
    exactamente onde os testes correm (o GitHub).
    """
    return _EMBUTIDO if _EMBUTIDO.exists() else Path(sys.executable)
DADOS = RAIZ / 'dados'                            # base, media, logs — sobrevive a updates


class _Tee:
    """Escreve em dois sítios ao mesmo tempo (consola + memória para o log)."""
    def __init__(self, *streams):
        self.streams = streams

    def write(self, data):
        for s in self.streams:
            s.write(data)

    def flush(self):
        for s in self.streams:
            s.flush()


def ler_escolha(caminho_ini):
    cfg = configparser.ConfigParser()
    cfg.read(caminho_ini, encoding='utf-8-sig')
    return cfg['bd'] if cfg.has_section('bd') else {'tipo': 'sqlite'}


def ler_dono(caminho_ini):
    cfg = configparser.ConfigParser()
    cfg.read(caminho_ini, encoding='utf-8-sig')
    return cfg['dono'] if cfg.has_section('dono') else None


def escrever_env(bd):
    """O .env é escrito UMA vez e nunca por cima: a SECRET_KEY assina sessões e a
    license.key — regenerá-la numa atualização deslogava toda a gente e invalidava
    a licença ativada. Se já existe, respeita-se."""
    env = APP / '.env'
    if env.exists():
        # Numa REINSTALAÇÃO não se prepara base nenhuma nem se gera password: o
        # `.env` que lá está é o que manda. Devolve-se o par (estado, nada) para
        # quem chama não ter de distinguir os dois caminhos — era aqui que um
        # `return` com um valor só rebentava a reinstalação com um ValueError.
        return 'mantido (instalação existente)', None
    linhas = [
        'DJANGO_DEBUG=False',
        f'DJANGO_SECRET_KEY={secrets.token_urlsafe(48)}',
        'DJANGO_ALLOWED_HOSTS=*',
        f'DJANGO_MEDIA_ROOT={DADOS / "media"}',
        f'DJANGO_STATIC_ROOT={DADOS / "staticfiles"}',
        # Este instalador serve tudo em HTTP simples na porta 8000 (sem nginx/
        # certificado à frente) — sem isto, o settings.py assume produção=HTTPS
        # por omissão e o Django entra num redirecionamento http->https sem fim
        # (a página nunca abre, "loop infinito"). Se um dia se puser um proxy
        # com TLS à frente, isto muda para True.
        'DJANGO_SSL_REDIRECT=False',
    ]
    tipo = (bd.get('tipo') or 'sqlite').lower()
    feito = None          # o que a preparação da base criou (None em SQLite)

    # A BASE É CRIADA AQUI, não por alguém a colar SQL no SSMS ou no pgAdmin.
    #
    # Pedia-se ao técnico que criasse a base, o utilizador e as permissões à
    # mão. Um técnico que não saiba SQL não tem como fazer isso bem, e um
    # comando mal colado estraga a instalação de uma maneira que ninguém
    # percebe — e que é pior de desfazer do que de fazer.
    #
    # Agora ele dá as credenciais de ADMINISTRAÇÃO do servidor e carrega em
    # Seguinte. O que corre aqui é idempotente: se a base já existir usa-se, se
    # o utilizador já existir acerta-se a password. Repetir uma instalação que
    # falhou a meio não estraga nada.
    #
    # As credenciais de administração NÃO vão para o .env: usam-se e esquecem-se.
    # O que fica é o utilizador da aplicação, que só manda na base desta casa.
    if tipo != 'sqlite':
        from preparar_base import ErroDeBase, preparar
        try:
            feito = preparar(bd)
        except ErroDeBase as e:
            print()
            print('NÃO FOI POSSÍVEL PREPARAR A BASE DE DADOS')
            print('-' * 60)
            print(str(e))
            print('-' * 60)
            sys.exit(2)
        if feito:
            # O que a aplicação vai usar é o que acabou de ser criado — e não o
            # que estava no ini, que podia ter só o nome.
            bd = dict(bd)
            bd['base'] = feito['base']
            bd['utilizador'] = feito['utilizador']
            bd['password'] = feito['password']
            if feito.get('driver'):
                bd['driver'] = feito['driver']
            print(f'Base "{feito["base"]}": '
                  f'{"criada" if feito["criou_base"] else "já existia"}; '
                  f'utilizador "{feito["utilizador"] or "(conta do Windows)"}": '
                  f'{"criado" if feito["criou_utilizador"] else "já existia"}.')

    if tipo in ('sqlserver', 'mssql'):
        # SQL SERVER — o servidor que a casa já tem.
        #
        # O utilizador VAZIO quer dizer "entrar com a conta do Windows"
        # (trusted connection): numa casa com domínio é o modo em que não fica
        # nenhuma password guardada em ficheiro. As settings tratam disso.
        #
        # A PORTA fica vazia numa instância nomeada (SERVIDOR\\INSTANCIA), porque
        # quem a resolve é o SQL Browser. Escrever lá a porta do PostgreSQL era
        # o erro que fazia a ligação falhar sem dizer porquê.
        linhas += [
            'DB_ENGINE=mssql',
            f'DB_HOST={bd.get("host", "localhost")}',
            f'DB_PORT={bd.get("porta", "")}',
            f'DB_NAME={bd.get("base", "mwanalodge")}',
            f'DB_USER={bd.get("utilizador", "")}',
            f'DB_PASSWORD={bd.get("password", "")}',
            f'DB_ODBC_DRIVER={bd.get("driver") or _driver_odbc()}',
        ]
    elif tipo == 'postgres':
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

    # FILA DE FUNDO (Celery): nada a escrever aqui — DJANGO_DEBUG=False (acima)
    # já basta para o erp_server/settings.py construir sozinho uma fila embutida
    # na própria base (SQLite ou PostgreSQL, a que ficou escolhida acima). Um
    # técnico que precise mesmo de um Redis dedicado acrescenta REDIS_URL a
    # este .env à mão — não é o caminho normal, por isso não tem pergunta no wizard.

    # O ENDEREÇO DO PCC — sem isto, "Sincronizar com o PCC" no cliente aponta
    # sempre para 127.0.0.1:8000 (o PRÓPRIO servidor do cliente, nunca o do
    # fornecedor). O build_instalador.ps1 grava-o em pcc_url.txt na raiz do
    # pacote — é o MESMO endereço para todos os clientes (é a VPS do fornecedor).
    pcc_url_file = RAIZ / 'pcc_url.txt'
    if pcc_url_file.exists():
        # 'utf-8-sig', não 'utf-8': o PowerShell (Set-Content -Encoding UTF8, no
        # build_instalador.ps1) grava este ficheiro COM BOM. 'utf-8' normal não o
        # remove — ficava um caractere invisível colado à frente do "https://",
        # dentro do PRÓPRIO valor de PCC_URL no .env final. .strip() não apanha
        # isto (BOM não é espaço em branco para o Python). Resultado: os pedidos
        # de "Sincronizar com o PCC" podiam falhar de forma esquisita, sem
        # explicação nenhuma no ecrã.
        pcc_url = pcc_url_file.read_text(encoding='utf-8-sig').strip()
        if pcc_url:
            linhas += [f'PCC_URL={pcc_url}']

    env.write_text('\n'.join(linhas) + '\n', encoding='utf-8')
    # Devolve também o que a preparação da base criou (nome final, utilizador e
    # password gerada): é com isso que o `main` escreve a ficha para o dono da
    # casa, e esses valores só existem aqui dentro.
    return 'criado', feito


def escrever_ficha_da_base(bd, feito):
    """A FICHA DA BASE DE DADOS, para o dono da casa.

    O sistema guarda as credenciais no `.env`, que é um ficheiro de
    configuração à mistura com a chave de assinatura do Django — ninguém espera
    que o dono de um hotel vá lá procurar a password para abrir o SSMS.

    E ele vai precisar dela: para ver as tabelas, para o informático dele fazer
    uma cópia de segurança, para ligar uma ferramenta de relatórios. Sem isto,
    a resposta a "quais são as minhas credenciais?" é "ninguém sabe" — porque a
    password é gerada na instalação e não é escrita em mais lado nenhum.

    Fica na pasta de DADOS (e não na do programa) porque é lá que as coisas
    sobrevivem a uma atualização.
    """
    tipo = (bd.get('tipo') or 'sqlite').lower()
    DADOS.mkdir(parents=True, exist_ok=True)
    ficha = DADOS / 'BASE-DE-DADOS.txt'

    linhas = ['BASE DE DADOS DO SYSTEM MWANA LODGE',
              '=' * 60, '']

    if tipo == 'sqlite':
        base = DADOS / 'mwanalodge.sqlite3'
        linhas += [
            'Motor      : SQLite (base local, nesta máquina)',
            f'Ficheiro   : {base}',
            '',
            'Não há servidor, utilizador nem password: a base é um ficheiro.',
            'Para a abrir e ver as tabelas, use o "DB Browser for SQLite"',
            '(gratuito) e abra o ficheiro acima.',
            '',
            'PARA COPIAR A BASE, pare primeiro os serviços do Mwana Lodge —',
            'copiar um ficheiro SQLite com o sistema a escrever nele dá uma',
            'cópia que pode não abrir.',
        ]
    else:
        nome = 'SQL Server' if tipo in ('sqlserver', 'mssql') else 'PostgreSQL'
        servidor = bd.get('host', 'localhost')
        porta = bd.get('porta') or ('(a instância resolve)' if nome == 'SQL Server' else '5432')
        utilizador = (feito or {}).get('utilizador') or bd.get('utilizador') or ''
        password = (feito or {}).get('password') or bd.get('password') or ''
        linhas += [
            f'Motor      : {nome}',
            f'Servidor   : {servidor}',
            f'Porta      : {porta}',
            f'Base       : {(feito or {}).get("base") or bd.get("base", "")}',
            '',
        ]
        if utilizador:
            linhas += [
                'CREDENCIAIS DO SISTEMA (é com estas que o Mwana Lodge se liga):',
                f'  Utilizador : {utilizador}',
                f'  Password   : {password}',
                '',
                'Com elas pode abrir a base e ver as tabelas:',
                ('  · SQL Server: no SSMS, Autenticação do SQL Server'
                 if nome == 'SQL Server' else
                 '  · PostgreSQL: no pgAdmin, nova ligação ao servidor acima'),
                '',
                'NÃO MUDE ESTA PASSWORD sem mudar também o ficheiro',
                f'{RAIZ / "app" / ".env"} — o sistema deixa de entrar na base e',
                'as vendas param.',
                '',
                'SE SÓ QUER VER AS TABELAS, peça ao seu informático um',
                'utilizador de LEITURA à parte. Este utilizador é o do sistema,',
                'e tem permissões para alterar tudo.',
            ]
        else:
            linhas += [
                'O sistema liga-se com a CONTA DO WINDOWS do serviço — não há',
                'utilizador nem password guardados em lado nenhum.',
                '',
                'Para ver as tabelas, abra o SSMS com a sua conta de Windows',
                '(a mesma que administra este SQL Server).',
            ]

    linhas += [
        '', '-' * 60,
        'Este ficheiro tem credenciais. Guarde-o como guarda as do banco:',
        'quem o ler consegue abrir a base de dados da casa.',
        '',
        'Gerado pela instalação. Se alguma coisa mudar, este ficheiro NÃO se',
        'actualiza sozinho — a verdade está sempre no .env da aplicação.',
    ]

    ficha.write_text('\n'.join(linhas) + '\n', encoding='utf-8')
    print(f'Ficha da base de dados: {ficha}')


def _driver_odbc():
    """O driver ODBC que ESTÁ instalado nesta máquina, e não o que se espera.

    O Driver 18 é o actual, mas uma casa com um servidor mais antigo pode ter
    só o 17 — e escrever no .env um driver que não existe dá um erro de ODBC
    que não diz qual é o driver em falta. Pergunta-se ao Windows e escolhe-se o
    mais recente que lá estiver; se não houver nenhum, escreve-se o 18 e o
    instalador avisa (quem instala precisa de o saber ANTES de o sistema
    arrancar, não quando o primeiro pedido falhar).
    """
    preferidos = ['ODBC Driver 18 for SQL Server', 'ODBC Driver 17 for SQL Server',
                  'SQL Server Native Client 11.0', 'SQL Server']
    try:
        import pyodbc
        instalados = set(pyodbc.drivers())
    except Exception:
        try:
            import subprocess
            r = subprocess.run(
                ['powershell', '-NoProfile', '-Command',
                 "Get-OdbcDriver | Select-Object -ExpandProperty Name"],
                capture_output=True, text=True, timeout=30)
            instalados = {l.strip() for l in (r.stdout or '').splitlines() if l.strip()}
        except Exception:
            instalados = set()
    for d in preferidos:
        if d in instalados:
            return d
    print('AVISO: não encontrei nenhum driver ODBC para SQL Server nesta máquina. '
          'Instale o "ODBC Driver 18 for SQL Server" da Microsoft — sem ele o '
          'sistema não consegue ligar-se ao servidor.')
    return preferidos[0]


def correr(*args):
    """manage.py com o Python embutido — o cliente não tem (nem precisa de) Python."""
    r = subprocess.run([str(_python()), str(APP / 'manage.py'), *args],
                       cwd=str(APP), capture_output=True, text=True)
    # Sempre para o log (sucesso ou falha) — antes só se via a saída quando FALHAVA;
    # foi assim que "criar_dono correu mas não criou ninguém" ficou invisível.
    print(f'$ manage.py {" ".join(args)}')
    if r.stdout:
        print(r.stdout.rstrip())
    if r.returncode != 0:
        # o instalador mostra isto se falhar — melhor um erro legível que um serviço
        # que arranca contra uma base a meio
        sys.stderr.write(r.stdout + '\n' + r.stderr)
        sys.exit(r.returncode)


def activar_licenca():
    """ATIVA A LICENÇA — para o cliente não acabar a instalação com trabalho.

    Até aqui a instalação terminava e o sistema ficava preso no ecrã da
    licença à espera de um `license.key` que alguém tinha de ir copiar à mão
    para dentro da pasta do servidor. Numa instalação a sério isso significa o
    técnico ficar lá, ou o dono telefonar no dia seguinte a dizer que "não
    entra".

    As credenciais viajam em `app\\ativacao.ini`, escrito pelo build dentro do
    pacote — e o pacote vai CIFRADO (Encryption=yes no setup.iss): o ficheiro só
    existe em claro depois de alguém ter aberto o instalador com a senha certa.
    Apaga-se a seguir, para a senha de instalação não ficar a viver no disco do
    cliente.

    Falhar aqui NÃO estraga a instalação: sem Internet, ou com o PCC em baixo, o
    sistema fica instalado e activa-se depois pelo ecrã (Empresa → Licença →
    "Puxar licença do PCC", ou carregando o ficheiro). O que não pode é falhar
    em silêncio — por isso fica tudo no registo.
    """
    dono_pcc = None
    ini = APP / 'ativacao.ini'
    if not ini.exists():
        print('Sem ativacao.ini — a licença terá de ser ativada pelo ecrã.')
        globals()['DONO_DO_PCC'] = None
        return
    try:
        cfg = configparser.ConfigParser()
        cfg.read(ini, encoding='utf-8-sig')
        sec = cfg['licenca'] if cfg.has_section('licenca') else {}
        codigo = (sec.get('cliente') or '').strip()
        senha = sec.get('senha_instalacao') or ''
        pcc = (sec.get('pcc_url') or '').strip() or None
        if not (codigo and senha):
            print('ativacao.ini incompleto — a licença terá de ser ativada pelo ecrã.')
            return

        # Dentro do processo: aqui ainda não há servidor web a quem pedir.
        sys.path.insert(0, str(APP))
        os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_server.settings')
        import django
        django.setup()
        from licensing.activation import ErroDeAtivacao, activar
        try:
            r = activar(codigo, senha, pcc_url=pcc)
            print(f"Licença ativada: {r.get('license_number')} · válida até "
                  f"{r.get('valid_until')} · {r.get('modules')} módulo(s).")
            dono_pcc = r.get('owner') or None
            if r.get('agt_applied'):
                print('Certificação AGT aplicada pelo fornecedor.')
            if r.get('company_applied'):
                print('Dados da empresa preenchidos a partir do PCC.')
            if r.get('aviso'):
                print(f'AVISO: {r["aviso"]}')
        except ErroDeAtivacao as e:
            print(f'AVISO: a licença não foi ativada automaticamente — {e.detalhe}')
            print('O sistema fica instalado; ative pelo ecrã (Empresa → Licença).')
    except Exception as e:
        print(f'AVISO: falhou a ativação automática ({e}). '
              f'O sistema fica instalado; ative pelo ecrã.')
    finally:
        globals()['DONO_DO_PCC'] = dono_pcc
        # A SENHA DE INSTALAÇÃO NÃO FICA NO DISCO DO CLIENTE. Serviu uma vez.
        try:
            ini.unlink()
        except Exception:
            pass


def main():
    ini = sys.argv[sys.argv.index('--ini') + 1] if '--ini' in sys.argv else str(RAIZ / 'instalacao.ini')
    DADOS.mkdir(exist_ok=True)
    (DADOS / 'media').mkdir(exist_ok=True)
    (DADOS / 'logs').mkdir(exist_ok=True)
    bd = ler_escolha(ini)
    estado, feito = escrever_env(bd)
    print(f'.env {estado}; base = {bd.get("tipo", "sqlite")}')
    # A ficha para o dono da casa — sem ela, a resposta a "quais são as minhas
    # credenciais?" é "ninguém sabe": a password é gerada na instalação.
    try:
        escrever_ficha_da_base(bd, feito)
    except Exception as e:
        # Não é fatal: a instalação não pode parar por causa de um ficheiro de
        # apoio. Mas diz-se, para quem instala poder escrever os dados à mão.
        print(f'AVISO: não consegui escrever a ficha da base de dados ({e}). '
              f'As credenciais estão no .env da aplicação.')
    correr('migrate', '--noinput')
    correr('collectstatic', '--noinput')
    # O CATÁLOGO DE PARÂMETROS (Configuração POS → Parâmetros) — sem isto, uma
    # instalação nova arranca com ZERO linhas na tabela; o motor (pos/params.py)
    # continua a funcionar (cai nos valores por omissão do próprio código), mas
    # o dono não vê nada para configurar, nem sabe que aqueles parâmetros
    # existem. update_or_create: idempotente, nunca apaga um valor que o dono já
    # tenha escolhido (só atualiza nome/grupo/texto de ajuda a cada versão nova).
    correr('seed_params')

    # O CATÁLOGO FISCAL AGT (tipos de documento — FT/FR/FS/NC/ND/GT/RC/…, taxas
    # de IVA, motivos de isenção, séries do ano). Sem isto, uma instalação nova
    # não conseguia emitir NENHUM documento fiscal — o motor (fiscal/services.py
    # issue_document) precisa de um FiscalDocType para saber o que assinar/
    # imprimir, e a tabela ficava vazia. Achado a testar a emissão a sério numa
    # instalação real: 0 tipos de documento configurados. Idempotente
    # (update_or_create), como seed_params — nunca apaga o que o dono já mudou.
    correr('seed_fiscal')

    # UNIDADES DE MEDIDA (Kg, L, Unidade, Caixa…) — sem isto, uma instalação nova não
    # conseguia criar NENHUM artigo: Item.base_uom é obrigatório no modelo e a ficha
    # do artigo (Configuração POS → Artigos) nem pergunta essa unidade diretamente
    # (deriva-a da Unidade de Venda/Stock/Compra) — sem UMA UoM cadastrada, não há de
    # onde derivar. Achado a investigar "não consigo criar artigo" num cliente real:
    # 0 unidades de medida configuradas. Idempotente, como os outros seeds acima.
    correr('seed_uoms')

    # O PLANO DE CONTAS (PGC-AO), OS DIÁRIOS E O EXERCÍCIO.
    #
    # O comando existia e o instalador nunca o corria. Sem plano de contas não há
    # diário; sem diário, `post_pos_ticket` devolve None e DESISTE EM SILÊNCIO —
    # cada venda do dia era lançada na caixa, declarada à AGT, e não chegava à
    # contabilidade. Ninguém dava por nada até o contabilista abrir o sistema ao
    # fim do mês e encontrar o razão vazio, com as vendas todas já emitidas e o
    # período a fechar.
    #
    # Idempotente (update_or_create), como os outros seeds: numa atualização não
    # mexe no que o contabilista já ajustou.
    correr('seed_accounting')

    # A LICENÇA primeiro: pode trazer a conta do dono com ela, e nesse caso não
    # se pede nada a ninguém.
    activar_licenca()

    # A CONTA DO DONO — do PCC se ela de lá vier, senão a que o técnico escreveu.
    #
    # Vir do PCC é melhor por uma razão que não é de comodidade: assim o técnico
    # não precisa de SABER a senha com que o dono entra no sistema dele. Ela
    # viaja cifrada no mesmo canal da licença, é usada uma vez para criar a
    # conta, e o dono é obrigado a trocá-la no primeiro login — não fica senha
    # de fábrica nenhuma viva na instalação.
    dono_pcc = globals().get('DONO_DO_PCC')
    dono = ler_dono(ini)
    if dono_pcc and dono_pcc.get('password'):
        correr('criar_dono', '--username', dono_pcc.get('username', 'dono'),
               '--password', dono_pcc['password'],
               *(['--trocar-no-primeiro-login'] if dono_pcc.get('must_change') else []))
        print(f"Conta do dono criada a partir do PCC ({dono_pcc.get('username', 'dono')}).")
    elif dono and dono.get('password'):
        correr('criar_dono', '--username', dono.get('utilizador', 'dono'),
               '--password', dono['password'])
        print('Conta do dono pronta (do wizard).')
    else:
        print(f'AVISO: sem secção [dono] (ou password vazia) em {ini} — '
              'nenhuma conta de acesso foi criada.')

    print('Base de dados pronta. Os serviços podem arrancar.')


if __name__ == '__main__':
    # Este script corria "runhidden" pelo Inno Setup — sem isto, uma falha aqui
    # (ex.: instalacao.ini ainda sem a secção [dono] no momento exato em que
    # correu) ficava invisível: nenhum ecrã de erro, nenhum registo em lado
    # nenhum, só "a conta do dono nunca chegou a existir" descoberto dias
    # depois pelo cliente a tentar entrar. Regista sempre, sucesso ou falha.
    (DADOS / 'logs').mkdir(parents=True, exist_ok=True)
    log_path = DADOS / 'logs' / 'configurar.log'
    import io
    import datetime
    buf = io.StringIO()
    real_stdout, real_stderr = sys.stdout, sys.stderr
    try:
        sys.stdout = sys.stderr = _Tee(real_stdout, buf)
        main()
    except Exception as e:
        buf.write(f'ERRO: {e}\n')
        raise
    finally:
        sys.stdout, sys.stderr = real_stdout, real_stderr
        with open(log_path, 'a', encoding='utf-8') as f:
            f.write(f'\n=== {datetime.datetime.now().isoformat(timespec="seconds")} ===\n')
            f.write(buf.getvalue())
