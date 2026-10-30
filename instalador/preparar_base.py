# -*- coding: utf-8 -*-
"""CRIAR A BASE DE DADOS DO CLIENTE — sem ninguém colar SQL à mão.

O técnico que instala o sistema numa casa não tem de saber SQL. Pedia-se-lhe
que abrisse o SSMS ou o pgAdmin e colasse meia dúzia de comandos para criar a
base, o utilizador e as permissões — e um comando mal colado estraga a
instalação de uma maneira difícil de perceber e pior de desfazer. Quem instala
devia só dar as credenciais e carregar em Seguinte.

É o que este ficheiro faz. Recebe as credenciais de ADMINISTRAÇÃO do servidor
(o `sa` do SQL Server, o `postgres` do PostgreSQL, ou a conta do Windows) e
trata do resto:

  1. liga-se ao servidor e confirma que as credenciais servem;
  2. cria a BASE da casa, se ainda não existir;
  3. cria um UTILIZADOR só para essa base, com uma password gerada;
  4. dá-lhe as permissões dessa base, e de mais nenhuma;
  5. devolve as credenciais da aplicação, que vão para o `.env`.

Tudo IDEMPOTENTE: correr outra vez não estraga nada nem apaga dados. Se a base
já existir, usa-se; se o utilizador já existir, actualiza-se a password. É o
que permite repetir uma instalação que falhou a meio sem medo.

**As credenciais de administração NÃO ficam guardadas.** Usam-se durante a
instalação e são esquecidas: o que fica no `.env` é o utilizador da aplicação,
que só manda na base desta casa.
"""
import re
import secrets
import string


class ErroDeBase(Exception):
    """Falhou a preparar a base — com uma explicação que se possa ler."""


ALFABETO = string.ascii_letters + string.digits + '#%+=?@'


def gerar_password(tamanho=20):
    """Password da aplicação. Nunca é escrita nem ditada por ninguém: nasce
    aqui e vai direita para o `.env`."""
    return ''.join(secrets.choice(ALFABETO) for _ in range(tamanho))


def _literal(texto):
    """Uma password dentro de uma instrução SQL, com aspas a dobrar.

    PORQUE É QUE NÃO VAI COMO PARÂMETRO: `CREATE LOGIN ... WITH PASSWORD = ?`
    é recusado — "Incorrect syntax near '@P1'". O mesmo no PostgreSQL com
    `CREATE ROLE ... PASSWORD %s`. São instruções DDL, e o SQL não deixa
    parametrizar nada numa delas: nem o nome, nem a password.

    Então cita-se à mão, e com cuidado: a plica (') fecha o literal, e é com
    ela que se sairia da string para injectar o que se quisesse. Dobrá-la é o
    que o SQL manda fazer, e vale nos dois motores. A password que o instalador
    gera nem sequer tem plicas (ver ALFABETO), mas quem a passa pode ser um
    ficheiro `.ini` escrito por outra pessoa — e aí já não controlo o conteúdo.
    """
    if texto is None:
        texto = ''
    if '\x00' in texto:
        raise ErroDeBase('A password tem um carácter que não pode ir numa '
                         'instrução SQL.')
    return "'" + str(texto).replace("'", "''") + "'"


def _nome_seguro(nome, oque):
    """Um nome de base ou de utilizador que se possa pôr numa instrução SQL.

    Estes nomes NÃO podem ir como parâmetro (`?`/`%s`) — o SQL não permite
    parametrizar um identificador — por isso o que os torna seguros é o filtro:
    letras, dígitos e `_`, e tem de começar por letra. Qualquer outra coisa é
    recusada antes de chegar ao servidor.
    """
    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,62}', nome or ''):
        raise ErroDeBase(
            f'O nome {oque} ("{nome}") só pode ter letras, números e underscore, '
            f'e tem de começar por uma letra. Use por exemplo "mwana_hotelsol".')
    return nome


