import re
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .models import AccountEmail, EmailChallenge, PushDevice

PASSWORD = "Synthetic-password-87!"
NEW_PASSWORD = "Replacement-password-92!"


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend", DEFAULT_FROM_EMAIL="Hibi <test@example.com>",
                   PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class RecoveryTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.ready = patch("planning.account_recovery.mail_ready", return_value=True)
        self.ready.start()
        self.addCleanup(self.ready.stop)
        self.user = get_user_model().objects.create_user("test-person", email="person@example.com", password=PASSWORD)
        AccountEmail.objects.create(user=self.user, email=self.user.email)

    def post(self, route, data):
        return self.client.post(f"/api/auth/{route}", data, format="json")

    def request_code(self):
        response = self.post("password-reset/request", {"email": "PERSON@example.com"})
        self.assertEqual(response.status_code, 200)
        return re.search(r"\b\d{8}\b", mail.outbox[-1].body).group()

    def confirm(self, code, **extra):
        return self.post("password-reset/confirm", {"email": self.user.email, "code": code,
                         "password": NEW_PASSWORD, "confirmPassword": NEW_PASSWORD, **extra})

    def test_registration_requires_email_confirmation_and_unique_normalized_email(self):
        body = {"username": "new-person", "email": "NEW@example.com", "password": PASSWORD, "confirmPassword": PASSWORD}
        self.assertEqual(self.post("register", {**body, "confirmPassword": "different"}).status_code, 400)
        self.assertEqual(self.post("register", {"username": "old-client", "password": PASSWORD}).status_code, 400)
        self.assertEqual(self.post("register", body).status_code, 201)
        self.assertTrue(AccountEmail.objects.filter(email="new@example.com").exists())
        self.assertEqual(self.post("register", {**body, "username": "another-person"}).status_code, 400)

    def test_login_accepts_username_or_case_insensitive_email_and_rejects_wrong_password(self):
        for identity in [self.user.username, "PERSON@EXAMPLE.COM"]:
            self.assertEqual(self.post("token", {"username": identity, "password": PASSWORD}).status_code, 200)
        self.assertEqual(self.post("token", {"username": self.user.email, "password": "wrong"}).status_code, 400)

    def test_reset_is_single_use_revokes_tokens_and_does_not_return_code(self):
        token = Token.objects.create(user=self.user)
        PushDevice.objects.create(user=self.user, endpoint="https://fcm.googleapis.com/test", keys={})
        code = self.request_code()
        challenge = EmailChallenge.objects.get()
        self.assertNotIn(code, challenge.digest)
        response = self.confirm(code)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(code, str(response.data))
        self.assertFalse(Token.objects.filter(pk=token.pk).exists())
        self.assertFalse(PushDevice.objects.filter(user=self.user).exists())
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(NEW_PASSWORD))
        self.assertEqual(self.confirm(code).status_code, 400)
        self.assertEqual(self.post("token", {"username": self.user.email, "password": PASSWORD}).status_code, 400)

    def test_unknown_email_returns_same_response_and_does_not_send_mail(self):
        known = self.post("password-reset/request", {"email": self.user.email})
        unknown = self.post("password-reset/request", {"email": "missing@example.com"})
        self.assertEqual(known.data, unknown.data)
        self.assertEqual(len(mail.outbox), 1)

    def test_expiry_attempt_limit_and_manual_password_change(self):
        code = self.request_code()
        for _ in range(5):
            self.assertEqual(self.confirm("00000000" if code != "00000000" else "11111111").status_code, 400)
        self.assertEqual(self.confirm(code).status_code, 400)
        challenge = EmailChallenge.objects.get()
        challenge.attempts = 0
        challenge.expires_at = timezone.now() - timedelta(seconds=1)
        challenge.save()
        self.assertEqual(self.confirm(code).status_code, 400)
        challenge.expires_at = timezone.now() + timedelta(minutes=5)
        challenge.save()
        self.user.set_password("Another-password-99!")
        self.user.save()
        self.assertEqual(self.confirm(code).status_code, 400)

    def test_mismatch_and_weak_password_do_not_change_password(self):
        code = self.request_code()
        self.assertEqual(self.confirm(code, confirmPassword="different").status_code, 400)
        self.assertEqual(self.confirm(code, password="123", confirmPassword="123").status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(PASSWORD))

    def test_cooldown_resend_and_delivery_failure(self):
        code = self.request_code()
        self.request_code()
        self.assertEqual(len(mail.outbox), 1)
        EmailChallenge.objects.update(sent_at=timezone.now() - timedelta(minutes=2))
        new_code = self.request_code()
        self.assertNotEqual(code, new_code)
        self.assertEqual(self.confirm(code).status_code, 400)
        EmailChallenge.objects.update(sent_at=timezone.now() - timedelta(minutes=2))
        with patch("planning.account_recovery.send_mail", side_effect=RuntimeError("synthetic SMTP failure")):
            self.assertEqual(self.post("password-reset/request", {"email": self.user.email}).status_code, 200)
        self.assertLessEqual(EmailChallenge.objects.get().expires_at, timezone.now())

    def test_unconfigured_email_returns_actionable_error_without_sending(self):
        with patch("planning.account_recovery.mail_ready", return_value=False):
            self.assertEqual(self.post("password-reset/request", {"email": self.user.email}).status_code, 503)
        self.assertFalse(EmailChallenge.objects.exists())

    def test_existing_account_email_requires_password_and_mailbox_proof(self):
        self.client.force_authenticate(self.user)
        body = {"email": "replacement@example.com", "password": PASSWORD}
        self.assertEqual(self.post("email", {**body, "password": "wrong"}).status_code, 400)
        self.assertEqual(self.post("email", body).status_code, 200)
        self.assertEqual(AccountEmail.objects.get(user=self.user).email, "person@example.com")
        code = re.search(r"\b\d{8}\b", mail.outbox[-1].body).group()
        self.assertEqual(self.post("email", {**body, "code": code}).status_code, 200)
        self.assertEqual(AccountEmail.objects.get(user=self.user).email, body["email"])
        self.assertEqual(self.post("email", {**body, "code": code}).status_code, 400)

    def test_verified_email_cannot_be_taken_from_another_user(self):
        other = get_user_model().objects.create_user("other-person", password=PASSWORD)
        self.client.force_authenticate(other)
        body = {"email": self.user.email, "password": PASSWORD}
        self.post("email", body)
        code = re.search(r"\b\d{8}\b", mail.outbox[-1].body).group()
        self.assertEqual(self.post("email", {**body, "code": code}).status_code, 400)
        self.assertEqual(AccountEmail.objects.get(email=self.user.email).user_id, self.user.pk)
