from django.conf import settings
from django.db import models


class SuggestedPlan(models.Model):
    """Reviewed plan drafts belong to the API account that requested them."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="suggested_plans")
    title = models.CharField(max_length=300)
    project = models.CharField(max_length=100)
    result = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
