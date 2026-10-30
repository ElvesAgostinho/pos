# A base de dados de cada cliente — SQL Server ou PostgreSQL

**Cada cliente é uma instalação separada, com a sua própria base de dados e a
sua própria ligação.** Nada é partilhado entre casas: nem a base, nem o
servidor, nem as credenciais. Este ficheiro é o que se leva para a instalação.

O instalador oferece **três** caminhos no passo *Base de Dados*:

| Escolha | Para quem | O que é preciso ter antes |
|---|---|---|
| **Base de dados local (SQLite)** | Uma casa, um servidor, meia dúzia de terminais | Nada |
| **Servidor SQL Server existente** | A casa já corre SQL Server (vem da Primavera) | Servidor + base + ODBC Driver |
| **Servidor PostgreSQL existente** | A casa já corre PostgreSQL | Servidor + base + utilizador |

Em caso de dúvida, **SQLite**. Não é uma opção menor: guarda as vendas, os
documentos fiscais e a contabilidade de uma casa inteira, e não há um segundo
servidor para alguém administrar. As outras duas servem a casa que **já tem**
um servidor de base de dados e quer tudo no mesmo sítio — com o mesmo
administrador e as mesmas cópias de segurança.

---

# A · SQL SERVER

## A1. Instalar o SQL Server (se a casa ainda não tiver)

1. **SQL Server Express** — gratuito, chega para uma casa:
   procure por *"SQL Server Express download"* no site da Microsoft.
2. Escolha **Basic** na instalação. Anote o **nome da instância**: por omissão
   fica `SQLEXPRESS`, e o servidor passa a chamar-se `NOME-DO-PC\SQLEXPRESS`.
3. Instale também o **SSMS** (*SQL Server Management Studio*) — é com ele que se
   cria a base. Procure por *"SSMS download"*.

## A2. Instalar o driver ODBC — **não se esqueça deste passo**

O sistema fala com o SQL Server através do **ODBC Driver 18 for SQL Server**, da
Microsoft. É software do sistema e **não vem no instalador do Mwana Lodge**.

- Procure por *"Microsoft ODBC Driver for SQL Server"* e instale a versão 18.
- Numa máquina onde já esteja o SSMS, costuma já lá estar.

> O instalador verifica isto e **recusa avançar** sem o driver, dizendo o nome
> exacto do que falta. É de propósito: sem ele a instalação acabava bem e o
> sistema não arrancava, com um erro de ODBC que não diz qual é o driver em
> falta.

## A3. A base e o utilizador — **o instalador cria-os sozinho**

**Não precisa de abrir o SSMS nem de escrever SQL nenhum.** Basta indicar, no
instalador, uma conta de **administração** do servidor; ele trata do resto:

1. liga-se ao servidor e confirma que as credenciais servem;
2. **cria a base** da casa, se ainda não existir;
3. **cria um utilizador** só para essa base, com uma password gerada de 20
   caracteres — que ninguém escreve nem dita a ninguém;
4. dá-lhe as permissões dessa base, **e de mais nenhuma**;
5. cria as tabelas todas.

> **As credenciais de administração não ficam guardadas.** São usadas uma vez,
> durante a instalação, e esquecidas. O que fica no `.env` da casa é o
> utilizador da aplicação, que não manda em mais nada naquele servidor — nem no
> resto do que a casa lá tenha.

**No SQL Server pode nem ser preciso password nenhuma**: deixe o campo
*Administrador* vazio e o instalador entra com a conta do Windows com que está
a instalar. Precisa só que essa conta seja administradora do SQL Server (é o
caso normal de quem instalou o servidor).

Correr o instalador uma segunda vez **não estraga nada**: se a base já existir,
usa-se; se o utilizador já existir, acerta-se a password. É o que torna seguro
repetir uma instalação que tenha falhado a meio.

<details>
<summary>Se a casa <b>exigir</b> que seja o informático dela a criar a base</summary>

Há casas com uma política de só o administrador delas criar bases. Nesse caso,
peça-lhe que corra isto no SSMS, e depois indique no instalador o utilizador e
a password que ele criou (em vez dos de administração):

