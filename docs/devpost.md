# Devpost: Sidecall

Owner: Role 2. Paste-ready: each `##` heading below is a Devpost field. Every figure comes from CLAUDE.md "Background facts", `data/scorecard.json` or our own test suite; keep the wording and the caveats. Before submitting, re-check the one line marked **[map]**, which depends on Omar's map landing.

## Elevator pitch

When one vendor gets breached, Sidecall finds every sister company that genuinely shares it, warns each at the right urgency, and holds the money until a person verifies.

**Seat it fills (Hyphenate):** AP payment controls across a private equity portfolio.

## Try it

- **Live:** https://sidecall.vercel.app (add `?stage` for the presenter panel and demo buttons).
- **Sign in:** pick anyone from the "Sign in as" list; the demo password for every seeded person is `sidecall-demo`. Start as **Jamie Chen** (AP clerk, Summit Home Health) and press **Fire incident**.
- Everything you see is a simulated portfolio on a real backend. **Reset** puts it back to a clean slate.

## Inspiration

Private equity firms own companies that quietly share the same payroll providers, IT contractors and login systems. When one of those vendors is compromised, every sister company is exposed, and nobody connects the dots.

Shared-vendor failures cascade:
- Kaseya in 2021 reached up to 1,500 downstream victims through about 60 providers.
- In August 2025 one Swedish HR and payroll supplier (Miljödata) took systems down at 200+ municipalities that were never breached themselves.
- CDK Global in 2024 hit about 15,000 dealerships for about three weeks.

48% of breaches involve a third party (Verizon 2026). Vendors take a median 73 days to disclose, while attackers can move laterally in about 29 minutes. Only 12% of smaller PE firms have a formal security requirement for their portfolio companies (55% of the largest do).

And in March 2026 a federal judge let a breach suit proceed against Bain Capital itself, citing its control over the portfolio company's vendors and IT staffing. PE firms now carry exposure for cross-portfolio decisions, and a record that they knew and acted matters.

## What it does

1. **An incident comes in** (one signed webhook call): "Brightline Payroll is compromised."
2. **Sidecall works out who genuinely shares the compromised thing.** Same vendor isn't the same weakness. A shared credential or shared admin access is urgent. Merely using the same vendor is advisory, and only when the vendor itself is what fell. A company with its own separate login isn't alerted at all.
3. **It holds the money.** Every pending payment to the breached vendor, at companies that opted in, is **held**, never cancelled. Payments going to bank details changed within 30 days of the incident are flagged, showing the last account confirmed by phone next to the new one (`••2208 → ••7731`).
4. **A different person must verify.** The clerk who requested a payment can't release it. A controller at that company calls the number on file, records what the vendor confirmed, and releases or rejects. Notes that don't describe the call are refused. Cash in the double-entry ledger moves only on release.
5. **Everyone sees their part, and only their part.** Each company gets an alert written for its own exposure and never learns who reported the incident. The PE firm sees the whole blast radius ("3 companies exposed · 4,200 people behind them · $612K in payments held") but never presses release: the company executes.
6. **One letter to the vendor** replaces eight separate escalations.
7. **It knows when to ask.** A held payment that nobody has decided as its due date gets close is escalated to that company's controllers, with an alert and an audit row.
8. **The warning reaches people where they work.** The same alerts, holds and escalations go to each company's Slack, Discord or webhook channel, and the firm's channel gets the headline. In the demo they're recorded as simulated, so nothing on stage depends on Wi-Fi.
9. **New companies onboard from their own AP export.** The firm uploads the vendor master and open bills any AP system exports. Sidecall matches the vendors, warns when a file pays an account other than the one confirmed by phone, and, mid-incident, holds the new company's payments on import.
10. **AI assistants are held like everyone else.** An agent connected over MCP can look up holds and request payments for a clerk. It is recorded as an agent in the audit log and has no way to release.
11. **The firm closes it out.** Marking an incident contained records what was fixed and how it was confirmed, and new payments to that vendor stop being held. Payments already held stay held until someone verifies.
12. **Everything is on the record:** a controls log of every hold, flag, refusal, release and rejection, exportable as CSV.

## How we built it

