import base64
import copy
from datetime import timedelta, datetime, timezone
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from django.test import override_settings
from dotenv import dotenv_values
from requests import Response as HTTPResponse
from rest_framework.test import APITestCase
from pywebpush import WebPushException

from .models import PushDevice, Reminder, PushDelivery
from .services.push import public_key, dispatch_due, send_push, NoRedirectSession

PRIVATE = base64.urlsafe_b64encode((1).to_bytes(32, 'big')).rstrip(b'=').decode()


@override_settings(WEBPUSH_PRIVATE_KEY=PRIVATE, WEBPUSH_SUBJECT='mailto:test@example.com',
                   PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class NotificationTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_user('push-user')
        self.other = get_user_model().objects.create_user('other-push-user')
        self.client.force_authenticate(self.user)
        self.device = {'endpoint': 'https://fcm.googleapis.com/fcm/send/synthetic-device',
                       'keys': {'p256dh': public_key(), 'auth': 'AAAAAAAAAAAAAAAAAAAAAA'}}
        self.task = {'id': 'task-1', 'title': 'Private task title', 'notes': 'Private task notes',
                     'when': 'Anytime', 'project': 'Personal', 'scheduledDate': '2030-01-02',
                     'startTime': '10:00', 'durationMinutes': 30, 'timeZone': 'Africa/Lagos', 'reminderMinutes': 10}

    def save_task(self, task=None, revision=0):
        response = self.client.put('/api/workspace', {'revision': revision, 'projects': ['Personal'],
            'tasks': [task or self.task]}, format='json')
        self.assertEqual(response.status_code, 200, response.data)

    def register_device(self):
        response = self.client.post('/api/notifications/subscriptions', self.device, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        return PushDevice.objects.get()

    def test_routes_require_login_and_only_expose_public_key(self):
        result = self.client.get('/api/notifications/config')
        self.assertTrue(result.data['configured'])
        self.assertEqual(result.data['publicKey'], public_key())
        self.assertNotIn(PRIVATE, result.content.decode())
        self.client.force_authenticate(None)
        for path, method in [('config', 'get'), ('subscriptions', 'post'), ('test', 'post')]:
            self.assertEqual(getattr(self.client, method)(f'/api/notifications/{path}', {}, format='json').status_code, 401)

    def test_device_upsert_and_delete_are_scoped_to_owner(self):
        device = self.register_device()
        self.register_device()
        self.assertEqual(PushDevice.objects.count(), 1)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post('/api/notifications/subscriptions', self.device, format='json').status_code, 409)
        self.assertEqual(self.client.delete('/api/notifications/subscriptions', self.device, format='json').status_code, 204)
        self.assertTrue(PushDevice.objects.filter(pk=device.pk).exists())
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.delete('/api/notifications/subscriptions', self.device, format='json').status_code, 204)
        self.assertFalse(PushDevice.objects.exists())

    def test_internal_and_untrusted_endpoints_and_invalid_keys_are_rejected(self):
        for endpoint in ['http://fcm.googleapis.com/x', 'https://127.0.0.1/x',
                         'https://fcm.googleapis.com.evil.example/x', 'https://fcm.googleapis.com:bad/x',
                         'https://user:pass@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x']:
            response = self.client.post('/api/notifications/subscriptions', {**self.device, 'endpoint': endpoint}, format='json')
            self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(self.client.post('/api/notifications/subscriptions', {**self.device, 'keys': {'auth': 'invalid'}}, format='json').status_code, 400)
        self.assertFalse(PushDevice.objects.exists())

    @patch('planning.notifications.send_push', return_value='sent')
    def test_test_notification_targets_only_the_current_users_registered_device(self, send):
        device = self.register_device()
        response = self.client.post('/api/notifications/test', self.device, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['accepted'])
        self.assertEqual(send.call_args.args[0].pk, device.pk)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post('/api/notifications/test', self.device, format='json').status_code, 404)
        self.assertEqual(send.call_count, 1)

    @override_settings(WEBPUSH_PRIVATE_KEY='')
    def test_unconfigured_server_is_explicit_and_cannot_register_devices(self):
        self.assertFalse(self.client.get('/api/notifications/config').data['configured'])
        self.assertEqual(self.client.post('/api/notifications/subscriptions', self.device, format='json').status_code, 503)
        self.assertFalse(PushDevice.objects.exists())

    def test_device_limit_is_enforced(self):
        for index in range(5):
            body = {**self.device, 'endpoint': f'https://fcm.googleapis.com/fcm/send/test-{index}'}
            self.assertEqual(self.client.post('/api/notifications/subscriptions', body, format='json').status_code, 200)
        self.assertEqual(self.client.post('/api/notifications/subscriptions', self.device, format='json').status_code, 400)
        self.assertEqual(PushDevice.objects.count(), 5)

    @patch('planning.notifications.send_push', return_value='sent')
    def test_test_push_is_rate_limited(self, send):
        self.register_device()
        for _ in range(3):
            self.assertEqual(self.client.post('/api/notifications/test', self.device, format='json').status_code, 200)
        self.assertEqual(self.client.post('/api/notifications/test', self.device, format='json').status_code, 429)
        self.assertEqual(send.call_count, 3)

    def test_reminder_saves_round_trips_and_converts_timezone_to_utc(self):
        self.save_task()
        self.assertEqual(self.client.get('/api/workspace').data['tasks'][0]['reminderMinutes'], 10)
        self.assertEqual(Reminder.objects.get().due_at, datetime(2030, 1, 2, 8, 50, tzinfo=timezone.utc))

    def test_reminder_without_time_or_with_unsupported_interval_is_rejected(self):
        for fields in [{'startTime': None}, {'reminderMinutes': 123}]:
            response = self.client.put('/api/workspace', {'revision': 0, 'projects': ['Personal'], 'tasks': [{**self.task, **fields}]}, format='json')
            self.assertEqual(response.status_code, 400)
        self.assertFalse(Reminder.objects.exists())

    @patch('planning.services.push.send_push', return_value='sent')
    def test_reminder_dispatch_is_once_per_device_and_avoids_private_text(self, send):
        self.register_device(); self.save_task()
        due = Reminder.objects.get().due_at
        self.assertEqual(dispatch_due(due - timedelta(seconds=1))['sent'], 0)
        self.assertEqual(dispatch_due(due)['sent'], 1)
        self.assertEqual(dispatch_due(due)['sent'], 0)
        payload = send.call_args.args[1]
        self.assertNotIn('Private task', str(payload))
        self.assertEqual(payload['taskId'], 'task-1')
        self.assertEqual(PushDelivery.objects.get().state, 'sent')
        self.save_task(revision=1)  # Repeated full-workspace saves must not requeue the notification.
        self.assertEqual(dispatch_due(due)['sent'], 0)

    @patch('planning.services.push.send_push', return_value='sent')
    def test_reschedule_completion_and_deletion_cancel_old_jobs(self, send):
        self.register_device(); self.save_task()
        old = Reminder.objects.get()
        self.save_task({**self.task, 'startTime': '11:00'}, revision=1)
        old.refresh_from_db()
        self.assertEqual(old.state, 'cancelled')
        newer = Reminder.objects.get(state='pending')
        self.save_task({**self.task, 'startTime': '11:00', 'done': True}, revision=2)
        newer.refresh_from_db()
        self.assertEqual(newer.state, 'cancelled')
        self.assertEqual(dispatch_due(newer.due_at)['sent'], 0)
        self.save_task({**self.task, 'startTime': '12:00'}, revision=3)
        response = self.client.put('/api/workspace', {'revision': 4, 'projects': [], 'tasks': []}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(Reminder.objects.filter(state='pending').exists())
        send.assert_not_called()

    @patch('planning.services.push.send_push', return_value='failed')
    def test_late_and_ambiguous_failed_deliveries_are_not_repeated(self, send):
        self.register_device(); self.save_task()
        due = Reminder.objects.get().due_at
        self.assertEqual(dispatch_due(due)['failed'], 1)
        self.assertEqual(dispatch_due(due)['failed'], 0)
        self.assertEqual(send.call_count, 1)
        self.save_task({**self.task, 'startTime': '12:00'}, revision=1)
        late = Reminder.objects.get(state='pending')
        dispatch_due(late.due_at + timedelta(minutes=16))
        late.refresh_from_db()
        self.assertEqual(late.state, 'expired')
        self.assertEqual(send.call_count, 1)

    def test_real_push_encoding_and_vapid_signing_with_mock_http(self):
        device = self.register_device()
        response = HTTPResponse(); response.status_code = 201; response._content = b''
        with patch.object(NoRedirectSession, 'send', return_value=response) as transport:
            self.assertEqual(send_push(device, {'title': 'Hibi test'}), 'sent')
        self.assertEqual(transport.call_count, 1)
        self.assertFalse(transport.call_args.kwargs['allow_redirects'])
        self.assertEqual(transport.call_args.kwargs['timeout'], 10)

    def test_expired_provider_subscription_is_removed(self):
        device = self.register_device()
        response = HTTPResponse(); response.status_code = 410
        with patch('planning.services.push.webpush', side_effect=WebPushException('Expired', response=response)):
            self.assertEqual(send_push(device, {}), 'expired')
        self.assertFalse(PushDevice.objects.exists())

    @override_settings(WEBPUSH_PRIVATE_KEY='')
    def test_key_generation_writes_privately_without_printing_secrets(self):
        temporary_root = Path(__file__).parents[1] / '.tmp'
        temporary_root.mkdir(exist_ok=True)
        with TemporaryDirectory(dir=temporary_root) as folder, override_settings(BASE_DIR=Path(folder)):
            output = StringIO()
            call_command('configure_webpush', subject='mailto:test@example.com', stdout=output)
            values = dotenv_values(Path(folder) / '.env')
            self.assertTrue(values['WEBPUSH_PRIVATE_KEY'])
            self.assertNotIn(values['WEBPUSH_PRIVATE_KEY'], output.getvalue())
            self.assertEqual(values['WEBPUSH_SUBJECT'], 'mailto:test@example.com')