```sql
CREATE DATABASE mwana_hotelnataniel;
GO
CREATE LOGIN mwana_hotelnataniel
    WITH PASSWORD = 'UMA-PASSWORD-FORTE', CHECK_POLICY = ON;
GO
USE mwana_hotelnataniel;
CREATE USER mwana_hotelnataniel FOR LOGIN mwana_hotelnataniel;
ALTER ROLE db_owner ADD MEMBER mwana_hotelnataniel;
GO
```

O utilizador tem de ser `db_owner` **daquela base** — o sistema cria e altera
tabelas lá dentro.
</details>

## A4. Deixar o servidor aceitar ligações

Só é preciso quando o SQL Server **não** está no mesmo computador onde o sistema
vai correr, ou quando é uma instância nomeada (`PC\SQLEXPRESS`):

1. **SQL Server Configuration Manager** → *Protocolos* da instância → **TCP/IP** →
   **Ativado**.
2. **SQL Server Browser** → serviço em **Automático** e **Iniciado**
   (é quem resolve o nome da instância).
3. Se usou `CREATE LOGIN` com password (ponto A3), o servidor tem de estar em
   **Modo Misto**: SSMS → botão direito no servidor → *Propriedades* →
   *Segurança* → **Modo de Autenticação do SQL Server e do Windows** → reiniciar
   o serviço.
4. **Firewall**: abrir a porta **1433** (ou a da instância).

## A5. No instalador do Mwana Lodge

No passo **Base de Dados**, escolha a segunda opção. O ecrã seguinte é este:

```
┌─ Ligação ao SQL Server ───────────────────────────────────────────┐
│ O instalador cria a base e o utilizador sozinho — não precisa     │
│ de SQL.                                                            │
│ Servidor: PC-RECECAO ou PC-RECECAO\SQLEXPRESS (porta vazia).       │
│ Administrador vazio = usar a conta do Windows com que instala.     │
│                                                                     │
│   Servidor:        [ ELVES-SACAPURI\SQLEXPRESS            ]         │
│   Porta:           [                                      ]         │
│   Base a criar:    [ mwana_hotelnataniel                  ]         │
│   Administrador:   [                                      ]         │
│   Password admin:  [                                      ]         │
│                                                                     │
│                                     [ Anterior ]  [ Seguinte ]      │
└─────────────────────────────────────────────────────────────────────┘
```

| Campo | O que escrever |
|---|---|
| **Servidor** | `NOME-DO-PC` se for a instância por omissão; `NOME-DO-PC\SQLEXPRESS` se for nomeada. No próprio computador, `localhost`. |
| **Porta** | **Deixe vazia** numa instância nomeada — quem a resolve é o SQL Browser. Só preencha (`1433`) se o servidor estiver noutra máquina com porta fixa. |
| **Base a criar** | O nome que quer dar à base desta casa. Se já existir, é usada tal como está. |
| **Administrador** | Uma conta que possa criar bases (o `sa`, ou outra). **Deixe vazio** para usar a conta do Windows com que está a instalar — é o mais simples, e não guarda password nenhuma. |
| **Password admin** | A do administrador. Fica vazia se o campo acima ficou vazio. |

> O instalador usa estas credenciais **uma vez**, para criar a base e o
> utilizador da casa, e esquece-as. No `.env` fica o utilizador da aplicação,
> com uma password gerada que ninguém escreve nem dita.

O resto da instalação segue igual. No fim, o configurador cria as tabelas todas
na base que indicou.

---

# B · POSTGRESQL

## B1. Instalar o PostgreSQL (se a casa ainda não tiver)

1. Procure por *"PostgreSQL download Windows"* — o instalador é o da EDB.
2. Escolha a versão **16** ou superior.
3. Durante a instalação pede uma **password para o utilizador `postgres`** —
   **anote-a**, é a password de administração do servidor.
4. **Porta**: deixe **5432**.
5. No fim, instala também o **pgAdmin**, que é por onde se cria a base.

## B2. A base e o utilizador — **o instalador cria-os sozinho**

**Não precisa de abrir o pgAdmin nem de escrever SQL.** Indique no instalador o
utilizador **`postgres`** e a password que definiu no ponto B1; ele cria a base,
cria um utilizador só para ela com password gerada, e dá-lhe as permissões.

