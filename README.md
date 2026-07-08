# POS / Hospitality ERP

ERP modular para hotelaria (F&B / POS) com ativação de módulos por licença.

- **Backend:** Django 6 + Django REST Framework (autenticação JWT), SQLite em desenvolvimento.
- **Frontend:** React 19 + Vite + Tailwind (`frontend/`), com um segundo frontend para o Platform Control Center (`frontend_pcc/`).
- **Documentação funcional:** `docs/`.

## Requisitos

- Python 3.12+
- Node.js 20+

## Arranque do backend

```bash
cd backend
python -m venv venv
# Windows PowerShell:  venv\Scripts\Activate.ps1
# Linux/macOS:         source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # preencher os valores
python manage.py migrate
python manage.py runserver
```

O backend arranca por omissão em modo `ERP`. Para o Platform Control Center use `SYSTEM_MODE=PCC`.

## Arranque do frontend

```bash
cd frontend
npm install
npm run dev
```

## Configuração e segredos

Toda a configuração sensível é lida de variáveis de ambiente (ver [backend/.env.example](backend/.env.example)).
Em produção defina obrigatoriamente `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=False` e `DJANGO_ALLOWED_HOSTS`.
Nenhum ficheiro `.env`, base de dados (`*.sqlite3`) ou licença (`*.key`) deve ser commitado.
