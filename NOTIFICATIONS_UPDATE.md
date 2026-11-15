# Notification repair

On-demand email uses verified Firebase JWTs (RS256, issuer and audience checked), caller-scoped Firestore queries under the existing owner rules, and a durable request log created before sending. Gmail SMTP is personal-only: the signed-in verified recipient must match SMTP_USER. This prevents this personal sender being exposed to arbitrary users. Brevo support is included for a future transactional sender. User-provided message text, fleet records and recipient substitutions are not trusted by the server. A reservation per account per minute limits repeated clicks across function instances. Provider acceptance is not inbox delivery. Failed or uncertain requests are logged honestly. No automatic retries after uncertain SMTP outcomes.

Server-only variables:
- SMTP_USER and SMTP_APP_PASSWORD for Gmail SMTP, or
- BREVO_API_KEY and NOTIFICATION_FROM_EMAIL for Brevo.

No credentials belong in source, archives, VITE_* variables or client storage.

Test email has no records. The on-demand compliance email checks vehicle insurance, FC, permit, pollution, driver licence and compliance-document expiry within 30 days, plus overdue service by date/KM. This is not a scheduled 10/5/1-day alert and does not replace compliance monitoring. Queries are capped at 500 records per collection for this small-workspace implementation.

Automatic alerts remain OFF. Vercel Hobby supports a daily cron job with an hour-wide execution window, but this app still needs server-authorized durable job data and a secure scheduler worker. Do not re-enable the old process-local scheduler. It mixed account snapshots and loses dedupe/retries on restart.

WhatsApp remains OFF. Use only official Meta Business Cloud API, an authorized sender phone-number ID, access token kept server-side, recipient opt-in and approved utility templates for unattended expiry messages. Confirm current prices before enabling paid messages. Meta test numbers can be used for a limited free test, not as a production alert service. Never automate WhatsApp Web.
