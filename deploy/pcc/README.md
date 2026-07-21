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

## A consola do PCC — só por VPN (como já fazes com o sistema do teu amigo)

O `nginx-pcc.conf` já vem assim de propósito: a consola inteira (login, Gestão
de Clientes, Wizard, e o `/admin/` do Django) **só responde a quem está ligado
por OpenVPN** — de fora, nem o ecrã de login se vê, é "connection refused".
A ÚNICA porta aberta ao público é a chamada que as instalações dos clientes
fazem sozinhas para sincronizar (`/api/clm/licenses/latest/`) — essa continua
por HTTPS normal, sem VPN nenhuma do lado deles (decisão já tomada: só o TEU
acesso pessoal fica atrás da VPN, os clientes não precisam de correr nada extra).

Para montar essa VPN na VPS:

```bash
sudo bash deploy/pcc/setup-vpn.sh
```

Usa o [openvpn-install](https://github.com/angristan/openvpn-install) (o
instalador comunitário mais usado para isto — não vale a pena escrever um de
raiz) e no fim entrega um ficheiro `.ovpn` para importar na app **OpenVPN
Connect** (a mesma que já usas). A partir daí, `https://pcc.mwanalodge.ao` só
abre com a VPN ligada. Para dar acesso a outro técnico mais tarde, corra o
mesmo `openvpn-install.sh` outra vez — tem um menu "Add a new user".

Já agora: a conta que criou com `createsuperuser` deve ter uma password forte
e só sua — é a chave-mestra de todo o PCC, mesmo estando atrás da VPN.

## Cópias de segurança

O PCC guarda dados que não pode perder (licenças, chaves de assinatura AGT,
senhas cifradas de todos os clientes). Configure um `pg_dump` diário:

```bash
# /etc/cron.d/mwana-pcc-backup
0 3 * * * mwana pg_dump mwana_pcc | gzip > /opt/mwana-pcc/dados/backups/$(date +\%F).sql.gz
```

E copie essa pasta de backups para fora da VPS de vez em quando (um bucket S3,
outro servidor) — um backup que só existe na mesma máquina não é backup.
