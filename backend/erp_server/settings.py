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
    "esm",
    "inventory",
    "procurement",
    "pos",
    "wms",
    "workforce",
    "eae",
    "ecc",
    "ewm",
    "fme",
    "amc",
    "eum",
    "ite",
    "edc",
    "clm",
]

# Modos: 'PCC' (Platform Control Center) ou 'ERP' (Hospitality ERP - Default)
import sys

RUN_MODE = os.environ.get('SYSTEM_MODE', 'ERP')

if RUN_MODE == 'PCC':
    # No Platform Control Center, ativamos o CLM
    INSTALLED_APPS += [
        "clm",
    ]
else:
    # No Hospitality ERP, carregamos a licença offline e ativamos os módulos autorizados
    try:
        from licensing.offline_validator import get_active_modules
        active_modules = get_active_modules(BASE_DIR, SECRET_KEY)
        
        # Mapeamento genérico ou se active_modules conter os nomes das apps.
        # Caso a licença venha com ["POS", "WMS"], os nomes precisam estar lowercase
        active_apps = [m.lower() for m in active_modules]
        
        # Se a licença não existir ou não estiver ativada com módulos, os módulos abaixo NÃO CARREGAM
        optional_apps = [
            "inventory", "pos", "wms", "ite", "edc", "eae",
            "ecc", "ewm", "fme", "amc", "eum", "procurement", "workforce", "esm"
        ]
        
        # Otimização: Apenas injetamos no Django os apps autorizados pela licença!
        for app in optional_apps:
            if app in active_apps or "*" in active_apps:
                INSTALLED_APPS.append(app)
                
    except ImportError:
        pass # Durante o setup inicial ou fallback

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

CORS_ALLOW_ALL_ORIGINS = True

REST_FRAMEWORK = {
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    )
}

from datetime import timedelta
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),
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

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

AUTH_PASSWORD_VALIDATORS = []
LANGUAGE_CODE = "pt-pt"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
LICENSING_HARD_MODE = False

# SMTP Email Configuration
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.sendgrid.net'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', 'apikey')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'noreply@topconsultores.com')
