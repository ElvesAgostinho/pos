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

# SQLITE_PATH APONTA PARA O VOLUME, e é uma rede de segurança, não o plano.
#
# O plano é PostgreSQL (ver .env.example): o PCC é o registo central de TODOS os
# clientes. Mas se o `DB_ENGINE` faltar na configuração do painel, o Django cai
# em SQLite — e sem esta linha a base nascia em `/app/db.sqlite3`, dentro da
# imagem. Arrancava, funcionava, e o PRIMEIRO REDEPLOY apagava as licenças, os
# clientes e as chaves AGT todas, sem erro nenhum pelo caminho. Uma perda de
# dados silenciosa não pode depender de alguém se lembrar de uma variável.
ENV SYSTEM_MODE=PCC \
    MWANA_WEBAPP=/app/webapp \
    SQLITE_PATH=/app/dados/pcc.sqlite3 \
    DJANGO_MEDIA_ROOT=/app/dados/media \
    DJANGO_STATIC_ROOT=/app/dados/staticfiles \
    LICENSING_KEYS_DIR=/app/dados/keys

EXPOSE 8000

# O ARRANQUE VIVE NUM GUIÃO PRÓPRIO (deploy/pcc/arrancar.sh), e não numa linha
# de CMD com "&&" encadeados.
#
# A ordem é a mesma e a regra também: migrar, recolher os estáticos, criar o
# primeiro administrador se as variáveis estiverem lá, e só então servir. Se as
# migrações falham, NÃO se serve — um servidor de licenças com a base a meio é
# pior do que um servidor em baixo.
#
# O que muda é o que fica para trás quando corre mal. Numa linha de CMD, a
# mensagem de erro do Django vai para o stdout de um contentor que morre a
# seguir; depois de um redeploy ou sem histórico no painel, não há nada
# para ler, e um ciclo de reinícios passa a ser um mistério. O guião escreve
# tudo em /app/dados/logs/arranque.log, que está no volume persistente e
# sobrevive à morte do contentor.
COPY deploy/pcc/arrancar.sh /app/arrancar.sh
# Normaliza os fins de linha: o ficheiro e editado em Windows, e um \r no fim
# do "#!/bin/sh" faz o contentor morrer com "no such file or directory" — o erro
# mais enganador que há, porque o ficheiro ESTÁ lá.
RUN sed -i 's/\r$//' /app/arrancar.sh && chmod +x /app/arrancar.sh

CMD ["/app/arrancar.sh"]
