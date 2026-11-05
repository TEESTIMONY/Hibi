# Hibi's own scheduling engine

Open **Plan my time** beside the task list. Choose a start date, one/three/seven days, available hours and timezone, then select tasks, estimate durations and choose priorities. Preview the proposed schedule, review anything that did not fit, and choose **Apply plan**. Availability repeats on every day in the chosen range, including weekends.

The engine runs in Django using Python's standard library: no OpenAI key, external network calls, machine-learning model or extra dependency. It reads only the authenticated account's persisted workspace. Preview never changes tasks. Applying uses the existing workspace save/revision mechanism and reminder reconciliation; no database migration is needed.

## Rules

- Existing current/future time slots remain fixed, including commitments outside the selected tasks. Overlapping existing slots produce a warning.
- Completed tasks are not rescheduled. An unfinished past slot may move forward if explicitly selected.
- Tasks with an earlier deadline go first, then high/medium/low priority, then stable task ID. This is an explainable first-fit heuristic, not a guarantee of the mathematically optimal schedule.
- Each task needs a duration from the planner or its stored duration/estimate. Missing estimates are reported rather than guessed.
- A task must fit uninterrupted within an available window. The engine does not split tasks. Optional breaks separate newly planned tasks. Existing fixed slots have no added buffer.
- Explicit future scheduled dates and Tomorrow are earliest-start constraints. This Evening starts no earlier than 18:00 in the task's timezone.
- Deadlines are end-of-day in the original task timezone. Proposed slots retain that timezone, even when availability is entered in another timezone.
- Time is compared in UTC. Proposals never start in the past. Nonexistent availability times during daylight-saving changes are rejected; ambiguous availability uses the first occurrence. Proposed starts in the second occurrence of a repeated clock time are left unplanned because task slots cannot yet store a clock-fold indicator.
- Tasks that cannot fit are left unchanged, with a reason. Overdue deadlines require a user decision rather than being silently moved.

## Endpoint

`POST /api/schedule/preview` requires token authentication. Request: `revision`, `startDate` (YYYY-MM-DD), `days` (1–14), `startTime` and `endTime` (HH:MM), `timeZone`, optional `breakMinutes` (0–60), and `selected` (1–200 task IDs with optional `durationMinutes` and `priority`). Unknown/duplicate IDs are rejected. A stale revision returns 409.

Response: `revision`, `proposals`, `unplanned`, `warnings`, `plannedMinutes`. Each proposal includes task ID, date, time, duration, timezone, priority and a short explanation.

The browser flushes pending edits before preview, rejects applying a preview after local task changes, and uses the existing server revision check for cross-device conflicts. The account can still report pending sync if the network fails during apply; saved locally is not a guarantee of server persistence.

## Scope of this first version

This is scheduling existing tasks, not extracting tasks from free text. Dependencies, recurring availability, lunch breaks, split tasks, calendar integration and automatic duration prediction are future work. Daily replanning is explicit and reviewed. The existing premium AI intake remains a separate optional feature.

Deployment needs both Django and the frontend updated. Test with `.venv/bin/python manage.py test planning` and `npm test`, `npm run check`, `npm run build`.
