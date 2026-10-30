# Separate frontend and API deployment

## Vercel: UI only

Push this source state to GitHub, then import the repository into Vercel. Use the repository root, Framework Preset **Other**, Build Command `npm run build`, and Output Directory `dist`. These are also declared in `vercel.json`.

Do not configure an OpenAI key in Vercel. The build publishes only `index.html`, browser modules/styles, and public assets. No Django code, database, `.env`, or model credentials enter `dist/`. Manifest, worker, and icon files are copied to the output root so `/manifest.webmanifest`, `/sw.js`, and `/icon.svg` resolve correctly.

Leave `HIBI_API_BASE_URL` unset to deploy a self-contained UI. Its task planner, notes, projects, themes, opening screen, and AI intake interface work. AI generation shows a clear disconnected state rather than calling a missing endpoint.

For later API integration, add this **public build-time variable** and redeploy:

```text
HIBI_API_BASE_URL=https://api.your-domain.example
```

Use the backend origin only, without `/api`, passwords, query parameters, or trailing route segments. Deployed API addresses require HTTPS. Local development also accepts `http://127.0.0.1:8000`.

## Django: host separately

Deploy the `backend/` application on a host supporting Python WSGI/ASGI and persistent database storage. This change does not create or deploy that hosting service.

Typical commands on Linux:

```sh
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --timeout 180
```

Set production environment variables:

```text
DJANGO_DEBUG=false
DJANGO_SECRET_KEY=<a long random private secret>
DJANGO_ALLOWED_HOSTS=api.your-domain.example
DATABASE_URL=<your private PostgreSQL connection URL>
HIBI_FRONTEND_ORIGINS=https://your-project.vercel.app,https://your-custom-domain.example
OPENAI_API_KEY=<your private OpenAI key>
OPENAI_MODEL=gpt-5-mini
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
```

Allow only your actual frontend origins; no wildcard CORS is configured. The default production settings enforce HTTPS. Set up TLS forwarding correctly on your host; if it terminates TLS at a reverse proxy, configure Django's proxy SSL handling only for that trusted proxy. Serve the collected admin static files through the backend host's static-file/CDN setup if you use the admin UI.

Run `python manage.py check --deploy` against production settings. Create an account with `python manage.py createsuperuser`, or provision ordinary Django users through your account-management process. There are no bundled users or passwords. Registration, password reset, social login, and task synchronization are not part of this first API.

## Authentication and requests

The browser signs in to `/api/auth/token` using a Django username/password. It stores the returned DRF token in session storage, scoped to the configured API origin. Protected requests send `Authorization: Token <token>` over HTTPS. Logout revokes the token. Basic DRF tokens do not expire automatically; account provisioning and token rotation should be considered before broader distribution.

AI requests go directly to Django, which validates source limits and calls OpenAI. The API exposes rate-limited planning and stores plan history per user. The initial throttles use Django's default local-memory cache; production multi-worker rate enforcement should use a shared cache. Long-running workloads may eventually need a background job queue.

## WhatsApp sharing with a static UI

An installed compatible PWA can receive multipart shares at `/share`. Its service worker intercepts that request in the browser and places source text/files in IndexedDB before redirecting to the review UI. No Vercel Function or backend-memory token exchange is used.

The browser deletes consumed shares; unopened shares expire after ten minutes and are pruned on the next received share. At most five pending shares are retained. IndexedDB may be evicted by the browser and is not durable cloud storage. Nothing is sent to the API until the user requests a plan.

This requires a supported installed PWA with an active worker, normally Android/Chromium. It is not an iPhone native share extension. Real-device sharing and microphone access still need device verification after hosting; API and UI tests cannot confirm OS share-sheet availability.

Official platform references:

- [Vercel static project configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [Django deployment checklist](https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/)
- [DRF token authentication](https://www.django-rest-framework.org/api-guide/authentication/)
