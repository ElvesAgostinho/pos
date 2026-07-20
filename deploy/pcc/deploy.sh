#!/usr/bin/env bash
# ============================================================================
# PRIMEIRA INSTALAÇÃO DO PCC NUMA VPS NOVA (Ubuntu 22.04/24.04).
#
# Corre-se UMA vez, como root ou com sudo. Para ATUALIZAÇÕES depois disto, ver
# a secção "Atualizar" no README.md ao lado — não é preciso repetir tudo.
# ============================================================================
set -euo pipefail

REPO_URL="${1:?Uso: deploy.sh <url-do-repo-git> [dominio]}"
DOMINIO="${2:-pcc.mwanalodge.ao}"
RAIZ=/opt/mwana-pcc

echo "== 1/8 Pacotes do sistema =="
apt-get update -qq
apt-get install -y python3.12 python3.12-venv python3-pip nodejs npm \
  postgresql nginx certbot python3-certbot-nginx git

echo "== 2/8 Utilizador e pastas =="
id -u mwana &>/dev/null || useradd --system --home "$RAIZ" --shell /usr/sbin/nologin mwana
mkdir -p "$RAIZ"/{app,venv,webapp,dados/staticfiles,dados/media,logs}

echo "== 3/8 Código =="
if [ -d "$RAIZ/app/.git" ]; then
  git -C "$RAIZ/app" pull
else
  git clone "$REPO_URL" "$RAIZ/app"
fi

echo "== 4/8 Python (venv) =="
python3.12 -m venv "$RAIZ/venv"
"$RAIZ/venv/bin/pip" install --upgrade pip
"$RAIZ/venv/bin/pip" install -r "$RAIZ/app/backend/requirements.txt" gunicorn psycopg[binary]

echo "== 5/8 Frontend do PCC (compilado a apontar para /api/ relativo) =="
( cd "$RAIZ/app/frontend_pcc" && npm install && VITE_API_URL=/api/ npm run build )
rm -rf "$RAIZ/webapp"/*
cp -r "$RAIZ/app/frontend_pcc/dist/." "$RAIZ/webapp/"

echo "== 6/8 .env (só na primeira vez — não apaga o que já existir) =="
if [ ! -f "$RAIZ/app/backend/.env" ]; then
  cp "$RAIZ/app/deploy/pcc/.env.example" "$RAIZ/app/backend/.env"
  SECRET=$(python3.12 -c 'import secrets; print(secrets.token_urlsafe(48))')
  sed -i "s#TROQUE-ISTO-por-uma-chave-longa-e-aleatoria-so-sua#$SECRET#" "$RAIZ/app/backend/.env"
  sed -i "s#pcc.mwanalodge.ao#$DOMINIO#" "$RAIZ/app/backend/.env"
  echo "  >> preencha a password da base de dados em $RAIZ/app/backend/.env antes de continuar (DB_PASSWORD)"
  echo "  >> depois corra este script outra vez, ou só os passos 7/8 à mão."
fi

echo "== 7/8 Base de dados + serviço =="
sudo -u mwana "$RAIZ/venv/bin/python" "$RAIZ/app/backend/manage.py" migrate --noinput
sudo -u mwana "$RAIZ/venv/bin/python" "$RAIZ/app/backend/manage.py" collectstatic --noinput
sudo -u mwana "$RAIZ/venv/bin/python" "$RAIZ/app/backend/manage.py" createsuperuser
chown -R mwana:mwana "$RAIZ"

cp "$RAIZ/app/deploy/pcc/mwana-pcc.service" /etc/systemd/system/mwana-pcc.service
sed -i "s#/opt/mwana-pcc/app#$RAIZ/app/backend#" /etc/systemd/system/mwana-pcc.service
systemctl daemon-reload
systemctl enable --now mwana-pcc

echo "== 8/8 nginx + HTTPS =="
cp "$RAIZ/app/deploy/pcc/nginx-pcc.conf" /etc/nginx/sites-available/mwana-pcc
sed -i "s#pcc.mwanalodge.ao#$DOMINIO#g" /etc/nginx/sites-available/mwana-pcc
ln -sf /etc/nginx/sites-available/mwana-pcc /etc/nginx/sites-enabled/mwana-pcc
nginx -t && systemctl reload nginx
certbot --nginx -d "$DOMINIO" --non-interactive --agree-tos -m suporte@mwanalodge.ao || \
  echo "certbot falhou ou já correu — confirme o domínio aponta para esta VPS e corra à mão: certbot --nginx -d $DOMINIO"

echo ""
echo "FEITO. https://$DOMINIO deve estar no ar."
echo "Agora: copie $DOMINIO (com https://) para instalador/pcc_url.txt na sua máquina de build."
