# Demo script (≤ 3 minutes)

Owner: Role 2. Opens on the money moment, as Hyphenate asked. Times are targets, not limits per beat.
Lines marked **[after 11pm]** depend on Role 3 (map) and need a re-read once it lands. Role 4's AI texts are in (`data/ai_cache.json`, 19 texts).

## Before you start (2 minutes, off camera)

0. **Dress rehearsal (Adrian):** `npm run rehearse -- --url https://judicious-tiger-712.convex.cloud` plays every beat against prod with real sign-ins and checks every number (~11 s). Then **readiness check:** run `npx convex run ops:demoReadiness --prod` (needs the prod deploy key / Adrian). Fix anything it reports before going on stage.
1. Open **https://sidecall.vercel.app/?stage** in tab A. Sign in as anyone, press **Reset** in the header. Everyone is signed out and the portfolio is reseeded, so the "changed 2 days before the incident" date is fresh.
2. The **Presenter** panel (bottom right) has every beat below with a one-click "Sign in as".
3. Open a second tab B on `/?stage` and leave it on the sign-in screen (for the race in beat 7).
4. Optional: open the Convex dashboard for prod (`judicious-tiger-712`) in a third tab, Data → `payments`.

## The script

| Time | Beat | Who (tab A) | Click | Say |
|---|---|---|---|---|
| 0:00 | **1. The money moment** | Jamie Chen, AP clerk, Summit Home Health | Sign in as Jamie → **Fire incident** | "Summit Home Health was about to pay **$480,000** to its payroll vendor, Brightline. Two days before Brightline was breached, someone changed Brightline's bank account by email. Nobody at Summit knew. Sidecall just **held** the payment and flagged it: the old account, confirmed by phone, ends 2208; the new one, 7731, came in by email. And it's due in 20 hours, so Sidecall already escalated it to the controller: it knows when to ask." |
| 0:25 | **2. Segregation of duties** | Jamie | Type a note → **Release payment** | "Jamie requested this payment, so Jamie can't release it. The refusal happens inside the backend and it's logged." |
| 0:35 | **2b. New requests too** | Jamie | **Bills to pay** → **Request payment** on the $38,000 November bill | "And it's not only what was already in flight: Jamie's new $38K request to the same vendor is held and flagged the moment she makes it." |
| (opt.) | **2c. It reached their Slack** | Rosa or Jamie | Scroll to **Notifications** → **Outbox** | "And nobody had to have the dashboard open: the same warning already went to Summit's #summit-finance channel. Here it's simulated so the demo doesn't depend on Wi-Fi." |
| (opt.) | **2d. An AI assistant asks too** | | Play the recorded clip (≤ 15 s, never live) | "Summit's AP assistant, an AI agent, can look up holds and request payments on Jamie's behalf. It gets held like everyone else, it's on the record as an agent, and it has no release button." |
| 0:40 | **3. The controller verifies** | Rosa Alvarez, controller | Sign in as Rosa → note: "Called Brightline at the number on file, …" → **Release** or **Reject** | "Rosa calls the number **on file**, never one from a recent email, writes down what the vendor said, and decides. Cash moves only on release: watch the ledger." |
| 1:05 | **4. Zoom out to the firm** | Jordan Ames, PE firm | Sign in as Jordan | "Here's the PE firm's view. One compromised vendor: **3 companies exposed, 4,200 people behind them, $650K in payments held**: the $612K that was already in flight plus Jamie's new $38K. Only this view names the company that reported it." *(After Rosa releases in beat 3 the headline drops to $170K, with "$480,000 released after verification" under it. To show $650K, zoom out before Rosa decides. Skip beat 2b and it reads $612K.)* |
| (opt.) | **4b. A new acquisition** | Jordan | **Onboard a company from its AP export** → **Use sample files** → point at the red warning → **Import** | "A new acquisition closes today. Here's its AP export, straight from its own system. Before we even import, Sidecall sees it pays Brightline at the 7731 account, not the one confirmed by phone. Import: two payments held on the spot, and the headline is now **4 companies, 4,650 people**." *(Adds $66,400 held: $716,400 with the $38K request, $678,400 without. Sign in as Daniel Okoro, Lakeside's controller, to show the held payments. Reset removes Lakeside.)* |
| 1:25 | **5. Evidence, not noise** | Jordan | Click **Bayview Veterinary Partners**, then **Cedar Ridge** | "Same vendor isn't the same weakness. Cedar Ridge shares a credential: urgent. Bayview only uses the same vendor, inferred from DNS: advisory, and we call that link a *candidate*. Companies that don't share Brightline aren't touched. (In the Ironclad scenario, Summit has its own login, so a leaked shared credential doesn't alert it.) Discipline over noise." **[after 11pm: Role 3's map]** |
| 1:50 | **6. One letter to the vendor** | Jordan | Scroll to **Tailored alerts** and the **Letter to the shared vendor** → Copy | "Each company gets an alert written for its own exposure, and the vendor gets one coordinated letter instead of eight separate ones. The AI only writes; it never decides who's exposed or what gets held." |
| 2:05 | **6b. The timeline** | Jordan | Point at the **Timeline** card under the headline | "Real timestamps: the payments were held in the same transaction as the report, alerts written in about 200 milliseconds, first acknowledgement seconds later." |
| (opt.) | **6c. Discipline** | Jamie | Header menu → **Ironclad shared login leaked** → **Fire incident** | "A shared Ironclad login leaks. Summit uses Ironclad too, but with its own login, so Summit gets no alert. Same vendor isn't the same weakness." Then Jordan → **Incident** menu to flip between the two incidents. |
| 2:15 | **7. Convex guarantees** | Tab A: Jamie · Tab B: Kwame Mensah (IT, Summit) | **Replay webhook**, then **Acknowledge** in both tabs at once | "Replay the same webhook: nothing duplicates, no second hold. Two people acknowledge the same alert at once: exactly one wins, and the app says who." |
| (opt.) | **7b. Contained** | Jordan | **Containment** card → note → **Mark contained** | "Brightline fixed it and confirmed by phone. The firm marks it contained, with what was fixed on the record." |
| 2:35 | **8. Proof** | Jordan | Scroll to **Controls log** → **Export CSV**, then **Proof** | "Every hold, flag, refusal and release is in the controls log, exportable for the auditor. What's real, what's simulated, and the scorecard against our planted answer key: 18 cases, everything caught, no false holds. And the same DNS vendor detection, run on real public domains." |
| 2:55 | **Close** | | | "Sidecall fills the **AP payment-controls seat across a private equity portfolio**: it holds payments for a person to verify, and it knows when to ask." |

## If something goes wrong

- **Blank or stuck screen:** reload. If it lands on sign-in, sign in again from the Presenter panel.
- **"Fire incident: duplicate"** on the first press: the incident was already fired. Press **Reset**, sign in as Jamie, fire again.
- **Release refused with "Describe the verification call…"**: the note is too short. Say who you called and what they confirmed.
- **Headline lower than expected ($170K or $132K):** a payment was already released (with / without the $38K request). Point at the "released after verification" line, or Reset. $650K = $612K in flight + the $38K request.

## Words to avoid on stage

From CLAUDE.md "Never say": don't say "we stop fraud" or "we block payments" (we **hold** payments for a person to verify), don't call an inferred link "validated", don't quote accuracy numbers we haven't measured, and don't say "we integrate with Armadin".
