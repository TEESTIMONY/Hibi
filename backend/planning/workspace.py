from django.contrib.auth import get_user_model
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db import IntegrityError
from rest_framework import serializers, status, permissions
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import Workspace, Project, Task
from .services.push import reconcile_reminders


class RegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, max_length=128, trim_whitespace=False)

    class Meta:
        model = get_user_model()
        fields = ["username", "password"]

    def validate(self, attrs):
        try:
            validate_password(attrs["password"], get_user_model()(username=attrs["username"]))
        except ValidationError as exc:
            raise serializers.ValidationError({"password": exc.messages})
        return attrs


class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        serializer = RegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                user = get_user_model().objects.create_user(**serializer.validated_data)
                token = Token.objects.create(user=user)
        except IntegrityError:
            raise serializers.ValidationError({"username": "This username is already taken."})
        return Response({"token": token.key}, status=status.HTTP_201_CREATED)


class MeView(APIView):
    def get(self, request):
        return Response({"id": request.user.pk, "username": request.user.username})


class ChecklistSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=2000)
    done = serializers.BooleanField(default=False)


class TaskSerializer(serializers.Serializer):
    id = serializers.CharField(max_length=80)
    title = serializers.CharField(max_length=500)
    project = serializers.CharField(max_length=100)
    notes = serializers.CharField(max_length=60000, allow_blank=True, default="")
    when = serializers.ChoiceField(choices=["Inbox", "Today", "This Evening", "Tomorrow", "Anytime", "Someday"])
    tag = serializers.CharField(max_length=100, allow_blank=True, default="")
    done = serializers.BooleanField(default=False)
    checks = ChecklistSerializer(many=True, max_length=200, default=list)
    dueDate = serializers.DateField(required=False, allow_null=True, format="%Y-%m-%d")
    priority = serializers.ChoiceField(choices=["low", "medium", "high"], required=False)
    estimatedMinutes = serializers.IntegerField(min_value=1, max_value=10080, required=False, allow_null=True)
    origin = serializers.ChoiceField(choices=["ai-plan"], required=False)
    scheduledDate = serializers.DateField(required=False, allow_null=True, format="%Y-%m-%d")
    startTime = serializers.TimeField(required=False, allow_null=True, format="%H:%M", input_formats=["%H:%M", "%H:%M:%S"])
    durationMinutes = serializers.IntegerField(min_value=1, max_value=1440, required=False, allow_null=True)
    timeZone = serializers.CharField(max_length=100, default="Africa/Lagos")
    reminderMinutes = serializers.ChoiceField(choices=[0, 5, 10, 15, 30, 60, 1440], required=False, allow_null=True)

    def validate_timeZone(self, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise serializers.ValidationError("Use a valid IANA timezone, such as Africa/Lagos.")
        return value

    def validate(self, attrs):
        start = attrs.get("startTime")
        if attrs.get("reminderMinutes") is not None and not start:
            raise serializers.ValidationError("A reminder requires a scheduled start time.")
        if start:
            if start.second or start.microsecond:
                raise serializers.ValidationError({"startTime": "Use minute precision (HH:MM)."})
            if not attrs.get("scheduledDate") or not attrs.get("durationMinutes"):
                raise serializers.ValidationError("A timed task requires a scheduled date and duration.")
            local = datetime.combine(attrs["scheduledDate"], start)
            zone = ZoneInfo(attrs["timeZone"])
            round_trip = local.replace(tzinfo=zone).astimezone(timezone.utc).astimezone(zone).replace(tzinfo=None)
            if round_trip != local:
                raise serializers.ValidationError({"startTime": "This local time does not exist because of a daylight-saving clock change."})
        return attrs


class WorkspaceSerializer(serializers.Serializer):
    revision = serializers.IntegerField(min_value=0)
    projects = serializers.ListField(child=serializers.CharField(max_length=100), max_length=200)
    tasks = TaskSerializer(many=True, max_length=5000)

    def validate(self, attrs):
        names = attrs["projects"]
        ids = [task["id"] for task in attrs["tasks"]]
        if len(names) != len(set(names)) or len(ids) != len(set(ids)):
            raise serializers.ValidationError("Projects and task IDs must be unique.")
        if any(task["project"] not in names for task in attrs["tasks"]):
            raise serializers.ValidationError("Every task must belong to a project in this workspace.")
        return attrs


def snapshot(workspace):
    tasks = Task.objects.filter(project__workspace=workspace).order_by("position")
    return {"revision": workspace.revision, "projects": list(workspace.projects.values_list("name", flat=True)),
            "tasks": [task.content for task in tasks]}


class WorkspaceView(APIView):
    def get(self, request):
        # Read revision and children consistently with concurrent writes.
        with transaction.atomic():
            workspace, _ = Workspace.objects.get_or_create(user=request.user)
            workspace = Workspace.objects.select_for_update().get(pk=workspace.pk)
            return Response(snapshot(workspace))

    def put(self, request):
        serializer = WorkspaceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.data  # Date fields serialize to JSON strings.
        with transaction.atomic():
            workspace, _ = Workspace.objects.get_or_create(user=request.user)
            # Compare-and-swap prevents stale tabs/devices from replacing newer data.
            changed = Workspace.objects.filter(pk=workspace.pk, revision=data["revision"]).update(revision=data["revision"] + 1)
            if not changed:
                return Response({"error": "This workspace changed on another device. Reload its latest version before saving."}, status=409)
            workspace.projects.all().delete()
            projects = {name: Project.objects.create(workspace=workspace, name=name, position=index)
                        for index, name in enumerate(data["projects"])}
            Task.objects.bulk_create([Task(project=projects[task["project"]], client_id=task["id"],
                                          position=index, content=task) for index, task in enumerate(data["tasks"])])
            reconcile_reminders(workspace, data["tasks"])
        return Response({"revision": data["revision"] + 1})
