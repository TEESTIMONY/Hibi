from django.core.management.base import BaseCommand
from planning.services.push import dispatch_due


class Command(BaseCommand):
    help = "Dispatch due task reminders once. Run regularly using the included systemd timer."

    def handle(self, *args, **options):
        result = dispatch_due()
        if not result["configured"]:
            self.stdout.write("Notifications are not configured; no messages sent.")
            return
        self.stdout.write(f"Reminders sent: {result['sent']}; failed: {result['failed']}")
