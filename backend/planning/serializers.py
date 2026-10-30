import base64
import binascii
import re
from rest_framework import serializers
from .models import SuggestedPlan

MAX_FILE_BYTES = 8 * 1024 * 1024
MAX_TOTAL_BYTES = 12 * 1024 * 1024
MIME_TYPES = {
    "pdf": "application/pdf", "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "txt": "text/plain", "md": "text/plain", "csv": "text/plain", "json": "text/plain",
    "mp3": "audio/mpeg", "mp4": "audio/mp4", "m4a": "audio/mp4", "wav": "audio/wav",
    "webm": "audio/webm", "mpeg": "audio/mpeg",
}


class SourceSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=180)
    data = serializers.CharField(max_length=4 * ((MAX_FILE_BYTES + 2) // 3), trim_whitespace=False)

    def validate(self, attrs):
        name = re.sub(r"[\x00-\x1f]", "", attrs["name"])
        extension = name.rsplit(".", 1)[-1].lower()
        if extension not in MIME_TYPES:
            raise serializers.ValidationError("Unsupported file type. Use PDF, DOCX, text, or a supported audio file.")
        try:
            data = base64.b64decode(attrs["data"], validate=True)
        except (ValueError, binascii.Error):
            raise serializers.ValidationError("The file is not valid base64.")
        if not data or len(data) > MAX_FILE_BYTES:
            raise serializers.ValidationError("Each file must be non-empty and at most 8 MB.")
        kind = "text" if extension in {"txt", "md", "csv", "json"} else "document" if extension in {"pdf", "docx"} else "audio"
        if kind == "text" and len(data) > 100000:
            raise serializers.ValidationError("Text files must be under 100 KB.")
        return {"name": name, "bytes": data, "mime": MIME_TYPES[extension], "kind": kind}


class IntakeSerializer(serializers.Serializer):
    text = serializers.CharField(required=False, allow_blank=True, default="", max_length=60000)
    goal = serializers.CharField(required=False, allow_blank=True, default="", max_length=2000)
    project = serializers.CharField(required=False, default="Personal", max_length=100)
    files = SourceSerializer(many=True, required=False, default=list, max_length=8)

    def validate(self, attrs):
        if not attrs["text"].strip() and not attrs["files"]:
            raise serializers.ValidationError("Add a message, some notes, or at least one file.")
        if sum(len(source["bytes"]) for source in attrs["files"]) > MAX_TOTAL_BYTES:
            raise serializers.ValidationError("Source files must total no more than 12 MB.")
        return attrs


class PlanRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = SuggestedPlan
        fields = ["id", "title", "project", "result", "created_at"]
