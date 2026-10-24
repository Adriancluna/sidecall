# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Sidecall is a dashboard for a PE firm and its portfolio companies. Primary users:
- **AP clerk** at a portfolio company (Jamie Chen, Summit Home Health): requests payments; cannot release their own.
- **Controller** at a portfolio company (Rosa Alvarez): verifies by phone with the number on file, then releases or rejects held payments.
- **PE firm partner** (Jordan Ames): sees the portfolio-wide blast radius, evidence, holds, vendor letter, containment. Sees holds but never releases.

Also present: **IT / security contact** at a portfolio company (Kwame Mensah), who acknowledges tailored alerts.

**Demo context:** all people and companies are simulated. The product is shown to Cal Hacks 13.0 judges in a live, projected demo under 3 minutes with roles switched on stage (`docs/demo-script.md`), plus a recorded video and Devpost, so screens must also read from the back of a room.

## Product Purpose

Companies owned by one PE firm quietly share vendors (IT contractors, payroll, login systems). When one company or a shared vendor is compromised, Sidecall works out which siblings *genuinely* share the compromised thing, warns each at the right urgency, shows the firm a live blast-radius map, drafts one coordinated vendor letter, and holds pending payments to a compromised vendor until a different person verifies by phone.

Success: a user understands a held payment (why it's held, what changed, who must act) and acts fast.

Seat it fills (Hyphenate track): AP payment controls across a private equity portfolio.

## Positioning

Same vendor is not the same weakness. Exposure is decided by link `shareType` (shared credential vs. `same_vendor_only` vs. DNS-inferred candidate), so Sidecall alerts only companies genuinely exposed and stays quiet otherwise. Payments are held for a person to verify, never cancelled or blocked. The firm sees; the company executes.

## Operating Context

- Demo runs at `https://sidecall.vercel.app/?stage`: Presenter panel with one-click "Sign in as" per beat, Reset, scenario picker, Fire incident / Replay webhook.
- Two browser tabs side by side for the acknowledge race (sessionStorage sign-in per tab).
- Convex dashboard may be shown on screen.
- Controller workflow: call the vendor at the number on file (never one from a recent email), write a call note, then release or reject. Audit log and controls-log CSV export for the auditor.
- Notifications outbox (Slack / Discord / webhook) is simulated on stage.

## Capabilities and Constraints

- Stack: React + Vite + TypeScript + Tailwind v4, Convex (DB, functions, live queries, HTTP, auth), Vercel. No new npm packages without telling the team.
- Two top-level views: **company view** (alerts, held payments, bills to pay, ledger, notifications, timeline, controls log) and **PE firm view** (headline, blast-radius map + evidence, tailored alerts, all held payments, vendor letter, containment, controls log, Proof panel).
- Folder ownership is strict (`CLAUDE.md`): Role 2 (frontend) owns `src/App.tsx`, `src/main.tsx`, `src/layout/`, `src/panels/`, `src/demo/`, `src/auth/`, styles, `docs/`. `src/map/` is Role 3. `brand/` is read-only.
- Every merge to `main` is a rate-limited production deploy; batch changes. Feature freeze ~6 hours before deadline.
- Terminology: "held until verified", "candidate" / "reachability" for DNS-inferred links (never "validated"), urgent / advisory / clear / info statuses.
- Rules the UI must keep: company views, alerts and hold notices never name the reporting company (only the PE view does); AI only writes text, never decides exposure, urgency or holds; all demo AI output is pre-generated.
- Lifespan: hackathon only (Cal Hacks 13.0).

## Brand Commitments

- Brand lives in `brand/`; read `brand/README.md` and `brand/GUIDELINES.md` before UI work. Tokens in `brand/tokens.css`; logo SVGs in `brand/logo/` (never retype the name as a logo); ignore `brand/concepts/`.
- Dark-first: graphite background, paper text, Signal Amber `#F5A524` as brand and advisory colour. No navy or electric blue, no gradients, glows or neon. Amber text never on white/paper.
- Font: Manrope (headings 600, body 400, labels 500).
- The mark: four sibling tiles around an empty centre, the company that was hit, never drawn. Company tiles echo it; the hit company stays an empty or neutral slot in company-facing views.
- Feel: calm, precise, fast, trustworthy. A warning system, not a weapon or wall. No shield, padlock, keyhole, chain-link, radar, siren/bell, warning-triangle, eye, brain or sparkle icons.
- Voice: say what's exposed and what to do ("Shared payroll login exposed. Rotate the credential."). No alarm language ("ATTACK!", "BREACH DETECTED").
- Never say (UI, pitch, Devpost, prompts): "we stop fraud", "we block payments", "validated" for inferred links, unmeasured accuracy %, "We integrate with Armadin", the full list in `CLAUDE.md`.

## Evidence on Hand

- Scorecard against our own planted answer key: 18 cases, 0 missed, 0 false holds (`data/scorecard.json`). It is our planted cases, not a benchmark.
- Real DNS-based vendor detection on real public domains (`data/dns_findings.json`), shown as candidates.
- Real Convex guarantees demonstrable live: atomic fan-out, idempotent `/incident` replay, race-safe acknowledge, timeline with real timestamps.
- Background facts approved for copy: `CLAUDE.md` "Background facts".
- Simulated: the portfolio, companies, people, bills, payments, amounts, incidents, bank changes. Never present them as real customers.
- Absent, do not fabricate: testimonials, customers, pilots, pricing, any public case of one shared vendor hitting several companies of one PE firm.

## Product Principles

1. **Discipline over noise.** Not alerting a company with a separate credential is a feature; the UI shows why someone was left alone.
2. **Hold, don't block.** Money waits for a person to verify; every hold, flag, refusal and release is on the record.
3. **Never reveal who was hit** outside the PE firm view.
4. **Honest about what's real.** Inferred links are candidates; simulated data is labelled; numbers on screen match the backend.
5. **Understand, then act.** A held payment shows why it's held and the next action at a glance.

## Accessibility & Inclusion

WCAG 2.2 AA: text contrast (watch amber on light surfaces), keyboard operation, visible focus, labelled controls. Status never conveyed by colour alone (urgent / advisory / clear also carry text). Layouts work at 375 px with no horizontal page scroll.
