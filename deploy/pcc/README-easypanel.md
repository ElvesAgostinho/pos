# Pôr o PCC no ar via EasyPanel (Hostinger VPS)

Isto é a via alternativa ao `README.md` ao lado (que é para uma VPS "nua", por
SSH). No EasyPanel não se mexe em nginx nem em systemd à mão — o painel trata
do domínio, do HTTPS e do reinício automático; nós só precisamos de dar-lhe um
**Dockerfile** que sabe compilar e correr o PCC sozinho.

## O que já está pronto no repositório

- `deploy/pcc/Dockerfile` — imagem única: compila o `frontend_pcc` e depois
  corre o backend Django (gunicorn) a servi-lo, exatamente como o serviço do
  Windows faz na instalação do cliente. Não precisa de nginx dentro do
  contentor — o Django serve os estáticos sozinho (`whitenoise`).
- `.dockerignore` (raiz do repo) — nunca leva segredos (`.env`, chaves,
  `db.sqlite3`) nem `node_modules`/`venv` para dentro da imagem.
- `core/pcc_access.py` — a versão "dentro da app" do que o nginx fazia com
  `allow/deny`: restringe a consola a uma lista de IPs (variável
  `PCC_ALLOWED_IPS`), sem precisar de VPN nem de nginx próprio. Sem essa
  variável definida, não bloqueia nada — a consola continua protegida por
  login (todos os ecrãs exigem `IsAdminUser`), só falta esta camada extra.

## Passo a passo no EasyPanel

### 1. Criar a base de dados

No projeto do EasyPanel: **+ Service → Database → PostgreSQL**.
Nome sugerido: `pcc-db`. Guarde a password que o EasyPanel gerar (ou defina a
sua) — vai precisar dela no passo 3.

### 2. Criar o serviço da aplicação

**+ Service → App**, e escolha a origem:

- **Git repository**: aponte para o seu repositório (GitHub/GitLab — pode ser
  privado, o EasyPanel pede as credenciais na primeira vez), branch `main`.
- **Build**: método **Dockerfile**.
  - Caminho do Dockerfile: `deploy/pcc/Dockerfile`
  - Contexto de build: raiz do repositório (`/`) — o Dockerfile precisa de
    `backend/` e `frontend_pcc/` ao mesmo tempo, por isso o contexto NÃO pode
    ser só a pasta `deploy/pcc`.
- **Porta**: `8000` (é a que o `EXPOSE` do Dockerfile declara; o EasyPanel liga
  o Traefik dele a esta porta sozinho).

### 3. Variáveis de ambiente

Na aba **Environment** do serviço da app, copie o `deploy/pcc/.env.example` e
preencha a sério:

```
SYSTEM_MODE=PCC
DJANGO_DEBUG=False
DJANGO_SECRET_KEY=<gere uma chave longa e aleatória — nunca a de exemplo>
DJANGO_ALLOWED_HOSTS=pcc.osseudominio.ao
DJANGO_CORS_ORIGINS=https://pcc.osseudominio.ao

DB_ENGINE=postgresql
DB_HOST=pcc-db          # o NOME do serviço Postgres criado no passo 1
DB_PORT=5432
DB_NAME=<a que o serviço Postgres criou/mostrou>
DB_USER=<idem>
DB_PASSWORD=<idem>

# Só na PRIMEIRA vez (cria o seu utilizador admin sozinho, sem terminal):
DJANGO_SUPERUSER_USERNAME=dono-pcc
DJANGO_SUPERUSER_EMAIL=voce@example.com
DJANGO_SUPERUSER_PASSWORD=<uma password forte, só sua>

# Opcional mas recomendado — o SEU IP (ou uma rede VPN, se um dia montar uma):
PCC_ALLOWED_IPS=<o IP de onde vai administrar o PCC>
```

`DB_HOST=pcc-db` funciona porque o EasyPanel põe todos os serviços do mesmo
projeto na mesma rede Docker interna — resolvem-se pelo nome, sem precisar do
IP. Se tiver dúvidas do nome exato, o ecrã do serviço Postgres mostra a
"internal connection string" — o pedaço antes de `:5432` é o `DB_HOST`.

### 4. Volume persistente (para não perder logótipos/uploads a cada deploy)

Aba **Mounts** (ou "Volumes") do serviço da app: monte um volume persistente em
`/app/dados`. Sem isto, cada redeploy começa com a pasta de uploads vazia.

### 4.1. A CHAVE DE LICENCIAMENTO — passo obrigatório, uma vez só

**Isto é o passo mais importante de todos.** O PCC assina TODAS as licenças
que emite com uma chave privada (`private.pem`). A chave pública que a
verifica do lado do cliente já vem dentro do próprio código (`public.pem`,
está no git). Se o contentor arrancar sem a `private.pem` correspondente, o
PCC não consegue emitir licença nenhuma; e se algum dia gerar uma
`private.pem` NOVA (por engano, ou porque a antiga se perdeu), **todas as
licenças de todos os clientes deixam de validar** — a chave pública que já
está distribuída não bate mais certo com a nova privada.

