# FzeeLog — Production Guide

## What "production ready" covers here

- **Auth & secrets**: organization member PINs are stored only as salted
  SHA-256 hashes (`src/lib/security.ts`); legacy plaintext PINs still verify
  and are upgraded on next PIN change. PINs are never displayed, logged, or
  autofilled in the UI, and the member-login form is never pre-filled. Member
  login always requires a PIN (a blank form cannot resolve or sign in as a
  member), and new members must be given an explicit PIN - there is no
  well-known default. Gemini/WhatsApp/Supabase secrets stay server-side or in
  AI Studio Secrets; only `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are
  client-exposed (both are public-by-design values).
- **No personal data in source**: the app ships with no hardcoded personal
  emails or phone numbers. Alert recipients come from each user's own profile
  settings; demo mode uses fictional contact details; the server requires an
  explicit recipient for every dispatch; exported PDF footers name the
  business, not a personal account. `tests/noHardcodedPii.test.ts` guards this.
- **Data integrity**: 15-column ledger math, odometer monotonicity, duplicate
  shift rejection, and ownership checks are enforced client-side
  (`src/lib/calculations.ts`) and mirrored in `firestore.rules`.
- **Crash safety**: a top-level `ErrorBoundary` (`src/components/ErrorBoundary.tsx`)
  shows a recovery screen instead of a white page.
- **Performance**: the Three.js 3D viewer is code-split and loads on demand;
  the initial JS bundle is ~1.6 MB (452 KB gzip) instead of ~2.6 MB.
- **Tests**: 133 automated tests (see below).

## Run the checks

```bash
npm install
npm run lint     # strict TypeScript, zero errors
npm test         # 133 vitest cases
npm run build    # production bundle in dist/
```

## Test coverage map

| Suite | File | Covers |
| --- | --- | --- |
| Financial math | `tests/financialMath.test.ts` | 15-column formulas, rounding, clamping, INR/KM formatting |
| Input validation | `tests/validators.test.ts` | logbook/vehicle/service/document/media/notification validators, odometer continuity, duplicates, ownership |
| PIN security | `tests/security.test.ts` | salted hashing, hash-vs-legacy verification, seeded demo members |
| Odometer rollback | `tests/odometerRollback.test.ts` | odometer recompute after deleting a shift entry |
| Expiry display | `tests/expiryDisplay.test.ts` | expired/today/upcoming badges, service-due badges, Kolkata dates |
| Demo data integrity | `tests/demoDataIntegrity.test.ts` | every seeded record passes validation and formula recomputation |
| Crash guard | `tests/errorBoundary.test.tsx` | error boundary fallback and recovery UI |
| Phase 1-7 invariants | `firestore.rules.test.ts` | original audit suite (aggregations, CSV, backup snapshot, alerts) |
| Portal security | `tests/portalSecurity.test.ts` | member lookup never matches blank input, explicit PIN required, no default PINs |
| PII regression | `tests/noHardcodedPii.test.ts` | owner contact data can never re-enter shipped source |

## Deploy checklist (when you choose to publish)

1. **Firestore rules**: deploy `firestore.rules` to the Firebase project
   (`firebase deploy --only firestore:rules`). The app enforces tenant
   isolation only once these rules are live.
2. **Secrets**: set `GEMINI_API_KEY` (AI Studio Secrets) and, optionally,
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` for PostgreSQL sync and
   `WHATSAPP_CLOUD_API_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` for WhatsApp alerts.
3. **Publish** via the AI Studio "Publish" button (Cloud Run). Review the
   generated URL and sharing settings before sharing it.
4. **Demo PINs** (change before real users): M. Basha `1234`, Karthik `2222`,
   Priya `3333`, Murugan `4444`.

## Known limitations before real multi-user rollout

- `/api/vehicle-3d/*` and `/api/notifications/*` are unauthenticated while the
  app is unpublished. Before a public rollout, gate them behind Firebase ID
  token verification (firebase-admin) so strangers cannot spend your Gemini
  quota.
- Demo mode (no sign-in) keeps data in memory only; real persistence needs a
  Google sign-in and the Firestore rules deployed.
- Email/WhatsApp expiry alerts require the Meta WhatsApp Cloud credentials;
  without them alerts are logged in-app only.
