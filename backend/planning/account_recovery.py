"""Mailbox proof codes are not login passwords and are never returned by the API."""
import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.crypto import constant_time_compare, salted_hmac
from rest_framework import permissions, serializers
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import AccountEmail, EmailChallenge, PushDevice

GENERIC = {"message": "If an eligible account uses that email, a reset code has been sent. Check your inbox and spam folder."}
INVALID = "This code is invalid or expired. Request a new code."


class EmailInput(serializers.Serializer):
    email = serializers.EmailField(max_length=254)

    def validate_email(self, value):
        return value.strip().lower()


def digest(code, user):
    return salted_hmac("hibi-email-code", f"{code}:{user.pk if user else ''}:{user.password if user else ''}", algorithm="sha256").hexdigest()


def mail_ready():
    # Never accidentally log recovery secrets through console/file email backends.
    return bool(settings.EMAIL_HOST and settings.DEFAULT_FROM_EMAIL) and settings.EMAIL_BACKEND == "django.core.mail.backends.smtp.EmailBackend"


def issue(email, user, purpose):
    now = timezone.now()
    code = f"{secrets.randbelow(100_000_000):08d}"
    with transaction.atomic():
        challenge, created = EmailChallenge.objects.select_for_update().get_or_create(
            email=email, purpose=purpose,
            defaults={"user": user, "digest": "", "sent_at": now - timedelta(minutes=2), "expires_at": now})
        if challenge.sent_at > now - timedelta(seconds=60):
            return
        challenge.user = user
        challenge.digest = digest(code, user)
        challenge.sent_at = now
        challenge.expires_at = now + timedelta(minutes=10)
        challenge.attempts = 0
        challenge.save()
        if user:
            try:
                count = send_mail(
                    "Your Hibi password reset code" if purpose == "reset" else "Verify your Hibi email",
                    f"Your Hibi code is {code}. It expires in 10 minutes and can be used once.\n"
                    "Do not share it. If you did not request this, ignore this email.",
                    settings.DEFAULT_FROM_EMAIL, [email], fail_silently=False)
                if count != 1:
                    raise RuntimeError("No email accepted")
            except Exception:
                challenge.expires_at = now
                challenge.save(update_fields=["expires_at"])
                logging.getLogger(__name__).warning("Hibi recovery email delivery failed; check SMTP configuration.")


def check(challenge, code, user):
    if not challenge or challenge.expires_at <= timezone.now() or challenge.attempts >= 5:
        return False
    challenge.attempts += 1
    challenge.save(update_fields=["attempts"])
    return bool(user and user.is_active and constant_time_compare(challenge.digest, digest(code, user)))


class PublicRecoveryView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "recovery"


class ResetRequestView(PublicRecoveryView):
    def post(self, request):
        data = EmailInput(data=request.data)
        data.is_valid(raise_exception=True)
        if not mail_ready():
            return Response({"message": "Password recovery email is not available yet. Please contact support."}, status=503)
        address = AccountEmail.objects.select_related("user").filter(email=data.validated_data["email"]).first()
        user = address.user if address and address.user.is_active and address.user.has_usable_password() else None
        issue(data.validated_data["email"], user, "reset")
        return Response(GENERIC)


class ResetInput(EmailInput):
    code = serializers.RegexField(r"^\d{8}$", max_length=8)
    password = serializers.CharField(max_length=128, trim_whitespace=False)
    confirmPassword = serializers.CharField(max_length=128, trim_whitespace=False)

    def validate(self, attrs):
        if attrs["password"] != attrs["confirmPassword"]:
            raise serializers.ValidationError({"confirmPassword": "Passwords must match."})
        return attrs


class ResetConfirmView(PublicRecoveryView):
    def post(self, request):
        data = ResetInput(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        # Invalid attempts must commit, so errors are returned outside the transaction.
        invalid = False
        with transaction.atomic():
            challenge = EmailChallenge.objects.select_for_update().filter(email=values["email"], purpose="reset").first()
            user = get_user_model().objects.select_for_update().filter(pk=challenge.user_id).first() if challenge else None
            if not check(challenge, values["code"], user) or not AccountEmail.objects.filter(user=user, email=values["email"]).exists():
                invalid = True
            else:
                try:
                    validate_password(values["password"], user)
                except ValidationError as exc:
                    return Response({"password": exc.messages}, status=400)
                user.set_password(values["password"])
                user.save(update_fields=["password"])
                EmailChallenge.objects.filter(user=user).delete()
                Token.objects.filter(user=user).delete()
                PushDevice.objects.filter(user=user).delete()
        if invalid:
            raise serializers.ValidationError(INVALID)
        return Response({"message": "Password reset. Sign in with your new password."})


class SaveEmailView(APIView):
    """Existing accounts prove both current password and mailbox ownership."""
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "recovery"

    def post(self, request):
        data = EmailInput(data=request.data)
        data.is_valid(raise_exception=True)
        email = data.validated_data["email"]
        password = request.data.get("password")
        if not isinstance(password, str) or not request.user.check_password(password):
            raise serializers.ValidationError("Enter your current password to update your email.")
        code = request.data.get("code")
        if not code:
            if not mail_ready():
                return Response({"message": "Email verification is not available yet. Please contact support."}, status=503)
            issue(email, request.user, "verify")
            return Response({"message": "Check that inbox for a verification code. Enter it below to save your email."})
        invalid = False
        try:
            with transaction.atomic():
                challenge = EmailChallenge.objects.select_for_update().filter(email=email, purpose="verify", user=request.user).first()
                user = get_user_model().objects.select_for_update().get(pk=request.user.pk)
                if not isinstance(code, str) or len(code) != 8 or not check(challenge, code, user):
                    invalid = True
                else:
                    AccountEmail.objects.update_or_create(user=user, defaults={"email": email})
                    user.email = email
                    user.save(update_fields=["email"])
                    EmailChallenge.objects.filter(user=user).delete()
        except IntegrityError:
            raise serializers.ValidationError("That email cannot be used. Try another address.")
        if invalid:
            raise serializers.ValidationError(INVALID)
        return Response({"message": "Your email is saved.", "email": email})