Essa chave já existe — foi gerada na sua máquina de desenvolvimento, em
`backend/licensing/engine/private.pem` (nunca foi ao git, por isso não vem
com o `git clone`/build). Tem de a copiar, à mão, UMA VEZ, para dentro do
volume persistente do contentor, no caminho `dados/keys/private.pem` (o
Dockerfile já lê daí via `LICENSING_KEYS_DIR=/app/dados/keys`). Duas formas:

- **Terminal do EasyPanel** (aba "Console" do serviço da app, depois do
  primeiro deploy): cole o conteúdo do ficheiro com um editor de texto lá
  dentro (`nano /app/dados/keys/private.pem`), ou
- **SCP direto para o volume**, se souber o caminho dele no disco da VPS
  (o EasyPanel mostra-o nas definições do volume) — copie o ficheiro por
  `scp` de uma vez, fora de qualquer canal partilhado (nunca por e-mail/chat).

Depois de confirmar que o ficheiro lá está (`ls -la /app/dados/keys/` no
Console deve mostrar `private.pem`), reinicie o serviço.

Se um dia precisar MESMO de trocar de chave (compromisso, perda), é uma
operação de rotação a sério — implica reemitir licença a todos os clientes
ativos. Não é um "regenerar" trivial.

### 5. Domínio + HTTPS

Aba **Domains**: adicione `pcc.osseudominio.ao` (ou o domínio/subdomínio que
tiver). Aponte o DNS (registo **A**) desse domínio para o IP da VPS Hostinger,
se ainda não estiver. O EasyPanel emite o certificado Let's Encrypt sozinho —
não precisa de correr `certbot` nenhum.

### 6. Implantar

Botão **Deploy**. Acompanhe os logs de build (primeira vez demora — compila o
frontend e instala as dependências Python). No fim, o contentor arranca,
corre as migrações, cria os estáticos e — se pôs as variáveis
`DJANGO_SUPERUSER_*` — já tem o seu utilizador admin pronto.

### 7. Confirmar

Abra `https://pcc.osseudominio.ao/admin/` e entre com o utilizador/password que
definiu em `DJANGO_SUPERUSER_*`. Depois disso, pode **remover essas três
variáveis** do ambiente (não fazem mal se ficarem — o comando já sabe que o
utilizador existe e não faz nada — mas menos segredos guardados é sempre
melhor).

### 8. Ligar o instalador do cliente a este PCC

Na SUA máquina de build do instalador:

```
echo https://pcc.osseudominio.ao > instalador/pcc_url.txt
```

A partir do próximo `build_instalador.ps1`, os clientes instalados já
apontam "Sincronizar com o PCC" para aqui.

## Atualizar depois da primeira vez

No EasyPanel: **Redeploy** (ou ligue o "auto-deploy on push" nas definições do
serviço, se quiser que cada `git push` para `main` implante sozinho). O
Dockerfile já trata de tudo — migrações, estáticos, nada fica desatualizado.

## Sobre o modelo "só por VPN" do README.md original

Aquele README foi pensado para uma VPS onde você tem SSH root e pode montar
o próprio OpenVPN + nginx com `allow/deny`. No EasyPanel isso não se aplica
(o painel é que serve o domínio) — a proteção equivalente é a
`PCC_ALLOWED_IPS` (passo 3 acima). Se um dia quiser MESMO uma VPN a sério na
frente disto, dá para montar um serviço OpenVPN à parte no EasyPanel (imagem
`kylemanna/openvpn` ou semelhante) e apontar `PCC_ALLOWED_IPS` para a sub-rede
dela — mas isso é opcional, e o login (`IsAdminUser` em tudo) já protege a
consola sozinho enquanto não se faz mais nada.

## Cópias de segurança

Duas coisas diferentes para proteger — o EasyPanel só trata da primeira
automaticamente, a segunda é manual:

### 1. A base de dados (Postgres) — ativar no painel

No serviço **Postgres** (`pcc-db`): aba **Backups** → ativar backups
periódicos (o EasyPanel costuma oferecer diário/semanal e um nº de cópias a
guardar). Isto cobre clientes, licenças, credenciais AGT geradas
(`agt_private_key`/`agt_public_key` na tabela `License` — ficam na base, não
em ficheiro, por isso já vão nesta cópia).

### 2. O volume `/app/dados` — a chave de licenciamento não está na base

`dados/keys/private.pem` (passo 4.1) **não está em lado nenhum a não ser
nesse volume** — não é backup do Postgres que a protege. Se o disco da VPS
morrer sem cópia desta pasta, perde-se a capacidade de emitir/renovar
licenças para sempre (a chave não se recria — ver aviso no passo 4.1).

Prioridade da cópia, da mais para a menos crítica:
1. `dados/keys/private.pem` — irrecuperável se perdida. Guarde uma cópia
   OFFLINE também (um gestor de senhas, uma pen encriptada) — não depender
   só de backups automáticos para o único segredo que não se regenera.
2. `dados/media/` — logótipos e imagens carregadas; recriável a incómodo.
3. `dados/logs/` — descartável, só para diagnóstico.

Forma simples de copiar o volume para fora da VPS de vez em quando (do seu
computador, com acesso SSH à VPS):

```bash
# veja o caminho real do volume nas definições dele no EasyPanel
scp -r root@SEU_IP:/caminho/do/volume/keys ./backup-pcc-keys-$(date +%F)
```

Um backup que só existe na mesma máquina não é backup.
