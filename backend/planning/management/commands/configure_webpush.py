import base64
import os
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric import ec
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from dotenv import dotenv_values, set_key


class Command(BaseCommand):
    help = "Generate a server-only web-push key once and save it privately in backend/.env."

    def add_arguments(self, parser):
        parser.add_argument("--subject", required=True, help="A contact such as mailto:you@example.com")

    def handle(self, *args, **options):
        subject = options["subject"]
        if (not subject.startswith(("mailto:", "https://")) or any(character.isspace() for character in subject)
                or (subject.startswith("mailto:") and "@" not in subject[7:])):
            raise CommandError("Provide a valid mailto: or HTTPS contact without spaces.")
        path = Path(settings.BASE_DIR) / ".env"
        if settings.WEBPUSH_PRIVATE_KEY or (path.exists() and dotenv_values(path).get("WEBPUSH_PRIVATE_KEY")):
            raise CommandError("A key is already configured. Keep it: replacing it invalidates device subscriptions.")
        private = ec.generate_private_key(ec.SECP256R1()).private_numbers().private_value.to_bytes(32, "big")
        value = base64.urlsafe_b64encode(private).rstrip(b"=").decode()
        if not path.exists():
            descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.close(descriptor)
        os.chmod(path, 0o600)
        set_key(str(path), "WEBPUSH_PRIVATE_KEY", value)
        set_key(str(path), "WEBPUSH_SUBJECT", subject)
        self.stdout.write(self.style.SUCCESS("Notification keys saved privately. Restart Django; no secret values were displayed."))
