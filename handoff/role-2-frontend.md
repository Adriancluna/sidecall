# Role 2: Frontend (Marco)
Last updated: Oct 23, 19:43 by Marco's Claude

## Status (on main after the login PR)
- **Login UI (✓ done for Role 1):** `ConvexAuthProvider` in `main.tsx`. Signed out → sign-in screen: email + password form, plus a "Sign in as" list of every seeded person grouped by company (Jamie Chen marked "start here"); one click signs in with the demo password (signIn, falls back to signUp). Signed in → `api.access.me` picks PE vs company view. Header: "Signed in as" switch (signs out, signs in as the chosen person) + Sign out. The "Viewing as" switcher (`src/demo/ActingAs.tsx`) is gone.
  - Tokens live in **sessionStorage**, so each browser tab has its own sign-in: one browser can show the AP clerk and the controller side by side.
  - Verified on Marco's dev: quick-pick sign-in, switch Jamie → Rosa → Jordan (PE headline loads), wrong password refused with a message, Sign out back to the sign-in screen, a new tab starts signed out.
- Red bank-change flag shows **old → new** (`••2208 → ••7731`, old = `lastVerifiedAccountLast4`, falls back to `previousAccountLast4`) (✓ thanks Role 1 for #23; CONTRACT.md restore seen).
- **`actingUserId` removed from every frontend call (✓ done for Role 1)** in this PR: App, CompanyView, PaymentCard, HeldPaymentsPanel, PortfolioView, LedgerPanel, map/EvidencePanel. `grep -rn actingUserId src` → 0. Role 1 can delete the arg from the API.
- Marco's dev has `REQUIRE_SESSION=true`; verified signed-in Jamie loads the company view and is refused on release (session identity).
- Company view: alerts (Acknowledge + Close), held payment cards (release/reject, refusals inline, audit log with who + incident), ledger (cash + AP).
- PE view: headline, blast radius + evidence, selected company's held payments, tailored alerts list, all held payments (read-only), vendor letter.
- Demo controls: Fire incident / Replay webhook (`POST /incident`). Reset only on `/?stage`; after Reset everyone is signed out and lands on the sign-in screen.
- ✓ **Live re-test with `REQUIRE_SESSION=true` on prod:** signed in as Jamie, $480K held + old → new flag, release refused ("The person who requested a payment cannot also approve it."); switched to Jordan: "3 companies exposed · 4,200 people behind them · $612,000 in payments held"; Replay → duplicate, nothing new written; a direct query with only `actingUserId` and no session → "Not signed in". Controller release not re-run on prod (tested on dev) to keep the demo data clean.

## In progress
1. Next: scorecard panel (when Role 4's `data/scorecard.json` exists), demo script, Devpost, backup video.

## Needs from others
- → Role 1: `actingUserId` is gone from `src/` once this PR merges; safe to drop it from the API after that.

## Decisions & gotchas
- Sign-in is invite-only (backend). The demo password `sidecall-demo` is shown on the sign-in screen on purpose: every person is simulated and judges need to switch roles. The form path sets the password on a person's first sign-in, so typing any other password the first time locks that person to it until a Reset; the quick-pick always uses the demo password.
- Presenter flow: open `/?stage`, Reset, then sign in as Jamie Chen ("start here").
- Row types come from `FunctionReturnType` of the Convex queries (`src/panels/types.ts`); identity type from `api.access.me` (`src/auth/currentUser.ts`).
- `src/map/BlastRadiusMap.tsx` and `src/map/EvidencePanel.tsx` are working placeholders. Role 3 replaces the insides, keeps the props.
- Switching people remounts the company view (`key={me._id}`), so refusals and notes never carry over.
