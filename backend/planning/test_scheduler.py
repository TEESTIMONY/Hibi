from copy import deepcopy
from datetime import date, datetime, time, timezone
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase
from django.core.cache import cache
from rest_framework.test import APITestCase

from .models import Workspace, Project, Task
from .services.scheduler import propose_schedule

NOW = datetime(2030, 1, 2, 7, tzinfo=timezone.utc)


def task(identifier="one", **fields):
    return {"id": identifier, "title": identifier, "project": "Personal", "done": False, "when": "Today", "timeZone": "Africa/Lagos", "durationMinutes": 30, **fields}


def plan(tasks, **options):
    config = dict(start_date=date(2030, 1, 2), days=1, start_time=time(9), end_time=time(12),
                  time_zone="Africa/Lagos", selected=[{"id": item["id"]} for item in tasks], break_minutes=5, now=NOW)
    config.update(options)
    return propose_schedule(tasks, **config)


class SchedulerTests(SimpleTestCase):
    def test_fixed_slots_priority_and_breaks_without_mutating_input(self):
        tasks = [task("fixed", scheduledDate="2030-01-02", startTime="09:00", durationMinutes=60), task("low", priority="low"), task("high", priority="high")]
        before = deepcopy(tasks)
        result = plan(tasks)
        self.assertEqual([(item["id"], item["startTime"]) for item in result["proposals"]], [("high", "10:00"), ("low", "10:35")])
        self.assertEqual(tasks, before)
        self.assertIn("existing", result["unplanned"][0]["reason"])

    def test_deadlines_take_precedence_and_overdue_deadlines_are_reported(self):
        tasks = [task("late", dueDate="2030-01-01"), task("urgent", dueDate="2030-01-02", priority="low"), task("important", priority="high")]
        result = plan(tasks)
        self.assertEqual(result["proposals"][0]["id"], "urgent")
        self.assertIn("already passed", next(item["reason"] for item in result["unplanned"] if item["id"] == "late"))

    def test_no_room_or_missing_estimates_are_not_guessed(self):
        result = plan([task("large", durationMinutes=240), task("unknown", durationMinutes=None), task("done", done=True)])
        self.assertEqual(result["proposals"], [])
        self.assertEqual(len(result["unplanned"]), 3)

    def test_fits_gaps_and_never_splits_a_task(self):
        tasks = [task("fixed", scheduledDate="2030-01-02", startTime="10:00", durationMinutes=60), task("long", durationMinutes=90)]
        self.assertFalse(plan(tasks)["proposals"])
        result = plan(tasks, days=2)
        self.assertEqual(result["proposals"][0]["scheduledDate"], "2030-01-03")

    def test_past_unfinished_slots_can_move_forward_but_future_dates_are_respected(self):
        result = plan([task("old", scheduledDate="2030-01-01", startTime="09:00"), task("future", scheduledDate="2030-01-04")], days=3)
        self.assertEqual([(item["id"], item["scheduledDate"]) for item in result["proposals"]], [("old", "2030-01-02"), ("future", "2030-01-04")])

    def test_tomorrow_and_current_time_are_respected(self):
        self.assertFalse(plan([task(when="Tomorrow")])["proposals"])
        result = plan([task()], now=datetime(2030, 1, 2, 9, 12, 3, tzinfo=timezone.utc))
        self.assertEqual(result["proposals"][0]["startTime"], "10:13")

    def test_evening_tasks_do_not_get_scheduled_in_the_morning(self):
        self.assertFalse(plan([task(when="This Evening")])["proposals"])
        result = plan([task(when="This Evening")], start_time=time(17), end_time=time(21))
        self.assertEqual(result["proposals"][0]["startTime"], "18:00")

    def test_cross_timezone_fixed_slots_and_deadlines_keep_their_meaning(self):
        tasks = [task("fixed", timeZone="UTC", scheduledDate="2030-01-02", startTime="08:00", durationMinutes=60), task("foreign", timeZone="UTC", dueDate="2030-01-02")]
        result = plan(tasks)
        self.assertEqual(result["proposals"][0]["startTime"], "09:00")
        self.assertEqual(result["proposals"][0]["timeZone"], "UTC")

    def test_overnight_commitments_block_the_next_day(self):
        tasks = [task("overnight", timeZone="UTC", scheduledDate="2030-01-01", startTime="23:00", durationMinutes=600), task("free")]
        result = plan(tasks)
        self.assertEqual(result["proposals"][0]["startTime"], "10:00")

    def test_invalid_hours_past_dates_and_dst_gaps_are_rejected(self):
        with self.assertRaises(ValueError):
            plan([task()], end_time=time(8))
        with self.assertRaises(ValueError):
            plan([task()], start_date=date(2030, 1, 1))
        with self.assertRaises(ValueError):
            plan([task()], start_date=date(2030, 3, 10), time_zone="America/New_York", start_time=time(2, 30))

    def test_existing_overlap_warning(self):
        result = plan([task("a", scheduledDate="2030-01-02", startTime="09:00", durationMinutes=60), task("b", scheduledDate="2030-01-02", startTime="09:30")])
        self.assertEqual(len(result["warnings"]), 1)

    def test_second_occurrence_of_dst_clock_time_is_not_silently_saved_as_first(self):
        now = datetime(2030, 11, 3, 6, 15, tzinfo=timezone.utc)
        result = plan([task(timeZone="America/New_York")], start_date=date(2030, 11, 3),
                      start_time=time(0), end_time=time(4), time_zone="America/New_York", now=now)
        self.assertFalse(result["proposals"])
        self.assertIn("ambiguous", result["unplanned"][0]["reason"])


class ScheduleAPITests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_user("scheduler")
        self.workspace = Workspace.objects.create(user=self.user)
        project = Project.objects.create(workspace=self.workspace, name="Personal", position=0)
        Task.objects.create(project=project, client_id="one", position=0, content=task())
        self.body = {"revision": 0, "startDate": "2030-01-02", "days": 1, "startTime": "09:00", "endTime": "12:00", "timeZone": "Africa/Lagos", "selected": [{"id": "one"}]}

    def test_preview_requires_auth_and_never_writes_tasks(self):
        self.assertEqual(self.client.post("/api/schedule/preview", self.body, format="json").status_code, 401)
        self.client.force_authenticate(self.user)
        from .services.scheduler import propose_schedule as actual
        with patch("planning.scheduling.propose_schedule", side_effect=lambda tasks, **kwargs: actual(tasks, **kwargs, now=NOW)):
            response = self.client.post("/api/schedule/preview", self.body, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(response.data["proposals"]), 1)
        self.assertNotIn("scheduledDate", Task.objects.get().content)
        self.workspace.refresh_from_db()
        self.assertEqual(self.workspace.revision, 0)

    def test_foreign_ids_duplicate_ids_stale_revision_and_invalid_inputs(self):
        self.client.force_authenticate(self.user)
        for patch_data, expected in [({"selected": [{"id": "foreign"}]}, 400), ({"selected": [{"id": "one"}, {"id": "one"}]}, 400),
                                     ({"revision": 99}, 409), ({"days": 15}, 400), ({"timeZone": "invalid"}, 400),
                                     ({"selected": [{"id": "one", "durationMinutes": 0}]}, 400)]:
            response = self.client.post("/api/schedule/preview", {**self.body, **patch_data}, format="json")
            self.assertEqual(response.status_code, expected, response.data)
