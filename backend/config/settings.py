import os
from pathlib import Path

import dj_database_url
from dotenv import load_dotenv
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")
DEBUG = os.getenv("DJANGO_DEBUG", "true").lower() == "true"
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "development-only-change-before-production")
if not DEBUG and SECRET_KEY == "development-only-change-before-production":
    raise ImproperlyConfigured("Set DJANGO_SECRET_KEY before running in production.")
if not DEBUG and (len(SECRET_KEY) < 50 or SECRET_KEY.startswith("REPLACE")):
    raise ImproperlyConfigured("Production DJANGO_SECRET_KEY must contain at least 50 characters.")

ALLOWED_HOSTS = [value.strip() for value in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if value.strip()]
INSTALLED_APPS = [
    "django.contrib.admin", "django.contrib.auth", "django.contrib.contenttypes",
    "django.contrib.sessions", "django.contrib.messages", "django.contrib.staticfiles",
    "corsheaders", "rest_framework", "rest_framework.authtoken", "planning",
]
MIDDLEWARE = [
    "config.health.HealthcheckMiddleware",
    "django.middleware.security.SecurityMiddleware", "whitenoise.middleware.WhiteNoiseMiddleware", "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware", "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware", "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware", "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"
TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates", "DIRS": [], "APP_DIRS": True,
    "OPTIONS": {"context_processors": [
        "django.template.context_processors.request", "django.contrib.auth.context_processors.auth",
        "django.contrib.messages.context_processors.messages",
    ]},
}]

DATABASES = {"default": dj_database_url.parse(
    os.getenv("DATABASE_URL") or f"sqlite:///{BASE_DIR / 'db.sqlite3'}", conn_max_age=60,
)}
if not DEBUG:
    if DATABASES["default"]["ENGINE"] != "django.db.backends.postgresql":
        raise ImproperlyConfigured("Production requires a PostgreSQL DATABASE_URL; SQLite is for local development only.")
    DATABASES["default"].setdefault("OPTIONS", {}).setdefault("sslmode", "require")
    if DATABASES["default"]["OPTIONS"]["sslmode"] not in {"require", "verify-ca", "verify-full"}:
        raise ImproperlyConfigured("Production PostgreSQL connections must use TLS.")
DATABASES["default"]["CONN_HEALTH_CHECKS"] = True
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": f"django.contrib.auth.password_validation.{name}"}
    for name in ["UserAttributeSimilarityValidator", "MinimumLengthValidator", "CommonPasswordValidator", "NumericPasswordValidator"]
]
TIME_ZONE = "Africa/Lagos"
LANGUAGE_CODE = "en-us"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
APPEND_SLASH = False

CORS_ALLOWED_ORIGINS = [value.strip() for value in os.getenv("HIBI_FRONTEND_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173").split(",") if value.strip()]
CORS_URLS_REGEX = r"^/api/.*$"
CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS
if not DEBUG:
    if not ALLOWED_HOSTS or any(host in {"*", "localhost", "127.0.0.1"} for host in ALLOWED_HOSTS):
        raise ImproperlyConfigured("Set explicit production DJANGO_ALLOWED_HOSTS.")
    if not CORS_ALLOWED_ORIGINS or any(not origin.startswith("https://") for origin in CORS_ALLOWED_ORIGINS):
        raise ImproperlyConfigured("Set explicit HTTPS HIBI_FRONTEND_ORIGINS in production.")
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.TokenAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.AnonRateThrottle", "rest_framework.throttling.UserRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"anon": "30/min", "user": "30/min", "planning": "10/hour", "login": "10/min", "push_test": "3/min", "push_subscribe": "10/min"},
    "EXCEPTION_HANDLER": "planning.exceptions.api_exception_handler",
}
DATA_UPLOAD_MAX_MEMORY_SIZE = 20 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 8 * 1024 * 1024
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5-mini")
OPENAI_TRANSCRIPTION_MODEL = os.getenv("OPENAI_TRANSCRIPTION_MODEL", "gpt-4o-mini-transcribe")

SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_SSL_REDIRECT = not DEBUG and os.getenv("DJANGO_SSL_REDIRECT", "true").lower() == "true"
# Only enable behind a managed proxy which overwrites the forwarded header.
if os.getenv("DJANGO_TRUST_PROXY_SSL", "false").lower() == "true":
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
# Container health probes use HTTP; ordinary API requests still require HTTPS.
SECURE_REDIRECT_EXEMPT = [r"^api/health$"]
SECURE_HSTS_SECONDS = 31536000 if not DEBUG else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG
SECURE_HSTS_PRELOAD = not DEBUG
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
WEBPUSH_PRIVATE_KEY = os.getenv("WEBPUSH_PRIVATE_KEY", "").strip()
WEBPUSH_SUBJECT = os.getenv("WEBPUSH_SUBJECT", "").strip()
