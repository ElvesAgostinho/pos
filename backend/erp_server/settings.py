import os
from pathlib import Path
import django.urls.converters
import django.urls

_original_register_converter = django.urls.converters.register_converter
def _safe_register_converter(converter, type_name):
    try:
        _original_register_converter(converter, type_name)
    except ValueError as e:
        if f"Converter {type_name!r} is already registered." not in str(e):
            raise

django.urls.converters.register_converter = _safe_register_converter
django.urls.register_converter = _safe_register_converter

BASE_DIR = Path(__file__).resolve().parent.parent

# Segredos e flags de ambiente vêm de variáveis de ambiente (.env em produção).
# O .env É LIDO AQUI, sem bibliotecas: na instalação do cliente quem arranca isto é um
# SERVIÇO do Windows, e serviços não fazem `source .env` — se o settings não o ler,
# a produção arrancava com os defaults de desenvolvimento (DEBUG ligado, base de dev).
# O ambiente real ganha sempre ao ficheiro (setdefault): um técnico pode sobrepor.
_env_file = Path(__file__).resolve().parent.parent / '.env'
if _env_file.exists():
    for _linha in _env_file.read_text(encoding='utf-8').splitlines():
        _linha = _linha.strip()
        if _linha and not _linha.startswith('#') and '=' in _linha:
            _k, _, _v = _linha.partition('=')
            os.environ.setdefault(_k.strip(), _v.strip())
# Os fallbacks abaixo destinam-se APENAS a desenvolvimento local.
SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY",
    "django-insecure-4l&$gg!94(7^&^mxirtw)n3!qwfu4d6*i7&3)6e37&$g26tf4(",
)
DEBUG = os.environ.get("DJANGO_DEBUG", "True").lower() in ("1", "true", "yes")

# CHAVE DE FORNECEDOR — autoriza o provisionamento da certificação AGT (nº de certificado
# + chave de assinatura) a partir do PCC/instalador. O cliente NUNCA a tem: sem ela, a
# certificação do software não pode ser alterada de dentro do sistema do cliente.
VENDOR_PROVISION_KEY = os.environ.get("VENDOR_PROVISION_KEY", "")
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "*").split(",")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "core",
    "mdm",
    "django_filters",
    "licensing",
    "identity",
    "auth_engine",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    # Módulos de NÚCLEO (sempre ativos): eae é necessário para o login; clm é usado
    # por ambos os modos. Os módulos OPCIONAIS NÃO estão aqui — são carregados
    # dinamicamente pela licença mais abaixo (gating real por licença).
    "eae",
    "clm",
    # Angola Tax & Fiscal Compliance Center — motor fiscal (obrigatório em AO, sempre ativo).
    "fiscal",
    # Contabilidade Geral (PGC-AO) — infraestrutura contabilística legal, sempre ativa.
    "accounting",
]

# Modos: 'PCC' (Platform Control Center) ou 'ERP' (Hospitality ERP - Default)
import sys

RUN_MODE = os.environ.get('SYSTEM_MODE', 'ERP')

if RUN_MODE == 'PCC':
    # No Platform Control Center ativamos o CLM. Como o `clm` já consta da lista base
    # (é usado por ambos os modos — ex: workforce importa clm.TerminalLicense), só o
    # acrescentamos se faltar, evitando "Application labels aren't unique".
    if "clm" not in INSTALLED_APPS:
        INSTALLED_APPS.append("clm")
    # (mdm) tem campos que apontam para 'pos.SelectionCode', 'inventory.Item', etc.
    # — são "core" mas referenciam modelos de módulos OPCIONAIS. No modo ERP isso
    # nunca dava erro porque o cliente normal ativa quase sempre o POS por licença;
    # o PCC nunca passa pelo resolve_active() (só gere licenças, não vende a si
    # próprio um módulo), por isso ficava sem 'pos'/'inventory' instalados e o
    # `manage.py check`/`migrate` rebentava logo ao arrancar (fields.E307). O PCC
    # nunca USA estas tabelas — só precisa delas para o Django validar o esquema.
    for _app in ('inventory', 'pos', 'commercial'):
        if _app not in INSTALLED_APPS:
            INSTALLED_APPS.append(_app)
