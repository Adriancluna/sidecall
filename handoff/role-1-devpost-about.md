# Devpost "About the project" draft (Role 1 → Marco)

Written Oct 24 by Adrian's Claude, modelled on 11 winning Cal Hacks Devposts (2023–2025: FaceTimeOS, Duet, GhostWriter, Nexus, Krates, Haven, Guardian, Mantis, …): default headings, named person → statistic → "That's why we built", bold capability bullets, tools tied to their job, hard numbers, problem→fix challenges, honest real-vs-simulated. ~1,000 words. Marco: paste into Devpost's About field and/or merge into `docs/devpost.md` (your file). **No screenshots yet** (Adrian: UI still changing).

---

## Inspiration

In December 2021, a ransomware attack took down Kronos, the payroll system behind roughly 8 million workers. Larry Kroeck, a cafeteria worker at Allegheny General Hospital, lost about 54 hours of pay and was told nothing could be done, because about 2,000 other employers had the same problem. Kronos's parent company was half-owned by a private equity firm.

That pattern is everywhere. Private equity owns companies that employ about 1 in 12 American workers, and the companies under one owner quietly share the same payroll providers, IT contractors and logins. **48% of breaches now involve a third party** (Verizon 2026). Vendors take a **median 73 days** to tell their customers; attackers can move laterally in **about 29 minutes**. When one shared vendor falls (Kaseya, Miljödata, Salesloft Drift), its sister companies find out last, if at all.

That's why we built **Sidecall**: when one vendor or login is compromised, it works out which sister companies genuinely share it, tells each one exactly what to do, and holds the money until a person verifies.

## What it does

- **Finds who genuinely shares it.** Same vendor isn't the same weakness. A shared login is urgent; merely being a customer is advisory, and only when the vendor itself fell. A company with its own separate login isn't alerted at all.
- **Holds the money.** Summit Home Health was about to pay **$480,000** to an account changed by email two days before the breach (`••2208 → ••7731`). Sidecall holds it, never cancels it. The clerk who requested it can't release it; a controller calls the number on file, records what the vendor confirmed, then releases or rejects. Cash in the double-entry ledger moves only then.
- **Carries a red-team finding one step ahead.** Autonomous red teams like Armadin prove a path inside one company and, by design and by law, stop at its boundary. Sidecall takes that last validated hop (say, a shared admin login) and tells each sister company that shares it: *reachable here, not tested here*, plus exactly **what to check**. It never touches their systems.
- **Runs each company's own pre-approved steps.** Each company decides in advance, per step: *Notify only*, *One click*, or *Pre-approved*. With "pause the shared login" pre-approved, Cedar Ridge's login is paused **0.1 seconds** after the report, logged, one click to undo.
- **Shows the PE firm the whole picture, and only the firm.** "3 companies exposed · 4,200 people · $612,000 held", who has acknowledged, and how far each company's first steps got. Companies never learn who was hit. One letter to the vendor replaces eight escalations.

## How we built it

- **Convex is the backbone.** `POST /incident` writes the incident, every exposure, every payment hold, bank-change flag, pre-approved step and alert **in one transaction**, so every dashboard sees the same snapshot, live, with no polling.
  - **Idempotent:** a replayed webhook writes nothing new.
  - **Race-safe:** two people clicking Acknowledge at once produce exactly one winner.
  - **Scales:** in our test suite, one report reached **303 companies and held 304 payments in a single transaction in about 1.4 s**.
  - **Also on Convex:** the scheduler, crons, HTTP actions and Convex Auth.
- **Controls live inside the mutations, not the UI.** These checks run in the backend, and refusals go into the audit log too:
  - requester ≠ approver
  - controller-only release
  - verification notes that must describe the call
  - two people to raise a step to Pre-approved
  - at most 3 companies running automatic steps from one report
- **Claude (Opus 5.5) writes; it never decides.** It writes the company alerts, hold notices and the vendor letter, pre-generated and checked against our copy rules: never name who was hit, never call a payment fraud, only the number on file. Exposure, urgency and holds come from deterministic rules.
- **Front end:** React, Vite, TypeScript and Tailwind on Vercel; each person lands on the one thing they must do first. AI assistants connect over MCP, audited as agents, with no release tool.

## Challenges we ran into

- **The asymmetry.** A company with its own login shouldn't be alerted when a *shared* login leaks, but should be when the vendor itself is breached. We encoded it as link types (shared credential, shared admin access, same vendor only) and show the non-alert on screen as discipline, not a miss.
- **Never revealing who was hit.** Every company-facing query, alert, hold notice and Slack message drops the reporting company; only the firm's view keeps it. Tests check it.
- **Acting without overreaching.** A finance professional told us: "If you only warn, you just create more calls." Auto-acting can cause its own outage, though, which the Change Healthcare advisories showed. Our fix:
  - The company pre-approves only reversible steps.
  - DNS guesses never trigger anything.
  - Payroll logins and vendor admin accounts stop at one click.
  - Every step is logged with who allowed it.

## Accomplishments that we're proud of

- **0 missed, 0 false holds** across 18 cases we planted with a known answer. Those include an honest bank change verified by phone five months ago, which a cruder rule would have flagged. These are our own planted cases, not a benchmark.
- **The $480K moment works end to end on the live site:** held, the requester refused, the controller verifies, cash moves exactly once.
- To our knowledge, nobody else carries a validated red-team finding to the sister companies that share the compromised access without touching their systems.
- **95 app and backend tests plus 40 for the AI text rules and scorecard,** and a rehearsal script that plays every demo beat against a live deployment and checks each number.
- **We checked the premise on real data:** public DNS of 26 companies in one real PE portfolio shows 9 on the same device-management vendor and 3 each on the same password-manager and login vendors (totals only, no company named).

## What we learned

Holding beats blocking. A control that pauses money, or a login, for a person to verify, with a record of who decided and why, is one a finance or IT team can actually live with. The firm should see everything; the company decides.

## What's next

- **Real identity-provider connectors** (Okta, Microsoft Entra, Google Workspace) behind the pre-approved steps, which are simulated today.
- **Breach-notice intake:** paste a vendor's breach email, and Claude turns it into a structured incident for a person to confirm.
- **Vendor masters pulled straight from AP systems** instead of CSV exports.
- **A pilot** with one mid-market PE firm's portfolio operations team.

**What's real vs. simulated:**
- **Simulated:** the portfolio, payments and incidents, plus the identity-provider calls.
- **Real:** the Convex backend, the exposure, hold and playbook logic, the AI writing, the scorecard, and DNS-based vendor detection on real public domains.
