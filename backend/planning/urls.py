from django.urls import path
from .views import AIStatusView, HealthView, PlanHistoryView, SuggestPlanView, TokenLoginView, TokenLogoutView

urlpatterns = [
    path("health", HealthView.as_view()),
    path("auth/token", TokenLoginView.as_view()),
    path("auth/logout", TokenLogoutView.as_view()),
    path("ai/status", AIStatusView.as_view()),
    path("ai/plan", SuggestPlanView.as_view()),
    path("plans", PlanHistoryView.as_view()),
]
