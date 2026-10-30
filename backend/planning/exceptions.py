from rest_framework.exceptions import APIException
from rest_framework.views import exception_handler
from rest_framework.response import Response
from django.core.exceptions import RequestDataTooBig


class PlanningError(APIException):
    status_code = 502
    default_detail = "The planning provider could not complete this request."

    def __init__(self, message, status=502):
        self.status_code = status
        super().__init__(message)


def api_exception_handler(exc, context):
    if isinstance(exc, RequestDataTooBig):
        return Response({"error": "Source upload is too large."}, status=413)
    response = exception_handler(exc, context)
    if response is not None:
        detail = response.data.get("detail") if isinstance(response.data, dict) else None
        response.data = {"error": str(detail) if detail else "Please check the submitted fields.", "details": response.data}
    return response
