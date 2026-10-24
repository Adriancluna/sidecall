# Role 2: Frontend (Marco)
Last updated: Oct 23, 20:22 by Marco's Claude

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
- ✓ **Round 2, task 1: prod end-to-end re-test** (session-only): Reset on `?stage` → everyone signed out, reseeded; Jamie → Fire incident → "incident recorded" → release refused ("The person who requested a payment cannot also approve it."); Jordan → "3 companies exposed · 4,200 people behind them · $612,000 in payments held"; Rosa → call note → release → status paid, ledger cash $5,000,000 → $4,520,000, AP $480,000 → $0; Reset again → prod left clean (8 companies, no incident).
- ✓ **Round 2, task 2: presenter mode** on `/?stage` (`src/demo/PresenterPanel.tsx`): collapsible panel with the 9 demo beats, what to say, tips, "Sign in as" per beat (Jamie → Rosa → Jordan; beat 8 says open a second tab as Kwame Mensah for the race), current person marked. Works signed out too (after Reset).
- ✓ **Role 1's "do first" bug (decided payment cards):** a decided card shows "Released by Rosa Alvarez · “note” · time" (or "Rejected by …"), chip says Released/Rejected, `holdReasons` labelled "Why it was held" ("Why it's held" while held), call prompt and note box hidden. PE headline gets a second line "$X released after verification" (sum of `decision.status === "paid"`). Verified on dev: note "480000" refused with the backend's guidance, full note → released card, PE shows $132,000 held + $480,000 released.
- ✓ **Round 2, task 3: controls log** (`src/panels/ControlsLogPanel.tsx`, `api.payments.getIncidentAudit`): table time · company · who · action · rule · reason, newest first, with **Export CSV** (client-side, every field quoted, leading `= + - @` neutralised). PE view: under held payments, whole portfolio. Company view: newest incident, own rows only. Verified on dev: PE 9 rows → `sidecall-controls-log-demo-brightline-001.csv` (header + 9 lines); Cedar Ridge sees 1 row, its own.
- ✓ **Round 2, task 4: who won the race** (`src/panels/AcknowledgedBy.tsx`): "Acknowledged by <name>" from `acknowledgedBy` + `listUsers`, in the company alert and in the PE tailored-alerts list (via `getExposureEvidence`). Verified on dev: Tom Becker acknowledges Cedar Ridge → both views show "Acknowledged by Tom Becker".
- ✓ **Round 2, task 5: proof panel** (`src/panels/ProofPanel.tsx`, end of the PE view): Real / Simulated lists (CLAUDE.md copy) + scorecard from `data/scorecard.json`, read via `?raw` and validated against CONTRACT.md "Scorecard" (`src/panels/scorecard.ts`). States: "Awaiting scorecard run." (placeholder), unreadable file message, or per-scenario tiles (caught / missed / false holds / correctly left alone) + case table. Verified both states on dev with a temporary local sample (not committed).
- ✓ **Round 2, task 6: vendor letter actions** (`src/panels/VendorLetterActions.tsx`): Copy (Clipboard API, falls back to select-and-copy where the API is blocked) + "Open in email" (`mailto:` with subject "Open security incident at <vendor>: one coordinated request from our portfolio" and the letter as body; no address, the vendor contact isn't in our data). Shown once the letter is ready. Verified on dev: "Copied", mailto subject/body correct.
- ✓ Checked #35 (signed webhook, gated reset): no frontend change needed. Fire/Replay send the built-in `brightline` scenario (accepted unsigned on DEMO_MODE); Reset only renders while signed in.
- Bug seen during task 1: a query error during a deploy (old session token) blanked the whole page. Fixing in task 7 with an error boundary.

## In progress
1. Round 2 tasks 6 → 8 in order ( vendor letter buttons, errors/polish, docs/).

## Needs from others
- (none right now)

## Decisions & gotchas
- Sign-in is invite-only (backend). The demo password `sidecall-demo` is shown on the sign-in screen on purpose: every person is simulated and judges need to switch roles. The form path sets the password on a person's first sign-in, so typing any other password the first time locks that person to it until a Reset; the quick-pick always uses the demo password.
- Presenter flow: open `/?stage`, Reset, then sign in as Jamie Chen ("start here").
- Row types come from `FunctionReturnType` of the Convex queries (`src/panels/types.ts`); identity type from `api.access.me` (`src/auth/currentUser.ts`).
- `src/map/BlastRadiusMap.tsx` and `src/map/EvidencePanel.tsx` are working placeholders. Role 3 replaces the insides, keeps the props.
- Switching people remounts the company view (`key={me._id}`), so refusals and notes never carry over.
