# Notifications and task reminders

Implemented locally; enabling notifications on the live site still requires deploying this code, configuring the server key, and starting the reminder timer. Device delivery has not been tested on a real phone yet.

## User experience

Sign in, open your account panel, choose **Enable notifications**, and grant the browser prompt. Use **Send test notification** to check the current device. Acceptance by the push provider does not prove that the OS displayed it; notification settings, connectivity, Focus modes, and battery policies can delay or suppress delivery.

On iPhone/iPad, add Hibi's HTTPS frontend to the Home Screen and open the installed app before opting in. The service worker and push subscription belong to the Vercel frontend origin; the API remains on AWS. No extra frontend environment variable or paid push platform is required. The authenticated backend provides only the public VAPID key to the frontend.

In a task's Schedule section, set a date, start time, duration, and reminder interval. Options are at start time, 5/10/15/30/60 minutes before, or one day before. Reminders default to Off. They follow the task's saved timezone and are converted to UTC server-side. Completing, removing, disabling a reminder, or changing its time cancels its old pending job when the workspace save reaches Django. Already in-flight push messages cannot be recalled.

Notifications use generic text instead of task titles or notes on lock screens. Tapping a reminder opens the task after authentication. Notification links are always constructed on the frontend's own origin; payloads cannot navigate users to an external site.

Up to five devices per account can be registered. Enabling a browser subscription for another account is rejected; the browser drops subscriptions owned by another locally recorded account. Signing out revokes the account's shared DRF token and removes its server subscriptions, so all devices must sign in/enable again. This follows the current API's shared-token logout behavior. Disabling on one device removes only that device.

## API

All endpoints require authentication:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | /api/notifications/config | Read configured state and public key |
| POST | /api/notifications/subscriptions | Register this device's endpoint and encryption keys |
| DELETE | /api/notifications/subscriptions | Remove the current user's matching endpoint |
| POST | /api/notifications/test | Send a generic test to the user's matching device |

Test sends are limited to three per minute. Subscription writes are limited to ten per minute. Provider endpoints are restricted to known Chrome/Firefox/Safari/Edge push hostnames, HTTPS only; redirects are disabled. Do not log or disclose endpoints, subscription keys, or VAPID private keys.

## Deploy on the existing Lightsail server

First commit/push the code and deploy the Vercel frontend. In SSH, update the application and install dependencies before restarting its service:

```bash
cd ~/Hibi
git pull --ff-only
cd backend
.venv/bin/pip install -r requirements.txt
.venv/bin/python manage.py migrate --settings=config.production
```

Generate the server's notification identity **once**, using your real contact email. The command writes private values to backend/.env without displaying them. Do not regenerate it during ordinary deployments or device subscriptions will stop working.

```bash
read -r -p "Notification service contact email: " PUSH_CONTACT
.venv/bin/python manage.py configure_webpush --subject "mailto:$PUSH_CONTACT" --settings=config.production
unset PUSH_CONTACT
sudo systemctl restart hibi
```

If the key is already configured, the command refuses to replace it. Keep your existing key. Back up backend/.env privately along with your recovery process; do not put it into GitHub or Vercel. The local and production notification keys are separate.

Install the timer:

```bash
sudo cp ~/Hibi/deploy/lightsail/hibi-reminders.service /etc/systemd/system/
sudo cp ~/Hibi/deploy/lightsail/hibi-reminders.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hibi-reminders.timer
sudo systemctl list-timers hibi-reminders.timer
```

The timer runs the management command roughly every 30 seconds after the previous run finishes. It does not add an AWS service, but consumes some CPU/network on the existing server. It will not deliver at exact alarm-clock precision. Check logs with:

```bash
sudo journalctl -u hibi-reminders.service -n 30 --no-pager
```

For a manual check (which sends any currently due reminders):

```bash
.venv/bin/python manage.py send_reminders --settings=config.production
```

This command cannot send anything until the server key and device subscriptions exist. Existing tasks do not acquire reminders automatically; users explicitly choose an interval and save.

## Reliability and limits

Reminder fingerprints and per-device delivery claims are durable database records, independent of the Task row's changing database ID. Repeated workspace saves and repeated worker runs do not re-send the same reminder to a device. Old pending work is cancelled on updates. Startup catch-up is limited to 15 minutes; older reminders expire to avoid a flood after downtime. Push messages have a five-minute provider TTL.

A delivery is claimed before network transmission. A crash after that claim or an ambiguous timeout can mean a missed notification. Ambiguous failures are not automatically retried, to avoid duplicate sends. This is best-effort delivery, not exactly-once delivery. Device subscriptions reported as 404/410 are removed. Other failures remain recorded for inspection. A future version can add safe retry rules, device management, quiet hours, and an in-app notification inbox. These are not part of this first release.

The worker limits each run's processing window and does not overlap itself under the supplied timer. Database outages cause a failed service invocation; subsequent timer runs can recover pending jobs within the catch-up window. Monitor the timer, application logs, certificate renewal, and database backups.

## Tests

Backend tests exercise owner isolation, invalid/SSRF endpoints, device limits, authenticated tests, test-send throttling, timezone conversion, reminder persistence, cancellation, no repeated delivery, stale reminder expiry, encryption/VAPID signing using mocked HTTP, expired-device cleanup, and private key generation. Frontend tests cover reminder validation, public-key decoding, and safe notification click navigation. No real device opt-in, push-provider call, OpenAI call, or charge occurs in tests.

```bash
.venv/bin/python manage.py test planning
```

From the repository root: npm test, npm run check, npm run build.