# ══════════════════════════════════════════════════════════════════════════
# SQL SERVER
# ══════════════════════════════════════════════════════════════════════════
def _ligar_sqlserver(servidor, porta, utilizador, password, base='master',
                     driver=None):
    import pyodbc
    driver = driver or _driver_sqlserver()
    alvo = servidor if not porta else f'{servidor},{porta}'
    partes = [f'DRIVER={{{driver}}}', f'SERVER={alvo}', f'DATABASE={base}',
              'TrustServerCertificate=yes', 'Encrypt=yes']
    if utilizador:
        partes += [f'UID={utilizador}', f'PWD={password}']
    else:
        # Sem utilizador = conta do Windows. Numa casa com domínio é o modo em
        # que não há password nenhuma a guardar.
        partes.append('Trusted_Connection=yes')
    # autocommit: o CREATE DATABASE do SQL Server não corre dentro de uma
    # transação de utilizador.
    return pyodbc.connect(';'.join(partes), timeout=15, autocommit=True)


def _driver_sqlserver():
    try:
        import pyodbc
        instalados = set(pyodbc.drivers())
    except ImportError:
        raise ErroDeBase(
            'Falta o pyodbc nesta instalação — o pacote deveria tê-lo trazido. '
            'Reinstale a partir do setup.exe completo.')
    for d in ('ODBC Driver 18 for SQL Server', 'ODBC Driver 17 for SQL Server',
              'SQL Server Native Client 11.0', 'SQL Server'):
        if d in instalados:
            return d
    raise ErroDeBase(
        'Não há nenhum driver ODBC para SQL Server nesta máquina. Instale o '
        '"ODBC Driver 18 for SQL Server" (descarga gratuita da Microsoft) e '
        'volte a correr o instalador.')


def preparar_sqlserver(servidor, porta, base, admin_user, admin_pass,
                       app_user=None, app_pass=None):
    """Cria a base e o utilizador da aplicação no SQL Server.

    `admin_user` vazio = entrar com a conta do Windows.
    `app_user` vazio = a aplicação também entra com a conta do Windows, e então
    não se cria utilizador nenhum (não há password para guardar).
    """
    base = _nome_seguro(base, 'da base de dados')
    driver = _driver_sqlserver()

    try:
        ligacao = _ligar_sqlserver(servidor, porta, admin_user, admin_pass,
                                   'master', driver)
    except Exception as e:
        raise ErroDeBase(_explicar_sqlserver(e, servidor, admin_user))

    criou_base = False
    with ligacao:
        cur = ligacao.cursor()
        cur.execute('SELECT DB_ID(?)', base)
        if cur.fetchone()[0] is None:
            cur.execute(f'CREATE DATABASE [{base}]')
            criou_base = True

        if not app_user:
            # A aplicação entra com a conta do Windows: não há utilizador a
            # criar nem password a guardar.
            return {'base': base, 'utilizador': '', 'password': '',
                    'driver': driver, 'criou_base': criou_base,
                    'criou_utilizador': False}

        app_user = _nome_seguro(app_user, 'do utilizador')
        app_pass = app_pass or gerar_password()

        # O LOGIN é do servidor; o USER é da base. São duas coisas, e é por não
        # se perceber isso que o passo manual falhava tantas vezes.
        cur.execute('SELECT COUNT(*) FROM sys.server_principals WHERE name = ?', app_user)
        if cur.fetchone()[0]:
            cur.execute(f'ALTER LOGIN [{app_user}] WITH PASSWORD = {_literal(app_pass)}')
            criou_login = False
        else:
            # CHECK_POLICY=OFF: a password é gerada aqui com 20 caracteres
            # aleatórios; a política do Windows recusaria algumas combinações
            # válidas e a instalação parava por um motivo que ninguém percebe.
            cur.execute(f'CREATE LOGIN [{app_user}] '
                        f'WITH PASSWORD = {_literal(app_pass)}, CHECK_POLICY = OFF')
            criou_login = True

        # O utilizador DENTRO da base, e dono só dela.
        cur.execute(f'USE [{base}]')
        cur.execute('SELECT COUNT(*) FROM sys.database_principals WHERE name = ?', app_user)
        if not cur.fetchone()[0]:
            cur.execute(f'CREATE USER [{app_user}] FOR LOGIN [{app_user}]')
        cur.execute(f'ALTER ROLE db_owner ADD MEMBER [{app_user}]')

    return {'base': base, 'utilizador': app_user, 'password': app_pass,
            'driver': driver, 'criou_base': criou_base,
            'criou_utilizador': criou_login}


