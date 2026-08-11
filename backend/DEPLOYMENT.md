# Deployment — Produção (hotel / instalação local)

O mesmo código serve **dev** (SQLite, DEBUG) e **produção** (PostgreSQL, seguro).
Tudo é controlado por **variáveis de ambiente** — ver `.env.example`.

## 1. Pré-requisitos no servidor
- Python 3.12+, PostgreSQL 14+
- `pip install -r requirements.txt` (inclui psycopg, waitress/gunicorn, whitenoise)

## 2. Variáveis de ambiente (`.env`)
Mínimo para produção:
```
DJANGO_SECRET_KEY=<segredo forte>        # python -c "import secrets;print(secrets.token_urlsafe(50))"
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=erp.hotelx.ao,192.168.1.10
DJANGO_CORS_ORIGINS=https://erp.hotelx.ao
DB_ENGINE=postgresql
DB_NAME=erp_2026
DB_USER=erp
DB_PASSWORD=<senha forte>
DB_HOST=localhost
DB_PORT=5432
```

## 3. Base de dados
```
createdb erp_2026            # ou via pgAdmin
python manage.py migrate
python manage.py seed_demo   # dados demo (opcional)
python manage.py seed_fiscal # catálogo fiscal AGT
python manage.py collectstatic --noinput
```

## 4. Servir (WSGI)
- **Windows:** `waitress-serve --port=8000 erp_server.wsgi:application`
- **Linux:** `gunicorn erp_server.wsgi:application --bind 0.0.0.0:8000 --workers 3`
- Atrás de **nginx/IIS** com HTTPS (o Django já ativa SSL redirect/HSTS/cookies seguros quando `DEBUG=False`).

## 5. Segurança (automática quando DEBUG=False)
CORS restrito às origens configuradas · SSL redirect · HSTS 1 ano · cookies Secure ·
X-Frame DENY · nosniff · `SECURE_PROXY_SSL_HEADER` (para proxy). O SECRET_KEY do dev
dispara um aviso — **usar sempre um segredo próprio**.

## 6. Frontend
`cd frontend && npm ci && npm run build` → servir `frontend/dist` (nginx) ou integrar.
Apontar a API base (`frontend/src/api/client.ts`) para o domínio do ERP em produção.
Modelo pronto a copiar: `deploy/nginx-erp.conf` (proxy para o gunicorn, `/static/`
`/media/` diretos, SPA com fallback a `index.html`). Não confundir com
`deploy/pcc/nginx-pcc.conf` — esse é só do console do vendedor, restrito por VPN.

## 6b. Fila de fundo (Celery) — embutida, sem Redis
Em produção (`DEBUG=False`) há sempre fila real, sem precisar de Redis nem de
nenhuma configuração extra: o Celery usa a PRÓPRIA base de dados como fila
(transporte SQLAlchemy do Kombu) — SQLite ganha um ficheiro dedicado ao lado do
seu (`fila_celery.sqlite3`, nunca o mesmo ficheiro do `db.sqlite3`), PostgreSQL
usa a mesma base já configurada. `REDIS_URL` continua a existir como override
avançado (melhor desempenho a escala muito grande), mas deixou de ser preciso
para ter fila a sério — é só para quem já tiver um Redis dedicado e quiser usá-lo.

Correr o worker (obrigatório em produção — sem ele, e-mail/SAF-T/AGT ficam em
fila mas não avançam):
```
celery -A erp_server worker -B -l info          # Linux (o -B embute o agendador)
python -m celery -A erp_server worker -B -l info --pool=solo   # Windows
```
No instalador Windows, o `servicos\celery.exe` (WinSW, mesmo padrão do
`servidor.xml`) é um TERCEIRO serviço, instalado e arrancado automaticamente pelo
`setup.iss` em toda e qualquer instalação — tal como o Servidor e a Impressão,
sem pergunta nenhuma no assistente.
A fila da AGT (`agt_worker`) corre sozinha a cada 30s via Celery Beat enquanto o
worker está de pé; o comando `python manage.py agt_worker` continua a existir à
parte (cron, ou depuração manual).

Em desenvolvimento (`DEBUG=True`, sem `REDIS_URL`), fica em modo eager: as
tarefas correm na hora, dentro do próprio pedido — nenhum worker é preciso para
testar localmente.

## 7. Backups
Agendar `pg_dump erp_2026` diário. O arquivo fiscal (documentos assinados) é imutável — nunca apagar.

## Pendente para certificação legal (Angola)
Integração AGT **real** (nº de validação + comunicação em tempo real) — ver Fiscal Connectivity Center.
