# Account email and password recovery

New accounts require a unique email, username and matching password confirmation. Usernames containing @ are reserved to avoid ambiguous email sign-in. Email addresses are normalized to lowercase. Existing username-only accounts remain usable; after sign-in, use Account → Recovery email, enter the current password, send the verification code, then verify and save. Existing auth_user.email fields are not automatically trusted or imported: account owners should verify them through this screen.

## API

- `POST /api/auth/register`: `username`, `email`, `password`, `confirmPassword`.
- `POST /api/auth/token`: `username` accepts a username or email, plus `password`.
- `GET /api/auth/me`: includes the registered recovery `email`, or an empty string.
- `POST /api/auth/password-reset/request`: `email`. Same response for known/unknown emails; never returns a code. SMTP delivery is synchronous, so response timing can differ; a durable email queue is a future improvement.
- `POST /api/auth/password-reset/confirm`: `email`, `code`, `password`, `confirmPassword`. On success, sign in again; existing API tokens and push subscriptions are revoked.
- Authenticated `POST /api/auth/email`: `email`, current `password` sends a verification code; repeat with `code` to save. A verified address belonging to another account cannot be claimed.

Codes contain eight random digits, expire after 10 minutes, allow at most five attempts, and work once. A new code invalidates the previous code; sends are limited to once per email/purpose per minute. Recovery endpoints are additionally throttled to 20 requests/hour per anonymous IP or authenticated account using Django's throttle cache. Configure a shared cache before scaling to multiple server workers. Codes are HMAC digests at rest, bound to the user's current password; manual password changes invalidate pending codes. They cannot be used to sign in. Email delivery failures expire the code and log a generic diagnostic without email/code/provider credentials. Unknown-address challenge records can be periodically deleted after expiry.

## Production setup

### Gmail for the initial launch

For `yourhibiplanner@gmail.com`, enable Google 2-Step Verification and create an App Password named Hibi. App Passwords may not be available for some account/security configurations: https://support.google.com/accounts/answer/185833 . Never use the normal Gmail password or paste the App Password into chat or a shell command.

After the new code is pulled onto the AWS server, run:

```bash
cd ~/Hibi/backend
.venv/bin/python manage.py configure_gmail --email yourhibiplanner@gmail.com --settings=config.production
```

The command asks for the App Password with hidden input, verifies the Gmail connection over TLS, then saves only the email settings in the private `.env`. It preserves existing database, API and notification settings. Restart Django after migrating using the commands below. Use the app's recovery flow with a test account/inbox you control to verify actual email delivery. Gmail has account sending limits and can temporarily block sending; this is a small-launch option rather than a delivery guarantee: https://support.google.com/mail/answer/22839 .

### Other SMTP providers / later SES setup

Configure these only in the Django server's private `backend/.env`:

```dotenv
EMAIL_HOST=your-provider-smtp-host
EMAIL_PORT=587
EMAIL_HOST_USER=your-smtp-username
EMAIL_HOST_PASSWORD=your-provider-smtp-password
EMAIL_USE_TLS=true
EMAIL_USE_SSL=false
DEFAULT_FROM_EMAIL=Hibi <your-verified-sender@example.com>
```

Use your provider's verified sender and SMTP credentials. With AWS SES, use SES SMTP credentials (not AWS access keys), verify the sender, and request production sending access if the SES account is in the sandbox. Use port 587/STARTTLS; avoid EC2/Lightsail outbound port 25. Do not enable TLS and implicit SSL simultaneously. The app fails with an actionable 503 when SMTP isn't configured; it never prints codes through a console email backend.

After deployment:

```bash
cd ~/Hibi/backend
.venv/bin/python manage.py migrate --settings=config.production
.venv/bin/python manage.py check --deploy --settings=config.production
sudo systemctl restart hibi
```

Deploy the matching frontend after migration. Register a test account with an inbox you control, request a reset, check inbox/spam, enter the code and new password twice, verify old-password and old-token rejection, then sign in with both username and email. Code delivery to a real mailbox is not verified by unit tests. Backend tests use a fake in-memory mailbox and never send real email.
