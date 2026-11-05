from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from .scheduling import ScheduleInput
from .services.task_parser import extract_tasks


class MessageInput(serializers.Serializer):
    text = serializers.CharField(max_length=20000, trim_whitespace=True)
    timeZone = serializers.CharField(max_length=100, default="Africa/Lagos")

    def validate_timeZone(self, value):
        return ScheduleInput().validate_timeZone(value)


class MessageTasksView(APIView):
    def post(self, request):
        serializer = MessageInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(extract_tasks(serializer.validated_data["text"], serializer.validated_data["timeZone"]))
