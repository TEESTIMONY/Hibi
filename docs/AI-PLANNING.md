# AI planning architecture

The UI is deployed separately from the Django REST API.

- [Backend setup, endpoints, and algorithms](../backend/README.md)
- [Frontend and backend deployment](DEPLOYMENT.md)

Frontend intake, source gathering, voice recording, selection, and approved-task import live in src/features/ai. Model calls, transcription, source validation, access control, and plan history live in backend/planning. OpenAI keys are private backend configuration, never frontend build variables.

The UI can be hosted on Vercel immediately without an API address. AI will remain explicitly disconnected until HIBI_API_BASE_URL is configured and the Django API is available. No fake model output is returned.
