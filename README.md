# Hibi

Hibi is split into two independently deployable applications:

- **Frontend:** HTML, CSS, and JavaScript in the project root. Deploy this UI to Vercel.
- **Backend:** Django 5.2 + Django REST Framework in `backend/`. Host it separately when you are ready for AI.

No backend or OpenAI key is required to use the planner UI in device-only mode. Connect Django and sign in for account storage.

## Frontend: run locally

Requires Node.js 20.12 or newer. No npm dependencies need installing.

```sh
npm run dev
```

Open http://127.0.0.1:5173. The default is UI-only mode. Refresh after source edits.

```sh
npm run check
npm test
npm run build
```

`dist/` is generated frontend output. Do not edit it. The source is `index.html`, `src/`, and `public/`.

## Deploy only the UI to Vercel

Import the GitHub repository into Vercel with these settings:

| Setting | Value |
| --- | --- |
| Root directory | Repository root (`.`) |
| Framework preset | Other |
| Build command | `npm run build` |
| Output directory | `dist` |

`vercel.json` already defines the build and output. Leave `HIBI_API_BASE_URL` unset for UI-only hosting. **Do not add an OpenAI API key to the frontend or Vercel project.** No Vercel Functions or Python backend are deployed by this setup.

When Django is hosted, set the public Vercel build variable `HIBI_API_BASE_URL=https://your-api.example.com` and redeploy. This is a public origin, not a secret. Set Django's `HIBI_FRONTEND_ORIGINS` to the exact frontend URL. Files and AI requests then go directly from the browser to Django, without going through Vercel Functions.

See [deployment instructions](docs/DEPLOYMENT.md) for the full setup.

## Backend: run separately

Requires Python 3.10 or newer.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python manage.py migrate
.\.venv\Scripts\python manage.py createsuperuser
.\.venv\Scripts\python manage.py runserver 127.0.0.1:8000
```

Put your OpenAI key in **backend/.env**. For local integration, set `HIBI_API_BASE_URL=http://127.0.0.1:8000` in the root `.env`, then restart `npm run dev`. Open **Plan with AI** and sign in with the Django account you created. No account or default password is bundled.

[Backend API documentation](backend/README.md) describes authentication, endpoints, tests, and production configuration.

## Structure

```text
index.html               Frontend shell and opening screen
src/
  main.js                UI startup and event handling
  components/            Sidebar, dashboard, task editor, task list
  domain/                Browser task filtering and checklist helpers
  features/ai/           Intake UI, API client, approved-task import, voice capture
  services/storage.js    Browser task storage (existing keys preserved)
  styles/                Stylesheets
  config.js              Public API origin; generated during build/dev
public/
  sw.js                  Browser-local incoming share handling
  manifest.webmanifest   Installable app and share target
  icon.svg               Hibi logo
backend/
  config/                Django settings, URLs, WSGI and ASGI
  planning/              REST endpoints, serializers, model, AI service, tests
  requirements.txt       Python dependencies
scripts/                 Frontend-only dev server, checks, static build
vercel.json              UI-only hosting configuration
docs/                    Deployment and AI architecture documentation
tests/                   Frontend tests
```

## Data and sharing

Tasks and theme preferences use the original browser storage keys, so renaming/refactoring does not discard them. Browser data remains local to an origin; deploying to a new domain does not transfer localhost tasks. Accepted AI tasks use the same storage and synchronization path as manually created tasks; generated plan history belongs to the authenticated Django user. Signed-in tasks and projects now synchronize through Django, with per-account device caches, explicit guest import, and conflict protection. See [account storage](docs/ACCOUNTS.md).

On compatible installed Android/Chromium PWAs, incoming WhatsApp shares are handled by a service worker and stored temporarily in this browser's IndexedDB. They do not require a Vercel backend. Sources are not sent to Django/OpenAI until you explicitly choose to analyze them. Expired shares are removed on the next share; consumed shares are deleted immediately. iPhone native sharing still needs a separate native extension.

The opening-screen observation link is `/?preview=opening`.
