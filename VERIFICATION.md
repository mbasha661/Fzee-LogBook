# Standalone verification

Verified 25 October 2026 on Node.js 22.23.3 / npm 10.9.9, Linux.

## Passed

- Fresh clone of original GitHub source at b27402baf339e013fd25ac63066629f16c82cdf6.
- Baseline suite: 171 passing tests.
- Clean dependency install with npm install, then npm ci from the generated npm lockfile.
- Final npm ci: 467 packages, zero reported vulnerabilities, no unsupported-engine warnings. Firebase pinned to 12.10.0 for supported Node 22 operation; grpc-js overridden to a patched compatible release.
- Final npm test: 178 passing tests across 14 files (171 original + 7 portability/retry regressions).
- npm run typecheck: passed.
- npm run build: passed, producing browser assets and a bundled Node server. Large-bundle warning remains, not a failed build.
- npm start: built production server starts, serves the app and API.
- npm run dev: TypeScript/Vite server starts, serves app and API.
- /api/health: successful JSON response.
- /api/notifications/scheduler/tick-now: successful response with no configured dispatches.
- /api/notifications/scheduler/delivery-log: empty log for disabled default configuration.
- /api/vehicle-3d/status: honestly reports no AI key and standard offline viewer support.
- Browser checks in desktop 1440x1000 and mobile 390x844 viewports: demo opens without credentials, no page runtime errors, mobile navigation opens Dashboard.
- Visual inspection of desktop/mobile screenshots; mobile top bar and quick filters repaired to wrap, no document-level horizontal overflow (390px viewport / 390px document). Wide ledger remains horizontally scrollable within its own container.
- Original AI Studio project and original GitHub repository were not changed.

## Not verified / not claimed

- No real Firebase/Drive/OAuth sign-in in this independent project, no provider-paid API calls, and no live WhatsApp/email messages. These need the owner's own project configuration and live provider testing.
- No public deployment or new GitHub repository created. Source delivered as a separate private ZIP.
- Firebase authorization rules not run against the Firebase emulator. Existing tests check application invariants, not full server-enforced isolation.
- No durable/multi-tenant scheduler storage. Runtime state is process-local and must be resynced after restart.
- No Meta approved-template implementation. Text delivery cannot be assumed to work for unattended business-initiated reminders.
- Server APIs still need authentication, account authorization and rate limiting before public exposure.

See README.md and PRODUCTION.md for integration setup and rollout limits.

## Real account update, 25 October 2026

- 188 automated tests, TypeScript clean, production build verified.
- Live Individual and Organization signup completed with new private empty workspaces.
- Live login and sign-out verified. UI-created vehicle remained after page reload.
- Same-browser switch from user A to user B showed an empty workspace, never A's vehicle.
- Live database rejects B reading A's profile/vehicle, forging A's ownerId, or taking ownership of A's record.
- Firebase accepts the password-reset request for a disposable QA email. Actual inbox delivery is untested. No test credential or reset email was sent to the owner's real address.
- Notification endpoints are disabled until authenticated per-account scheduling is implemented. Organizations currently have one owner account, not invited shared-team authentication.
