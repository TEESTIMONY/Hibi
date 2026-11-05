from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.db import transaction
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Workspace
from .workspace import snapshot
from .services.scheduler import propose_schedule


class SelectedTask(serializers.Serializer):
    id = serializers.CharField(max_length=80)
    durationMinutes = serializers.IntegerField(min_value=1, max_value=1440, required=False)
    priority = serializers.ChoiceField(choices=["high", "medium", "low"], required=False)


class ScheduleInput(serializers.Serializer):
    revision = serializers.IntegerField(min_value=0)
    startDate = serializers.DateField()
    days = serializers.IntegerField(min_value=1, max_value=14)
    startTime = serializers.TimeField(input_formats=["%H:%M"])
    endTime = serializers.TimeField(input_formats=["%H:%M"])
    timeZone = serializers.CharField(max_length=100)
    breakMinutes = serializers.IntegerField(min_value=0, max_value=60, default=5)
    selected = SelectedTask(many=True, max_length=200, allow_empty=False)

    def validate_timeZone(self, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise serializers.ValidationError("Choose a valid timezone, such as Africa/Lagos.")
        return value


class SchedulePreviewView(APIView):
    def post(self, request):
        serializer = ScheduleInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        with transaction.atomic():
            workspace, _ = Workspace.objects.get_or_create(user=request.user)
            workspace = Workspace.objects.select_for_update().get(pk=workspace.pk)
            current = snapshot(workspace)
        if current["revision"] != data["revision"]:
            return Response({"error": "Your workspace changed. Reload it before planning."}, status=409)
        ids = [item["id"] for item in data["selected"]]
        if len(ids) != len(set(ids)) or not set(ids).issubset({str(task["id"]) for task in current["tasks"]}):
            raise serializers.ValidationError("Select unique tasks from your own workspace.")
        try:
            result = propose_schedule(current["tasks"], start_date=data["startDate"], days=data["days"],
                                      start_time=data["startTime"], end_time=data["endTime"], time_zone=data["timeZone"],
                                      selected=data["selected"], break_minutes=data["breakMinutes"])
        except (ValueError, ZoneInfoNotFoundError, OverflowError) as exc:
            raise serializers.ValidationError(str(exc))
        return Response({**result, "revision": current["revision"]})
