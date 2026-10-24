# One-shot prompt: remake the whole Sidecall UI and the blast-radius map (for Omar's agent)

> Paste this whole file into a fresh Claude Code session (Fable, ultracode) opened at the Sidecall repo root. You know nothing about this project yet. Everything you need is here or in the files it names. If this prompt and the code on `main` disagree on a fact, **the code wins**: follow the code and write the disagreement into your handoff file.
>
> Written Oct 24, 2026 from research on `main` at `a362e33` (#89) plus branch `docs/map-echarts-handoff` (`2ca2df1`). Line numbers are approximate; grep before you trust one.

---

## 0. Read-first checklist (do all of it before writing code)

1. `git pull --rebase origin main`, then read **every** file in `handoff/`. Act on items addressed to Role 2, Role 3 or Role 4 (Omar now owns Roles 3 and 4, and for this task the frontend that used to be Role 2's). Confirm `handoff/role-2-frontend.md` on main says: "Oct 24: Marco hands `src/` (all of it, incl. `index.css`, `index.html`) to Omar for the UI remake on `feat/ui-remake`." If that line is missing, stop and ask Omar.
2. The visual target and this prompt ship in PR #88 (branch `docs/map-echarts-handoff`). If `docs/specs/map-echarts-reference.md` is already on `main`, skip this step. Otherwise bring them in without merging:
   ```
   git fetch origin
   git restore --source=origin/docs/map-echarts-handoff --worktree -- docs/specs/map-echarts-reference.md docs/specs/map-prototype/ docs/specs/ui-remake-oneshot-prompt.md
   ```
   These stay untracked. Never use `git add -A`, `git add .` or `git commit -a`; stage files by path only. Also never stage `DESIGN.md`, `.impeccable/`, `docs/specs/*` or `.env.local` if they exist locally. Do not commit these docs files on your branch unless Omar says so (they are Marco's `docs/`).
3. Read, in this order:
   - `CLAUDE.md`: project rules. They override your defaults, except where §3 of this prompt narrows them for this task.
   - `PRODUCT.md` (repo root): users (judges first), purpose, positioning, WCAG 2.2 AA commitment. `DESIGN.md` is **not** on `main`; if a copy exists locally, treat it as Marco's notes, not a contract.
   - `CONTRACT.md`: exact data shapes. Look at `getBlastRadius` (around :207-218), the headline numbers line (around :355), and the dated change log at the top (incl. #89 "what to check").
   - `handoff/README.md` (template and rules), `handoff/role-2-frontend.md` (everything Marco built and verified; read the whole file), `handoff/role-3-map.md`. **The role-3 file is stale**: it says PR #81 is "not merged", but `482a1ee ... (#81)` is on `main`, so the tree map is live in production. `handoff/role-1-backend.md` has Adrian's latest asks, including the two from #89 quoted in §4.6.
   - `brand/README.md` and `brand/tokens.css`. **`brand/tokens.css` is not imported by the app today** (see §5.1).
   - `src/index.css`, `index.html`, `package.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`.
   - `docs/specs/map-echarts-reference.md` and `docs/specs/map-prototype/blast-radius-echarts.html`. Serve it with `python3 -m http.server` from `docs/specs/map-prototype/` and watch both scenes auto-play. This is the **look** to reach.
   - Every file in `src/`: `App.tsx`, `main.tsx`, `auth/*`, `layout/*`, `demo/*`, `panels/*`, `map/*`. There are about 40 files; read them all, they are short.
   - Backend, read only: `convex/blastRadius.ts`, `convex/payments.ts`, `convex/incidents.ts`, `convex/alerts.ts`, `convex/scoring.ts`, `convex/seed.ts`, `convex/imports.ts`, `convex/schema.ts`. You may not edit any of them.
   - `docs/demo-script.md` (the 3-minute script, every beat) and `docs/video-shot-list.md` (shots and the voice-over banned words around :31).
   - `docs/specs/armadin-one-step-ahead.md` (red-team finding wording) and `docs/specs/ui-audit-2026-10-24.md` + `docs/specs/ui-audit-2026-10-24-rerun.md` (what was already fixed; do not regress it).
   - `convex/_generated/ai/guidelines.md`, only to understand the client rules (you only use `useQuery` / `useMutation`).
4. Run the app before judging it: `npm run dev` (runs `convex dev` + Vite against your dev deployment from `.env.local`). Open `/?stage`, press **Reset**, sign in as each persona from the "Sign in as" list (password `sidecall-demo` for every seeded person), fire each scenario from the stage scenario menu, and look at every screen. Write down what you see before you change anything.
   - `convex dev` regenerates `convex/_generated/*`. Before every commit run `git checkout -- convex/` and check that `git diff --name-only origin/main` lists nothing under `convex/`.
   - Your dev deployment needs `DEMO_MODE=true` (`npx convex env set DEMO_MODE true` against dev only; ask Omar first, it changes deployment config). Without it, Fire returns an error, `listUsers` is not public and sign-in shows no people. `npm run rehearse` resets dev, so never run it while you have screenshots half-done.

---

## 1. Why this exists

### 1.1 The event
Cal Hacks 13.0 (Palace of Fine Arts, San Francisco; sponsors listed on calhacks.io include Hyphenate, Convex, Anthropic, Armadin and Microsoft). **Not verified**: the exact dates, the 13.0 judging rubric, sponsor prize names and criteria, whether a design or security prize exists, judge names. Earlier Cal Hacks editions judged on design, novelty, technical accomplishment, impact and polish; treat that as a guess, not a rubric. Do not put any prize name or rubric claim in the UI.

### 1.2 The product in two sentences
Companies owned by one private equity firm quietly share vendors, and when one shared vendor is compromised Sidecall works out which sister companies **genuinely** share the compromised thing, warns each at the right urgency, shows the firm a live blast-radius map and drafts one letter to the vendor. It also **holds** pending payments to that vendor until a different person verifies by calling the number on file: the AP payment-controls seat across a PE portfolio (Hyphenate track).

### 1.3 The audience
`PRODUCT.md`: the primary user is a judge watching a **projected live demo under 3 minutes**, roles switched on stage, plus a recorded video and Devpost (the shot list adds: often watched muted, captions on). "Every screen must read from the back of a room and land its point in one beat. When stage legibility and in-world realism conflict, stage legibility wins."

**The judge's first 10 seconds** must answer: one vendor was breached; these sister companies are exposed and these are not; $480,000 is sitting held until someone verifies by phone. Today the first screen is a login form with no story (§5.3), and every view is a column of identical grey-titled cards. That is the main thing this remake fixes.

### 1.4 The demo arc the UI must carry (one dominant screen per beat)
From `docs/demo-script.md` (read it; times are targets):
1. **Incident in.** Jamie Chen (AP clerk, Summit Home Health) presses **Fire incident** (`POST /incident`, asset-centric). Company views never name the reporter.
2. **Money held.** Jamie's view centres the **$480,000** payment to Brightline Payroll Inc., held and flagged: trusted account ••2208 (grey) → new account ••7731 (coral), changed by email 2 days before the incident, due in about 20 hours, already escalated to the controller. Beat 2b: Jamie's new $38,000 request is held and flagged the moment she makes it.
3. **Requester refused.** Jamie tries **Release payment** → refused in place ("The person who requested a payment cannot also approve it."), logged.
4. **Controller verifies.** Rosa Alvarez (controller) calls the number on file, writes the note, **Release** or **Reject**. A too-short note is refused with "Describe the verification call...". Cash moves only on release; the ledger shows it.
5. **Firm zooms out.** Jordan Ames (PE firm) sees the headline: "3 companies exposed · 4,200 people behind them · $650,000 in payments held" (or $612,000 without beat 2b, $170,000 + "$480,000 released after verification" after Rosa releases). Only this view names the reporter. The firm sees holds, never releases.
6. **Map lights up** (beat 4 in the script, video shot 5). Then **evidence** (beat 5, shot 6): click Bayview Veterinary Partners and Cedar Ridge Manufacturing (the script says Bayview then Cedar Ridge; the shot list says Cedar Ridge then Bayview; both orders must work). Cedar Ridge: shared credential, urgent. Bayview: same vendor, DNS-inferred, advisory, "candidate". Untouched companies stay visibly quiet. Optional 4b: Lakeside Orthopedics is imported live and appears as a fourth exposed company.
7. **Alerts + one vendor letter** (Copy / Open in email). "The AI only writes; it never decides."
8. **Convex beats.** Timeline with real timestamps; **Replay webhook** → "duplicate, nothing new written"; two tabs **Acknowledge** at once → exactly one wins, "Acknowledged by ...".
9. **Proof.** Controls log with **Export CSV**; Real vs Simulated; scorecard against the planted answer key; DNS vendor detection on real public domains.
10. **Close.** "Sidecall fills the AP payment-controls seat across a private equity portfolio: it holds payments for a person to verify, and it knows when to ask."

### 1.5 Sponsor angles that must be visible on screen
Only what the repo supports:
- **Hyphenate (primary):** the held $480,000 card with ••2208 → ••7731 and "changed 2 days before"; the requester refusal in place; the controller call note → Release / Reject; ledger cash moving only on release ($5,000,000 → $4,520,000 at Summit); controls log + Export CSV; Real vs Simulated + planted answer key. "Held, never cancelled" wording everywhere.
- **Convex:** live sync across two tabs with no reload; Replay webhook → visible "duplicate, nothing new written"; acknowledge race → one winner named; Timeline headline ("Payments held in the same transaction as the report · alerts written in N ms ..."). The "303 companies / 304 payments in one transaction" fact is a **test-suite** result; if shown, label it "in our test suite".
- **Anthropic / Claude:** alerts, hold notices and the vendor letter are Claude-written; label them so ("Written by Claude" or "AI-written; Sidecall decided who is exposed"). The MCP agent appears only as a recorded clip, never live; the UI does not need anything for it beyond showing agent actors in audit rows ("<name> (agent)").
- **Armadin-style red-team finding** (`demo-armadin-004`, stage button "Red-team finding (Ironclad login)"): firm view shows the validated path at the source; sister views show "reachable here · not tested" and the new "What to check" step (§4.6). Say "Armadin-style finding (our schema)", never "Armadin's format", never "we integrate with Armadin". No score number anywhere (it reads as a naive risk score).
- **Microsoft:** no requirement found in the repo. Do not invent one.

---

## 2. Definition of done (every bullet testable)

**Whole UI**
1. All four scenarios (`demo-brightline-001`, `demo-ironclad-cred-002`, `demo-ironclad-msp-003`, `demo-armadin-004`) render correctly for all four personas (Jamie AP clerk, Rosa controller, Kwame IT, Jordan PE firm), plus a Lakeside import mid-Brightline.
2. The signed-out landing states the story in one line and offers one primary "Start the demo as Jamie Chen" action above the people list; every seeded person is still one click away.
3. Each role's view opens with an incident banner and one dominant element: Jamie and Rosa the held payment, Kwame his alert and what to check, Jordan the stat strip + map. No view is a single column of equal-weight cards.
4. The money moment is a hero block, not a card inside a card. Release confirmation is an inline, brand-styled step, not `window.confirm`. The requester refusal, the short-note refusal and every other refusal still show inline, verbatim from the backend.
5. Ledger impact is visible next to (or directly under) the held payment for controller and AP clerk, with no scrolling at 1440×900.
6. PE order follows the script: stat strip → map + evidence → alerts + vendor letter → timeline / Convex beats → controls log → proof. Setup tools (AP import, notifications, containment) sit in a secondary area that is still reachable on stage. The Proof panel is no longer buried last under setup cards.
7. After Rosa releases, Summit's alert shows the payment's **current** state under the alert text (§4.6), live, no reload.
8. "What to check" appears first in the evidence for exposed companies when present (Armadin scenario), with plain labels instead of raw keys (§4.6).
9. The presenter panel (`?stage`) never covers Release, Acknowledge or the map; all 14 beats, "Sign in as" and "Next beat" still work; Reset still confirms (inline, not `window.confirm`). You may add one beat, "Red-team finding", as Jordan then Sam Kowalski (no other new beats).
10. Every loading state is a designed skeleton or a calm message that keeps layout stable; every empty state tells the story (e.g. "No alerts. Nothing you share is affected." becomes a clear, positive "discipline" state). Session-ended handling (`ErrorBoundary`, `friendlyError`) still works.
11. One token system (§5.1); amber marks only brand, advisory and the single next action on each screen.
12. No horizontal scroll at 390 px; usable at 800 px; projector-legible at 1440 px; `prefers-reduced-motion` respected everywhere; keyboard-only run of the whole demo works; WCAG AA contrast.
13. All copy rules in §3.3 pass a grep of the diff.

**Map**
14. Looks and behaves like the ECharts prototype (vendor centre, verdict colours, headcount size, line weight by share type, dashed DNS candidates, calm ripple, particles on live links, auto-playing story steps with a synced list), driven entirely by `getBlastRadius` data for any N; nothing hard-coded per scenario.
15. Every node with `heldCents > 0` carries a held badge, so Brightline badges add up to `totals.heldCents` ($92,000 + $480,000 + $40,000 = $612,000).
16. Clicking an exposed company opens its evidence and its held payments; clicking a non-exposed company shows its caption and does not select it.
17. `?map=grid` and phone widths render `MapList` only. Reduced motion: no intro, ripple, particles, auto-play or tweening. Keyboard and screen-reader parity with mouse.
18. Live updates (the $38K request, the release, the Lakeside import, containment) change the picture without reload and without restarting the story or intro; only a new `incident._id` replays the intro.

**Engineering**
19. `npm run lint`, `npm run build`, `npm test` green; `npm run rehearse` passes on **dev**.
20. No new npm dependency unless the team was told first (§3.5).
21. Branch pushed, PR into `main` open, **not merged**; `handoff/role-3-map.md` rewritten (§8).

---

## 3. Hard constraints

### 3.1 File scope (Marco, Role 2, handed the whole frontend UI to Omar for this task)
**You may edit:** `src/App.tsx`, `src/main.tsx`, `src/layout/**`, `src/panels/**`, `src/demo/**`, `src/auth/**`, `src/index.css`, `src/map/**`, `index.html`, and `handoff/role-3-map.md`. You may add new files inside those folders, including new `*.test.ts` files under `src/`.

**Forbidden:**
- `convex/**` (including `convex/ai.ts` for this task, even though it is Omar's Role 4 file; see §4.6), `CONTRACT.md`, `CLAUDE.md`: Adrian, Role 1.
- `convex/_generated/**`: `convex dev` regenerates it. Before every commit run `git checkout -- convex/` and check that `git diff --name-only origin/main` lists nothing under `convex/`.
- `brand/**` (including the favicons `index.html` points to): read-only for everyone. Import from it; never edit it.
- `tsconfig*.json`, `.env*`, `.claude/`.
- `data/**`, and `scripts/**` outside Role 4 (`scripts/dns/`, `scripts/scorecard/`); this task needs neither.
- `docs/**`: Marco's. Leave notes for him instead (§8).
- `package.json`, `package-lock.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `vercel.json`, `public/`.
- Other roles' handoff files (`role-1-backend.md`, `role-2-frontend.md`, `role-4-ai.md`) and `handoff/README.md`.

**Backend needs:** never add a field, index or query. Write `→ Role 1 (Adrian): <ask> (why)` under "Needs from others" in `handoff/role-3-map.md` and work around the gap in the UI (precedent: there is no firm name in the schema, so the map said "Parent firm").

**Business logic stays in Convex.** The client only calls `useQuery` and `useMutation`. Never poll. Never call actions. Never recompute exposure, urgency, holds, scores, bank-change flags or permissions in React. Deriving display state from query results (sums for a label, joining a payment to an alert by id, picking a chip) is fine. Who may release is decided by the mutation; the UI may hide or show the form from data it already has, as `PaymentCard` does today, but the refusal path must keep working.

### 3.2 Brand
- Dark-first: graphite background, paper text, Signal Amber `#F5A524` as brand and advisory colour. No navy or electric blue. **No gradients, glows, neon, `box-shadow` glows, `shadowBlur`, `filter: blur`, `drop-shadow`.** (The ECharts prototype breaks this at its :14, :40, :180-182, :202, :231. Strip all of it.)
- Never put amber text on paper or white (2:1 contrast).
- Status colours are product-only (urgent coral, advisory amber, clear green, info/ash for candidate or inferred). Never recolour the logo.
- Logo: use the SVGs in `brand/logo/` (`sidecall-horizontal-dark.svg` in the header, `sidecall-stacked-dark.svg` on sign-in, `sidecall-symbol-small-amber.svg` below 40 px). **Never retype "Sidecall" as a logo.** Nothing in the logo's empty centre.
- Banned icons and imagery: shield, padlock, keyhole, chain-link, radar, siren or bell, warning triangle, eye, brain, sparkle. Prefer circle, dot, check, clock, arrow. The ripple on the map must read as a calm pulse, not a radar sweep (no rotating line).
- Companies as rounded tiles (`rounded-tile`, 12px) echo the logo. Chips and buttons `rounded-chip` (8px).
- Font: Manrope (400 body, 500 labels, 600 headings, 700 sparingly). Tabular numbers on every amount, count and time.
- No alarm language: no "ATTACK", no "BREACH DETECTED", no exclamation marks. Say what is exposed and what to do.

### 3.3 Copy rules (judges read the UI and the code)
- **Never name the reporter outside the PE firm view.** Company views, alerts, hold notices and any shared component never name Pinecrest (or whoever reported). `getBlastRadius`, the PE incident line "reported by X (visible to the PE firm only)" and the map in `PortfolioView` are the only places. If you build a shared component, it must not take the reporter name as a prop it could leak.
- **DNS links are "candidate" or "reachability", never "validated", "confirmed" or "verified".** "Validated" may appear only for `edge.path === "validated_at_source"` / `path.source` in the firm view (the reporter's own edge in the Armadin scene). At sister companies the wording is "reachable here · not tested".
- **Money:** "held", "held until verified", "released after verification", "rejected". Never "blocked", "stopped", "cancelled", "frozen", "fraud". Hold notices say to call the number on file, never one from a recent email.
- **Never say** (UI, aria labels, comments, PR text): "we stop fraud", "we block payments", "Three weeks or never", "MSPs hide breaches", "Stolen credentials are the #1 attack vector", anything about exit valuations, any accuracy percentage we have not measured, "We integrate with Armadin", the "MSP Credential Risk Report" / "73% of MSPs share admin credentials", or any public case of one shared vendor hitting several companies of one PE firm.
- Scorecard copy says "our own planted cases, not a benchmark".
- Status is never colour alone: every chip, node and row carries a word.
- Simulated things are labelled simulated (notifications outbox: "recorded as simulated and not actually sent"; Real vs Simulated lists stay).

### 3.4 Process
- Every merge to `main` is a rate-limited production deploy (Vercel + Convex). **Open a PR; do not merge.** Branch pushes do not deploy (`vercel.json`), so push the branch freely.
- `git pull --rebase origin main` before each push.
- **Handoff:** CLAUDE.md says to push your handoff to `main` at the end of every prompt. For this task Omar overrides that: the handoff edit rides on the PR branch. Do not push to `main` directly, even for the handoff.
- Feature freeze is about 6 hours before the deadline; Adrian already froze backend features ("no more new features; focus on precision, the $480K moment, and the red-team finding"). Check the time with Omar. If you are past freeze, cut to polish of existing screens and the map, no new behaviour.
- Conventional commits (`feat: ...`, `fix: ...`, `refactor: ...`). No `console.log` in committed code (the project rule; eslint has no `no-console` rule, so grep the diff yourself).
- Source files under about 400 lines, functions under about 50. Immutable updates.

### 3.5 The dependency decision: ECharts or not (decide explicitly)
Runtime deps today are only `@auth/core`, `@convex-dev/auth`, `convex`, `react`, `react-dom`. `echarts` and `d3` are absent. Team rule: no new npm package unless your human has told the team first (package.json conflicts), and `package.json` is outside your scope anyway.

**Recommendation: port the prototype's look to SVG + React, no new dependency.**
1. `map-echarts-reference.md` itself says the layout, step list and encoding do not depend on ECharts; **only the ripple and the particles do**, and both are small in SVG:
   - Ripple: 2-3 `<circle>`s with CSS `@keyframes` on scale and opacity (`transform-box: fill-box; transform-origin: center`).
   - Particles: small `<circle>`s moving along the exact edge `<path>` with SVG `<animateMotion>` + `<mpath>` (or CSS `offset-path`). Riding the same `d` removes the prototype's curve-mismatch gotcha.
2. Accessibility: ECharts draws to canvas, which loses per-node `role="button"`, `tabIndex`, `aria-pressed`, `aria-label`, `<title>`, Enter/Space and `:focus-visible` rings that today's SVG map already has.
3. Brand: what makes the prototype look "ECharts" is mostly glow, which is banned. Without it, what is left is SVG.
4. Bundle and deploy cost: ECharts is large, every merge is a rate-limited deploy, and SVG is already proven here (dense mode at 300 companies, no horizontal scroll at 375 px).

**Fallback only if the SVG port demonstrably cannot reach the look:** stop and tell Omar. He announces `echarts` to the team (Marco, Adrian) first. Then, with their OK, the `package.json` change rides on your PR with an exact pinned version (the prototype uses `5.5.0`; run `npm view echarts versions` and pick one at least two weeks old). Lazy-load it inside `src/map/` (`await import("echarts/core")` plus only `GraphChart`, `EffectScatterChart`, `LinesChart`, `CanvasRenderer`) behind a Suspense boundary that shows `MapList` while loading, keep an accessible DOM overlay of `<button>`s over each node, and apply every gotcha in §6.8. Either way the no-dependency fallback that must always work is `MapList` (`?map=grid`, phones). Record the decision and reasons in the handoff.

---

## 4. Data contract

Types come from the queries: `src/panels/types.ts` has `BlastRadius = NonNullable<FunctionReturnType<typeof api.blastRadius.getBlastRadius>>` and `HeldPaymentRow = FunctionReturnType<typeof api.payments.getHeldPayments>[number]`. Identity type from `api.access.me` (`src/auth/currentUser.ts`). Keep deriving types this way; never hand-write a backend shape.

### 4.1 Queries and mutations by screen (verify each in `convex/` before use)
| Screen / component | Reads (`useQuery`) | Writes (`useMutation`) / other |
|---|---|---|
| `App.tsx` | `api.access.me` (null → `signOut()`) | auth via `@convex-dev/auth` |
| Sign-in, user switcher (`auth/directory.ts`) | `api.blastRadius.listUsers`, `api.blastRadius.listCompanies` (public only on `DEMO_MODE` deployments) | `signIn("password")`, falls back to `signUp` (`useSignInAs.ts`) |
| `DemoControls` | | `fetch(`${SITE_URL}/incident`)` for Fire / Replay (HTTP, not an action); `api.seed.resetDemo` on `?stage` |
| `PresenterPanel` | `api.access.me` | sign-in helpers |
| `PortfolioView` (PE) | `api.blastRadius.listIncidents`, `api.blastRadius.getBlastRadius({incidentId})`, `api.payments.getHeldPayments({incidentId})`, `api.alerts.getIncidentAlerts({incidentId})` | |
| `TimelinePanel` | `api.blastRadius.getIncidentTimeline({incidentId})` (null for a company it never touched) | |
| `ControlsLogPanel` | `api.payments.getIncidentAudit({incidentId})` | CSV via `<a download href=data:...>`, formula injection neutralised |
| `ContainPanel` | | `api.incidents.containIncident` |
| `ApImportPanel` | `api.imports.previewApImport` | `api.imports.importPortfolioCompany` |
| `NotificationsPanel` | `api.notifications.listChannels`, `api.notifications.listOutbox` | `addChannel`, `removeChannel`, `sendTest` |
| `ProofPanel` | none: reads `data/scorecard.json`, `data/dns_findings.json`, `data/ai_cache.json` at build time (`?raw`) | |
| `CompanyView` | `api.blastRadius.listCompanies` (filtered client-side), `api.blastRadius.getMyExposures`, `api.alerts.getMyAlerts`, `api.payments.getHeldPayments({})`, `api.blastRadius.listIncidents` | `api.incidents.acknowledgeExposure`, `api.incidents.closeExposure` |
| `PaymentCard` | `api.payments.getPaymentAudit({paymentId})` (rows carry `actorName`), `api.blastRadius.listIncidents` | `api.payments.releasePayment`, `api.payments.rejectPayment` (optional `note`) |
| `BillsPanel` | `api.payments.getMyBills`, `api.payments.getHeldPayments` | `api.payments.requestPayment({billId})` |
| `LedgerPanel` | `api.payments.getLedger({companyId?})` → `{ entries, balances }` | |
| `AcknowledgedBy` | `api.blastRadius.listUsers`, `api.blastRadius.getExposureEvidence` | |
| Map (`src/map/`) | `api.payments.getHeldPayments({incidentId})` (exactly the args `PortfolioView` uses, so the subscription is shared), `api.blastRadius.listAssets({})` (sibling-asset names only) | none |
| `EvidencePanel` | `api.blastRadius.getExposureEvidence({exposureId})` | |

Mutations return `{ok:false, reason}` on refusal (`refusalOf` in `src/layout/errors.ts`) or throw `ConvexError` (`friendlyError`). Show both inline, verbatim. Never swallow either.

### 4.2 `getBlastRadius({ incidentId })` (`convex/blastRadius.ts` ~:58-166)
- Returns `null` for non-firm viewers, a missing incident or a missing asset.
- `incident`: full `Doc<"incidents">` + `reportedByName: string | null`. Fields: `externalId`, `assetId`, `reportedByCompanyId?`, `summary?`, `createdAt`, `containedAt?`, `containedBy?`, `containmentNote?`, `finding?`.
  - `finding` (`schema.ts` ~:112-122): `source: "armadin"|"manual"`, `findingId`, `engagementId?`, `validatedAt`, `technique: {id, name|null}`, `terminalKind: "credential"|"vendor_tenant"`, `path: {kind: "foothold"|"credential"|"system"|"vendor_tenant", label}[]` (firm only), `evidence: {kind, summary}[]`, `confidence: number|null`.
- `asset`: `name`, `vendorName`, `kind` (`msp|idp|payroll|email|other`), `phoneOnFile`.
- `nodes[]` (one per company, up to `MAX_FANOUT`): `companyId`, `name`, `headcount`, `exposed`, `relation`, `exposureId|null`, `urgency: "urgent"|"advisory"|null`, `score` (0 when not exposed; a sort key, never displayed), `confidence|null`, `status: "open"|"acknowledged"|"closed"|null`, `heldCents` (status `held` only).
- `NodeRelation` (exported) = `"reporter" | "exposed" | "linked_not_exposed" | "same_vendor_separate_access" | "unrelated"`. Switch on it exhaustively with a `never` check.
- `edges[]`: compromised-asset links first, then sibling-asset links: `companyId`, `assetId`, `shareType: "shared_credential"|"shared_admin_access"|"same_vendor_only"`, `source: "self_reported"|"dns_inferred"`, `compromised`, `path: "validated_at_source"|"reachable_not_tested"|null`.
- `totals`: `companiesExposed`, `peopleExposed`, `heldCents`, `paymentsHeld`, computed from the incident's own rows, not from `nodes`. There is **no** `releasedCents`; the UI sums `getHeldPayments` rows with `decision.status === "paid"` for the "released after verification" line (keep doing that).
- `getExposureEvidence` returns `reasons`, `confidence`, `evidence: {kind, detail}[]`, `urgency`, `score`, `status`, `acknowledgedBy`, and `path: {techniqueId, techniqueName, sharedHop, linkType, here: "reachable_not_tested", whatToCheck?, source: "validated_at_source"} | null`. Today `EvidencePanel` does **not** render `path` at all.

Rules behind the data (context only, never re-implement): the reporter never gets an exposure; one exposure per company from its strongest link; score = base (shared_credential 90 / shared_admin_access 80 / same_vendor_only 40) × source weight (self 1, DNS 0.75), +30 for a flagged held payment, capped at 100, urgent at 70+; confidence 0.9 self-reported, 0.5 DNS; `terminalKind === "credential"` skips `same_vendor_only` links; holds only on `pending` payments at companies with `holdRuleEnabled` (off for Granite Peak, Meridian Dental, Pinecrest); bank-change flag when the paid account changed within 30 days of the incident.

### 4.3 The four scenarios (derived from `convex/seed.ts`; confirm live)
| Scenario | Centre asset | Exposed | Not exposed | Totals |
|---|---|---|---|---|
| `demo-brightline-001` ("Brightline payroll breach") | Brightline Payroll (payroll; vendor Brightline Payroll Inc., phone +1 (415) 555-0142). Reporter Pinecrest Staffing | **Cedar Ridge Manufacturing**: urgent, shared_credential, self-reported, $92,000 held (••2208, not flagged; that change was 150 days ago). **Summit Home Health**: urgent (40+30), same_vendor_only, self-reported, **$480,000 held, flagged** (••7731, changed by email 2 days earlier). **Bayview Veterinary Partners**: advisory (30+30), same_vendor_only, **dns_inferred**, confidence 0.5, $40,000 held ($28,000 ••2208 + $12,000 ••4419 flagged) | Alder Freight Systems, Granite Peak Software, Harborline Foods, Meridian Dental Group: `unrelated`. Pinecrest's $35,000 is not held (hold rule off) | 3 · 4,200 people · $612,000 across 4 payments |
| `demo-ironclad-cred-002` ("Ironclad shared login leaked") | Ironclad shared admin account (msp). Reporter Pinecrest | Cedar Ridge (urgent, shared_credential), Granite Peak (urgent, shared_credential), Harborline (urgent, shared_admin_access). Nothing held | **Alder, Summit: `same_vendor_separate_access`** via sibling asset "Ironclad IT Services". Bayview, Meridian: `unrelated` | 3 · 3,950 · $0 |
| `demo-ironclad-msp-003` ("Ironclad MSP compromised") | Ironclad IT Services (msp). Reporter Pinecrest | Alder (advisory, $24,000 held), Summit (advisory, nothing held), Harborline (urgent 40+30, $92,000 held: $55,000 ••5510 not flagged + $37,000 ••9902 flagged) | Cedar Ridge, Granite Peak: `same_vendor_separate_access` | 3 · 4,600 · $116,000 across 3 payments |
| `demo-armadin-004` ("Red-team finding (Ironclad login)") | Same asset as cred-002, with finding `ARM-2026-0412` (T1078 Valid Accounts, `terminalKind: "credential"`, 3 hops; never display its `confidence` value) | Same as cred-002; each exposure carries `path.here: "reachable_not_tested"` and `whatToCheck` | Same as cred-002 | Pinecrest's edge `validated_at_source`; Cedar Ridge, Granite Peak, Harborline edges `reachable_not_tested`; sibling edges `null`. Nothing held |

None of the 13 entries in `data/dns_links.json` touches Brightline or Ironclad, so Bayview is the only DNS-candidate edge in these scenes.

### 4.4 Live numbers during the Brightline demo
All via `useQuery` reactivity; derived from seed and docs, **confirm with `npm run rehearse` and by playing it**:
- In flight at fire: **$612,000** held (headline "$612,000 in payments held"). `money()` prints full dollars; do not write a "$612K" formatter. "K" in this prompt is shorthand.
- Jamie requests the $38,000 Summit bill (beat 2b): held on creation, flagged at ••7731. Headline **$650,000**; Summit node **$518,000 held**.
- Rosa releases the $480,000: it leaves `heldCents`. Headline **$170,000** plus "$480,000 released after verification"; Summit node "$38,000 held · $480,000 released". Without beat 2b: $132,000.
- Lakeside import (beat 4b, `convex/imports.ts`): a new exposed node with held payments appears live; headline **4 companies · 4,650 people**, adding $66,400 held ($716,400 with the $38K request, $678,400 without; after release $236,400 with the request, by arithmetic). A node added live must slot in without restarting the story or intro.
- Summit's ledger: cash $5,000,000 → $4,520,000 on release; AP goes to $38,000 (the $38K bill is still owed), not $0.
- `containedAt` set: vendor lines drop to 0.5 opacity, "✓ Contained", ripple off, particles stop; "Contained {date}. New payments to this vendor are no longer held."

### 4.5 The "$612K vs one badge" issue
The prototype badged only Summit's $480,000, so a judge adding up badges would not reach the headline. **Badge every node with `heldCents > 0`** via the existing `moneyBadges(node, facts)` in `src/map/copy.ts` ("$X held" amber, plus "$Y released" ok when `releasedCents > 0`), and add a text "bank change" marker when `facts.flaggedHeld > 0`. Brightline then shows $92,000 + $480,000 + $40,000 = $612,000. Add the `sum(nodes.heldCents) === totals.heldCents` check as a test in `src/map/layout.test.ts` only. No runtime assert. If it ever fails, report it to Role 1, do not paper over it. The headline lives outside the map; do not repeat totals inside the map.

### 4.6 New since #89 and the open asks to the frontend
- **"What to check"** (Role 1, #89): `exposures.path.whatToCheck?`, `getExposureEvidence().path.whatToCheck`, evidence item `kind: "what_to_check"`, and `getWritingContext().companyAlerts[].whatToCheck` (backend only). Example: "What to check: sign-ins to Ironclad shared admin account in the last 30 days, especially after Oct 24, 08:12 UTC. Rotate that login today, even if nothing looks wrong." Harborline (admin access) gets "Ask Ironclad Managed IT to rotate the admin account it uses for you...". It exists only when the incident carries a finding (the Armadin scene). Adrian's asks, now yours:
  - In `EvidencePanel`, label `what_to_check` "What to check" and show it **first** for exposed companies: it is the IT lead's next step. Show it in the IT lead's company view (from their own exposure via `getMyExposures` / `getExposureEvidence`) as the lead element under the alert. In the Armadin scene that is Sam Kowalski (`sam.kowalski@cedarridge.example`, IT, Cedar Ridge) or Ben Carter (Granite Peak), not Kwame. Kwame in that scene is the "discipline" empty state. Check the email with `listUsers` (`demoEmail()` in `seed.ts`) before hard-coding it.
  - Replace raw keys and mono values ("link: shared_credential via ...", "technique", "path") with plain labels: "How you're connected", "Attack technique: Valid Accounts (T1078)", "What this means for you". Map evidence kinds to labels in one table; unknown kinds fall back to `humanize(kind)`.
  - Show `path` in the firm view: label Pinecrest's line "validated at Pinecrest" (firm view only) and exposed lines "reachable here · not tested". At company level never print "validated".
  - Adrian also asked for `convex/ai.ts` changes: append `item.pathSummary` and then `item.whatToCheck` (each when non-null) to the canned alert, and use `context.technique` in the vendor letter (asks #4 and #6). Today the canned text drops both. That is backend and out of scope here; leave it for Omar to do in a separate Role 4 PR, and say so in the handoff.
- **Released payment vs. stale alert text** (→ Role 2, now you): alert text is written once at incident time, so after Rosa releases, Summit's alert still says "That payment is held until verified". Under each company alert, show the **current** state of that company's payments for the alert's incident (join `getHeldPayments({})` rows to the alert by `payment.heldByIncidentId === alert.incidentId`, or by `alert.paymentId` when set), e.g. "Payment since released by Rosa Alvarez · Oct 24, 3:04 PM". Reuse `paymentLook` and the decision strip wording from `PaymentCard` ("Released by ..." / "Rejected by ..."); read the decision's actor name the way `PaymentCard` does today. Display only; do not edit the alert text.
- **Nice-to-haves already asked of Role 1** (`role-2-frontend.md`): `viewerIsRequester` / `viewerCanDecide` on held rows, `incidentName` on audit rows, `acknowledgedByName`, `totals.releasedCents`, a readable `reason` from `requestPayment`. Do not wait for them; keep the current client derivations.

---

## 5. UI remake spec

### 5.1 Tokens: one system
Today `src/index.css` defines its own `@theme` (`graphite #15171c`, `panel #1d2027`, `line #2c303a`, `paper #f4f2ed`, `ash #8c919a`, `amber #f5a524`, `danger #f26d6d`, `ok #4cc38a`) and `brand/tokens.css` is never imported. The brand file has `graphite-950 #15171C`, `graphite-900 #1C1F26`, `graphite-800 #262A33`, `line #30353F`, `urgent #F2665A`, `advisory`, `clear #4CC38A`, `info #8C919A`, `--font-mono`, `--radius-tile 12px`, `--radius-chip 8px`. Note `--color-info` and the radii exist **only** in the brand file.

Do this (editing `src/index.css` only, never `brand/`):
1. Add `@import "../brand/tokens.css";` right after `@import "tailwindcss";` (the brand README's own instruction).
2. Keep the old class names working as aliases so nothing breaks mid-refactor: `--color-graphite: var(--color-graphite-950)`, `--color-panel: var(--color-graphite-900)`, `--color-danger: var(--color-urgent)`, `--color-ok: var(--color-clear)` (current code uses `text-graphite`, `bg-graphite`, `bg-panel`, `text-danger`, `text-ok`). Delete `--color-line`, `--color-paper`, `--color-ash`, `--color-amber` and `--font-sans` from `index.css`'s `@theme` so the brand values win. Then migrate components to the brand names (`graphite-950/900/800`, `urgent`, `clear`, `info`, `rounded-tile`, `rounded-chip`) and drop the aliases once grep shows no users. Decide and record it.
3. Visible shifts to check: `line` becomes `#30353F`, urgent becomes `#F2665A`, cards become `#1C1F26`. Re-check AA contrast for every text/background pair, especially ash on graphite-900 and coral chips at 10% fill.
4. Canvas or SVG attributes that cannot read CSS variables: read them once with `getComputedStyle(document.documentElement)` or hard-code the **brand** hex values in one constants file in `src/map/`. Never the prototype's `C` palette.
5. Keep `color-scheme: dark`, `scroll-padding-top` and the amber `:focus-visible` outline. Keep the Google Fonts `@import url(...)` as the first line of `src/index.css`. Then `@import "tailwindcss";`, then `@import "../brand/tokens.css";`. Do not add a `<link>` to Manrope in `index.html`.

**Amber discipline:** amber means brand, advisory, or the single next action on this screen. Today it is on Fire incident, the PE headline amount, the phone number, "Decision needed" and the presenter border. Pick one per screen: for Jamie, the hold framing; for Rosa, Release (once the note is written); for Jordan, the held total. Escalation uses an amber outline only if it is that screen's next action.

### 5.2 Layout direction: a deliberate command centre
Replace "one long stack of identical cards" with a layout that has a lead, a working area and a reference area per role. A starting point (the design phase picks the final one, §7):
- **Shell:** sticky header (logo SVG, incident context pill, user switcher, sign out). Demo controls move into a separate, clearly labelled "Demo" strip (or a compact menu) so the product header is not test controls. **Keep visibility rules unchanged:** Fire and Replay stay visible to everyone (judges may try the live site); the scenario menu and Reset stay `?stage`-only.
- **Incident banner** on every signed-in view while an incident is open: what happened, in that viewer's words, never naming the reporter outside the PE view. E.g. company: "Your payroll vendor, Brightline Payroll, is under an active incident." PE: asset, kind, time, "reported by Pinecrest Staffing (visible to the PE firm only)", Contained chip.
- **Lead zone:** one dominant element per role (§5.4).
- **Working zone:** a 12-column grid at `lg` and up, with a main column and a context column. Sections get real hierarchy: an `h2` at a readable size (not tiny uppercase ash for everything), an optional one-line explanation, then content.
- **Reference zone:** audit, ledger history, setup tools: lower, quieter, still on the page (judges must be able to reach them on stage in one scroll or one click). If you add in-page section navigation (anchor links or tabs), it must not hide anything the script points at; anchors are safer than tabs on stage.
- Content width: today `max-w-7xl` with `px-4 md:px-6`. You may widen the PE view so the map gets more room (e.g. `max-w-screen-2xl`); keep the 16 px phone gutter.

**Type scale** (projector first; at 1440 px): page lead number 56-72 px (600, tabular); `h1` 32-40 px; section `h2` 18-20 px (600, paper); body 16 px; secondary 14 px ash; chips 12-13 px 500; never below 12 px. **Spacing:** a 4/8 px rhythm, section gaps 32-48 px, card padding 20-24 px, no nested card-in-card for the hero. **Radii:** tiles 12 px, chips and buttons 8 px. **Motion:** 150-250 ms opacity/transform for state changes, no layout animation on live data, nothing that loops except the map ripple and particles; all of it off under `prefers-reduced-motion`.

### 5.3 Sign-in (`src/auth/SignInScreen.tsx`, `useSignInAs.ts`, `directory.ts`)
- Today: stacked logo, a small "Sign in" `h1`, email/password form, "Demo password for every seeded person: `sidecall-demo`", and a "Sign in as" card grouped by company with Jamie marked "· start here".
- Lead with the story: one sentence (from §1.2, shortened), a three-step strip (one vendor breached → sisters that genuinely share it are warned → payments to it held until someone calls the number on file), and one amber primary button "Start the demo as Jamie Chen (AP clerk, Summit Home Health)".
- Below it, the people grid as rounded tiles grouped by company, with roles in words; the email/password form stays but is secondary.
- Keep: the demo password notice (on purpose; every person is simulated), both error messages ("That email isn't on a portfolio team. Ask your admin for access." / "Sign-in failed. Check the email and password."), the loading and "No one is seeded yet. Run the seed, then reload." states, sessionStorage sign-in per tab.
- Switching users currently flashes sign-in → "Loading..." for 2-4 s. Make that a stable skeleton of the destination view.

### 5.4 What leads, per role
- **AP clerk (Jamie):** incident banner → **hero held payment** (amount at lead size, "Held until verified", route "Summit Home Health → Brightline Payroll Inc.", ••2208 grey → ••7731 coral with "changed by email 2 days before the incident", due time, the call line for a requester: "You requested this payment, so a controller must release it..."). The release form stays available so the refusal beat works; the refusal appears in place, prominent, in words, and is clearly logged. Then **Bills to pay** with Request payment (beat 2b) close by, then alerts, then ledger, timeline, controls log, notifications.
- **Controller (Rosa):** banner → **escalation** ("Decision needed · due in about N hours") attached to the hero payment → call line "Call Brightline Payroll Inc. at +1 (415) 555-0142, the number on file, never one from a recent email." → note field ("Verification note (who you called, what they confirmed)") → Release / Reject. Release is enabled for the requester with or without a note, so the refusal is one click. For a controller who isn't the requester, it is disabled only while the note is empty. Never check note length or content in React: the short-note refusal ("Describe the verification call...") must come from the mutation, or beat 4 disappears. Then → **inline confirm** with today's text ("Release $480,000 to Brightline Payroll Inc. account ••7731, an account changed by email 2 days before the incident?"). **Ledger impact beside the payment**: Cash and AP balances (`getLedger().balances`) with the change visible when it happens (e.g. Cash $5,000,000 → $4,520,000). Then alerts (with current payment state, §4.6), then the full ledger table, controls log, notifications (`canManage` for controller).
- **IT (Kwame, or the IT lead of an exposed company):** banner → **their alert first** (urgency chip, AI-written body, Acknowledge / Close, "Acknowledged by ..."), then held payments read-only (no "Decision needed"), then timeline, controls log. "What to check": show it in the IT lead's company view as the lead element under the alert. In the Armadin scene that is Sam Kowalski (`sam.kowalski@cedarridge.example`, IT, Cedar Ridge) or Ben Carter (Granite Peak), not Kwame. Kwame in that scene is the "discipline" empty state. This is the second tab in the acknowledge race: Acknowledge is the primary action, 44 px tall, visible without scrolling at 800×900 in both tabs. Close stays secondary and visually separate, so the presenter can't hit it in the race. The loser sees the backend's reason ("Not acknowledged: {reason}").
- **PE firm (Jordan):** banner (with incident selector when more than one incident, " · contained" in the menu) → **stat strip**: companies exposed, people behind them, held (amber), released after verification (clear), each a big tabular number with a label; on phones the strip stacks, it must not break mid-sentence at "·" → **map + evidence** (map wide, evidence and "Payments held · {company}" in a context column or drawer next to it) → **tailored alerts + vendor letter** side by side or adjacent (beat 6), each alert with urgency, status, "Acknowledged by ...", AI label → **timeline** (Convex beat; today it sits above the map and pushes the map below the fold: move it) → **all held payments** (read-only, "The firm sees every hold. Only a controller at the portfolio company can release or reject.") → **controls log + Export CSV** → **Proof** (Real / Simulated, scorecard tiles Caught / Missed / False holds / Correctly left alone and the case table, DNS findings on real domains) → secondary area: **AP import**, **notifications**, **containment**. The firm never gets a release button.
- **No incident yet (PE):** today "No open incidents across the portfolio. Fire the demo incident to start." plus AP import. Make the pre-fire frame show the portfolio itself (companies as quiet tiles, from `listCompanies`) with a calm "No open incidents" state, so the zoom-out has a "before".
- **Company with no exposure:** "No alerts. Nothing you share is affected." becomes a designed, positive state in clear green with a check (the discipline beat 6c: Summit under the Ironclad credential leak). "Payment holds are off for this company." stays visible when `!holdRuleEnabled`.

### 5.5 Component specs
- **Payment card states** (`PaymentCard.tsx`, `HeldPaymentsPanel.tsx`): held (amber framing, "Held until verified"), held + bank change (coral block "••old → ••new" with the days-before line; trusted ••2208 grey, new ••7731 coral), escalated, releasing / rejecting ("Releasing..." / "Rejecting..."), released ("Released by Rosa Alvarez · "note" · time", chip "Released" when it went through a hold, "Paid" only without one), rejected, refusal (inline, coral, verbatim reason), firm read-only ("Waiting on Summit Home Health's controller..."). "Why it's held" / "Why it was held" disclosure with `holdReasons`, notice and escalation text. Audit log disclosure: show `actorName`, readable action labels instead of raw `a.action` in mono, rule ids wrapping at underscores.
- **Release confirm:** inline two-step inside the card (button becomes "Confirm release" with the sentence above it and a Cancel), focus moves to the confirm, Esc cancels. Same for Reject and for Reset (`DemoControls`). Remove every `window.confirm`, including Disconnect in `NotificationsPanel` (today at `DemoControls.tsx:155`, `PaymentCard.tsx:60`, `NotificationsPanel.tsx:84`; grep for more).
- **Escalations:** `kind: "escalation"` alerts from `getMyAlerts`, shown on the matching held card for controllers only, only while held.
- **Bills** (`BillsPanel.tsx`): description, "vendor · due Mon D", amount, status chip ("Held until verified" like payment cards) or Request payment; result line inline.
- **Ledger** (`LedgerPanel.tsx`): balances summary + table (Date, Memo, Account, Debit, Credit), fixed columns, tabular, scrolls inside its own box on phones. `LedgerPanel.tsx:1` says it is optional; keep it, it carries the Hyphenate "cash moves only on release" beat.
- **Notifications / outbox:** channels with masked target, Send test / Remove where allowed, "Connect a channel" form, outbox rows (time · channel · event · status chip · preview with `whitespace-pre-line`), the "simulated" label.
- **Controls log:** Time, Company, Who, Action, Rule, Reason; newest first; Export CSV keeps the file names (`sidecall-controls-log-{externalId}.csv` for the firm, `sidecall-controls-log-{domain}-{externalId}.csv` for a company) and the CSV escaping.
- **AP import:** keep every state (sample files, preview with "already tracked" / "new vendor", red warnings, problems, "Reading the files...", "Only the PE firm can import.", result with both logins). Lives in the secondary area.
- **Timeline:** amber stat headline from `stats` and the collapsible "N events, real timestamps" list; unknown event kinds render as text.
- **Vendor letter:** `whitespace-pre-wrap`, Copy (Clipboard API with select fallback) and "Open in email" (mailto with no address, on purpose), a "writing..." state until ready, AI label.
- **Presenter panel** (`?stage`): today fixed bottom-right, up to 70vh, can cover Release / Acknowledge. Make it dock so it never covers content (e.g. a collapsible bottom bar that reserves its own height, or a side rail the page makes room for), start collapsed under 768 px, keep all beats with title / say / tip, "Sign in as {name}", "Next beat", current person marked, and "Couldn't sign in as X. Reset, then try again.". Update beat copy only if a label it names changes (you own `src/demo/` now).
- **Errors:** `ErrorBoundary` session-ended path ("Your session ended (the demo may have been reset). Taking you to sign-in...") and the generic message + Reload stay. Keep `friendlyError` / `refusalOf` / `isSessionEnded`.
- **Primitives:** rework `Card`, `Chip`, `LookChip`, `Empty` in `src/panels/ui.tsx` and `BUTTON_PRIMARY` / `BUTTON_SECONDARY` / `FIELD` in `styles.ts`; replace the hand-rolled button classes in `BillsPanel`, `DemoControls`, `VendorLetterActions`, `NotificationsPanel`, `SignInScreen`. Add a section header, a stat tile, a skeleton and a designed empty state. Keep labels in `labels.ts` as the single source of status words.

### 5.6 Already fixed: must not regress
From the two UI audits and Marco's handoff: held payment first and large for company viewers, smaller on the firm view; one column when there is one card; reasons / notice / escalation folded into "Why it's held"; call line by role (requester, decider, other staff, firm); confirm only for a controller who is not the requester (Jamie goes straight to the refusal); IT keeps alerts first and no "Decision needed"; status chips from `labels.ts`; alert text `max-w-prose`; ••2208 grey, ••7731 coral; "due within the hour" / "1 hour"; "Releasing..." / "Rejecting..."; subtitle drops the account when the bank-change block shows it; "Released" vs "Paid" chip rule; no score text anywhere; 375 px with no horizontal scroll; skip link; sticky header only from `md`; switcher wide enough for "Jordan Ames (Northpass Capital) · PE firm"; switching people remounts the company view (`key={me._id}`) so notes and refusals never carry over.

### 5.7 Responsive, projector, accessibility
- Widths to design and check: **1440** (projector), **800** (half-screen two-tab race), **390** (phone). No horizontal scroll at 390 (tables scroll inside their box).
- Projector: nothing important below 14 px at 1440; amounts and names larger; AA contrast against graphite-950 and graphite-900; one focal point per screen.
- WCAG 2.2 AA: semantic headings in order, landmarks, skip link, visible `:focus-visible`, focus moved sensibly after inline confirms and refusals, `aria-live="polite"` for refusals, results and live number changes (announce the change once, not on every render), labels on every field, target size 24 px minimum (44 px for primary stage actions), no colour-only status, reduced motion honoured.

---

## 6. Map spec (`src/map/**`)

### 6.1 Contract with `PortfolioView`
Today `PortfolioView.tsx` (~:127-161) renders `<BlastRadiusMap blast={blast} selected={selected} onSelect={setSelected} />` as the first child of `grid lg:grid-cols-[1fr_360px]`, with `EvidencePanel` (`exposureId={selectedNode?.exposureId ?? undefined}`, `companyName`) and the "Payments held · {name}" card on the right. Selection state lives in `PortfolioView`; today it is reset to `undefined` only when the firm picks another incident from the selector (not when a new incident auto-replaces the shown one). Reset it on any `incidentId` change.

**You own `PortfolioView` now, so props may change**, but keep the behaviour:
- `onSelect(companyId)` fires only for exposed nodes; non-exposed nodes show their caption locally.
- The evidence panel and the selected company's held payments follow the selection.
- `selected` can become `undefined` from outside (incident change); the map clears its ring and detail.
- The map subscribes to `getHeldPayments` with exactly the same args as `PortfolioView` (shared subscription), and to `listAssets` only for sibling-asset names. Only `useQuery`; no mutations from the map.
- Keep `MapCard` (or an equivalent) renderable without Convex given `factsFor` and `assetNames`, so fixtures and tests work.
- Grep for importers before renaming or deleting any export (today only `PortfolioView.tsx` imports from `src/map/`).
- Width: measure the container with `ResizeObserver`. The 900 / 640 / 500 breakpoints use the measured container width. The single exception is the phone switch to `MapList`, which stays on the viewport `sm` breakpoint (as today). Today the column is about 850 px at 1440; if your new PE layout gives the map more, design for that.

### 6.2 Visual and copy rules specific to the map
- Tones via `copy.ts` `tone()`: urgent coral (exposed + urgent), amber (exposed + advisory), clear green (`same_vendor_separate_access`), paper (reporter), ash (`linked_not_exposed`, `unrelated`). DNS-candidate lines in ash/`info` (there is no `info` in `src/index.css` today; it arrives with the brand import in §5.1).
- Reuse `copy.ts` words: `tone`, `statusWord` ("Urgent" / "Advisory" / "Reported this incident" / "Linked · not exposed" / "Separate access · not exposed" / "Not linked"), `mainEdge`, `SHARE_WORDS` ("Shared login" / "Shared admin access" / "Customer of the vendor"), `reason` ("Payment to a changed account" when flagged; " · candidate link" for DNS), `moneyBadges`, `moneyFacts`, `exposureState` ("✓ Acknowledged" / "✓ Closed"), `caption(node, blast.asset.name, siblingName)`, `ariaLabel`. The map describes what the backend decided and decides nothing (`copy.ts:1-2`).
- Reporter: named here only (firm view), a neutral paper slot labelled "Reported this incident" (or "Reported it · firm view only"); no patient-zero emphasis; its vendor link is not drawn, except the Armadin `validated_at_source` case below.
- The vendor sub-label "breached" (`[vendorName, "${kind} · breached"]`) is existing accepted copy. When `incident.finding?.terminalKind === "credential"`, the sub-label is "login · leaked". Otherwise keep `${kind} · breached`. Record the cred-002 gap (no field marks it as a credential, so it still shows "msp · breached") for Role 1.
- The PE user's name is "Jordan Ames (Northpass Capital)". Don't parse the firm name out of `me.name`; keep the label "Parent firm" and leave the ask with Role 1.

### 6.3 Deterministic layout (`layout.ts`, pure, no DOM)
A pure function, e.g. `layoutBlast(blast, assetNames, factsFor, { width, height })`, returning node positions, label anchors, edge path `d` strings and the story steps. An algorithm for any N, not the prototype's hand-placed positions:
- **Safe area:** inset from the frame by the room labels need (left/right gutters capped at 30% of width, a top band for the step caption, a bottom band).
- **Centre:** the compromised asset at the safe-area centre, larger than the biggest company, ripple unless reduced motion or contained.
- **Bands on concentric ellipses** with **one** scale for both axes (circles stay circles): inner ring `exposed`, ordered urgent first, then score descending, then name, spread over a sector facing right; middle ring on the opposite side for `same_vendor_separate_access` and `linked_not_exposed`, with sibling-asset nodes there as quiet squares; outer ring `unrelated`; reporter on the outer ring near the top-left, never next to the hottest node.
- **Stable order:** sort by `(band, urgency, -score, name, companyId)`. A node must not jump when a payment is released; a node inserted live (Lakeside) slots in, and existing nodes may move only within their band.
- **Radius** by headcount: sqrt scale clamped to 18-34 px at full width, shrinking with the container. Dense mode: above 14 shown companies every radius is 14 and the reason line is dropped; above 14 nodes, unrelated companies collapse into "+ N other companies, not linked" (`DENSE_AT = 14`, collapse rule around `layout.ts:191-195`).
- **Labels point outward:** right half anchored start, left half end, within ±25° of vertical centred below (bottom) or above (top). Lines: name (`splitName`), status tag, reason (exposed only), money badges.
- **No overlaps:** deterministic label pass per side (sort by y, push down by box height + gap, shift the column up if it overflows, leader line if moved more than ~12 px); nudge node angles within their band if nodes overlap each other or the centre.
- **Edges:** quadratic curves; store `d` so particles reuse it. Centre → every company with a `compromised` edge except the reporter. Width: `shared_credential` / `shared_admin_access` 3.5, `same_vendor_only` 1.75. Colour: company tone when exposed, else line/ash. `dns_inferred`: dashed ash, "candidate" in label, tooltip and `aria-label`. `reachable_not_tested`: "reachable here · not tested" on hover, focus and `aria-label`. `validated_at_source` (Armadin, Pinecrest's edge): the one exception to "no reporter link"; Adrian asked for the label "validated at Pinecrest" (firm view only). Draw it as a thin paper dashed line, or, if it clutters, put the fact in the step caption; decide and record. Sibling edges (`compromised: false`): ash, width 1, opacity 0.4, to the sibling-asset node. In the Ironclad scenes this gives Alder and Summit (cred-002) or Cedar Ridge and Granite Peak (msp-003) a faint line, fixing the prototype's "green nodes with no line" gap. Draw only sibling assets that appear in `edges[]`; do **not** draw the prototype's decorative vendor squares (Keystone, Relay, Ledgerly).
- **Background stays quiet:** unrelated companies and sibling assets small, ash, low opacity, labelled on hover or focus, always visible.

### 6.4 Story steps, built from data
Include a step only if it has members (the Ironclad scenes have no money step):
| Key | Members | Title | Body |
|---|---|---|---|
| `vendor` | centre | "The leaked login" when `incident.finding?.terminalKind === "credential"`, else "The compromised vendor" (cred-002 has no finding, so it gets "The compromised vendor"; note for Role 1 that no field marks it as a credential) | "{asset.name}, used across the portfolio, is compromised." |
| `urgent` | exposed + urgent | "Genuinely exposed" | names + share words |
| `advisory` | exposed + advisory | "Same vendor, lower risk" | names, + "candidate" when any edge is `dns_inferred` |
| `money` | `heldCents > 0` | "The money is held" | "Held until a controller calls the number on file. Cash moves only on release." (per-company badges carry the amounts; no totals in the map) |
| `safe` | `same_vendor_separate_access` | "Same vendor, not exposed" | "{names} use {vendorName} through {siblingName}, not {asset.name}. Not alerted." |
| `quiet` | `unrelated` + `linked_not_exposed` | "Discipline over noise" | `unrelated`: "{names or N companies} don't use {asset.name}. No alert." `linked_not_exposed`: "{names} are linked to {asset.name}, but not in a way this incident reaches. No alert." |

- Current step at full strength; others visible but dimmed (current edges 0.95, other edges 0.3, cold edges 0.07; nodes similar).
- **Side list** (`<ol>`) next to the map, below it under ~900 px container width: current step `aria-current="step"` with a progress bar, click to jump, wrapped in `aria-live="polite"` announcing only the step title.
- **Auto-play** every 3.6 s, looping. Pause on hover, focus inside the map, a selected node, the Pause button (`aria-pressed`), `document.hidden`. Reduced motion: starts paused, never auto-advances. Once a company is selected, stay on its step (or a neutral "all" view); never fight the presenter.
- **Keyboard** (scoped to the map figure, never `document`): ← → change step, Space play/pause (`preventDefault` only there), Esc clears the detail or zoom. Nodes keep Enter/Space to select; tab order follows the layout sort.

### 6.5 Motion
- **Intro** once per `incident._id`: keep the `useReveal.ts` approach (Web Animations API, `data-reveal` groups, 90 ms stagger, `cubic-bezier(.2,.7,.2,1)`, about 1.2 s, cancelled on unmount so StrictMode replays). Rewrite its order and its first-line comment (it still describes the parent/branch tree) for centre → edges → companies.
- **Ripple:** 2-3 rings, CSS keyframes, 2.4 s, opacity ending at 0, no blur, off when contained.
- **Particles:** 1-2 dots per current-step edge, centre outward, on the edge's own `d`; speed by line weight; removed (not hidden) outside the current step; off when contained.
- **Step change:** 250-350 ms opacity. Never animate positions on data updates.
- `prefers-reduced-motion: reduce` via `matchMedia` with a change listener: no intro, ripple, particles, auto-play; instant transitions.

### 6.6 Selection, detail, tooltips
- Exposed node click: select it (amber solid ring, `aria-pressed=true`); evidence and held payments update. Other nodes: local caption via `caption(...)`, no selection. Centre or sibling asset: the asset detail copy ("Breached vendor asset", "Shared by N portfolio companies: ...", "Verify by calling the number on file: {phoneOnFile}"; sibling: "Same vendor · not affected ... Not alerted.").
- Zoom (today a 450 ms viewBox zoom with Esc and "← Back to portfolio (Esc)") is optional in the new look. Keep it with Esc and the back button, or drop it and show detail in a card beside the map; record which.
- Default hint: "Select a company to see why. Exposed ones open their evidence on the right." (adjust "on the right" if your layout moves evidence).
- Tooltip on hover and focus (`role="tooltip"`, `aria-describedby`): "{share words} · {DNS candidate | self-reported}", "reachable here · not tested" where it applies, "{N} people". The full fact is also in `aria-label`.

### 6.7 Fallbacks, responsiveness, accessibility
- `?map=grid` renders only `MapList` (no SVG, legend or motion); phones (below `sm`) always get `MapList`. This is the documented stage fallback.
- Container ~500 px up to full width: under ~900 px the step list moves below; under ~640 px reasons move to tooltips and labels shorten; 390 px viewport uses the list, no horizontal scroll.
- Projector at 1440: names ≥ 14 px, status tags ≥ 12 px, badges ≥ 13 px, AA contrast, text halo via `paintOrder="stroke"` in the background colour, tabular numbers.
- Every interactive node `role="button"`, `tabIndex=0`, `aria-pressed`, `aria-label`, `<title>`; focus ring only on `:focus-visible` (amber dashed "4 3"), selection ring amber solid; lines and decoration `aria-hidden`. Sr-only `figcaption`: "Blast radius for {asset.name}: N companies exposed out of M." Keep the `aria-live="polite"` note.
- Legend: colour = verdict (with words), size = headcount, thick vs thin = shared login/admin vs customer of the vendor, dashed = candidate (public DNS). Line swatches hidden on phones.
- `EvidencePanel`: keep the urgency chip, `AcknowledgedBy`, Reasons, the empty state "Select an exposed company to see why.", and the `role="meter"` bar, but confidence shows as words plus the bar only: "High · self-reported link" or "Medium · candidate link from public DNS" (Role 1's earlier ask). No percentage text, and never display `finding.confidence` or `score`. The `role=meter` keeps `aria-valuetext` in words. Add the §4.6 changes ("What to check" first, plain labels, path wording).

### 6.8 Gotchas
SVG-specific:
1. One `viewBox` equal to the measured pixel size (or one uniform scale with `preserveAspectRatio="xMidYMid meet"`); never scale x and y differently.
2. Key particle elements by `stepKey + edgeId` so React remounts them on a step change instead of retargeting a running `<animateMotion>`.
3. Keep the step timer in a ref with `setTimeout`, not per-frame state; memoize the motion layers so hover and ticks do not re-render them.
4. `ResizeObserver`: debounce with `requestAnimationFrame`, re-layout only when size changes by ≥ 1 px.
5. Scope key handlers to the map figure; the app has other inputs (call notes, forms).
ECharts-only (fallback path): pin two invisible anchor nodes and hidden value axes to keep coordinates 1:1 (or circles stretch into ovals); `effect.trailLength: 0` (a non-zero trail leaves a ghost arc and is a glow); fresh series `id` per render with `setOption(opt, { replaceMerge: ["series"] })`; set the option once per step, never per frame (it restarts effects); sample the graph's own quadratic curve for particle polylines.

---

## 7. Execution plan for Fable ultracode

### Phase 1: Understand (no code)
- Do all of §0. Run the app; sign in as each persona; fire each scenario; take baseline screenshots at 1440 / 800 / 390 of every screen and role into the scratchpad.
- Record what `getBlastRadius` returns for all four scenarios from the browser (React DevTools on the map's props while signed in as Jordan) or from the rehearsal output. `npx convex run` returns `null` for it (firm-only query). **Never edit `convex/`**, not even temporarily. Confirm §4.3 and §4.4; note differences.
- List every string the script and shot list point at ("Fire incident", "Release payment", "Bills to pay", "Request payment", "Payments held", "Letter to the shared vendor", "Controls log", "Export CSV", "Proof", "Onboard a company from its AP export", "Use sample files", "Mark contained", "Acknowledge", "Replay webhook", "Incident" menu, scenario names). Keep them, or record every rename for Marco.

### Phase 2: Design (judge panel)
- Produce **2-3 layout directions** for the whole app (for example: A "command centre" with a stat strip and a context column; B "one stage per beat" with a hero per role and a quiet reference area; C "desk with a drawer" where evidence and payment detail slide over a wide map). For each: a short written spec plus a quick static mock (HTML in the scratchpad, or a throwaway route that is not committed) at 1440 and 390 for Jamie, Rosa and Jordan.
- Run a **judge panel** of 2-3 independent reviewers (subagents), each scoring every direction against: first-10-seconds clarity, one focal point per beat, projector legibility, script order, brand rules, accessibility, phone fit, implementation risk before freeze. Pick one, merge the best ideas, write the final design brief (tokens, type scale, grid, per-role lead, component list) into the scratchpad. Also decide: zoom kept or dropped, the Armadin validated-edge drawing, step-list placement, section navigation or not.

### Phase 3: Implement (parallel workstreams, no two agents on one file)
Agree file ownership before starting; a file has exactly one writer. Subagents share one working tree. Only the lead agent runs `git` (stage by path, commit), `npm run lint`, `build` and `test`. Workstreams return finished files and do not commit. Or use one git worktree per workstream, branched off `feat/ui-remake`, merged by the lead.
1. **Foundation (serial, first):** `src/index.css` token import and aliases, `src/panels/ui.tsx`, `src/panels/styles.ts`, `src/panels/labels.ts`, `src/panels/format.ts`, new shared primitives (section header, stat tile, skeleton, empty state, inline confirm). Everyone else waits for this, then only imports from it.
2. **Shell and stage:** `src/App.tsx`, `src/main.tsx`, `src/layout/**`, `src/auth/**`, `src/demo/**` (header, incident banner slot, demo strip, presenter dock, sign-in landing, loading skeletons, error states).
3. **Company views:** `CompanyView.tsx`, `PaymentCard.tsx`, `HeldPaymentsPanel.tsx`, `BillsPanel.tsx`, `LedgerPanel.tsx`, `AcknowledgedBy.tsx` (hero payment, inline confirm, ledger beside it, alert current-payment state, IT "What to check").
4. **Firm view and shared panels:** `PortfolioView.tsx`, `TimelinePanel.tsx`, `ControlsLogPanel.tsx`, `VendorLetterActions.tsx`, `ContainPanel.tsx`, `ApImportPanel.tsx`, `NotificationsPanel.tsx`, `ProofPanel.tsx`, `scorecard.ts`, `dnsFindings.ts`. The company workstream uses these components but does not edit them; it asks this owner for changes.
5. **Map:** `src/map/**`, split into sub-owners by file: geometry (`layout.ts`, `steps.ts`, pure), rendering (`BlastRadiusMap.tsx` and new small scene/list components), motion and story (`useStory.ts`, `useReveal.ts`), copy and evidence (`copy.ts`, `EvidencePanel.tsx`, `MapList.tsx`). The `PortfolioView` ↔ map interface is agreed between workstreams 4 and 5 up front.
Delete dead code (the old tree renderer, unused exports, hand-rolled button classes). No `console.log`.

### Phase 4: Adversarial review (separate reviewers, before the PR)
- **Correctness and contract:** every query and mutation from §4.1 still used with the right args; nothing recomputed in React that Convex decides; `onSelect` only for exposed; shared `getHeldPayments` subscription; refusals shown verbatim; session-ended path works; live inserts (Lakeside) and live releases do not restart the story.
- **Copy and legal:** grep the diff for `validated|verified|confirm|fraud|block|stop|cancel|frozen|attack|breach detected|patient|integrate|accuracy` and justify every hit; any percentage shown in the UI is a plain fail. Check the reporter name never reaches a company view: sign in as Jamie, Rosa, Kwame in every scenario and search the page text for "Pinecrest" while excluding the user switcher and presenter panel (`[aria-label]` regions you mark). Any hit in banners, alerts, payment cards, evidence, timeline, controls log or notifications fails. Do not remove Pinecrest from the directory.
- **Brand:** grep for `gradient|shadow|blur|glow|drop-shadow|filter:` and any blue hex (`shadow-` utilities count; `PresenterPanel` uses `shadow-lg` / `shadow-2xl`; remove them); banned icons; amber used once per screen for the next action; logo from SVG only.
- **Accessibility:** keyboard-only run of the whole script, focus order, focus after inline confirm and refusal, live-region spam, unscoped key handlers, colour-only status, contrast, target sizes, reduced motion.
- **Demo beats:** play `docs/demo-script.md` end to end and tick every beat and number; confirm the presenter panel never covers a control it tells you to press; confirm the first 10 seconds on the landing page and on each role's view.
- **Layout robustness:** 1 company, 0 exposed, 14 / 15 companies (collapse edge), 40 companies, very long names, contained incident, selected node going `undefined`, two incidents in the selector.

### Phase 5: Verify (evidence before claims)
1. `npm run lint` (`tsc -b` + eslint `--max-warnings 0`), `npm run build`, `npm test`. `vitest.config.ts` only includes `convex/**/*.test.ts` and you may not edit it, so run pure frontend tests (map layout: zero node overlaps, zero label overlaps, every label inside the frame, stable order across two runs, `sum(heldCents) === totals.heldCents`, for all four scenes at 1440 / 800 / 500 px container widths and a 40-company fixture) with a scratch config: write `<scratchpad>/vitest.ui.config.mjs` with no imports: `export default { root: "<abs repo path>", test: { include: ["src/**/*.test.ts"], environment: "node" } }`, then run `npx vitest run -c <that path>` from the repo root. `tsc -b` type-checks `src/**/*.test.ts` (tsconfig.app includes `src`), so tests import only from `vitest` and pure modules. Commit the test files (e.g. `src/map/layout.test.ts`) so Marco can widen the include later. Do not use `npx tsx` (not in the repo; it would download an unpinned package).
2. `npm run rehearse` against **dev only** (`.env.local`). It needs `DEMO_MODE=true` on the deployment, and it **resets the dev deployment before and after**, so re-fire scenarios afterwards. Never pass `--url` to production.
3. Visual check in a browser for **every scenario × every role** at **1440, 800 and 390** widths (plus ~500 px container for the map), with screenshots saved to the scratchpad: landing; Jamie hero + refusal + $38K request; Rosa short-note refusal, inline confirm, release, ledger move; Kwame alert + acknowledge race in two tabs at 800 px each; Jordan stat strip $612,000 / $650,000 / $170,000 + "$480,000 released after verification"; map lit set and colours, all Brightline badges, dashed Bayview "candidate", faint sibling lines in Ironclad scenes, Armadin path wording and "What to check", reporter neutral, "✓ Contained", Lakeside live insert; evidence for Cedar Ridge and Bayview in both orders; Summit alert showing "Payment since released by Rosa Alvarez"; `?map=grid`; phone list; Replay → "duplicate, nothing new written"; Export CSV.
4. `prefers-reduced-motion: reduce` (DevTools → Rendering): no intro, ripple, particles, auto-play or transitions anywhere; steps still navigable.
5. Console: zero errors and zero React key warnings; no render work while idle.

---

## 8. Deliverables and reporting

- **Branch:** `feat/ui-remake` (one branch; conventional commits, rebased on `main` before each push). Push the branch (does not deploy).
- **PR into `main`, do not merge.** Title like "feat: command-centre UI remake and story map (Omar)". Body: summary per screen and role, the dependency decision, token migration, a table of scenario × role × width (1440 / 800 / 390) with the scratchpad path of each screenshot (tell Omar to drag the key six into the PR by hand; do not commit screenshots), the verification checklist with each command's exit status, every renamed UI string, and open asks. Every merge is a rate-limited production deploy; Omar and the team decide when it merges, batched with other work.
- **`handoff/role-3-map.md`**, rewritten with the `handoff/README.md` template, on the PR branch:
  - **Last updated** line with date, time and "by Omar's Claude".
  - **Status:** fix the stale "#81 not merged" line; say Omar now owns the whole frontend UI for this remake (by Marco's handoff), what is on the branch, what was verified.
  - **In progress.**
  - **Needs from others:**
    - `→ Role 1 (Adrian)`: optional firm name on `getBlastRadius` (the map still cannot say "Northpass Capital"; don't parse it out of `me.name`); no field marks cred-002's asset as a credential; any mismatch between §4.3 / §4.4 and live data; the nice-to-haves listed in §4.6 if still wanted.
    - `→ Role 2 (Marco)`: update `docs/demo-script.md` and `docs/video-shot-list.md` (beats 1-8, shots 5 and 6, the map's new look, any renamed labels, the presenter dock); the `src/` handover line in `role-2-frontend.md` is a precondition (§0.1), not a follow-up; optionally widen the vitest include to `src/**/*.test.ts`; `?map=grid` is still the stage fallback.
    - `→ Role 4 (Omar, separate PR)`: the `convex/ai.ts` changes (asks #4 and #6): append `item.pathSummary` and then `item.whatToCheck` (each when non-null) to the canned alert, and use `context.technique` in the vendor letter.
  - **Decisions & gotchas:** SVG vs ECharts and why; the vendor-centred story map **replaces** the parent-firm tree Omar asked for in #81; zoom kept or dropped; Armadin validated-edge choice; step rules; every hold badged; token migration (brand import, aliases, what changed visually); layout direction chosen and why; presenter dock behaviour; anything deliberately not done.
- **Final reply in chat:** PR URL and branch; files touched; dependency decision; verification results (each command and exit status, screenshot paths); differences between this prompt and live data; open asks to other roles; what you chose not to do and why.
