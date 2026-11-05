from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.conf import settings
from django.core.management import call_command, CommandError
from django.test import SimpleTestCase, override_settings
from dotenv import dotenv_values


class GmailSetupTests(SimpleTestCase):
    def test_credentials_are_verified_and_privately_saved_without_overwriting_other_settings(self):
        temp_root = Path(settings.BASE_DIR) / ".tmp"
        temp_root.mkdir(exist_ok=True)
        with TemporaryDirectory(dir=temp_root) as directory, override_settings(BASE_DIR=Path(directory)):
            path = Path(directory) / ".env"
            path.write_text("OPENAI_API_KEY=synthetic-preserve\n", encoding="utf8")
            output = StringIO()
            with patch("planning.management.commands.configure_gmail.getpass.getpass", return_value="abcd efgh ijkl mnop"), patch("planning.management.commands.configure_gmail.smtplib.SMTP") as smtp:
                call_command("configure_gmail", email="yourhibiplanner@gmail.com", stdout=output)
                smtp.return_value.__enter__.return_value.starttls.assert_called_once()
                smtp.return_value.__enter__.return_value.login.assert_called_once_with("yourhibiplanner@gmail.com", "abcdefghijklmnop")
            values = dotenv_values(path)
            self.assertEqual(values["OPENAI_API_KEY"], "synthetic-preserve")
            self.assertEqual(values["EMAIL_HOST"], "smtp.gmail.com")
            self.assertEqual(values["EMAIL_HOST_PASSWORD"], "abcdefghijklmnop")
            self.assertNotIn("abcdefghijklmnop", output.getvalue())

    def test_connection_failure_does_not_save_credentials(self):
        with patch("planning.management.commands.configure_gmail.getpass.getpass", return_value="abcdefghijklmnop"), patch("planning.management.commands.configure_gmail.smtplib.SMTP", side_effect=OSError("synthetic failure")), patch("planning.management.commands.configure_gmail.set_key") as save:
            with self.assertRaises(CommandError):
                call_command("configure_gmail", email="yourhibiplanner@gmail.com")
            save.assert_not_called()
