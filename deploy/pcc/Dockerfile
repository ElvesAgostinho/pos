# ============================================================================
# PCC — imagem única (Docker) para correr num painel como o EasyPanel.
#
# Mesma ideia do instalador do cliente: UM processo serve a API e o site
# compilado (ver erp_server/urls.py — MWANA_WEBAPP). Aqui não há nginx nem
# systemd: o painel (EasyPanel/Traefik) trata do domínio e do HTTPS; este
# contentor só precisa de responder em 0.0.0.0:8000.
#
# Contexto de build: a RAIZ do repositório (precisa de backend/ e frontend_pcc/
# ao mesmo tempo). No EasyPanel: "Build > Dockerfile path" = deploy/pcc/Dockerfile,
# "Build context" = raiz do repo (o valor por omissão já costuma ser esse).
# ============================================================================

# ---------- 1) compilar o frontend_pcc ----------
FROM node:20-alpine AS frontend
WORKDIR /src/frontend_pcc
COPY frontend_pcc/package.json frontend_pcc/package-lock.json ./
RUN npm ci
COPY frontend_pcc/ ./
# /api/ relativo: funciona com qualquer domínio que o painel atribuir, sem
# recompilar se o domínio mudar.
RUN VITE_API_URL=/api/ npm run build

# ---------- 2) backend Python + o site compilado ----------
FROM python:3.12-slim AS backend
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

# libpq-dev/gcc só para compilar o psycopg se não houver wheel binário; fica
# tudo no mesmo stage (imagem final maior, mas simples — sem stage extra de
# runtime a duplicar dependências do sistema).
RUN apt-get update && apt-get install -y --no-install-recommends \
      gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY --from=frontend /src/frontend_pcc/dist ./webapp

# Dados que sobrevivem a um redeploy (o EasyPanel monta aqui um volume persistente).
# /app/dados/keys leva a private.pem do licenciamento — TEM de ser copiada para
# lá manualmente na primeira vez (ver README-easypanel.md, secção "chave de
# licenciamento"). Sem ela no volume, cada redeploy destruiria a chave.
RUN mkdir -p /app/dados/media /app/dados/staticfiles /app/dados/logs /app/dados/keys

ENV SYSTEM_MODE=PCC \
    MWANA_WEBAPP=/app/webapp \
    DJANGO_MEDIA_ROOT=/app/dados/media \
    DJANGO_STATIC_ROOT=/app/dados/staticfiles \
    LICENSING_KEYS_DIR=/app/dados/keys

EXPOSE 8000

# migrate + collectstatic a cada arranque: idempotente (mesma lógica do
# configurar.py do instalador do cliente) — um redeploy nunca deixa a base
# desatualizada em relação ao código. Se DJANGO_SUPERUSER_* estiver definida,
# cria o primeiro admin sozinho (Django trata disto nativamente com --noinput);
# nos arranques seguintes o utilizador já existe e o comando falha em silêncio
# (|| true) — não há consola interativa num contentor, por isso não se pode
# contar com "createsuperuser" à mão na primeira vez.
CMD ["sh", "-c", "python manage.py migrate --noinput && python manage.py collectstatic --noinput && (python manage.py createsuperuser --noinput || true) && gunicorn erp_server.wsgi:application --bind 0.0.0.0:8000 --workers 3 --timeout 60 --access-logfile - --error-logfile -"]
