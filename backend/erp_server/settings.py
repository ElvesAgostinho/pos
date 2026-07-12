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
# Os fallbacks abaixo destinam-se APENAS a desenvolvimento local.
SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY",
    "django-insecure-4l&$gg!94(7^&^mxirtw)n3!qwfu4d6*i7&3)6e37&$g26tf4(",
)
DEBUG = os.environ.get("DJANGO_DEBUG", "True").lower() in ("1", "true", "yes")
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
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

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
            "NAME": BASE_DIR / "db.sqlite3",
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

# SMTP Email Configuration
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.sendgrid.net'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', 'apikey')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'noreply@topconsultores.com')
