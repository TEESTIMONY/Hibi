# Hibi Django REST API

This is a separately deployable Python backend. The Vercel frontend neither runs this project nor contains its credentials.

## Local setup

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python manage.py migrate
.\.venv\Scripts\python manage.py createsuperuser
.\.venv\Scripts\python manage.py runserver 127.0.0.1:8000
```

Edit backend/.env locally. Keep it out of Git. SQLite is used locally; set `DATABASE_URL` for a production PostgreSQL database. Set `HIBI_FRONTEND_ORIGINS` to the exact UI origins allowed to access this API.

## Endpoints

| Method | Route | Authentication | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | Public | Service health |
| GET | `/api/ai/status` | Public; optional token | Model readiness and authentication state; never exposes secrets |
| POST | `/api/auth/token` | Username/password JSON | Issue a DRF token |
| POST | `/api/auth/logout` | Token | Revoke the current token |
| POST | `/api/ai/plan` | Token | Validate sources, transcribe audio, generate and save a suggested plan |
| GET | `/api/plans` | Token | Latest 50 saved plan drafts belonging to this account |

API errors have an `error` message and, where available, field `details`. No route accepts an OpenAI key from the browser. User authentication is required before model use, regardless of CORS.

Example planning body:

```json
{
  "text": "Prepare the revised homepage copy tomorrow.",
  "goal": "Make this manageable",
  "project": "Work",
  "files": [{ "name": "notes.txt", "data": "base64-encoded-file-bytes" }]
}
```

Files are optional. Maximum eight files, 8 MB per file, 12 MB total; pasted notes up to 60,000 characters. PDF/DOCX use OpenAI file inputs, plain text is decoded server-side, and audio is transcribed before planning. Supported audio formats are MP3, MP4, M4A, WAV, WebM, and MPEG. OGG/Opus attachments need conversion.

The output contains title, summary, assumptions, questions, named sources, suggested tasks, and `planId`. Structured output validation checks source references, supported timing values, real calendar deadlines, and effort estimates. Tasks are not executed automatically. The frontend lets users edit/select suggestions before importing them into browser task storage.

The backend saves generated draft plans per authenticated user. It does not save uploaded source files as separate records and does not synchronize the UI's task lists. Model requests use `store: false`; provider-side retention policies still apply.

## Layout

```text
config/                     Django settings, root routes, WSGI/ASGI
planning/models.py          Per-user plan history
planning/serializers.py     Incoming source validation and response serialization
planning/views.py           REST API and authentication endpoints
planning/services/openai.py Provider calls, transcription, structured result validation
planning/services/plan-schema.json  Model output contract
planning/tests.py           API, access control, source validation, and provider tests
```

## Checks

```powershell
.\.venv\Scripts\python manage.py check
.\.venv\Scripts\python manage.py test planning
```

Provider tests use an injected mock HTTP transport. No real API calls or charges occur. See [deployment notes](../docs/DEPLOYMENT.md) before hosting publicly.
