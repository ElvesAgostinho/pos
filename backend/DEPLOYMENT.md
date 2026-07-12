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

## 7. Backups
Agendar `pg_dump erp_2026` diário. O arquivo fiscal (documentos assinados) é imutável — nunca apagar.

## Pendente para certificação legal (Angola)
Integração AGT **real** (nº de validação + comunicação em tempo real) — ver Fiscal Connectivity Center.
