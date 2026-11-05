from datetime import datetime, timezone
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import SimpleTestCase
from rest_framework.test import APITestCase

from .models import Task
from .services.task_parser import extract_tasks

NOW = datetime(2030, 1, 2, 10, tzinfo=timezone.utc)


def parse(text, **kwargs):
    return extract_tasks(text, now=NOW, **kwargs)["suggestions"]


class ParserTests(SimpleTestCase):
    def test_clear_actions_dates_durations_and_source(self):
        result = parse("Please submit the report by Friday.\nCall Ada tomorrow at 3pm for 30 minutes.")
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["dueDate"], "2030-01-04")
        self.assertIsNone(result[0]["scheduledDate"])
        self.assertEqual(result[1]["scheduledDate"], "2030-01-03")
        self.assertEqual(result[1]["durationMinutes"], 30)
        self.assertEqual(result[1]["mentionedTime"], "15:00")
        self.assertEqual(result[0]["source"], "Please submit the report by Friday.")

    def test_negation_completion_conditional_and_general_chat_are_not_tasks(self):
        for text in ["Don't send the report", "Please don’t send it", "Send the report if Ada agrees", "Call Ada, already done", "Maybe buy milk", "Send it, not today", "Good morning everyone", "The meeting was useful"]:
            self.assertEqual(parse(text), [], text)

    def test_whatsapp_speaker_bullets_duplicates_and_explicit_priority(self):
        result = parse("[02/01/2030, 10:00] Ada: Please call John tomorrow urgent\n- Call John tomorrow urgent\n2. Buy milk")
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["priority"], "high")
        self.assertTrue(any("responsible" in warning for warning in result[0]["warnings"]))

    def test_dates_are_not_guessed_for_ambiguous_or_conflicting_dates(self):
        for text in ["Submit it on 04/05", "Submit it next week", "Submit it tomorrow or Friday", "Submit it on 2030-02-30"]:
            result = parse(text)[0]
            self.assertIsNone(result["scheduledDate"])
            self.assertTrue(result["warnings"])

    def test_iso_dates_and_timezone_aware_relative_dates(self):
        self.assertEqual(parse("Review the report on 2030-02-12")[0]["scheduledDate"], "2030-02-12")
        instant = datetime(2030, 1, 2, 23, 30, tzinfo=timezone.utc)
        result = extract_tasks("Call Ada tomorrow", "Africa/Lagos", now=instant)
        self.assertEqual(result["suggestions"][0]["scheduledDate"], "2030-01-04")

    def test_multiple_actions_and_durations_need_review(self):
        result = parse("Call Ada and email John for 20 minutes or 40 minutes")[0]
        self.assertIsNone(result["durationMinutes"])
        self.assertTrue(any("multiple actions" in warning for warning in result["warnings"]))

    def test_relative_start_is_not_a_duration_estimate(self):
        result = parse("Call Ada in 30 minutes")[0]
        self.assertIsNone(result["durationMinutes"])
        self.assertTrue(any("relative start" in warning for warning in result["warnings"]))

    def test_duration_and_clock_validation(self):
        self.assertEqual(parse("Study for 1.5 hours at 12am")[0]["durationMinutes"], 90)
        self.assertEqual(parse("Study for 1.5 hours at 12am")[0]["mentionedTime"], "00:00")
        result = parse("Study for 9000 minutes at 29:70")[0]
        self.assertIsNone(result["durationMinutes"])
        self.assertIsNone(result["mentionedTime"])

    def test_limit_and_unrecognised_counts(self):
        result = extract_tasks("Hello there\n" + "\n".join(f"Review chapter {number}" for number in range(120)), now=NOW)
        self.assertEqual(len(result["suggestions"]), 100)
        self.assertEqual(result["skippedLines"], 1)


class ParserAPITests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_user("parser-user")

    def test_authentication_validation_and_no_side_effects(self):
        body = {"text": "Call Ada tomorrow", "timeZone": "Africa/Lagos"}
        self.assertEqual(self.client.post("/api/tasks/extract", body, format="json").status_code, 401)
        self.client.force_authenticate(self.user)
        response = self.client.post("/api/tasks/extract", body, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["suggestions"]), 1)
        self.assertEqual(Task.objects.count(), 0)
        for invalid in [{"text": "x" * 20001}, {"text": ""}, {**body, "timeZone": "invalid"}]:
            self.assertEqual(self.client.post("/api/tasks/extract", invalid, format="json").status_code, 400)
