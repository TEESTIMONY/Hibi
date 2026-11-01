import base64
from urllib.parse import urlsplit
from cryptography.hazmat.primitives.asymmetric import ec
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.throttling import ScopedRateThrottle
from django.db import transaction
from .models import PushDevice
from .services.push import public_key, send_push


def validate_endpoint(value):
    try:
        url = urlsplit(value)
        port = url.port
    except ValueError:
        raise serializers.ValidationError("Invalid push subscription URL.")
    host = (url.hostname or "").lower()
    allowed = host == "fcm.googleapis.com" or host == "updates.push.services.mozilla.com" or host.endswith(".updates.push.services.mozilla.com") or host == "web.push.apple.com" or host.endswith(".notify.windows.com")
    if url.scheme != "https" or not allowed or url.username or url.password or port not in {None, 443} or url.fragment:
        raise serializers.ValidationError("Unsupported push provider. Use a supported Safari, Chrome, Edge, or Firefox browser.")
    return value


class EndpointSerializer(serializers.Serializer):
    endpoint = serializers.CharField(max_length=2048, validators=[validate_endpoint])


class DeviceSerializer(EndpointSerializer):
    keys = serializers.DictField(child=serializers.CharField(max_length=200))

    def validate_keys(self, value):
        try:
            point = base64.urlsafe_b64decode(value["p256dh"] + "=" * (-len(value["p256dh"]) % 4))
            auth = base64.urlsafe_b64decode(value["auth"] + "=" * (-len(value["auth"]) % 4))
            ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), point)
            if len(auth) != 16:
                raise ValueError()
        except (KeyError, ValueError, TypeError):
            raise serializers.ValidationError("Invalid device encryption keys.")
        return {"p256dh": value["p256dh"], "auth": value["auth"]}


class NotificationConfigView(APIView):
    def get(self, request):
        key = public_key()
        return Response({"configured": bool(key), "publicKey": key})


class PushDeviceView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "push_subscribe"

    def post(self, request):
        serializer = DeviceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not public_key():
            return Response({"error": "Notifications are not configured on the server yet."}, status=503)
        with transaction.atomic():
            device = PushDevice.objects.filter(endpoint=serializer.validated_data["endpoint"]).first()
            if device and device.user_id != request.user.pk:
                return Response({"error": "This subscription belongs to another account. Disable notifications on this device, then enable them again."}, status=409)
            if not device and PushDevice.objects.filter(user=request.user).count() >= 5:
                return Response({"error": "Five devices are already enabled. Disable notifications on another device first."}, status=400)
            PushDevice.objects.update_or_create(endpoint=serializer.validated_data["endpoint"], defaults={"user": request.user, "keys": serializer.validated_data["keys"]})
        return Response({"enabled": True})

    def delete(self, request):
        serializer = EndpointSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        PushDevice.objects.filter(user=request.user, endpoint=serializer.validated_data["endpoint"]).delete()
        return Response(status=204)


class TestNotificationView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "push_test"

    def post(self, request):
        serializer = EndpointSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not public_key():
            return Response({"error": "Notifications are not configured on the server yet."}, status=503)
        device = PushDevice.objects.filter(user=request.user, endpoint=serializer.validated_data["endpoint"]).first()
        if not device:
            return Response({"error": "Enable notifications on this device first."}, status=404)
        result = send_push(device, {"title": "Hibi", "body": "Notifications are working on this device.", "tag": "hibi-test"})
        if result != "sent":
            return Response({"error": "The push service could not accept this notification. Try enabling notifications again."}, status=502)
        return Response({"accepted": True})
