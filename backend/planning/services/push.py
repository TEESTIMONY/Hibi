import base64
import hashlib
import json
import time
from datetime import datetime, timedelta, timezone as dt_timezone
from zoneinfo import ZoneInfo

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from pywebpush import webpush, WebPushException
from requests import Session

from planning.models import PushDevice, Reminder, PushDelivery, Task


class NoRedirectSession(Session):
    def request(self, *args, **kwargs):
        kwargs["allow_redirects"] = False
        return super().request(*args, **kwargs)


def public_key():
    if not settings.WEBPUSH_PRIVATE_KEY or not settings.WEBPUSH_SUBJECT.startswith(("mailto:", "https://")):
        return ""
    try:
        raw = base64.urlsafe_b64decode(settings.WEBPUSH_PRIVATE_KEY + "=" * (-len(settings.WEBPUSH_PRIVATE_KEY) % 4))
        if len(raw) != 32:
            return ""
        key = ec.derive_private_key(int.from_bytes(raw, "big"), ec.SECP256R1())
        data = key.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode()
    except (ValueError, TypeError):
        return ""


def reminder_spec(task):
    minutes = task.get("reminderMinutes")
    if task.get("done") or minutes is None or not task.get("scheduledDate") or not task.get("startTime"):
        return None
    local = datetime.fromisoformat(f"{task['scheduledDate']}T{task['startTime']}").replace(tzinfo=ZoneInfo(task.get("timeZone", "Africa/Lagos")))
    due = local.astimezone(dt_timezone.utc) - timedelta(minutes=minutes)
    identity = [str(task["id"]), local.isoformat(), minutes]
    fingerprint = hashlib.sha256(json.dumps(identity).encode()).hexdigest()
    return fingerprint, due


def reconcile_reminders(workspace, tasks):
    desired = {}
    for task in tasks:
        spec = reminder_spec(task)
        if spec:
            fingerprint, due = spec
            desired[fingerprint] = (str(task["id"]), due)
    Reminder.objects.filter(workspace=workspace, state="pending").exclude(fingerprint__in=desired).update(state="cancelled")
    for fingerprint, (task_id, due) in desired.items():
        reminder, created = Reminder.objects.get_or_create(workspace=workspace, fingerprint=fingerprint,
            defaults={"task_id": task_id, "due_at": due})
        if not created and reminder.state == "cancelled" and due > timezone.now():
            reminder.state = "pending"
            reminder.save(update_fields=["state"])


def send_push(device, payload):
    """Returns a sanitized result. Never log endpoints, encryption keys or provider bodies."""
    try:
        with NoRedirectSession() as session:
            webpush(subscription_info={"endpoint": device.endpoint, "keys": device.keys}, data=json.dumps(payload),
                vapid_private_key=settings.WEBPUSH_PRIVATE_KEY, vapid_claims={"sub": settings.WEBPUSH_SUBJECT},
                ttl=300, timeout=10, requests_session=session)
        return "sent"
    except WebPushException as error:
        code = getattr(getattr(error, "response", None), "status_code", None)
        if code in {404, 410}:
            device.delete()
            return "expired"
        return "failed"
    except Exception:
        # An ambiguous network timeout is not retried automatically: a push may already be accepted.
        return "failed"


def dispatch_due(now=None):
    if not public_key():
        return {"configured": False, "sent": 0, "failed": 0}
    now = now or timezone.now()
    Reminder.objects.filter(state="pending", due_at__lt=now - timedelta(minutes=15)).update(state="expired")
    sent = failed = 0
    deadline = time.monotonic() + 25
    jobs = list(Reminder.objects.filter(state="pending", due_at__lte=now).order_by("due_at")[:50])
    for reminder in jobs:
        if time.monotonic() >= deadline:
            break
        # Re-read the current task: removed/completed/rescheduled work must not trigger an old job.
        task = Task.objects.filter(project__workspace_id=reminder.workspace_id, client_id=reminder.task_id).first()
        if not task or not reminder_spec(task.content) or reminder_spec(task.content)[0] != reminder.fingerprint:
            Reminder.objects.filter(pk=reminder.pk, state="pending").update(state="cancelled")
            continue
        devices = list(PushDevice.objects.filter(user_id=reminder.workspace.user_id))
        if not devices:
            continue  # Can deliver after device opt-in within the catch-up window.
        finished = True
        for device in devices:
            if time.monotonic() >= deadline:
                finished = False
                break
            with transaction.atomic():
                delivery, _ = PushDelivery.objects.get_or_create(reminder=reminder, device=device)
                claimed = PushDelivery.objects.filter(pk=delivery.pk, state="pending", reminder__state="pending").update(state="sending", attempted_at=now)
            if not claimed:
                continue
            # Generic text avoids putting task names/notes on a locked phone screen.
            result = send_push(device, {"title": "Hibi reminder", "body": "A planned task is due. Open Hibi to see it.",
                "taskId": reminder.task_id, "tag": f"hibi-reminder-{reminder.pk}"})
            PushDelivery.objects.filter(pk=delivery.pk).update(state=result)
            sent += result == "sent"
            failed += result == "failed"
        if finished:
            Reminder.objects.filter(pk=reminder.pk, state="pending").update(state="processed")
    return {"configured": True, "sent": sent, "failed": failed}
