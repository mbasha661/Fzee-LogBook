# FzeeLogBook Standalone

A separate full-stack fleet logbook project. Runs on your own computer or a private Node.js server. No Google AI Studio account, editor, hosting, or injected configuration is required.

## Quick start

Use Node.js 22.22.2 or newer (Node 22 recommended) and npm.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000. The default page is a clean signup/login screen, never a preloaded workspace. Without Firebase configuration the page reports that account setup is incomplete and does not open demo data.

Optional configuration: copy `.env.example` to `.env`, using your editor or `cp .env.example .env`. Fill the public Firebase web configuration fields to enable real accounts. Do not commit `.env`.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

`npm run lint` also runs the TypeScript check. `npm run test:watch` watches tests.

## Run the production build privately

```sh
npm run build
npm start
```

This builds the browser into `dist/` and bundles the TypeScript Express server into `dist-server/server.js`. `npm start` serves both the UI and API, with notification endpoints disabled until secure per-account scheduling is configured. Keep dependencies installed. `npm run preview` is a frontend-only Vite preview and does NOT run the API or notifications.

The server binds to `127.0.0.1:3000` by default. `PORT` changes the port. Set `HOST` deliberately only when you need another bind address; do not expose this server to the public internet before the security checklist below is completed. `/api/health` is a local readiness endpoint.

Run commands from the project root. Stop with Ctrl+C. Keep the Node process running for scheduled work.

## Features retained

- 15-column logbook, configurable calculation modes, driver share and net earnings
- Vehicles, service records, compliance expiry, reports and PDF exports
- Standard 360/GLB viewer with optional AI calibration
- English/Tamil switch (Tamil needs native-language review)
- Notification scheduler implementation retained but disabled for real-account deployments
- Optional Firebase persistence, Google Drive backups and Supabase sync

## Real integrations

| Integration | Setup | If not configured |
| --- | --- | --- |
| Firebase | Add your own web app's `VITE_FIREBASE_*` values; enable email/password sign-in, add localhost/your domain to Auth authorized domains; create Firestore and deploy `firestore.rules`. Set `VITE_FIRESTORE_DATABASE_ID` only for a named database. | Signup unavailable until configured. No old project's config is bundled. |
| Google Drive | Configure Firebase/Google OAuth for your own project and origin, enable Drive API and permit `drive.file` scope, then connect in-app. Existing external connections do not sign this app in. | No live backup. |
| WhatsApp | Server-only `WHATSAPP_CLOUD_API_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`; verify Meta setup, recipients and approved template requirements for scheduled business-initiated messages. Opt in inside Notifications. | SKIPPED, never fake SENT. |
| Email | Server-only `NOTIFICATION_EMAIL_WEBHOOK_URL`, a trusted relay accepting `{to,subject,body}` JSON. Opt in inside Notifications. | SKIPPED. |
| Gemini | Server-only `GEMINI_API_KEY`; verify model availability for your account. | AI calibration unavailable; standard viewer works. |
| Supabase | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, migrations under `supabase/`, and correct row-level security. | Optional sync disabled. |

VITE-prefixed settings are public browser build configuration, not a place for secrets. Change them before `npm run build`; rebuild to apply. Never use a service-role key in client settings.

## Important limits before real rollout

The account/workspace app is live at https://fzeelogbook.vercel.app. See `PRODUCTION.md` for the remaining external-integration checklist.

- Notification API state is a single in-memory scheduler, not tenant-isolated server storage. Settings, snapshot, retries and dedupe history are lost on process restart. After restart the signed-in client must sync again. While the process stays up, it can work with the browser closed, but uses only the last synced snapshot.
- API routes currently lack server-side authentication. Keep the loopback default and no live credentials in the demo. Add Firebase ID-token verification, per-user authorization, durable per-account scheduler state and rate limits before any public/multi-user use.
- External provider integrations need operational verification. Retries preserve the original payload, stop after three attempts, and honor disabled/revoked-consent settings.
- Meta business-initiated alerts often need approved templates. Current sender uses text payloads and does not implement a template workflow. Having keys alone is not proof that scheduled WhatsApp delivery works.
- Automated rules tests are invariants, not a substitute for Firebase emulator authorization testing. Deploy rules and verify isolation with separate accounts.
- Sample records remain only in source fixtures for tests. They are never loaded into real accounts. Create your own account password.

No paid hosting has been purchased. The existing Vercel Hobby deployment is active. The original AI Studio project and original GitHub repository are unchanged.

## Source provenance

Based on `mbasha661/Fzee-LogBook` commit `b27402baf339e013fd25ac63066629f16c82cdf6`. This standalone package is a separate copy; the original repository does not contain these standalone changes. See `VERIFICATION.md` for checks run on this package.

## Real accounts on the deployed version

The deployed app now uses Firebase email/password Authentication and owner-only Firestore records. Choose Individual or Organization, enter your own details, and create your password. New accounts contain no sample vehicles, drivers, shifts or team members. Use Forgot password on the login/signup screen to request a Firebase reset email. Existing saved records stay with their account; a fresh account does not inherit another account's data.

The Firebase project is `fzeelogbook` on Spark, database `(default)` in Mumbai (`asia-south1`). The public web config is supplied through the `VITE_FIREBASE_*` environment variables. Authentication is session-scoped. Private data persists in Firestore and is not deleted by reload or sign-out.

Organization currently creates a private organization-owner workspace. Invited shared-team Firebase accounts are not implemented. Old team PIN selectors are not security boundaries and cannot sign in to another account. Scheduled notifications are disabled in the real-account deployment until per-account server authorization and durable scheduling are available. No billing upgrade, card or paid service is configured.
