# Devpost: Sidecall

Owner: Role 2. Paste-ready for the Devpost "Project details" step. Each block below maps to one form field. Rewritten Oct 25 against main `0e016d9` (#139), merging Role 1's draft in `handoff/role-1-devpost-about.md`. Test counts were run on that commit. Keep the wording and the caveats; check CLAUDE.md "Never say" before editing.

---

## Field: About the project

Paste everything between the two lines below into "About the project" (Markdown).

---

## Inspiration

In December 2021, a ransomware attack took down Kronos, the payroll system behind roughly 8 million workers. Larry Kroeck, a cafeteria worker at Allegheny General Hospital, lost about 54 hours of pay and was told nothing could be done, because about 2,000 other employers had the same problem.

That pattern is everywhere. Private equity owns companies that employ about 1 in 12 American workers (the industry's own count), and the companies under one owner quietly share the same payroll providers, IT contractors and logins. **48% of breaches now involve a third party** (Verizon 2026). Vendors take a **median 73 days** to tell their customers, while attackers can move laterally in **about 29 minutes**. When one shared vendor falls (Kaseya, Miljödata, Salesloft Drift), the sister companies find out last, if at all.

That's why we built **Sidecall**: when one vendor or login is compromised, it works out which sister companies genuinely share it, tells each one what to do, and holds the money until a person verifies.

## What it does

- **Finds who genuinely shares it.** Same vendor isn't the same weakness. A shared login or shared admin access is urgent. Merely being a customer is advisory, and only when the vendor itself fell. A company with its own separate login isn't alerted at all.
- **Holds the money.** Summit Home Health was about to pay **$480,000** to an account changed by email two days before the breach (`••2208 → ••7731`). Sidecall holds it, never cancels it.
- **Makes a different person verify.** The clerk who requested the payment is refused. A controller calls the vendor at the number on file, types the account ending the vendor confirmed, ticks that the call was made and writes what was said. If the confirmed account doesn't match the payment, release stays locked. After a reject, the controller can prepare a corrected payment to the confirmed account, and the clerk requests it separately, so the bill still gets paid.
- **Runs each company's own pre-approved steps.** Each company decides in advance, per step: *Notify only*, *One click*, or *Pre-approved*. With "pause the shared login" pre-approved, Cedar Ridge's shared vendor login is paused within seconds of the report, with one-click Undo. In our demo that pause suspends a real, disposable Okta test account through a signed receiver the company runs, so Sidecall never holds the company's admin keys.
- **Carries a red-team finding one step ahead.** An AI red team like Armadin proves an attack path inside one company and has to stop at its boundary. Sidecall takes the last proven step (say, a shared admin login) and tells each sister company that shares it: *reachable here, not tested here*, plus what to check. It never tests or touches their systems.
- **Shows the PE firm the whole picture, and only the firm.** A live blast-radius map, "3 companies exposed · 4,200 people · $612,000 held", who has acknowledged, and how far each company's first steps got. Companies never learn who was hit. One letter to the vendor replaces separate escalations.
- **Doesn't overreact to unconfirmed reports.** A signed but unconfirmed report warns the linked companies immediately; payment holds and automatic steps wait for confirmation.

**Also built:** onboarding a new acquisition from a plain AP export (its payments to a breached vendor are held on import), Slack, Discord and webhook notifications, escalation before a held payment's due date, a CSV controls log, and bounded purchasing for AI assistants. A controller pre-approves specific bills, payee and budget. Claude can read an approved invoice and request payment through scoped MCP tools. Convex checks every rule before anything settles in the simulated ledger. The assistant has no tool to approve purchases or release held money.

## How we built it

- **Convex is the backbone.** `POST /incident` writes the incident, every exposure, every payment hold, bank-change flag, pre-approved step and alert **in one transaction**, so every dashboard sees the same snapshot, live, with no polling.
  - **Idempotent:** a replayed report writes nothing new.
  - **Race-safe:** two people clicking Acknowledge at once produce exactly one winner.
  - **Scales:** in our test suite, one report reached **303 companies and held 304 payments in a single transaction in about 1.4 s**.
  - **Also on Convex:** the scheduler, crons, HTTP actions, Convex Auth and the official rate-limiter component for report intake.
- **Controls live inside the mutations, not the UI.** These checks run in the backend, and refusals go into the audit log too:
  - requester ≠ approver, controller-only release;
  - confirmed account must match the payment, plus a call note;
  - two people to raise a step to Pre-approved;
  - at most 3 companies running automatic steps from one report;
  - only confirmed links act; DNS guesses never trigger anything.
- **Claude (Opus 5.5) writes; rules decide.** Claude writes the company alerts, hold notices and the vendor letter, pre-generated and checked against our copy rules: never name who was hit, never call a payment fraud, only the number on file. Exposure, urgency and holds come from deterministic rules.
- **Front end:** React, Vite, TypeScript and Tailwind on Vercel. Each person lands on the one thing they must do first.

## Challenges we ran into

- **The asymmetry.** A company with its own login shouldn't be alerted when a *shared* login leaks, but should be when the vendor itself is breached. We encoded it as link types (shared credential, shared admin access, same vendor only) and show the non-alert on screen as discipline, not a miss.
- **Never revealing who was hit.** Every company-facing query, alert, hold notice and Slack message drops the reporting company; only the firm's view keeps it. Tests check it.
- **Acting without overreaching.** A finance professional told us: "If you only warn, you just create more calls." But acting automatically can cause its own outage. Our answer: each company pre-approves only reversible steps, payroll logins stop at one click, automatic steps are capped per report, and every step is logged with who allowed it.

## Accomplishments that we're proud of

- **The $480K moment works end to end on the live site:** held, the requester refused, the wrong account locked out, and cash moving only after a controller verifies.
- **0 missed, 0 false holds** across 18 cases we planted with a known answer, including an honest bank change verified by phone five months ago that a cruder rule would have flagged. These are our own planted cases, not a benchmark.
- **A real Okta account paused** by a company's own pre-approved rule, seconds after the report, and restored with one click.
- **296 app and backend tests, 70 for the AI text rules, scorecard and assistant, and 29 for the Okta receiver,** plus a rehearsal script that plays every demo beat against a live deployment and checks each number.
- **We checked the premise on real data:** public DNS of 26 companies in one real PE portfolio shows 9 on the same device-management vendor and 3 each on the same password-manager and login vendors (totals only, no company named).

## What we learned

Holding beats blocking. A control that pauses money, or a login, for a person to verify, with a record of who decided and why, is one a finance or IT team can actually live with. The firm should see everything; the company decides.

## What's next

- **More identity providers** (Microsoft Entra, Google Workspace) behind the same signed receiver as Okta.
- **Breach-notice intake:** paste a vendor's breach email, and Claude turns it into a structured incident for a person to confirm.
- **Vendor masters pulled straight from AP systems** instead of CSV exports.
- **Stop-loss advice:** recommending which steps each company should pre-approve before an incident (built, not yet in the product).
- **A pilot** with one mid-market PE firm's portfolio operations team.

## What's real, what's simulated

- **Simulated:** the portfolio, companies, people, bills, payments, amounts, incidents and bank-detail changes; the ledger; the phone calls (role-played); Slack messages on stage.
- **Real:** the Convex backend and its guarantees, the exposure, hold and playbook logic, the AI writing, the scorecard, DNS-based vendor detection on real public domains, and the Okta pause on a disposable test account.

---

## Field: Built with

Convex, Convex Auth, React, Vite, TypeScript, Tailwind CSS, Vercel, Claude, Anthropic API, Model Context Protocol, Okta, Node.js, Vitest, AntV G6

## Field: "Try it out" links

- https://sidecall.vercel.app
- https://github.com/Adriancluna/sidecall

Access: the site asks for a demo password first. Put it where judges see it: in "Additional info" if that step has a field for judges, otherwise as the last line of "About the project". Then sign in as anyone from the "Sign in as" list (demo password `sidecall-demo`).

## Field: Video demo link

YouTube or Vimeo URL of the final recording (Loom isn't accepted here; upload the Loom export to YouTube as unlisted).
