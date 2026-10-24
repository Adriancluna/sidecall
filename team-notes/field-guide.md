# Sidecall field guide

How to explain Sidecall so you can talk about it fluently. Plain English. Built from the code on `main`, `CONTRACT.md`, the specs in `docs/specs/` and the team's pitch research (Oct 24). The same content is also shared as a web page: https://claude.ai/artifact/88shx4RYGVeZS6qPrRVfQN

Contents:
1. The 60-second story
2. The problem, with numbers
3. Who uses it
4. One incident, start to finish
5. How each part works
6. The demo, beat by beat
7. Pitch by track
8. Hard questions
9. Edge cases
10. Words to use and avoid
11. Numbers cheat sheet
12. What's real, what isn't

---

## 1. The 60-second story
Learn this first. Every other section supports one of these lines.

1. **The setup.** A private equity firm owns many companies. Those companies quietly share the same payroll provider, IT contractor and logins.
2. **The problem.** When one shared vendor or login is compromised, the sister companies find out late or never. Vendors take a median 73 days to tell customers; attackers can move in about 29 minutes.
3. **What Sidecall does.** It receives the incident, works out which sister companies *genuinely* share the compromised thing, and tells each one exactly what to do, at the right urgency, without revealing who was hit.
4. **The money moment.** Summit Home Health was about to pay $480,000 to its payroll vendor, at a bank account changed by email two days before the breach. Sidecall holds it until a different person verifies by phone.
5. **One step ahead.** An AI red team like Armadin proves an attack path inside one company and must stop at its boundary. Sidecall carries that last proven step to every sister company that shares it: "reachable here, not tested", plus what to check.
6. **The company's own rules.** Each company decides in advance which first steps Sidecall may take for it. Cedar Ridge pre-approved pausing its shared login, so it was paused a tenth of a second after the report, with Undo.
7. **The firm sees, the company decides.** The PE firm gets the whole picture and a response tracker. The company makes the decisions. That matches where the law is heading.

> **Say it like this:** "When one vendor is breached, Sidecall finds every sister company that genuinely shares it, tells each one exactly what to do, and holds the money until a person verifies."
> Elevator pitch (36 characters): **Shared vendor hit? Warn the rest.**

---

## 2. The problem, with numbers
The research chain behind the pitch. Each link is a real event. Use the exact wording; some numbers have caveats.