Trata também de uma armadilha do PostgreSQL 15 e posteriores: desde essa versão,
**ser dono da base já não chega para criar tabelas no esquema `public` dela**.
Quem cria a base à mão esbarra num `permission denied for schema public` numa
base de que o utilizador *é* dono — e não percebe porquê. O instalador acerta
isso sozinho.

<details>
<summary>Se a casa <b>exigir</b> que seja o informático dela a criar a base</summary>

```sql
CREATE USER mwana_hotelnataniel WITH PASSWORD 'UMA-PASSWORD-FORTE';
CREATE DATABASE mwana_hotelnataniel
    OWNER mwana_hotelnataniel ENCODING 'UTF8';
GRANT ALL PRIVILEGES ON DATABASE mwana_hotelnataniel TO mwana_hotelnataniel;
-- PostgreSQL 15+: sem isto, o dono da base não cria tabelas nela.
\c mwana_hotelnataniel
GRANT ALL ON SCHEMA public TO mwana_hotelnataniel;
ALTER SCHEMA public OWNER TO mwana_hotelnataniel;
```
</details>

## B3. Deixar o servidor aceitar ligações

Só é preciso quando o PostgreSQL **não** está no mesmo computador onde o sistema
vai correr:

1. No ficheiro `postgresql.conf` (pasta `data` da instalação):
   `listen_addresses = '*'`
2. No ficheiro `pg_hba.conf`, acrescentar a rede da casa:
   ```
   host    mwana_hotelnataniel    mwana_hotelnataniel    192.168.1.0/24    scram-sha-256
   ```
3. Reiniciar o serviço **postgresql**.
4. **Firewall**: abrir a porta **5432**.

## B4. No instalador do Mwana Lodge

No passo **Base de Dados**, escolha a terceira opção:

```
┌─ Ligação ao PostgreSQL ───────────────────────────────────────────┐
│ O instalador cria a base e o utilizador sozinho — não precisa     │
│ de SQL.                                                            │
│ Administrador: o utilizador "postgres" e a password definida       │
│ quando o PostgreSQL foi instalado.                                 │
│                                                                     │
│   Servidor:        [ localhost                            ]         │
│   Porta:           [ 5432                                 ]         │
│   Base a criar:    [ mwana_hotelnataniel                  ]         │
│   Administrador:   [ postgres                             ]         │
│   Password admin:  [ ••••••••••••                         ]         │
│                                                                     │
│                                     [ Anterior ]  [ Seguinte ]      │
└─────────────────────────────────────────────────────────────────────┘
```

| Campo | O que escrever |
|---|---|
| **Servidor** | `localhost` se for no mesmo computador; senão o IP ou o nome da máquina. |
| **Porta** | `5432`. |
| **Base a criar** | O nome que quer dar à base desta casa. |
| **Administrador** | `postgres` — **obrigatório**. No PostgreSQL não existe "conta do Windows". |
| **Password admin** | A que foi definida quando o PostgreSQL foi instalado (ponto B1). |

---

# C · Depois de instalar — confirmar que ficou mesmo naquela base

Na máquina do cliente, abra `C:\Mwana Lodge\app\.env` (ou a pasta onde instalou)
e confirme as linhas:

```
DB_ENGINE=mssql                 # ou postgresql, ou nenhuma linha DB_ENGINE (SQLite)
DB_HOST=ELVES-SACAPURI\SQLEXPRESS
DB_NAME=mwana_hotelnataniel
DB_USER=mwana_hotelnataniel
```

E a prova que não deixa dúvida — **as tabelas estão lá**:

```sql
-- SQL Server, no SSMS:
USE mwana_hotelnataniel;
SELECT COUNT(*) AS tabelas FROM sys.tables;    -- centenas, não zero
```

```sql
-- PostgreSQL, no pgAdmin:
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';
```

Se der zero, a instalação criou as tabelas noutro sítio — quase sempre porque o
nome da base estava trocado.

---

# D · Erros que vai encontrar, e o que querem dizer

