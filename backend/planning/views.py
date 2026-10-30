from django.conf import settings
from rest_framework import generics, permissions, status
from rest_framework.authtoken.models import Token
from rest_framework.authtoken.serializers import AuthTokenSerializer
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .exceptions import PlanningError
from .models import SuggestedPlan
from .serializers import IntakeSerializer, PlanRecordSerializer
from .services.openai import OpenAIPlanner


class HealthView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response({"status": "ok", "service": "Hibi Django REST API"})


class AIStatusView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({
            "configured": bool(settings.OPENAI_API_KEY), "provider": "OpenAI", "model": settings.OPENAI_MODEL,
            "requiresAuth": True, "authenticated": request.user.is_authenticated,
        })


class TokenLoginView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        serializer = AuthTokenSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        token, _ = Token.objects.get_or_create(user=serializer.validated_data["user"])
        return Response({"token": token.key})


class TokenLogoutView(APIView):
    def post(self, request):
        request.auth.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SuggestPlanView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "planning"

    def post(self, request):
        serializer = IntakeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not settings.OPENAI_API_KEY:
            raise PlanningError("OpenAI is not configured on the Django backend.", 503)
        plan = OpenAIPlanner().suggest_plan(serializer.validated_data)
        record = SuggestedPlan.objects.create(
            user=request.user, title=plan["title"], project=serializer.validated_data["project"], result=plan,
        )
        return Response({**plan, "planId": record.pk})


class PlanHistoryView(generics.ListAPIView):
    serializer_class = PlanRecordSerializer

    def get_queryset(self):
        return SuggestedPlan.objects.filter(user=self.request.user)[:50]
