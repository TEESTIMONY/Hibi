import importlib.util
import os
from pathlib import Path
from unittest.mock import patch
from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase, override_settings


class ProductionSettingsTests(SimpleTestCase):
    def load(self, **changes):
        env = {
            "DJANGO_DEBUG": "false", "DJANGO_SECRET_KEY": "ci-only-secret-for-settings-validation-0123456789-ABCDEFGH",
            "DATABASE_URL": "postgresql://test:test@db.example.com:5432/hibi?sslmode=require",
            "DJANGO_ALLOWED_HOSTS": "api.hibi.example", "HIBI_FRONTEND_ORIGINS": "https://hibi.example",
        }
        env.update(changes)
        spec = importlib.util.spec_from_file_location('production_settings_test', Path(__file__).parents[1] / 'config/settings.py')
        module = importlib.util.module_from_spec(spec)
        with patch.dict(os.environ, env, clear=True), patch('dotenv.load_dotenv'):
            spec.loader.exec_module(module)
        return module

    def test_production_uses_postgres_tls_and_opt_in_proxy_trust(self):
        config = self.load()
        self.assertFalse(config.DEBUG)
        self.assertTrue(config.SECURE_SSL_REDIRECT)
        self.assertTrue(config.SESSION_COOKIE_SECURE)
        self.assertEqual(config.DATABASES['default']['OPTIONS']['sslmode'], 'require')
        self.assertFalse(hasattr(config, 'SECURE_PROXY_SSL_HEADER'))
        self.assertEqual(self.load(DJANGO_TRUST_PROXY_SSL='true').SECURE_PROXY_SSL_HEADER, ('HTTP_X_FORWARDED_PROTO', 'https'))

    def test_unsafe_production_settings_fail_before_startup(self):
        for change in [dict(DJANGO_SECRET_KEY=''), dict(DATABASE_URL=''), dict(DJANGO_ALLOWED_HOSTS='*'),
                       dict(HIBI_FRONTEND_ORIGINS='http://localhost:5173'),
                       dict(DATABASE_URL='postgresql://test:test@db.example.com/hibi?sslmode=disable')]:
            with self.subTest(change=list(change)), self.assertRaises(ImproperlyConfigured):
                self.load(**change)

    @override_settings(SECURE_SSL_REDIRECT=True, ALLOWED_HOSTS=['api.hibi.example'])
    def test_liveness_probe_accepts_internal_host_without_exposing_other_routes(self):
        self.assertEqual(self.client.get('/api/health', HTTP_HOST='10.0.0.12:8000').status_code, 200)
        self.assertEqual(self.client.get('/api/ai/status', secure=True, HTTP_HOST='untrusted.example').status_code, 400)
