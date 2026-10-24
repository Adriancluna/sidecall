# Devpost draft: Sidecall

Owner: Role 2. Draft; lines marked **[after 11pm]** wait for Role 3. Every figure below comes from CLAUDE.md "Background facts"; keep the wording and the caveats.

## Tagline

When one vendor gets breached, Sidecall finds every sister company that genuinely shares it, warns each at the right urgency, and holds the money until a person verifies.

**Seat it fills (Hyphenate):** AP payment controls across a private equity portfolio.

## Inspiration

Private equity firms own companies that quietly share the same payroll providers, IT contractors and login systems. When one of those vendors is compromised, every sister company is exposed, and nobody connects the dots. Shared-vendor failures cascade: Kaseya in 2021 reached up to 1,500 downstream victims through about 60 providers; in August 2025 one Swedish HR and payroll supplier (Miljödata) took systems down at 200+ municipalities that were never breached themselves; CDK Global in 2024 hit about 15,000 dealerships for about three weeks.

48% of breaches involve a third party (Verizon 2026). Vendors take a median 73 days to disclose, while attackers can move laterally in about 29 minutes. Only 12% of smaller PE firms have a formal security requirement for their portfolio companies (55% of the largest do). And in March 2026 a federal judge let a breach suit proceed against Bain Capital itself, citing its control over the portfolio company's vendors and IT staffing. PE firms now carry exposure for cross-portfolio decisions, and a record that they knew and acted matters.

## What it does

1. **An incident comes in** (one webhook call, e.g. an offensive-security finding): "Brightline Payroll is compromised."
2. **Sidecall works out who genuinely shares the compromised thing.** Same vendor isn't the same weakness: a shared credential or shared admin access is urgent; merely using the same vendor is advisory, and only when the vendor itself is what fell. A company with its own separate login isn't alerted at all.
3. **It holds the money.** Every pending payment to the breached vendor, at companies that opted in, is **held** (never cancelled). Payments going to bank details changed within 30 days of the incident are flagged, showing the last account confirmed by phone against the new one.
4. **A different person must verify.** The clerk who requested a payment can't release it. A controller at that company calls the number on file, records what the vendor confirmed, and releases or rejects. Notes that don't describe the call are refused. Cash in the double-entry ledger moves only on release.
5. **Everyone sees their part, and only their part.** Each company gets an alert written for its exposure and never learns who reported the incident. The PE firm sees the whole blast radius ("3 companies exposed · 4,200 people behind them · $612K in payments held") but never presses release: the company executes.
6. **One letter to the vendor** replaces eight separate escalations.
7. **It knows when to ask.** A held payment that nobody has decided as its due date gets close is escalated to the company's controllers, with an alert and an audit row.
8. **New companies onboard from their own AP export.** The firm uploads the vendor master and open bills any AP system exports; Sidecall matches the vendors, warns when a file pays an account other than the one confirmed by phone, and, mid-incident, holds the new company's payments on import.
9. **AI assistants are held like everyone else.** An agent connected over MCP can look up holds and request payments for a clerk, is recorded as an agent in the audit log, and has no way to release.
10. **Everything is on the record:** a controls log of every hold, flag, refusal, release and rejection, exportable as CSV.

## How we built it

- **Convex** for the database, server functions, live queries, HTTP endpoint, scheduling and auth. React + Vite + TypeScript, deployed on Vercel (every merge to `main` deploys the backend and the frontend together).
- **One webhook, one transaction:** `POST /incident` writes the incident, every exposure, every payment hold and bank-change flag, and the pending alerts atomically, then schedules the AI writer once per incident. Every browser sees the same snapshot, live, without polling.
- **Idempotent:** replaying the same webhook (deduped on `externalId`) writes nothing new and holds nothing twice.
- **Measured, on screen:** an incident timeline built from real timestamps shows the payments held in the same transaction as the report and alerts written within a few hundred milliseconds (about 200 ms in our dev run).
- **Scales in one transaction:** in our test suite, one report fanned out to 303 companies and held 304 payments in a single atomic transaction in about 1.4 s on Convex. The demo shows 8.
- **Race-safe:** two people acknowledging the same alert at once: Convex serializes the transactions and exactly one wins; the UI shows who.
- **Controls inside the mutation, not the UI:** segregation of duties, controller-only, held-status and verification-note checks all run in `releasePayment` / `rejectPayment`, and refusals are written to the audit log too.
- **Identity from the session:** Convex Auth (password, invite-only); every query is scoped to the signed-in person, so Company A can't read Company B's data. Unsigned webhook calls are refused except the built-in demo scenarios.
- **The AI only writes:** company alerts, hold notices and the vendor letter. Exposure, urgency and holds are decided by queries and scoring, never by the model. Demo output is pre-generated, so nothing on stage depends on a model call. Texts come from Claude (Opus 5.5), checked against our copy rules before they're saved (no reporter named, no "fraud", only the phone number on file).
- Tests with `convex-test` cover the guarantees: replay writes nothing, the headline totals, flagging, same-vendor-not-exposed, the acknowledge race, refusals logged, release moves cash once, every ledger entry balances, and scoping.

## What's real, what's simulated

- **Simulated:** the portfolio, companies, users, bills, payments, amounts, incidents and bank-detail changes.
- **Real:** the Convex backend and its guarantees (atomic fan-out, same snapshot, idempotency, race safety), the exposure and hold logic, the AI writing, the scorecard against the planted answer key, and DNS-based vendor detection on real public domains.

## Proof: the scorecard

The seed plants cases with a known answer (`data/answer_key.json`): payments that should be held and flagged, payments that should be held without a flag, and honest cases that must be left alone (a bank change verified by phone five months ago, a company that hasn't opted in, a payment already made). Nothing in the backend reads the answer key; a separate script compares what the system did against it.

Measured on a fresh seed across all three demo scenarios (`data/scorecard.json`, Oct 24):

| Scenario | Caught | Missed | False holds | Correctly left alone |
|---|---|---|---|---|
| Brightline payroll breach | 6 | 0 | 0 | 4 |
| Ironclad shared login leaked | 0 | 0 | 0 | 3 |
| Ironclad MSP compromised | 4 | 0 | 0 | 1 |

18 planted cases: every expected hold and flag caught, no false holds, and every honest case (a phone-verified bank change, a company that hasn't opted in, an already-paid bill) left alone. These are our own planted cases, not a benchmark.

## Challenges we ran into

- **The asymmetry.** "Same vendor" should not trigger alerts when a credential leaks (a separate login isn't exposed), but it should when the vendor itself is compromised. Getting that rule right, and showing it on screen as discipline rather than a miss, was the hardest design call.
- **Never revealing who was hit.** Every company-facing query, alert and hold notice had to drop the reporting company, while the PE firm view keeps it.
- **Identity during a live demo.** We moved from a demo user switcher to real sign-in with per-tab sessions, so the presenter can show the clerk being refused and the controller deciding side by side.

## What we learned

Holding beats blocking as a default: a control that pauses money for a person to verify, with a record of who decided and why, is one a finance team can actually live with. A control that cancels payments on a model's say-so is not.

## What's next

- Ingest real offensive-security findings as incidents (signed webhook already in place).

## Built with

Convex · Convex Auth · React · Vite · TypeScript · Tailwind CSS · Vercel · Claude (Anthropic) · MCP
