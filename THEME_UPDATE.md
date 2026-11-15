# FzeeLogBook appearance update

October 26, 2026

- Red-accent theme, white/light-gray cards and Outfit typography based on the requested Fzee LogBook AI Studio preview.
- Original FZEE feather/logbook mark, header wordmark and favicon.
- Light, Dark and System appearance selector on sign-in and in the workspace header. Preference is stored on this device and restored before rendering.
- Horizontal desktop navigation, mobile drawer and account sign-out preserved.
- Firebase authentication, account ownership queries, calculations and live data code are unchanged.

Verification: 193 tests pass across 16 files, including five appearance tests. Typecheck and production build pass. Desktop light/dark and 390px mobile screens inspected. Signed-in layout checked with local in-memory fixtures only; fixtures were not included or enabled in production. No real account data was added, removed or changed. Existing notification and organization-team limitations in PRODUCTION.md remain.

Deploy: https://fzeelogbook.vercel.app

Build setup: .env.example lists the Firebase public web configuration needed to build. No hosting access tokens or private keys are included.
