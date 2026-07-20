# Pôr o PCC numa VPS a sério

O PCC é o SEU sistema — a consola onde emites licenças, geras as senhas de
instalação/dono, e para onde os clientes sincronizam (certificação AGT, ligação
e-fatura, renovações). Hoje só corre na sua máquina, por isso tem de me pedir
para o pôr no ar. Isto resolve isso: um servidor **seu**, sempre ligado, com o
seu domínio, que só você administra.

## O que vai acontecer, em uma frase

Uma VPS Linux (Ubuntu) corre o backend Django (gunicorn) e serve o `frontend_pcc`
compilado, atrás de nginx com HTTPS — **exatamente o mesmo mecanismo** que já usa
para instalar o sistema no cliente (Django a servir a SPA compilada), só que numa
VPS com nginx e certificado em vez do serviço do Windows.

## Antes de começar

1. **Uma VPS** — qualquer fornecedor serve (DigitalOcean, Hetzner, Vultr, AWS
   Lightsail…). Mínimo razoável: 1 vCPU, 2 GB RAM, Ubuntu 22.04 ou 24.04.
   Isto não é o sistema do cliente (esse fica na casa dele) — é só a SUA consola
   e o registo de licenças; não precisa de ser grande.
2. **Um domínio** (ou subdomínio) — ex. `pcc.mwanalodge.ao` — apontado por um
   registo DNS **A** para o IP da VPS. Sem domínio não há HTTPS a sério (o
   certbot precisa de um nome para validar).
3. **Acesso SSH** à VPS como root (ou um utilizador com sudo).

## Instalar (a primeira vez)

Por SSH, na VPS:

```bash
git clone https://github.com/o-seu-repo/pos.git /tmp/mwana-clone
sudo bash /tmp/mwana-clone/deploy/pcc/deploy.sh https://github.com/o-seu-repo/pos.git pcc.mwanalodge.ao
```

O script (`deploy.sh`) faz tudo: instala Python/Node/Postgres/nginx, clona o
código para `/opt/mwana-pcc`, compila o `frontend_pcc` já a apontar para `/api/`
(caminho relativo — funciona com qualquer domínio), cria a base de dados,
regista o serviço systemd, configura o nginx e pede o certificado HTTPS ao
Let's Encrypt. No meio, pede para preencher a password da base de dados e para
criar o PRIMEIRO utilizador administrador do PCC (`createsuperuser` — este é
seu, pessoal, diferente das contas "dono" que geras para os clientes).

No fim: `https://pcc.mwanalodge.ao` está no ar. **Copie esse endereço para
`instalador/pcc_url.txt`** na sua máquina de build — é isso que faz
"Sincronizar com o PCC" funcionar nos clientes a partir de agora.

## Atualizar (depois da primeira vez)

```bash
cd /opt/mwana-pcc/app
sudo -u mwana git pull
sudo -u mwana /opt/mwana-pcc/venv/bin/pip install -r backend/requirements.txt
sudo -u mwana /opt/mwana-pcc/venv/bin/python backend/manage.py migrate --noinput
cd frontend_pcc && sudo -u mwana bash -c "npm install && VITE_API_URL=/api/ npm run build"
sudo rm -rf /opt/mwana-pcc/webapp/* && sudo cp -r dist/. /opt/mwana-pcc/webapp/
sudo systemctl restart mwana-pcc
```

## A página do Django Admin (`/admin/`)

Continua lá — é um escape hatch genuíno (corrigir um registo à mão numa
emergência) e não vale a pena tirá-lo. Mas **não a deixe exposta ao público**:
o `nginx-pcc.conf` já está pronto para isso — a forma correta não é mudar o
URL (segurança por obscuridade não protege nada a sério), é **restringir por
IP ou por VPN**. Acrescente ao bloco `location /` do nginx, antes do
`proxy_pass`, algo como:

```nginx
location /admin/ {
    allow SEU.IP.DE.CASA;      # ou a sub-rede da VPN (ver abaixo)
    deny all;
    proxy_pass http://unix:/run/mwana-pcc.sock;
    proxy_set_header Host $host;
}
```

E, já agora: a conta que criou com `createsuperuser` deve ter uma password
forte e só sua — é a chave-mestra de todo o PCC.

## VPN (para a sincronização com os clientes, opcional mas recomendado)

O `PCC_URL` de cada cliente pode apontar para o domínio público com HTTPS
(simples, funciona já) — **ou**, se quiser um nível a mais de controlo (só a
VPS e as instalações que você autorizou é que se falam, nunca a internet
pública), monte uma VPN **WireGuard** entre a VPS e cada instalação:

1. Na VPS: `apt install wireguard`, gera um par de chaves, cria `wg0` com um IP
   privado (ex. `10.66.0.1/24`).
2. Em cada cliente: instala o cliente WireGuard, entra na mesma rede privada
   (ex. `10.66.0.2/24`), aponta `PCC_URL=https://10.66.0.1` (ou um nome interno).
3. O nginx da VPS passa a só aceitar ligações da interface `wg0` para as rotas
   de sincronização, se quiser ir a esse ponto.

Isto é mais trabalho por cliente (cada instalação precisa do túnel a correr) —
para começar, HTTPS público com domínio + a restrição de IP no `/admin/` já dá
uma proteção séria. Fica documentado para quando quiser subir o nível.

## Cópias de segurança

O PCC guarda dados que não pode perder (licenças, chaves de assinatura AGT,
senhas cifradas de todos os clientes). Configure um `pg_dump` diário:

```bash
# /etc/cron.d/mwana-pcc-backup
0 3 * * * mwana pg_dump mwana_pcc | gzip > /opt/mwana-pcc/dados/backups/$(date +\%F).sql.gz
```

E copie essa pasta de backups para fora da VPS de vez em quando (um bucket S3,
outro servidor) — um backup que só existe na mesma máquina não é backup.
