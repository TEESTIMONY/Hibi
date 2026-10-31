from django.conf import settings
from django.db import models


class Workspace(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    revision = models.PositiveIntegerField(default=0)


class Project(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="projects")
    name = models.CharField(max_length=100)
    position = models.PositiveIntegerField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["workspace", "name"], name="unique_workspace_project")]
        ordering = ["position"]


class Task(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="tasks")
    client_id = models.CharField(max_length=80)
    position = models.PositiveIntegerField()
    # Validated task document retains notes, ordered checklist, deadlines and AI metadata.
    content = models.JSONField()

    class Meta:
        ordering = ["position"]


class SuggestedPlan(models.Model):
    """Reviewed plan drafts belong to the API account that requested them."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="suggested_plans")
    title = models.CharField(max_length=300)
    project = models.CharField(max_length=100)
    result = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-pk"]
