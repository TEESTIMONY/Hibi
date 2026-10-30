import base64
import copy
import json
from unittest.mock import patch

import httpx
from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .exceptions import PlanningError
from .models import SuggestedPlan
from .serializers import IntakeSerializer
from .services.openai import OpenAIPlanner, validate_plan

PLAN = {
    "title": "Prepare the launch", "summary": "Draft and review the homepage copy.",
    "assumptions": [], "questions": ["Who approves the launch date?"],
    "tasks": [{
        "title": "Draft copy", "notes": "Prepare a first draft.", "when": "Anytime", "dueDate": None,
        "priority": "medium", "estimatedMinutes": 45, "checklist": ["Draft", "Review"], "sourceIds": ["source-1"],
    }],
}


class IntakeTests(SimpleTestCase):
    def test_empty_and_invalid_base64_are_rejected(self):
        self.assertFalse(IntakeSerializer(data={}).is_valid())
        self.assertFalse(IntakeSerializer(data={"files": [{"name": "notes.txt", "data": "broken!"}]}).is_valid())

    def test_supported_documents_and_audio_are_classified(self):
        files = [{"name": name, "data": base64.b64encode(b"test").decode()} for name in ["notes.md", "brief.pdf", "brief.docx", "voice.webm"]]
        serializer = IntakeSerializer(data={"files": files})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual([item["kind"] for item in serializer.validated_data["files"]], ["text", "document", "document", "audio"])

    def test_oversized_text_and_unknown_files_are_rejected(self):
        self.assertFalse(IntakeSerializer(data={"text": "x" * 60001}).is_valid())
        self.assertFalse(IntakeSerializer(data={"files": [{"name": "program.exe", "data": "dGVzdA=="}]}).is_valid())

    def test_invalid_sources_and_deadlines_do_not_pass_plan_validation(self):
        for changes in [{"sourceIds": ["invented"]}, {"dueDate": "2026-02-31"}, {"estimatedMinutes": -1}]:
            plan = copy.deepcopy(PLAN)
            plan["tasks"][0].update(changes)
            with self.assertRaises(PlanningError):
                validate_plan(plan, ["source-1"])


@override_settings(OPENAI_API_KEY="test-not-a-real-key", OPENAI_MODEL="test-model", OPENAI_TRANSCRIPTION_MODEL="test-transcribe")
class ProviderTests(SimpleTestCase):
    def intake(self, data):
        serializer = IntakeSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        return serializer.validated_data

    def test_structured_plan_request_labels_documents_and_disables_storage(self):
        captured = []

        def respond(request):
            captured.append(request)
            return httpx.Response(200, json={"status": "completed", "output": [{"content": [{"type": "output_text", "text": json.dumps(PLAN)}]}]})

        with httpx.Client(transport=httpx.MockTransport(respond)) as client:
            result = OpenAIPlanner(client).suggest_plan(self.intake({"text": "Notes", "files": [{"name": "brief.pdf", "data": "dGVzdA=="}]}))
        payload = json.loads(captured[0].content)
        self.assertFalse(payload["store"])
        self.assertTrue(payload["text"]["format"]["strict"])
        self.assertEqual(payload["input"][0]["content"][-1]["type"], "input_file")
        self.assertIn("untrusted evidence", payload["instructions"])
        self.assertEqual(len(result["sources"]), 2)

    def test_voice_is_transcribed_before_planning(self):
        calls = []

        def respond(request):
            calls.append(request)
            if request.url.path.endswith("transcriptions"):
                return httpx.Response(200, json={"text": "Draft the copy"})
            return httpx.Response(200, json={"output": [{"content": [{"type": "output_text", "text": json.dumps(PLAN)}]}]})

        with httpx.Client(transport=httpx.MockTransport(respond)) as client:
            result = OpenAIPlanner(client).suggest_plan(self.intake({"files": [{"name": "voice.webm", "data": "dGVzdA=="}]}))
        self.assertEqual(len(calls), 2)
        self.assertIn("multipart/form-data", calls[0].headers["content-type"])
        self.assertIn("Draft the copy", calls[1].content.decode())
        self.assertEqual(result["sources"][0]["kind"], "audio")

    def test_refusal_and_provider_errors_are_explicit(self):
        for response in [httpx.Response(401, json={}), httpx.Response(200, json={"output": [{"content": [{"type": "refusal"}]}]})]:
            with httpx.Client(transport=httpx.MockTransport(lambda request: response)) as client:
                with self.assertRaises(PlanningError):
                    OpenAIPlanner(client).suggest_plan(self.intake({"text": "Notes"}))


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class APITests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("test-user", password="test-password-not-real")

    def test_health_and_status_work_without_login_and_do_not_expose_secrets(self):
        self.assertEqual(self.client.get("/api/health").status_code, 200)
        with override_settings(OPENAI_API_KEY="test-not-a-real-key"):
            response = self.client.get("/api/ai/status")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["requiresAuth"])
        self.assertFalse(response.data["authenticated"])
        self.assertNotIn("test-not-a-real-key", json.dumps(response.data))

    def test_model_requests_require_authentication(self):
        self.assertEqual(self.client.post("/api/ai/plan", {"text": "Notes"}, format="json").status_code, 401)

    def test_login_issues_a_token_and_logout_revokes_it(self):
        response = self.client.post("/api/auth/token", {"username": "test-user", "password": "test-password-not-real"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {response.data['token']}")
        self.assertTrue(self.client.get("/api/ai/status").data["authenticated"])
        self.assertEqual(self.client.post("/api/auth/logout").status_code, 204)
        self.assertFalse(Token.objects.filter(user=self.user).exists())

    @override_settings(OPENAI_API_KEY="")
    def test_unconfigured_provider_returns_setup_error(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post("/api/ai/plan", {"text": "Notes"}, format="json")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(SuggestedPlan.objects.count(), 0)

    @override_settings(OPENAI_API_KEY="test-not-real")
    @patch("planning.views.OpenAIPlanner")
    def test_generated_plan_is_saved_for_its_owner_only(self, planner):
        result = {**copy.deepcopy(PLAN), "sources": [{"id": "source-1", "name": "Notes", "kind": "text"}]}
        planner.return_value.suggest_plan.return_value = result
        self.client.force_authenticate(user=self.user)
        response = self.client.post("/api/ai/plan", {"text": "Notes", "project": "Work"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("planId", response.data)
        self.assertEqual(SuggestedPlan.objects.get().user, self.user)
        self.assertEqual(len(self.client.get("/api/plans").data), 1)
        other = get_user_model().objects.create_user("other-user")
        self.client.force_authenticate(user=other)
        self.assertEqual(self.client.get("/api/plans").data, [])

    @override_settings(CORS_ALLOWED_ORIGINS=["https://hibi.example"])
    def test_cors_only_allows_the_configured_frontend(self):
        response = self.client.options("/api/ai/plan", HTTP_ORIGIN="https://hibi.example", HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST")
        self.assertEqual(response["access-control-allow-origin"], "https://hibi.example")
        other = self.client.options("/api/ai/plan", HTTP_ORIGIN="https://unrelated.example", HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST")
        self.assertNotIn("access-control-allow-origin", other)