def _explicar_sqlserver(erro, servidor, utilizador):
    """O erro do ODBC em português, e com o que fazer a seguir.

    As mensagens do ODBC dizem o que falhou em termos de ODBC, não em termos do
    que quem instala tem à frente. Estas três são 90% dos casos reais.
    """
    t = str(erro)
    if 'Login failed' in t:
        quem = utilizador or 'a conta do Windows'
        return (f'O servidor "{servidor}" recusou as credenciais de {quem}.\n\n'
                f'· Se usou utilizador e password: confirme-os, e confirme que o '
                f'servidor está em Modo Misto (Propriedades do servidor > Segurança '
                f'> "Modo de Autenticação do SQL Server e do Windows", e reiniciar '
                f'o serviço).\n'
                f'· Se deixou o utilizador vazio: a conta do Windows com que está '
                f'a correr o instalador não tem acesso a este servidor.')
    if 'not be found' in t or 'not accessible' in t or 'Named Pipes' in t:
        return (f'Não encontrei o servidor "{servidor}".\n\n'
                f'· Se é uma instância nomeada, escreva-a como SERVIDOR\\INSTANCIA '
                f'(ex.: PC-RECECAO\\SQLEXPRESS) e deixe a porta VAZIA.\n'
                f'· No SQL Server Configuration Manager, confirme que o TCP/IP está '
                f'Ativado e que o serviço "SQL Server Browser" está a correr.\n'
                f'· Se o servidor está noutra máquina, confirme a firewall (porta 1433).')
    if 'certificate' in t.lower():
        return (f'O servidor "{servidor}" apresentou um certificado que não se pôde '
                f'validar. O sistema já liga com TrustServerCertificate; se isto '
                f'aparece, o servidor está a recusar a ligação cifrada.')
    return f'Não consegui ligar-me ao servidor "{servidor}".\n\n{t[:400]}'


# ══════════════════════════════════════════════════════════════════════════
# POSTGRESQL
# ══════════════════════════════════════════════════════════════════════════
def preparar_postgres(servidor, porta, base, admin_user, admin_pass,
                      app_user=None, app_pass=None):
    """Cria a base e o utilizador da aplicação no PostgreSQL."""
    import psycopg

    base = _nome_seguro(base, 'da base de dados')
    app_user = _nome_seguro(app_user or base, 'do utilizador')
    app_pass = app_pass or gerar_password()
    porta = porta or '5432'

    try:
        # Liga-se à base `postgres`, que existe sempre, porque a da casa ainda
        # pode não existir. autocommit porque CREATE DATABASE não corre dentro
        # de uma transação.
        ligacao = psycopg.connect(host=servidor, port=porta, dbname='postgres',
                                  user=admin_user, password=admin_pass,
                                  connect_timeout=15, autocommit=True)
    except Exception as e:
        raise ErroDeBase(_explicar_postgres(e, servidor, admin_user))

    criou_base = criou_user = False
    with ligacao:
        cur = ligacao.cursor()
        cur.execute('SELECT 1 FROM pg_roles WHERE rolname = %s', (app_user,))
        if cur.fetchone():
            cur.execute(f'ALTER ROLE "{app_user}" WITH LOGIN PASSWORD {_literal(app_pass)}')
        else:
            cur.execute(f'CREATE ROLE "{app_user}" WITH LOGIN PASSWORD {_literal(app_pass)}')
            criou_user = True

        cur.execute('SELECT 1 FROM pg_database WHERE datname = %s', (base,))
        if not cur.fetchone():
            cur.execute(f'CREATE DATABASE "{base}" OWNER "{app_user}" ENCODING \'UTF8\'')
            criou_base = True
        else:
            # A base já existia (de uma tentativa anterior, ou criada à mão):
            # garante-se que o utilizador da aplicação lhe chega.
            cur.execute(f'GRANT ALL PRIVILEGES ON DATABASE "{base}" TO "{app_user}"')

    # O ESQUEMA `public` é o ponto que falha a quem cria a base à mão no
    # PostgreSQL 15+: desde essa versão, ser dono da BASE já não dá direito a
    # criar tabelas no esquema `public` dela. Sem isto, o `migrate` falha com
    # "permission denied for schema public" numa base de que ele É dono — e
    # ninguém percebe porquê.
    try:
        with psycopg.connect(host=servidor, port=porta, dbname=base,
                             user=admin_user, password=admin_pass,
                             connect_timeout=15, autocommit=True) as lig2:
            c2 = lig2.cursor()
            c2.execute(f'GRANT ALL ON SCHEMA public TO "{app_user}"')
            c2.execute(f'ALTER SCHEMA public OWNER TO "{app_user}"')
    except Exception:
        # Não é fatal: em PostgreSQL mais antigo o dono da base já pode criar.
        pass

    return {'base': base, 'utilizador': app_user, 'password': app_pass,
            'criou_base': criou_base, 'criou_utilizador': criou_user}