- **Convex** for the database, server functions, live queries, HTTP endpoints, scheduling and auth. React + Vite + TypeScript + Tailwind, deployed on Vercel; every merge to `main` deploys the backend and the frontend together.
- **One webhook, one transaction:** `POST /incident` writes the incident, every exposure, every payment hold and bank-change flag, and the pending alerts atomically, then schedules the AI writer once per incident. Every browser sees the same snapshot, live, without polling.
- **Idempotent:** replaying the same webhook (deduped on `externalId`) writes nothing new and holds nothing twice.
- **Measured, on screen:** an incident timeline built from real timestamps shows the payments held in the same transaction as the report, and alerts written within a few hundred milliseconds (about 200 ms in our runs).
- **Scales in one transaction:** in our test suite, one report fanned out to 303 companies and held 304 payments in a single atomic transaction in about 1.4 s on Convex. The demo shows 8.
- **Race-safe:** when two people acknowledge the same alert at once, Convex serializes the transactions, exactly one wins, and the UI shows who.
- **Controls inside the mutation, not the UI:** segregation of duties, controller-only, held-status and verification-note checks all run in `releasePayment` / `rejectPayment`, and refusals are written to the audit log too.
- **Identity from the session:** Convex Auth (password, invite-only). Every query is scoped to the signed-in person, so Company A can't read Company B's data. Unsigned webhook calls are refused, except the built-in demo scenarios.
- **The AI only writes:** company alerts, hold notices and the vendor letter. Exposure, urgency and holds are decided by queries and scoring, never by the model. The texts come from Claude (Opus 5.5), pre-generated so nothing on stage depends on a model call, and checked against our copy rules before they're saved: the reporter is never named, no payment is called fraud, and the only phone number is the one on file.
- **Notifications:** one outbox row per channel and event, deduped, written in the same transaction as the alert or hold. One dispatch action sends them (5 s timeout, one retry, never throws), and only when the deployment allows live sending.
- **MCP:** a `/mcp` endpoint with a bearer token per agent and four tools (`list_held_payments`, `explain_hold`, `list_bills`, `request_payment`). Every call is audited, and a test checks that a release tool doesn't exist.
- **Tested:** 45 `convex-test` tests cover the guarantees: replay writes nothing, the headline totals, flagging, same-vendor-not-exposed, the acknowledge race, refusals logged, release moves cash once, every ledger entry balances, scoping, notifications and MCP. A rehearsal script plays every demo beat against a deployment with real sign-ins and checks each number.

## What's real, what's simulated

- **Simulated:** the portfolio, companies, users, bills, payments, amounts, incidents and bank-detail changes.
- **Real:** the Convex backend and its guarantees (atomic fan-out, same snapshot, idempotency, race safety), the exposure and hold logic, the AI writing, the scorecard against the planted answer key, and DNS-based vendor detection on real public domains.

## Proof: the scorecard

The seed plants cases with a known answer (`data/answer_key.json`):
- payments that should be held and flagged;
- payments that should be held without a flag;
- honest cases that must be left alone: a bank change verified by phone five months ago, a company that hasn't opted in, a payment already made.

Nothing in the backend reads the answer key; a separate script compares what the system did against it.

Measured on a fresh seed across all three demo scenarios (`data/scorecard.json`, Oct 24):

| Scenario | Caught | Missed | False holds | Correctly left alone |
|---|---|---|---|---|
| Brightline payroll breach | 6 | 0 | 0 | 4 |
| Ironclad shared login leaked | 0 | 0 | 0 | 3 |
| Ironclad MSP compromised | 4 | 0 | 0 | 1 |

18 planted cases: every expected hold and flag caught, no false holds, and every honest case left alone. These are our own planted cases, not a benchmark.

## Challenges we ran into

- **The asymmetry.** "Same vendor" should not trigger an alert when a shared credential leaks (a company with its own login isn't exposed), but it should when the vendor itself is compromised. Getting that rule right, and showing it on screen as discipline rather than a miss, was the hardest design call.
- **Never revealing who was hit.** Every company-facing query, alert, hold notice and Slack message had to drop the reporting company, while the PE firm's view keeps it.
- **Identity during a live demo.** We moved from a demo user switcher to real sign-in with per-tab sessions, so the presenter can show the clerk being refused and the controller deciding side by side.
- **Saying the right thing to the right person.** The same held payment means "call the vendor, then decide" to the controller, "a controller must release this" to the clerk who requested it, and "waiting on the company" to the firm. The backend enforces the rule; the screen had to word it for whoever is looking.

## Accomplishments that we're proud of

- The money moment works end to end on the live site: $480,000 held two days after an email changed the bank account, the clerk refused, the controller verifies by phone, and cash moves exactly once.
- One report, one transaction: holds, flags, alerts and notifications land together or not at all, and a replay changes nothing.
- A new acquisition can be onboarded mid-incident from a plain AP export, and its exposed payments are held on import.
- No false holds on our planted cases, including the honest bank change that a cruder rule would have flagged.

## What we learned

Holding beats blocking as a default. A control that pauses money for a person to verify, with a record of who decided and why, is one a finance team can actually live with. A control that cancels payments on a model's say-so is not.

## What's next

- Ingest real offensive-security findings as incidents (the signed webhook is already in place).
- Pull vendor masters and open bills straight from AP systems instead of CSV exports.
- Email as a notification channel, next to Slack, Discord and webhooks.
- **[map]** A live node graph of the blast radius for the firm view (in progress).

## Built with

Convex · Convex Auth · React · Vite · TypeScript · Tailwind CSS · Vercel · Claude (Anthropic) · Model Context Protocol (MCP)
