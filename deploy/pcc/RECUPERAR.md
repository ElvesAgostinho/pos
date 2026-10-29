# Recuperar o PCC — o que fazer quando se perde a VPS

Este ficheiro responde a uma pergunta só: **se a VPS desaparecer agora, como é
que o PCC volta?** Está escrito para ser seguido num dia mau, por isso é por
passos e sem rodeios.

O PCC guarda as licenças de todos os clientes e a chave que as assina. Perder
isso não é perder um servidor — é perder a capacidade de emitir e renovar
licenças. Vale a pena ler isto antes de ser preciso.

---

## O que está guardado, e onde (verificado a 2026-10-29)

| O quê | Quando | Onde fica |
|---|---|---|
| Base `mwana_pcc` (`pg_dump`) | diária, 02:00, 14 dias de retenção | `/etc/easypanel/backups/top_n8n/pcc-db/` |
| Volume `pcc-dados` (leva a `private.pem`) | domingo, 03:41 | `/etc/easypanel/backups/mwana-pcc/volume-dados/` |

> **Os dois ficam na MESMA VPS.** O destino configurado é o "Local Disk" do
> EasyPanel. Isso protege do que acontece mais vezes — um redeploy mau, um
> volume apagado por engano, uma base corrompida. **Não protege de perder a
> VPS**, que é o cenário deste ficheiro. Ver "Passo 0".

## O que NÃO está em cópia nenhuma

Três coisas vivem fora da base e fora do volume, na configuração do próprio
EasyPanel — e desaparecem com a VPS:

1. **As variáveis de ambiente do serviço** (`DJANGO_SECRET_KEY`, `DB_PASSWORD`,
   `DJANGO_ALLOWED_HOSTS`, …). Nenhuma é insubstituível: a `SECRET_KEY` nova só
   obriga a voltar a entrar na consola, e a password da base define-se de novo.
   Mas sem as ter à mão, o arranque é por tentativas.
2. **O domínio e o certificado.** Recriam-se.
3. **A ligação ao GitHub** (a chave de deploy do EasyPanel). Recria-se.

Guardar uma cópia do painel de variáveis num gestor de senhas poupa uma hora no
dia mau.

---

## Passo 0 — o que fazer HOJE, não no dia mau

Enquanto as cópias só existirem na VPS, este manual não serve para o cenário que
descreve. Duas formas de resolver, por ordem de simplicidade:

**(a) Um destino fora da VPS, no painel.** `Settings > Storage Providers` aceita
SFTP, Dropbox ou Google Drive. Depois de criado, basta trocar o destino nos dois
trabalhos de cópia (`Backups` de cada serviço). É a forma que fica a funcionar
sozinha — e é a recomendada.

**(b) Puxar as cópias para fora à mão, de vez em quando.** Do computador, com
acesso SSH à VPS:

```bash
scp -r root@SEU_IP:/etc/easypanel/backups/top_n8n/pcc-db        ./pcc-base-$(date +%F)
scp -r root@SEU_IP:/etc/easypanel/backups/mwana-pcc/volume-dados ./pcc-volume-$(date +%F)
```

A segunda pasta leva a `private.pem`. **Guarde uma cópia dela offline também** —
num gestor de senhas ou numa pen encriptada. É o único segredo do sistema que
não se regenera: sem ela, nenhuma licença nova pode ser assinada, e as que já
foram emitidas deixam de poder ser renovadas.

---

## Recuperação completa, numa VPS nova

### 1. EasyPanel e os dois serviços

Instalar o EasyPanel, criar o projecto (ex.: `top_n8n`) e dentro dele:

- **`pcc-db`** — `Add Service > Database > Postgres`. Guardar o nome da base, o
  utilizador e a password que o painel mostra.
- **`pcc`** — `Add Service > App`, com:
  - **Source**: GitHub, `ElvesAgostinho/pos`, ramo `main`
  - **Build**: `Dockerfile`, ficheiro `deploy/pcc/Dockerfile`, contexto na raiz
  - **Mounts**: volume em `/app/dados`
  - **Environment**: as variáveis do `.env.example` ao lado, com
    `DB_HOST = <projecto>_pcc-db` (o nome interno do serviço Postgres)
  - **Domains**: o domínio, com HTTPS

Fazer o primeiro deploy. Vai arrancar com a base vazia — é o esperado.

### 2. Pôr as cópias ao alcance do painel

Copiar as duas pastas guardadas (Passo 0) para o destino de armazenamento da VPS
nova — em `/etc/easypanel/backups/`, se o destino for o "Local Disk".

### 3. Restaurar a base de dados

No painel: serviço **`pcc-db` > Backups > Restore**, escolher o ficheiro do dump.

Pela API, se for mais prático (o mesmo que o botão faz):

```
POST /api/trpc/databaseBackups.restoreDatabaseBackup
Authorization: Bearer <token de auth.login>
{"json":{"projectName":"top_n8n","serviceName":"pcc-db",
         "databaseName":"mwana_pcc",
         "storageProviderId":"<id em storageProviders.common.list>",
         "path":"<caminho do ficheiro no destino>"}}
```

### 4. Repor a chave de licenciamento

A `private.pem` **tem de ir para o volume à mão** — não está na base de dados.
No Terminal do serviço `pcc`:

```bash
mkdir -p /app/dados/keys
# colar o conteúdo da chave:
nano /app/dados/keys/private.pem
chmod 600 /app/dados/keys/private.pem
ls -la /app/dados/keys/
```

O resto do volume (logótipos, imagens carregadas) restaura-se do backup do
volume, ou recria-se com algum incómodo.

### 5. Confirmar, antes de dizer que está feito

```bash
curl -s https://SEU_DOMINIO/                          # 200, serve a consola
curl -s https://SEU_DOMINIO/api/clm/releases/latest/  # 401 (existe e exige auth)
```

E na consola, com sessão iniciada: a lista de clientes tem de ter todos, e
**emitir uma licença de ensaio** para um cliente de teste — é o único teste que
prova que a `private.pem` está no sítio certo e a funcionar. Sem esse passo, só
se sabe que o site abre.

### 6. O que os clientes sentem, e o que fazer

Uma instalação de cliente a trabalhar **não para** quando o PCC está em baixo: a
licença dela está no ficheiro local e na base dela. O que para enquanto o PCC
não voltar é renovar, activar uma instalação nova e publicar actualizações.

Se o domínio do PCC mudar, as instalações existentes continuam a apontar para o
antigo (`instalador/pcc_url.txt`, fixado no instalador de cada cliente). Nesse
caso, ou se mantém o domínio, ou cada cliente precisa de uma actualização com o
endereço novo. **Manter o domínio é muito mais barato do que mudá-lo.**
