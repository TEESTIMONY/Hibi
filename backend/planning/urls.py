from django.urls import path
from .views import AIStatusView, HealthView, PlanHistoryView, SuggestPlanView, TokenLoginView, TokenLogoutView
from .workspace import RegisterView, MeView, WorkspaceView

urlpatterns = [
    path("auth/register", RegisterView.as_view()),
    path("auth/me", MeView.as_view()),
    path("workspace", WorkspaceView.as_view()),
    path("health", HealthView.as_view()),
    path("auth/token", TokenLoginView.as_view()),
    path("auth/logout", TokenLogoutView.as_view()),
    path("ai/status", AIStatusView.as_view()),
    path("ai/plan", SuggestPlanView.as_view()),
    path("plans", PlanHistoryView.as_view()),
]