def _explicar_postgres(erro, servidor, utilizador):
    t = str(erro)
    if 'password authentication failed' in t or 'autenticação' in t.lower():
        return (f'O servidor "{servidor}" recusou a password do utilizador '
                f'"{utilizador}".\n\nConfirme a password de administração — é a que '
                f'foi pedida durante a instalação do PostgreSQL, para o utilizador '
                f'"postgres".')
    if 'could not connect' in t or 'could not translate' in t or 'refused' in t:
        return (f'Não consegui ligar-me ao servidor "{servidor}".\n\n'
                f'· Confirme que o serviço do PostgreSQL está a correr.\n'
                f'· Se está noutra máquina: `listen_addresses` em postgresql.conf, '
                f'a linha da rede em pg_hba.conf, e a firewall (porta 5432).')
    if 'no pg_hba.conf entry' in t:
        return (f'O servidor "{servidor}" não aceita ligações desta máquina.\n\n'
                f'Acrescente a rede desta casa ao ficheiro pg_hba.conf do servidor '
                f'e reinicie o serviço.')
    return f'Não consegui preparar a base no servidor "{servidor}".\n\n{t[:400]}'


# ══════════════════════════════════════════════════════════════════════════
# A PORTA ÚNICA — é esta que o configurador chama
# ══════════════════════════════════════════════════════════════════════════
def preparar(bd):
    """Prepara a base a partir da secção [bd] do instalacao.ini.

    Devolve o que a aplicação precisa de saber (base, utilizador, password e,
    no SQL Server, o driver). As credenciais de administração ficam aqui e não
    vão para lado nenhum.
    """
    tipo = (bd.get('tipo') or 'sqlite').lower()
    if tipo == 'sqlite':
        return None

    servidor = (bd.get('host') or 'localhost').strip()
    porta = (bd.get('porta') or '').strip()
    base = (bd.get('base') or 'mwanalodge').strip()
    # O utilizador/password da secção são os da APLICAÇÃO. Os de administração
    # vêm em campos próprios e só existem durante a instalação.
    app_user = (bd.get('utilizador') or '').strip()
    app_pass = (bd.get('password') or '').strip()
    admin_user = (bd.get('admin_utilizador') or '').strip()
    admin_pass = (bd.get('admin_password') or '').strip()

    if tipo in ('sqlserver', 'mssql'):
        return preparar_sqlserver(servidor, porta, base, admin_user, admin_pass,
                                  app_user or None, app_pass or None)
    if tipo == 'postgres':
        if not admin_user:
            raise ErroDeBase(
                'Para criar a base no PostgreSQL é preciso um utilizador de '
                'administração (normalmente "postgres") — no PostgreSQL não existe '
                'ligação pela conta do Windows.')
        return preparar_postgres(servidor, porta, base, admin_user, admin_pass,
                                 app_user or None, app_pass or None)
    raise ErroDeBase(f'Tipo de base de dados desconhecido: "{tipo}".')
