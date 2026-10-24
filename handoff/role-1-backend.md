# Role 1: Backend (Adrian)
Last updated: Oct 23, 20:20 by Adrian's Claude

## Status (on main)
- **Production:** https://sidecall.vercel.app → Convex prod `judicious-tiger-712`. Seeded, `DEMO_MODE=true`, login keys set. Presenter: https://sidecall.vercel.app/?stage
- **Identity is session-only.** `actingUserId` is **removed from every function** (#27, after Role 2's #26). Signed out = "Not signed in". `REQUIRE_SESSION` no longer exists (always on).
- **Sign-up only accepts the demo password** (`sidecall-demo`), so a first sign-in with another password can no longer lock a person out of the quick-pick (✓ fixes the gotcha Role 2 noted).
- **New query `payments.getIncidentAudit({ incidentId })`**: the controls log (every hold, flag, refusal, release, reject for an incident, with `actorName` and `companyName`, newest first). PE sees the whole portfolio, a company only its own rows.
- **`data/scorecard.json` format defined** in CONTRACT.md → "Scorecard" (placeholder file on main so the UI can import it now).
- **Fixed (from Adrian's prod test):** a paid payment still showed "held until verified" text. `getHeldPayments` now returns `notice: null` once decided, plus `decision: { status, byName, note, at }`. Release now refuses notes that don't describe the call (Adrian's test note "480000" passed before).
- **Convex review done; fixes shipped:** `POST /incident` now refuses unsigned requests except the built-in demo scenarios on `DEMO_MODE` deployments (anyone could post fake incidents to prod before); `resetDemo` needs a signed-in user; company controls-log reads use an index; ledger balances cover all entries. Open (low risk): no `returns` validators yet; `listUsers` returns whole user docs.
- `npm test`: 17 tests green (they sign in as each person; added: client can't pass a user id, controls log scoping).
- ✓ done for Role 2: reviewed and merged #26. Earlier: #20, #22, #24.

## In progress
1. Next (Role 1, not overlapping Role 2): "knows when to ask" — escalate held payments nobody decided before their due date (scheduled check → controller alert + audit row); `getIncidentTimeline` query (reported → held → alerts ready → acknowledged → released, real timestamps) for a "held in 0.2s" demo line.
2. After 11pm: Role 4's `dns_links.json` + scorecard; review Waterloo PRs; run convex-reviewer before freeze.
3. Watch the handoff for Role 2 asks.

## Needs from others
- → **Role 2: next tasks, in priority order** (round 2, since round 1 is done). Pick from the top; note progress in your file.
  1. **Re-test prod end to end now** (session-only + demo password are live): sign in as Jamie → fire → release refused; switch to Rosa → call note → release → ledger cash moves; Jordan → headline 3 · 4,200 · $612K; Reset on `?stage` signs everyone out.
  2. **Presenter mode on `/?stage`:** a collapsible step list of the 9 demo beats (CLAUDE.md "Demo story") showing who to sign in as at each beat (Jamie → Rosa → Jordan), one-click "Sign in as" per step, and a hint to open a second tab as Kwame Mensah for the acknowledge race.
  3. **Controls log panel (PE view, under held payments):** `api.payments.getIncidentAudit({ incidentId })`. Columns: time, company, who, action, rule, reason. Add **Export CSV** (client-side): Hyphenate judges ask for an audit trail. Also show it in the company view (already scoped to that company).
  4. **Show who won the acknowledge race:** exposures carry `acknowledgedBy` (a user id) → resolve the name via `listUsers` and show "Acknowledged by Rosa Alvarez".
  5. **Proof panel** (Hyphenate asks for "what's real, what's simulated, planted errors with an answer key"):
     - Static two-column "Real / Simulated" list (copy in CLAUDE.md → "Real vs. simulated").
     - Scorecard from `data/scorecard.json` (format in CONTRACT.md → "Scorecard"): caught / missed / false holds per scenario + the case table. Placeholder is empty now: render an "awaiting scorecard run" state. Role 4 fills it after 11pm.
  6. **Vendor letter:** Copy button + "Open in email" (`mailto:` with subject and body).
  7. **Errors and polish:** friendly message for `ConvexError` texts ("Not signed in" after Reset → back to sign-in); every screen at phone width (16px gutter, no horizontal scroll); copy audit against CLAUDE.md "Never say" (no "fraud", no "validated", no "we block payments").
  8. **Pitch material** (new folder `docs/`, Role 2 owns it): `docs/demo-script.md` (opens on the $480K money moment, ≤ 3 min, who clicks what), `docs/devpost.md` draft (what it does, how we built it on Convex, real vs simulated, the one-line seat: "AP payment controls across a PE portfolio"), and a shot list for the backup video.
- → **Role 2, do first (bug from Adrian's prod test):** on a decided payment card (`row.decision` set), show "Released by Rosa Alvarez · <note> · <time>" (or "Rejected by …") instead of hold wording; label `holdReasons` as "Why it was held"; hide the note box. Short notes like "480000" now come back refused with guidance (shown inline already). Also: the PE headline's "$ held" drops after a release (counts still-held only, by design); add a second line "released after verification: $X" from `getHeldPayments` rows with `decision.status === "paid"`.
- → Role 2: if any task needs a backend change (new field, query), ask here first; Role 1 turns those around fast.
- → Role 4: if your script posts to `/incident` (e.g. an Armadin-style finding), sign it: `X-Sidecall-Signature: sha256=<HMAC-SHA256(raw body, INCIDENT_WEBHOOK_SECRET)>`; ask Adrian for the secret. Demo scenarios work unsigned.
- → Role 4: overwrite `data/dns_links.json` and `data/scorecard.json` (both placeholders). Formats in CONTRACT.md → "DNS links" and "Scorecard". ⚠ No DNS links to Brightline Payroll for seed companies.

## Decisions & gotchas
- **Packages:** `@convex-dev/auth`, `@auth/core@^0.41` (runtime); `convex-test`, `vitest`, `@edge-runtime/vm` (dev). Run `npm install` after pulling.
- Demo logins: `first.last@<company domain>`, password `sidecall-demo` (full list in the sign-in quick-pick). PE: `jordan.ames@northpasscapital.example`.
- Each dev deployment needs auth keys once: `npx @convex-dev/auth --web-server-url http://localhost:5173 --skip-git-check`.
- Never edit `convex/` or other Role 1 files; ask here. `docs/` now belongs to Role 2.
- Demo bank-change dates are relative to seeding: Reset shortly before the demo.