1. **PE owns a big slice of working life.** About 13.3 million Americans work at PE-backed companies (the industry's own count; critics say about 12 million). That's roughly 1 in 12 workers.
2. **Companies under one owner share vendors.** Firms pool benefits and vendors across portfolios and inherit them through acquisitions. There's no public statistic for how often; never invent one.
3. **One shared vendor falls, everyone behind it falls.**
   - Kaseya (2021): about 60 IT providers led to up to 1,500 businesses hit.
   - Miljödata (Aug 2025): one Swedish HR and payroll supplier took systems down at 200+ municipalities that were never breached themselves.
   - Salesloft Drift (2025): stolen app tokens reached 700+ organizations in ten days.
   - CDK Global (2024): about 15,000 car dealerships down for about three weeks.
4. **It lands on one person.** Kronos (Dec 2021) disrupted payroll for about 8 million workers. Larry Kroeck, a cafeteria worker at Allegheny General, lost about 54 hours of pay and was told nothing could be done, because about 2,000 other employers had the same problem.
5. **Nobody warns the siblings.** 48% of breaches now involve a third party (Verizon 2026). Vendors take a median 73 days to tell customers; attackers can move laterally in about 29 minutes.
6. **The vendors were PE-owned too:** Kronos/UKG (Hellman & Friedman), Kaseya (Insight Partners), CDK (Brookfield), PowerSchool (Bain Capital).

**Why it matters for the pitch:** it turns an abstract "supply chain risk" into a person who didn't get paid, then shows the structural reason: shared vendors under one owner, and nobody whose job is to connect the dots.

**Don't say:**
- "Stolen credentials are the #1 way in." Not true any more: exploitation leads (31%). Say "the breach comes through someone you trust; shared access is how it crosses to the next company."
- Any statistic about how many MSPs share admin passwords ("73% of MSPs…"). The source appears invented.
- "Three weeks or never," "MSPs hide breaches."
- The 73 days vs 29 minutes as a ratio ("2,500 times faster"). Present it as a gap.
- Any public case of one vendor hitting several companies of one PE firm. None is public; don't invent one.

---

## 3. Who uses it
Four people, each with a different first screen. Know who you're "being" in each demo beat.

- **PE firm (Jordan Ames). The buyer.**
  - Watches the whole portfolio: who's exposed, how many people, how much money is held, who has acknowledged, and how far each company's first steps got.
  - Never releases money and never changes a company's rules.
- **IT lead (Sam Kowalski, Cedar Ridge).** Fixes the security side. First screen: one plain sentence saying what's wrong, the steps Sidecall already took or has ready, then numbered "Do this now" steps and an Acknowledge button.
- **Controller (Rosa Alvarez, Summit).** Decides held payments. Calls the vendor at the number on file, writes down what they confirmed, then releases or rejects.
- **AP clerk (Jamie Chen, Summit).** Requested the $480K payment. Sees it's held and why, and is refused if she tries to release her own request.

The vendor (e.g. Brightline) never logs in; it gets one letter. Ordinary employees never see Sidecall.

---

## 4. One incident, start to finish
Everything in steps 3–7 happens in **one database transaction**. That single fact is behind most of our Convex claims.

This is the confirmed-response workflow; an unconfirmed signed report instead notifies linked companies immediately without holding money or changing access.

1. An incident arrives (a signed webhook, or a red-team finding).
2. Seen this ID before? If yes, return the first incident and write nothing.
3. Find every company linked to the compromised thing.
4. Score each link: urgent, advisory, or not exposed.
5. Hold pending payments; flag recent bank changes.
6. Open exposures and sister-safe paths.
7. Plan each company's pre-approved steps; queue alerts, the vendor letter and Slack messages.
8. Scheduled once per incident: the AI writes the text, the steps run, the messages send.
9. Every dashboard updates live from the same snapshot.

> **Say it like this:** "One report, one transaction. The holds, the alerts and the steps land together or not at all, and every screen sees the same snapshot at the same instant."

---

## 5. How each part works
For each part: what it does, how, why it's there, the line to say, and what can go wrong.

### 5.1 Incident intake (`convex/http.ts`, `POST /incident`)
- **Policy:** warn immediately on signed unconfirmed reports; holds and pre-approved access steps wait for firm confirmation or an explicitly enrolled detector's confirmed report; the four built-in demo scenarios remain instant.
- **What:** the front door. A security tool, a vendor or the demo button reports "this vendor or login is compromised."
- **How:**
  - Real senders sign every request with a shared secret (HMAC). This authenticates the sender, not the truth of the report.
  - Each report has an ID; a second report with the same ID writes nothing.
  - Different IDs for the same active asset/class episode add evidence receipts without repeating holds or access changes. Correlation ends on containment or 30 days without a report.
  - The four demo scenarios can be sent unsigned, but only on the demo deployment, and on production only with the presenter key.
  - A report can carry a red-team finding in our own format: the technique, the proven steps, and the shared thing at the edge.
- **Why it matters:** idempotency (the replay beat) is a Convex judge favourite, and the signature answers "can anyone trigger this?"
- **Edge cases:**
  - Same report sent twice: the second is a no-op ("duplicate"), with no second hold.
  - Unknown vendor name: refused (404).
  - A finding from a company we don't know: refused, because "sister companies" are measured from the reporter.
  - A finding with any step not marked as proven: refused. This checks the sender's declared evidence; it does not independently re-run the red-team test.

### 5.2 The link map: who shares what (`links` table)
- **What:** the graph behind everything. Each row says "this company uses this vendor or account, in this way."
- **How:**
  - **Each link has a type:** shared login; shared admin access (the vendor can get into your systems); or same vendor only (you're a customer, nothing shared).
  - **Each link has a source:** reported by the company when it joined, or guessed from public DNS records (a "candidate").
  - Links also come from a company's AP export when it's onboarded.
- **Why it matters:** this is the answer to "same vendor isn't the same weakness," our hardest and most important design call.
- **Edge cases:**
  - A company has two links to the same vendor: the strongest counts.
  - DNS guesses only ever say "this company probably uses this vendor". They're shown as candidates and never trigger automatic steps.
  - Note: the DNS evidence on the demo companies comes from simulated records. The live scan of real domains is separate; see `handoff/role-1-data-inventory.md`.

### 5.3 Exposure rules: who is genuinely at risk (`convex/scoring.ts`)
- **What:** decides, for each linked company, whether it's exposed and how urgently.
- **How:** fixed rules, no AI.
  - Shared login: urgent.
  - Shared admin access: urgent.
  - Same vendor only: advisory, and only when the vendor itself was breached.
  - When a single *login* leaks, customers with their own separate login aren't alerted at all.
  - A pending payment to a recently changed bank account raises urgency.
- **Why it matters:** "discipline over noise." Not alerting Summit when only Ironclad's shared login leaked (Summit uses its own) is a feature, and security judges care about false positives.

> **Say it like this:** "We don't alert everyone who uses the vendor. Summit uses Ironclad with its own login, so when the shared login leaks, Summit hears nothing. When Ironclad itself is breached, every customer does."

### 5.4 Money controls (`convex/payments.ts`, `ledger.ts`)
- **What:** the Hyphenate "seat": AP payment controls across a portfolio.
- **How:**
  - **Hold, never cancel.** Every pending payment to the breached vendor is held at companies that switched holds on.
  - **Bank-change flag.** If the vendor's bank details changed within 30 days of the incident, the payment is flagged. The last account confirmed by phone is shown next to the new one (••2208 → ••7731).
  - **Two people.** Whoever requested a payment can't release it. Only a controller at that company can, after calling the number on file and writing down what was confirmed. A note like "480000" is refused.
  - **Real books.** A double-entry ledger: cash moves only on release, exactly once.
  - **Knows when to ask.** A held payment due within 24 hours is escalated to the company's controllers.
  - **New requests too.** For 30 days, any new payment request to that vendor is held and flagged the moment it's made.
  - **Everything on the record.** Every hold, flag, refusal, release and rejection writes an audit row; the controls log exports to CSV.
- **Why it matters:** it's the moment the video opens on. It also shows "autonomy with limits": the system holds automatically, but a human always releases.
- **Edge cases:**
  - An honest bank change verified by phone months ago is *not* flagged (it's in the planted test cases).
  - A company that switched holds off: nothing is held there; it still gets the alert.
  - The firm marks the incident contained: new requests stop being held; payments already held stay held until someone decides.
  - The controller is unavailable: the payment stays held (never auto-released), and the escalation flags it as due soon.

### 5.5 Red-team finding, one step ahead (`convex/findings.ts`, `scoring.ts` `sisterPath`)
- **What:** takes a proven attack path from one company and carries the last step to the sister companies.
- **How:**
  - The finding arrives in our own format, modelled on what AI red teams report: the technique, the proven steps, and the shared thing at the end (e.g. Ironclad's shared admin login).
  - The PE firm sees all of it, labelled "validated at source."
  - Each sister company that shares that login gets: "a validated attack path at another portfolio company ends at a login you share; reachable here, not tested here."
  - It also gets a concrete "What to check" (e.g. sign-ins to that account since 08:12 UTC on Oct 24, then rotate it).
- **Why it matters:**
  - Armadin's whole value is "validated". We never call anything at the sister validated; we say reachable, not tested. And we never touch the sister's systems.
  - It also doesn't raise the sister's confidence: a test at Pinecrest proves nothing about whether Bayview really uses that vendor.
- **Edge cases:**
  - The sister never sees who was tested, the computer names, the finding ID or the engagement ID. A test checks this.
  - A leaked login skips "same vendor only" customers: a leaked password isn't the vendor's whole platform.

### 5.6 Response playbook: each company's pre-approved steps (`convex/responses.ts`)
- **What:** each company decides in advance what Sidecall may do for it. Per step: **Notify only**, **One click**, or **Pre-approved** (runs on report, logged, Undo).
- **The steps:**
  - hold payments (the existing switch)
  - pause the shared login (suspend it in the company's own tenant: everyone is signed out, nothing deleted)
  - revoke the vendor's app tokens
- **Rules Sidecall enforces, whatever the company set:**
  - Only confirmed links act. A DNS guess never moves anything.
  - Payroll logins and vendor admin accounts stop at one click: pausing them can stop payroll, or cut off the vendor running your recovery.
  - At most 3 companies run steps automatically from one report, so a fake report can't cause a portfolio-wide outage.
  - Raising a step to Pre-approved takes two different people at the company. The firm can only recommend.
  - Only reversible steps; every one has Undo. Rotating a password and cutting a vendor off entirely are never steps.
  - The calls to Okta, Microsoft or Google are simulated in the demo; each step shows the real call it stands for.
- **Why it matters:** it answers the objection a finance professional raised: "If you only warn, you create more calls and the responsibility lands on you." Now the company owns the rule, and the first step is already done or one click away.

> **Say it like this:** "The company decides in advance. Cedar Ridge pre-approved pausing its shared login, so Sidecall paused it a tenth of a second after the report: logged, one click to undo."

### 5.7 Identity and privacy (`convex/access.ts`, Convex Auth)
- **What:** who can see what.
- **How:**
  - Real sign-in.
  - Every query works out who you are from your session, never from something the browser sends, so Company A can't read Company B's data even by guessing IDs.
  - Only the PE firm's view ever names the company that reported the incident.
- **Why it matters:** "never reveal who was hit" is what lets companies share at all. It's also how we answer "isn't this a map of the firm's weakest points?" (only the firm sees the map).

### 5.8 AI writing (`convex/ai.ts`, Claude Opus 5.5)
- **What:** writes the company alerts, the hold notices and the vendor letter.
- **How:**
  - The AI only writes; it never decides exposure, urgency or holds.
  - Texts are generated before the demo and saved.
  - Each text is checked against copy rules: never name who was hit, never call a payment fraud, only the phone number on file, and never "validated" for a sister without "not tested".
  - If anything fails a rule, a fixed template is used.
- **Why it matters:** nothing on stage depends on a live model call or Wi-Fi, and judges who distrust "AI-powered" products see that the decisions are deterministic.

### 5.9 Notifications (`convex/notifications.ts`, `notify.ts`)
- **What:** sends the same alerts to each company's Slack, Discord or webhook, and the headline to the firm's channel.
- **How:**
  - Each message goes into an outbox in the same transaction as the alert, deduplicated.
  - One sender delivers them, with a timeout and one retry.
  - In the demo they're recorded as "simulated", so nothing depends on Wi-Fi.

### 5.10 The Convex guarantees
- **One transaction:** holds, alerts and steps land together or not at all.
- **Same snapshot:** every dashboard updates live from the same data, with no refresh and no polling.
- **Idempotent:** a replayed report changes nothing.
- **Race-safe:** two people clicking Acknowledge (or Run now) at once: exactly one wins.
- **Scheduled work:** AI writing and steps are scheduled once per incident, not per company.
- **Scale:** in our test suite, one report reached 303 companies and held 304 payments in a single transaction in about 1.4 seconds.

> **Say it like this:** "Payments are held in the same transaction as the report. Replay it, and nothing duplicates. Two people click at once, and exactly one wins."

### 5.11 Proof
- **Planted answer key:** 18 cases with known right answers (should hold, should flag, must leave alone). Nothing in the backend reads the key; a separate script compares. Result: 0 missed, 0 false holds.
- **66 automated tests** cover the backend guarantees, including privacy and the playbook rules. (This becomes 68 if PR #96 merges.)
- **Rehearsal script:** plays every demo beat against a live deployment with real sign-ins and checks each number.
- **Readiness check and presenter lock:** before going on stage, one command says READY, and a presenter key stops anyone else resetting the live demo.
- **Don't say:** "99% accurate" or any accuracy figure. Say "on our own planted cases, not a benchmark."

### 5.12 Also built
- **AP import:** a newly acquired company is onboarded from the vendor list and open bills any AP system exports. Mid-incident, its payments to the breached vendor are held on import.
- **MCP:** AI assistants can look up holds and request payments for a clerk. They're audited as agents, and there's no release tool.
- **Dashboards per role:** each person lands on the one thing they must do first, with quick links and tabs for everything else.

---

## 6. The demo, beat by beat
About 3 minutes. Open on the money. Use `sidecall.vercel.app/?stage` (or `sidecall.us` once it's live), and press Reset within 2 hours of going on.

| Beat | Be | Do | Say |
|---|---|---|---|
| 1. Fire | Jamie | Simulator: Brightline payroll breach → Fire | "Pinecrest's security team reports their payroll vendor was breached." |
| 2. Money | Jamie | Point at the hero | "Summit was about to pay $480,000 to an account changed by email two days ago. It's held until verified." |
| 3. Refused | Jamie → Rosa | Jamie presses Release → refused. Rosa writes the call note → Release | "Jamie asked for it, so Jamie can't release it. Rosa calls the number on file. Cash moves only now." |
| 4. Zoom out | Jordan | Hero + map | "3 companies exposed, 4,200 people, $612,000 held. Only the firm sees this." |
| 5. Red team | Jordan | Simulator: Red-team finding → Fire. Point at "First step done at 1 of 3" | "Armadin's path stops at Pinecrest. Cedar Ridge shares that login and pre-approved pausing it. Done in a tenth of a second, one click to undo." |
| 6. Convex | any | Replay webhook; two tabs Acknowledge | "Replay: nothing duplicates. Two clicks: exactly one wins." |
| 7. Proof | Jordan | Proof tab | "18 planted cases, 0 missed, 0 false holds, on our own answer key." |

**Recovery tips:**
- "Fire incident: duplicate" on stage means someone fired it already. Press Reset (with the presenter key) and fire again.
- Sign-in looks stuck after Reset: everyone is signed out by design. Pick the person again from the list.

---

## 7. Pitch by track
- **Hyphenate (autonomous finance).**
  - Seat filled: AP payment controls across a PE portfolio.
  - Lead with the $480K hold, segregation of duties, the audit trail and the ledger, and "it knows when to ask" (escalation before a due date).
  - Autonomy with a limit: it holds on its own; a person always releases.
- **Armadin (AI offensive security).**
  - "Every validated attack path ends where the scope letter ends. The shared login behind it doesn't."
  - We accept a validated finding in our own format and carry the last step to sisters as "reachable, not tested", and we never touch their systems. Precision, not noise.
- **Convex.**
  - One webhook, one transaction; the same snapshot on every screen; idempotent replay; race-safe acknowledge; the scheduler running once per incident; crons; auth.
  - 303 companies in 1.4 s, in our test suite.
  - Show the Convex dashboard's live log during the demo.
- **Microsoft.**
  - The human story (Kronos payroll), and the breadth: finance, security and PE oversight.
  - The pre-approved steps map to Microsoft Entra (disable sign-in, revoke sessions) once connected.

---

## 8. Hard questions, with answers
Practise these out loud. Short answer first; stop there unless they ask for more.

- **Liability: "If Sidecall acts and something breaks, isn't that on you?"** The company sets its own rules in advance, and every step is logged with who approved it, like Microsoft Defender's automation levels. Steps are reversible and capped, and payroll logins never pause automatically. We make the company's own plan run in seconds instead of days.
- **Liability: "If you only warn, aren't you just creating more calls?"** That's why each company can pre-approve first steps. The step is already done or one click away, and the alert says exactly what to check, so the call is shorter or doesn't happen.
- **Realism: "Is any of this real?"** The backend, controls and owned sandbox authorization are real; the portfolio/payments/incidents are synthetic and external identity-provider calls are simulated. Signed unconfirmed reports warn immediately; action waits for firm confirmation or an explicitly enrolled detector's confirmed report. The four stage scenarios remain instant. The response record distinguishes sandbox checks, simulations and later Undo.
- **Data: "How do you know which companies share a login?"** Companies report their shared logins and vendor access when they join the portfolio; AP exports show which vendors they pay; public DNS records suggest vendors as candidates. Confirmed links outweigh candidates, and candidates never trigger automatic steps.
- **Armadin: "Who authorized you to touch the sibling?"** The sibling did, in advance, for one reversible step. With its switch off, nothing is touched. Sidecall never tests or probes anything.
- **Armadin: "Isn't acting on a sister company exactly what the pentesting standard forbids?"** That standard (OWASP APTS) governs testing infrastructure nobody authorized. This is a defensive change in the company's own tenant that the company pre-approved. We don't test anything.
- **Armadin: "Why can't the PE firm just put every company in one red-team engagement?"** The shared login is usually discovered at the end of a test, after the scope was signed. Most portfolio companies aren't on a common engagement, and each must consent. It's a legal and organizational barrier, not a technical one.
- **Armadin: "Show me a real chain proven across two companies."** We can't, and we say so: the portfolio is simulated. What's real is the logic, the rules, and the fact that we never claim the second company was tested.
- **Precision: "What about false positives?"** We alert on shared access, not shared vendors. On our planted cases: 0 false holds, including an honest bank change verified by phone months ago that a cruder rule would flag.
- **Abuse: "Couldn't an attacker send a fake incident to lock everyone out?"** Signed unconfirmed reports warn immediately without holding money or changing access; action waits for firm confirmation or an explicitly enrolled detector's confirmed report. Repeated IDs are no-ops; different IDs within an active episode do not repeat actions or extend the payment window. Automatic access steps still require company pre-approval, confirmed links and the existing three-company cap. A compromised enrolled detector remains a risk; signing is not proof of truth. Pause supports authorized Undo; revoked sandbox tokens require a new token.
- **Privacy: "Isn't this a map of the firm's weakest points?"** Only the PE firm sees the whole map. Each company sees only itself and never learns who was hit.
- **Finance: "What if the vendor genuinely changed banks?"** Then the controller confirms by phone and releases it. Holding costs a phone call; paying a fraudster costs the money. The payment is held, never cancelled.
- **Finance: "Doesn't holding payroll funding hurt the workers you claim to protect?"** The hold lasts one phone call, and it escalates to the controller before the due date. The alternative is paying payroll money to an account an attacker controls, and then nobody gets paid.
- **AI: "What if the AI makes something up?"** The AI only writes text; it decides nothing. Every text is checked against rules before it's saved, and a fixed template is used if it fails. On stage everything is pre-generated.
- **Market: "Who buys this?"** The PE firm's portfolio operations or security lead, especially at smaller firms: only 12% of smaller PE firms have a formal security requirement for their portfolio companies, versus 55% of the largest. (Pricing isn't set; the working idea is per portfolio company, paid by the firm. Agree on this as a team.)
- **Market: "How is this different from vendor risk-rating tools?"** Rating tools score vendors before anything happens. Sidecall acts during an incident: it routes one report to the right companies, holds the money and runs each company's pre-approved steps, across a portfolio under one owner.
- **Legal: "Can companies even share this with each other?"** The 2015 US cybersecurity information-sharing law lets private companies share threat indicators (in force through Dec 11, 2026). Sidecall moves one fact, "this vendor or login is compromised," not an investigation.
- **Legal: "Why should the PE firm care?"** In March 2026 a federal judge let a breach suit proceed against Bain Capital itself, citing its control over the portfolio company's vendors and IT (still at an early stage). A record that the firm knew and the company acted matters.

---

## 9. Edge cases and what the system does
| Situation | What Sidecall does |
|---|---|
| Same report sent twice | The second is a no-op ("duplicate"); nothing new is held or run. |
| Two people click Acknowledge or Run now at once | Exactly one wins; the other sees "already done". |
| The clerk tries to release her own request | Refused, and the refusal is logged. |
| The controller writes "ok" as the note | Refused: the note must describe the call. |
| A company with its own login, when a shared login leaks | No alert. Shown to the firm as "separate access, not exposed". |
| The vendor itself is breached | Every customer is exposed, including same-vendor-only ones (advisory). |
| The link is only a DNS guess | Labelled candidate, lower confidence, never any automatic step. |
| Bank change verified by phone months ago | Not flagged. |
| Company has holds switched off | Alert only; nothing held. |
| Firm marks the incident contained | New requests stop being held; held payments stay held; waiting one-click steps expire. |
| New company imported mid-incident | Its payments to the breached vendor are held on import. |
| More than 3 companies pre-approved a step | The first 3 run; the rest become one click, with the reason shown. |
| Firm tries to change a company's playbook | Refused and logged. The firm can only recommend. |
| Someone signs in with the public password and presses Reset or Fire on production | Refused without the presenter key. |
| A company opens an incident that never touched it | Sees nothing. |

---

## 10. Words to use and avoid
- **Use:**
  - held until verified · shared access · genuinely shares
  - reachable here, not tested
  - validated (only for the reporter's own proven steps)
  - candidate (for DNS guesses)
  - pre-approved step, one click to undo
  - the firm sees, the company decides
  - a red team *like* Armadin; our own finding format
- **Avoid:**
  - we stop fraud · we block payments
  - we integrate with Armadin
  - auto-mitigate · we contain the breach · we stop the attack
  - Sidecall covers everything
  - every sister company is exposed
  - any accuracy percentage
  - anything about raising exit valuations

---

## 11. Numbers cheat sheet
| Number | What it is | Source / caveat |
|---|---|---|
| $480,000 | Summit's held payment, account changed by email 2 days before | Our demo data |
| 3 · 4,200 · $612K | Companies exposed, people, payments held (Brightline) | Our demo data |
| 0.1 s | Cedar Ridge's pre-approved pause after the report | Measured from real timestamps |
| ~0.2 s | Alerts written after the report | Measured on our runs |
| 303 / 304 / 1.4 s | Companies, payments held, one transaction | "In our test suite" |
| 18 · 0 · 0 | Planted cases, missed, false holds | Our own planted cases, not a benchmark |
| 66 | Backend tests on main | Our test suite (68 if PR #96 merges) |
| 48% | Breaches involving a third party | Verizon DBIR 2026 |
| 73 days | Median time for a vendor to tell customers | Black Kite 2026 (vendor-reported); present as a gap |
| 29 min | Average attacker breakout time | CrowdStrike 2026; never as a ratio |
| 13.3M · 1 in 12 | Americans at PE-backed companies | Industry figure; critics say ~12M |
| ~60 → 1,500 | Kaseya: providers → businesses hit | 2021 |
| 200+ | Miljödata: municipalities down, none breached themselves | Aug 2025 |
| 700+ in 10 days | Salesloft Drift: organizations reached via stolen app tokens | 2025 |
| 79.7% | Snowflake: accounts used had leaked credentials before | Mandiant |
| ~54 hours | Larry Kroeck's lost pay (Kronos) | Dec 2021 |
| 12% vs 55% | Smaller vs largest PE firms with a formal portfolio security requirement | Industry survey |

---

## 12. What's real, what isn't
Say this before a judge asks. Honesty about limits reads as competence.

- **Real:**
  - the Convex backend and its guarantees
  - the exposure, hold and playbook rules
  - owned sandbox authorization checks (HTTP 200→403), unaffected-resource checks, authorized Undo/replay tests and the firm-only response record; these do not verify a live identity provider
  - AI-written alerts and letters (pre-generated)
  - the scorecard against the planted answer key
  - DNS vendor detection on real public domains (the separate scan; the demo companies' DNS evidence is simulated)
- **Simulated:**
  - the portfolio, companies, people, payments and amounts
  - the incidents and bank-detail changes
  - the identity-provider calls behind pre-approved steps
  - Slack messages (recorded, not sent, on stage)
- **Not built yet:**
  - live Okta / Entra / Google connectors
  - reading breach-notice emails into incidents
  - pulling vendor lists straight from AP systems
  - a real pilot with a PE firm
