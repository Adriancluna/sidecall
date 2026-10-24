# Role 2: Frontend (Marco)
Last updated: Oct 23, 19:40 by Marco's Claude

## Status (on main after the login PR)
- **Login UI (✓ done for Role 1):** `ConvexAuthProvider` in `main.tsx`. Signed out → sign-in screen: email + password form, plus a "Sign in as" list of every seeded person grouped by company (Jamie Chen marked "start here"); one click signs in with the demo password (signIn, falls back to signUp). Signed in → `api.access.me` picks PE vs company view. Header: "Signed in as" switch (signs out, signs in as the chosen person) + Sign out. The "Viewing as" switcher (`src/demo/ActingAs.tsx`) is gone.
  - Tokens live in **sessionStorage**, so each browser tab has its own sign-in: one browser can show the AP clerk and the controller side by side.
  - Verified on Marco's dev: quick-pick sign-in, switch Jamie → Rosa → Jordan (PE headline loads), wrong password refused with a message, Sign out back to the sign-in screen, a new tab starts signed out.
- Red bank-change flag shows **old → new** (`••2208 → ••7731`, old = `lastVerifiedAccountLast4`, falls back to `previousAccountLast4`) (✓ thanks Role 1 for #23; CONTRACT.md restore seen).
- Calls still pass `actingUserId` (= the signed-in user's id), harmless; the backend ignores it when signed in.
- Company view: alerts (Acknowledge + Close), held payment cards (release/reject, refusals inline, audit log with who + incident), ledger (cash + AP).
- PE view: headline, blast radius + evidence, selected company's held payments, tailored alerts list, all held payments (read-only), vendor letter.
- Demo controls: Fire incident / Replay webhook (`POST /incident`). Reset only on `/?stage`; after Reset everyone is signed out and lands on the sign-in screen.
- ✓ Live on https://sidecall.vercel.app (before login): $480K held + flagged, PE headline 3 · 4,200 · $612,000.

## In progress
1. After the login PR merges and Role 1 flips `REQUIRE_SESSION`: re-test on prod (sign in, fire, refusal, release, PE view).
2. Drop the `actingUserId` args from the frontend in the same follow-up where Role 1 removes them from the API.
3. Then: scorecard panel (when Role 4's `data/scorecard.json` exists), demo script, Devpost, backup video.

## Needs from others
- → Role 1: **login UI is merged (#22) and live on prod** (quick-pick as Jamie works on sidecall.vercel.app). Please flip `REQUIRE_SESSION=true` on prod (and dev); Role 2 re-tests right after.

## Decisions & gotchas
- Sign-in is invite-only (backend). The demo password `sidecall-demo` is shown on the sign-in screen on purpose: every person is simulated and judges need to switch roles. The form path sets the password on a person's first sign-in, so typing any other password the first time locks that person to it until a Reset; the quick-pick always uses the demo password.
- Presenter flow: open `/?stage`, Reset, then sign in as Jamie Chen ("start here").
- Row types come from `FunctionReturnType` of the Convex queries (`src/panels/types.ts`); identity type from `api.access.me` (`src/auth/currentUser.ts`).
- `src/map/BlastRadiusMap.tsx` and `src/map/EvidencePanel.tsx` are working placeholders. Role 3 replaces the insides, keeps the props.
- Switching people remounts the company view (`key={me._id}`), so refusals and notes never carry over.
