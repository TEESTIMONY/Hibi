# Account storage and synchronization

## Run locally

The Django database has been migrated. Run the frontend with `npm run dev` and the backend separately with:

```powershell
backend/.venv/Scripts/python.exe backend/manage.py runserver 127.0.0.1:8000
```

The ignored root `.env` now points the local frontend at `http://127.0.0.1:8000`. This local address is not committed or used by Vercel. For a deployment, set `HIBI_API_BASE_URL` to the hosted HTTPS Django origin and allow the frontend origin in Django.

Open the planner without `?preview=opening`. Click **Sign in** near the bottom of the sidebar. Enter a username and password, selecting **Create a new account** if needed. Django validates and hashes passwords; no default account or password is installed. Password reset and email verification remain future work.

New accounts start empty with a Personal space. Use **Import this device’s tasks** to copy the current guest workspace, including any demo entries it contains. The guest data remains untouched. Import is offered only before the first account save, preventing accidental repeated migration.

## Persistence

- `/api/auth/register` creates an account and issues a token.
- `/api/auth/me` returns the authenticated account identity.
- `GET /api/workspace` returns that account's projects, tasks, and revision.
- `PUT /api/workspace` atomically replaces the account workspace, provided its revision still matches.

Django stores a per-user Workspace, ordered Project rows, and ordered Task rows. Validated task documents include title, notes, timing, completion, checklist entries, and optional AI deadlines/priority/effort/origin. Both legacy numeric IDs and new UUIDs are accepted; API output normalizes IDs to strings. Task notes are supported; standalone notebooks are not implemented yet.

The first version uses a bounded workspace snapshot API rather than independent requests for each checkbox. Limits are 200 projects, 5,000 tasks, 200 checklist entries per task, and 60,000 characters per task note. Invalid requests never partially delete or replace existing data. All routes scope data to the authenticated user; submitted user IDs are never used to select the owner.

## Pending changes and conflicts

The browser writes a private account-specific cache before sending an edit. Guest storage retains its original key. Account caches include the API origin and user ID, avoiding mixing multiple users' data. Do not treat a shared browser profile as private storage: cached notes remain on this device after signing out.

A single save runs per tab, queuing edits made while a previous save is in flight. Pending edits survive a failed network request. Reconnecting triggers a retry, and **Retry sync** is available in the account panel. If the initial account connection fails, editing is blocked until the connection can establish the correct workspace.

A stale revision receives HTTP 409. It is never silently overwritten or merged. **Load latest account version** first backs up pending edits on this device, then loads the server version. **Download device copy / backup** exports the most recent conflict backup, or the current device account copy when no backup exists. Merging backup edits is manual in this version.

Another device's changes appear when opening/reloading the account. Live push updates and automatic conflict merging are not implemented. Signing out through the account panel first attempts to save pending changes. Password recovery, automatic token expiration, robust production throttling/shared cache, and deployment still need production work.

## Verification

```powershell
backend/.venv/Scripts/python.exe backend/manage.py test planning
npm run check
npm test
npm run build
```

Tests cover owner isolation, authentication, password validation, complete task round trips, ordered projects, deletion, invalid inputs, revision conflicts, queued saves, offline retries, and local storage failure. Provider tests continue to use mocked HTTP without paid model calls.