else:
    # No Hospitality ERP, carregamos a licença offline e ativamos os módulos autorizados
    try:
        from licensing.offline_validator import get_active_modules
        active_modules = get_active_modules(BASE_DIR, SECRET_KEY)

        # Fecho transitivo: dado o que a licença autoriza, resolve as dependências
        # necessárias (ex: 'procurement' arrasta 'esm' e 'inventory') e ignora o resto.
        # Se não houver licença válida, o conjunto é vazio -> nenhum módulo opcional carrega.
        from core.modules import resolve_active
        for app in resolve_active(active_modules):
            if app not in INSTALLED_APPS:
                INSTALLED_APPS.append(app)

    except ImportError:
        pass  # Durante o setup inicial ou fallback

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # Serve /static/ sozinho (admin, DRF) quando não há nginx à frente — caso do
    # contentor Docker do PCC. Na instalação do cliente (Windows) isto também não
    # faz mal: fica só a servir ficheiros que já lá estavam.
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "core.audit_middleware.AuditMiddleware",   # trilho de auditoria universal
]
if RUN_MODE == 'PCC':
    # Só a consola do PCC tem esta camada extra (ver core/pcc_access.py) — o
    # sistema instalado no cliente (RUN_MODE=ERP) nunca precisa disto.
    MIDDLEWARE.append("core.pcc_access.PccConsoleGateMiddleware")

# (PCC) Lista de IPs/redes com acesso à consola — CIDR separado por vírgulas
# (ex.: "41.63.12.7,10.8.0.0/24"). Vazia = sem restrição extra (só o login).
PCC_ALLOWED_IPS = os.environ.get('PCC_ALLOWED_IPS', '')

# CORS: em dev permite tudo; em produção só as origens configuradas (DJANGO_CORS_ORIGINS).
if DEBUG:
    CORS_ALLOW_ALL_ORIGINS = True
else:
    CORS_ALLOW_ALL_ORIGINS = False
    CORS_ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("DJANGO_CORS_ORIGINS", "").split(",") if o.strip()]
    CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS

REST_FRAMEWORK = {
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    # Paginação opcional (só quando o cliente pede ?page) — retrocompatível.
    'DEFAULT_PAGINATION_CLASS': 'core.pagination.OptionalPageNumberPagination',
    'PAGE_SIZE': 50,
    # Pesquisa (?search=) e ordenação (?ordering=) disponíveis nos ViewSets que as declararem.
    'DEFAULT_FILTER_BACKENDS': (
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ),
    # Rate limiting (protege a API pública/booking sob carga alta e abuso).
    'DEFAULT_THROTTLE_CLASSES': (
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ),
    'DEFAULT_THROTTLE_RATES': {
        'anon': os.environ.get('THROTTLE_ANON', '60/min'),
        'user': os.environ.get('THROTTLE_USER', '1200/min'),
    },
}
# Em produção, só JSON (mais rápido, menos memória; sem a Browsable API).
if not DEBUG:
    REST_FRAMEWORK['DEFAULT_RENDERER_CLASSES'] = ('rest_framework.renderers.JSONRenderer',)

from datetime import timedelta
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=12),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
}

ROOT_URLCONF = "erp_server.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "erp_server.wsgi.application"

# Base de dados por ambiente. Produção: DB_ENGINE=postgresql + credenciais.
# Dev (default): SQLite. Assim o mesmo código serve dev e produção sem alterações.
if os.environ.get("DB_ENGINE", "sqlite").lower() in ("postgres", "postgresql"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ.get("DB_NAME", "erp"),
            "USER": os.environ.get("DB_USER", "erp"),
            "PASSWORD": os.environ.get("DB_PASSWORD", ""),
            "HOST": os.environ.get("DB_HOST", "localhost"),
            "PORT": os.environ.get("DB_PORT", "5432"),
            # Ligações persistentes + validação de saúde: essencial sob alta carga.
            "CONN_MAX_AGE": int(os.environ.get("DB_CONN_MAX_AGE", "60")),
            "CONN_HEALTH_CHECKS": True,
            "OPTIONS": {"connect_timeout": 5},
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": os.environ.get("SQLITE_PATH", BASE_DIR / "db.sqlite3"),
            # "DATABASE IS LOCKED" — o SQLite deixa UM escritor de cada vez. No POS há
            # sempre dois ao mesmo tempo: o terminal a lançar um artigo e o mapa a
            # refrescar, o KDS a marcar pratos, a consulta a assinar o documento e a pôr
            # o talão na fila de impressão. Sem espera, o segundo desiste de imediato e
            # o empregado leva com "database is locked" no meio de uma venda.
            #
            # timeout: em vez de desistir, ESPERA 20s pela vez dele.
            # WAL (ver connection_created abaixo): leitores e escritor deixam de se
            # bloquear — quem lê o mapa não trava quem está a cobrar.
            #
            # transaction_mode=IMMEDIATE: a transação pede a tranca de ESCRITA logo ao
            # começar. Por omissão o SQLite começa a ler e só depois tenta subir a
            # tranca — e uma tranca que já não pode subir falha NA HORA, sem esperar,
            # por muito timeout que se ponha. Era isto: dez consultas ao mesmo tempo,
            # nove com "database is locked". A pedir a tranca à cabeça, a segunda espera
            # pela primeira em vez de desistir.
            "OPTIONS": {"timeout": 20, "transaction_mode": "IMMEDIATE"},
        }
    }