| O que aparece | O que é | O que fazer |
|---|---|---|
| *"Falta o driver ODBC da Microsoft"* | O instalador verificou e não o encontrou | Instalar o ODBC Driver 18 (ponto A2) e voltar a correr |
| `Login failed for user` | Password errada, ou o servidor não está em Modo Misto | Ponto A4.3 |
| `server was not found or was not accessible` | Nome da instância errado, TCP/IP desligado ou SQL Browser parado | Pontos A4.1 e A4.2 |
| `certificate chain was issued by an authority that is not trusted` | O Driver 18 exige ligação cifrada | Já está tratado: o sistema liga com `TrustServerCertificate=yes`. Se aparecer, é porque alguém mexeu no `.env` |
| `password authentication failed` (PostgreSQL) | Password errada ou `pg_hba.conf` sem a linha da rede | Ponto B3.2 |
| `could not connect to server` (PostgreSQL) | Serviço parado, firewall, ou `listen_addresses` | Ponto B3 |

---

# O · Se a casa NÃO tiver servidor nenhum

É o caso mais frequente numa casa que nunca teve sistema. O instalador **deteta
isso sozinho** — procura o SQL Server e o PostgreSQL no registo da máquina — e,
se não encontrar nenhum, mostra este ecrã em vez de deixar o técnico encalhado:

```
┌─ Servidor de base de dados ───────────────────────────────────────┐
│ Esta máquina não tem o servidor escolhido                         │
│ O que quer fazer?                                                  │
│                                                                     │
│  (•) Instalar agora o servidor nesta máquina (descarrega da        │
│      Internet)                                                      │
│  ( ) O servidor está NOUTRO computador — continuar e indicar o     │
│      endereço                                                       │
│  ( ) Usar a base de dados local (SQLite) — sem servidor,           │
│      recomendado                                                    │
│                                                                     │
│                                     [ Anterior ]  [ Seguinte ]      │
└─────────────────────────────────────────────────────────────────────┘
```

**A escolha é do cliente, e as três funcionam.** Há casas que querem mesmo o
servidor — porque já têm quem o administre, ou porque é a política da empresa —
e há quem só precise que o sistema funcione.

## O1. "Instalar agora o servidor nesta máquina"

O instalador descarrega da fonte oficial (Microsoft para o SQL Server Express,
EnterpriseDB para o PostgreSQL) e instala em silêncio. Depois **sabe onde está
o servidor que ele próprio montou**: preenche o endereço, a instância e as
credenciais sozinho, e continua a instalação normalmente.

| | SQL Server Express | PostgreSQL 16 |
|---|---|---|
| Descarga | ~6 MB (traz o resto durante a instalação) | ~350 MB |
| Autenticação | **Windows** — sem password nenhuma no processo | Password de superutilizador, **gerada pelo instalador** |
| Limites | 10 GB por base, 1 GB de RAM | sem limites |

> **No PostgreSQL, anote a password que aparece no fim.** É a chave de
> administração daquele servidor para sempre. Fica também em
> `POSTGRESQL-ADMIN.txt`, na pasta do programa. O sistema não precisa dela para
> funcionar — usa um utilizador próprio —, mas sem ela ninguém administra o
> servidor.

**Precisa de Internet na casa do cliente, nesse momento.** Se a descarga
falhar, o instalador diz-o e deixa voltar atrás para escolher outra das três
saídas — não encalha.

## O2. "O servidor está noutro computador"

Segue para o ecrã da ligação normal (pontos A5 ou B4). É o caso da casa que tem
o servidor numa máquina à parte.

## O3. "Usar a base de dados local (SQLite)"

Sem servidor nenhum. É a opção recomendada para uma casa com um servidor e meia
dúzia de terminais: guarda as vendas, os documentos fiscais e a contabilidade
inteira, e não deixa um segundo servidor para alguém administrar.

Mudar para SQL Server ou PostgreSQL mais tarde é possível — ver a secção E.

---

# E · Mudar de base de dados depois de instalado

Não é preciso reinstalar. Na máquina do cliente:

1. Parar os serviços do Mwana Lodge.
2. Editar `app\.env` com os dados da base nova.
3. `python manage.py migrate` para criar as tabelas na base nova.
4. Arrancar os serviços.

> **Isto cria uma base VAZIA — não leva os dados da antiga.** Mover os dados de
> um motor para outro (SQLite → SQL Server, por exemplo) é uma migração a
> sério, com exportação e importação, e faz-se com a casa parada. Não é um
> passo de instalação.
