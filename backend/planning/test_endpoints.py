"""HTTP contracts for every public API route; all model calls are mocked."""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase
from rest_framework.throttling import ScopedRateThrottle

from .exceptions import PlanningError
from .models import SuggestedPlan
from .tests import PLAN
from .urls import urlpatterns


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class EndpointContractTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_user('endpoint-user', password='Synthetic-api-test-83!')
        self.token = Token.objects.create(user=self.user)

    def authenticate(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')

    def test_route_inventory_and_supported_methods(self):
        contracts = {
            'health': ('get', 200), 'ai/status': ('get', 200),
            'auth/register': ('post', 400), 'auth/token': ('post', 400),
            'auth/me': ('get', 200), 'auth/logout': ('post', 204),
            'workspace': ('get', 200), 'ai/plan': ('post', 400), 'plans': ('get', 200),
        }
        self.assertEqual({str(route.pattern) for route in urlpatterns}, set(contracts))
        self.authenticate()
        # Logout is deliberately last so it doesn't invalidate the remaining requests.
        for route in [name for name in contracts if name != 'auth/logout'] + ['auth/logout']:
            method, expected = contracts[route]
            response = getattr(self.client, method)(f'/api/{route}', {}, format='json')
            self.assertEqual(response.status_code, expected, (route, response.data))
            if expected != 204:
                self.assertIn('application/json', response['Content-Type'])

    def test_every_protected_route_rejects_missing_and_invalid_tokens(self):
        for authorization in ['', 'Token invalid-token']:
            self.client.credentials(HTTP_AUTHORIZATION=authorization)
            for route, method in [('auth/me', 'get'), ('auth/logout', 'post'), ('workspace', 'get'),
                                  ('workspace', 'put'), ('ai/plan', 'post'), ('plans', 'get')]:
                response = getattr(self.client, method)(f'/api/{route}', {}, format='json')
                self.assertEqual(response.status_code, 401, (route, response.data))
                self.assertIn('error', response.data)

    def test_login_wrong_password_and_inactive_user_are_rejected(self):
        for password in ['wrong-password', 'Synthetic-api-test-83!']:
            if password.startswith('Synthetic'):
                self.user.is_active = False
                self.user.save()
            response = self.client.post('/api/auth/token', {'username': self.user.username, 'password': password}, format='json')
            self.assertEqual(response.status_code, 400)
            self.assertNotIn('token', response.data)

    def test_real_token_login_identity_and_logout_lifecycle(self):
        response = self.client.post('/api/auth/token', {'username': self.user.username, 'password': 'Synthetic-api-test-83!'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {response.data['token']}")
        identity = self.client.get('/api/auth/me')
        self.assertEqual(identity.data, {'id': self.user.pk, 'username': self.user.username})
        self.assertTrue(self.client.get('/api/ai/status').data['authenticated'])
        self.assertEqual(self.client.post('/api/auth/logout').status_code, 204)
        self.assertEqual(self.client.get('/api/auth/me').status_code, 401)

    def test_unsupported_methods_and_malformed_json_return_errors(self):
        self.authenticate()
        for route, method in [('health', 'post'), ('auth/me', 'post'), ('workspace', 'delete'),
                              ('plans', 'post'), ('ai/plan', 'get'), ('auth/register', 'get')]:
            self.assertEqual(getattr(self.client, method)(f'/api/{route}').status_code, 405)
        response = self.client.put('/api/workspace', '{invalid', content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.data)
        self.assertEqual(self.client.get('/api/does-not-exist').status_code, 404)

    @override_settings(OPENAI_API_KEY='synthetic-not-a-real-key')
    @patch('planning.views.OpenAIPlanner')
    def test_ai_provider_failures_do_not_create_history(self, planner):
        self.authenticate()
        for code in [429, 502, 504]:
            planner.return_value.suggest_plan.side_effect = PlanningError('Synthetic provider failure', code)
            response = self.client.post('/api/ai/plan', {'text': 'Synthetic test notes'}, format='json')
            self.assertEqual(response.status_code, code)
            self.assertIn('error', response.data)
        self.assertFalse(SuggestedPlan.objects.exists())

    def test_plan_history_is_bounded_newest_first_and_ignores_other_user_query(self):
        other = get_user_model().objects.create_user('another-owner')
        SuggestedPlan.objects.create(user=other, title='Private', project='Personal', result=PLAN)
        rows = SuggestedPlan.objects.bulk_create([
            SuggestedPlan(user=self.user, title=f'Plan {index}', project='Personal', result=PLAN)
            for index in range(51)
        ])
        SuggestedPlan.objects.filter(user=self.user).update(created_at=rows[0].created_at)
        self.authenticate()
        response = self.client.get(f'/api/plans?user={other.pk}')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 50)
        self.assertEqual(response.data[0]['id'], rows[-1].pk)
        self.assertNotIn('Private', [record['title'] for record in response.data])

    def test_login_throttling_has_a_retry_after_response(self):
        with patch.object(ScopedRateThrottle, 'THROTTLE_RATES', {'login': '2/min'}):
            for _ in range(2):
                self.assertEqual(self.client.post('/api/auth/token', {}, format='json').status_code, 400)
            response = self.client.post('/api/auth/token', {}, format='json')
        self.assertEqual(response.status_code, 429)
        self.assertIn('Retry-After', response)

    def test_preflight_allows_authorization_put_and_rejects_untrusted_origins(self):
        with override_settings(CORS_ALLOWED_ORIGINS=['https://hibi.example']):
            response = self.client.options('/api/workspace', HTTP_ORIGIN='https://hibi.example',
                HTTP_ACCESS_CONTROL_REQUEST_METHOD='PUT', HTTP_ACCESS_CONTROL_REQUEST_HEADERS='authorization,content-type')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response['access-control-allow-origin'], 'https://hibi.example')
            self.assertIn('PUT', response['access-control-allow-methods'])
            self.assertIn('authorization', response['access-control-allow-headers'])
            rejected = self.client.options('/api/workspace', HTTP_ORIGIN='https://untrusted.example',
                HTTP_ACCESS_CONTROL_REQUEST_METHOD='PUT')
            self.assertNotIn('access-control-allow-origin', rejected)