# Cache partilhado (Redis em produção) — acelera e permite escalar horizontalmente
# (várias instâncias da app partilham cache/sessões). Sem REDIS_URL, usa memória local.
_REDIS_URL = os.environ.get("REDIS_URL")
if _REDIS_URL:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": _REDIS_URL,
        }
    }
    SESSION_ENGINE = "django.contrib.sessions.backends.cache"
else:
    CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

# Hasher extra para o PIN do terminal POS (pos.PosPinHasher) — o login por PIN
# percorre TODOS os operadores ativos a testar o hash de cada um; com o hasher
# por omissão (~600 mil iterações) isso custava vários segundos por operador.
# Fica ao FUNDO da lista: continua disponível para VERIFICAR PINs já gravados
# com ele, mas nunca se torna o hasher por omissão (o `password` da conta de
# acesso continua com o hasher forte de sempre).
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
    "django.contrib.auth.hashers.ScryptPasswordHasher",
    "pos.hashers.PosPinHasher",
]

# Validadores de palavra-passe (aplicam-se onde validate_password é chamado).
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
LANGUAGE_CODE = "pt-pt"
TIME_ZONE = "Africa/Luanda"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
# Ficheiros estáticos servidos em produção (python manage.py collectstatic).
STATIC_ROOT = os.environ.get("DJANGO_STATIC_ROOT", str(BASE_DIR / "staticfiles"))
# WhiteNoise: comprime e dá hash ao nome (cache eterna sem ficar com o ficheiro
# velho preso) — só em produção; em DEBUG o Django serve os estáticos à mão.
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"
        if not DEBUG else "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}
LICENSING_HARD_MODE = False

# ---------------------------------------------------------------------------
# Segurança de PRODUÇÃO — só ativa quando DEBUG=False (dev não é afetado).
# ---------------------------------------------------------------------------
if not DEBUG:
    SECURE_SSL_REDIRECT = os.environ.get("DJANGO_SSL_REDIRECT", "True").lower() in ("1", "true", "yes")
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = int(os.environ.get("DJANGO_HSTS_SECONDS", "31536000"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_REFERRER_POLICY = "same-origin"
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")  # atrás de proxy/nginx
    X_FRAME_OPTIONS = "DENY"
    # Aviso de configuração: em produção o SECRET_KEY não deve ser o de desenvolvimento.
    if SECRET_KEY.startswith("django-insecure-"):
        import warnings
        warnings.warn("DJANGO_SECRET_KEY não definido em produção — usar um segredo forte via ambiente.")

# SMTP — por variável de ambiente, com o SendGrid como omissão (era fixo no
# código antes; quem usa outro fornecedor não conseguia mudar sem editar isto).
# Sem EMAIL_HOST_PASSWORD definida, o envio de e-mail falha (ou, no POS, o
# motor pos/mailer.py já sabe SIMULAR e registar em vez de rebentar — mas o
# PCC/admin do Django usa o backend SMTP direto, por isso aqui falha a sério).
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = os.environ.get('EMAIL_HOST', 'smtp.sendgrid.net')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', '587'))
EMAIL_USE_TLS = os.environ.get('EMAIL_USE_TLS', 'True').lower() in ('1', 'true', 'yes')
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', 'apikey')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'noreply@mwanalodge.ao')

# Ficheiros carregados pelo cliente (logótipos, imagens de artigos, fotos de alergénios).
MEDIA_URL = "/media/"
MEDIA_ROOT = os.environ.get("DJANGO_MEDIA_ROOT", BASE_DIR / "media")
