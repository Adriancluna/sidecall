# Role 1: Backend (Adrian)
Last updated: Oct 23, 21:05 by Adrian's Claude

## Status (on main)
- **Production:** https://sidecall.vercel.app → Convex prod `judicious-tiger-712`. Seeded, `DEMO_MODE=true`, login keys set. Presenter: https://sidecall.vercel.app/?stage
- **Identity is session-only.** `actingUserId` is **removed from every function** (#27, after Role 2's #26). Signed out = "Not signed in". `REQUIRE_SESSION` no longer exists (always on).
- **Sign-up only accepts the demo password** (`sidecall-demo`), so a first sign-in with another password can no longer lock a person out of the quick-pick (✓ fixes the gotcha Role 2 noted).
- **New query `payments.getIncidentAudit({ incidentId })`**: the controls log (every hold, flag, refusal, release, reject for an incident, with `actorName` and `companyName`, newest first). PE sees the whole portfolio, a company only its own rows.
- **`data/scorecard.json` format defined** in CONTRACT.md → "Scorecard" (placeholder file on main so the UI can import it now).
- **Fixed (from Adrian's prod test):** a paid payment still showed "held until verified" text. `getHeldPayments` now returns `notice: null` once decided, plus `decision: { status, byName, note, at }`. Release now refuses notes that don't describe the call (Adrian's test note "480000" passed before).
- **Convex review done; fixes shipped:** `POST /incident` now refuses unsigned requests except the built-in demo scenarios on `DEMO_MODE` deployments (anyone could post fake incidents to prod before); `resetDemo` needs a signed-in user; company controls-log reads use an index; ledger balances cover all entries. Open (low risk): no `returns` validators yet; `listUsers` returns whole user docs.
- **Escalation ("knows when to ask") live on dev:** a held payment due within 24h gets one `escalation` alert to the company's controllers (named) + an `escalate` audit row, at hold time or via a 15-min cron. Seed: the $480K is due in 20h, so it escalates to Rosa the moment it's held. Prod picks this up after the next Reset (old rows have no due date).
- **`blastRadius.getIncidentTimeline({ incidentId })`:** every event with real timestamps + stats. Measured on dev: holds and flags in the report's own transaction (0 ms), alerts and vendor letter written 97 ms later.
- **Copy fixes:** alert reasons no longer repeat "under an active incident"; proper plurals ("1 held payment goes…", "2 days"). E.g. "Your company shares a login credential with Brightline Payroll Inc."
- **Return validators** on every public mutation + `access.me` (Convex review follow-up). Types unchanged.
- ✓ done for Role 2: `vercel.json` `ignoreCommand` skips non-production builds (your #43). Saw your escalation banner + timeline panel (#42): thanks.
- **Demo readiness check:** `npx convex run ops:demoReadiness --prod` (Adrian runs before going on stage; read-only). Checks DEMO_MODE, seed, $480K still pending, escalation window, "2 days before" freshness, no incident yet, ledger balance, AI alerts written. Says "press Reset" when needed.
- **All 3 scenarios verified through the real webhook on dev** (unsigned, DEMO_MODE): `demo-brightline-001`, `demo-ironclad-cred-002`, `demo-ironclad-msp-003`.
- ✓ Merged Role 2's #45 (polish + ledger columns): tsc, lint, build, tests green.
- ✓ done for Role 2 (#46 ask): **Role 3 and Role 4 briefs rewritten in `handoff/role-3-map.md` and `handoff/role-4-ai.md`** to match `main` (handoff path, `ai.ts({ incidentId })` once per incident, scorecard + DNS shapes from CONTRACT.md, full dev setup incl. login keys + DEMO_MODE, `exportOutcomes`, signed webhook). They supersede the older `role-4-ai-dns.md`. CLAUDE.md now says in-repo files beat outside briefs.
- For Role 4: `getWritingContext` now includes `externalId` (to key pre-generated text); `ANTHROPIC_API_KEY` and `AI_LIVE` declared in `convex.config.ts`.
- `npm test`: 21 tests green (they sign in as each person; added: client can't pass a user id, controls log scoping).
- ✓ done for Role 2: reviewed and merged #26. Earlier: #20, #22, #24.

## In progress
1. After 11pm: Role 4's `dns_links.json` + scorecard; review Waterloo PRs; run convex-reviewer before freeze.
2. Watch the handoff for Role 2 asks; keep `convex/` stable while the Waterloo pair onboards.

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
- → **Role 2, round 4 — scenario picker on `/?stage`** (backend ready, no changes needed):
  - Next to Fire incident, a small select of three scenarios; POST the same way your Fire button does (unsigned works for these only):
    - **Brightline payroll breach** (main demo): `{ "externalId": "demo-brightline-001", "assetName": "Brightline Payroll", "reportedByDomain": "pinecreststaffing.example" }`
    - **Ironclad shared login leaked** (discipline beat: Summit uses Ironclad with its own login → **no alert for Summit**, map shows it as "separate access"; no payments held): `{ "externalId": "demo-ironclad-cred-002", "assetName": "Ironclad shared admin account", "reportedByDomain": "pinecreststaffing.example" }`
    - **Ironclad MSP itself compromised** (vendor fell: every customer exposed, Harborline's $37K to a new account flagged): `{ "externalId": "demo-ironclad-msp-003", "assetName": "Ironclad IT Services", "reportedByDomain": "pinecreststaffing.example" }`
  - PE view: add an incident selector (`listIncidents` is newest first; today the view shows only `[0]`), so after firing two scenarios you can flip between them.
  - Presenter panel: add an optional beat "Discipline: fire the Ironclad credential scenario → sign in as Jamie → no new alert".
  - Add "Run `npx convex run ops:demoReadiness --prod`" as step 0 in `docs/demo-script.md`.
- ✓ Ledger column spacing: fixed in your #45.
- → Role 2 (done, keep for reference) round 3:
  1. **Escalation in the company view:** `getMyAlerts` now includes `kind: "escalation"` alerts ("Decision needed: … due in about 20 hours … Rosa Alvarez: call … then release or reject"). Show them at the top of the held-payments card or as a banner; the controls log already lists the `escalate` rows.
  2. **Timeline panel (PE view, and scoped in the company view):** `api.blastRadius.getIncidentTimeline({ incidentId })`. Headline line from `stats`: "Payments held in the same transaction as the report · alerts written in 97 ms · first acknowledgement after 41 s". This is our Convex-track proof on screen.
- → Role 2: if any task needs a backend change (new field, query), ask here first; Role 1 turns those around fast.
- → Role 4: if your script posts to `/incident` (e.g. an Armadin-style finding), sign it: `X-Sidecall-Signature: sha256=<HMAC-SHA256(raw body, INCIDENT_WEBHOOK_SECRET)>`; ask Adrian for the secret. Demo scenarios work unsigned.
- → Role 4: overwrite `data/dns_links.json` and `data/scorecard.json` (both placeholders). Formats in CONTRACT.md → "DNS links" and "Scorecard". ⚠ No DNS links to Brightline Payroll for seed companies.

## For anyone joining (e.g. Omar, from the plane)
- Read `CLAUDE.md` → `CONTRACT.md` → every file in `handoff/`, in that order. Your role file in `handoff/` has a "Getting started" section.
- `convex/` belongs to Role 1 except `convex/ai.ts` (Role 4). Need a field, query or index? Write it under "Needs from others → Role 1" in your role file and push; Role 1 picks it up fast.
- Setup: `npm install`, `npx convex dev` (your own dev database), `npx @convex-dev/auth --web-server-url http://localhost:5173 --skip-git-check`, `npx convex env set DEMO_MODE true`, then `npx convex run seed:run`. Sign in with any seeded email (quick-pick on the sign-in screen), password `sidecall-demo`.

## Decisions & gotchas
- **Packages:** `@convex-dev/auth`, `@auth/core@^0.41` (runtime); `convex-test`, `vitest`, `@edge-runtime/vm` (dev). Run `npm install` after pulling.
- Demo logins: `first.last@<company domain>`, password `sidecall-demo` (full list in the sign-in quick-pick). PE: `jordan.ames@northpasscapital.example`.
- Each dev deployment needs auth keys once: `npx @convex-dev/auth --web-server-url http://localhost:5173 --skip-git-check`.
- Never edit `convex/` or other Role 1 files; ask here. `docs/` now belongs to Role 2.
- Demo bank-change dates are relative to seeding: Reset shortly before the demo.
