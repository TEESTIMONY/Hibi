from django.http import JsonResponse


class HealthcheckMiddleware:
    """Only the public liveness route bypasses TLS/Host checks for ALB probes."""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path == "/api/health" and request.method in {"GET", "HEAD"}:
            return JsonResponse({"status": "ok", "service": "Hibi Django REST API"})
        return self.get_response(request)
