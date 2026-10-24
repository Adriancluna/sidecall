# Demo script (≤ 3 minutes)

Owner: Role 2. Opens on the money moment, as Hyphenate asked. Times are targets, not limits per beat.
Lines marked **[after 11pm]** depend on Role 3 (map) or Role 4 (AI text, scorecard) and need a re-read once their work lands.

## Before you start (2 minutes, off camera)

0. **Readiness check:** run `npx convex run ops:demoReadiness --prod` (needs the prod deploy key / Adrian). Fix anything it reports before going on stage.
1. Open **https://sidecall.vercel.app/?stage** in tab A. Sign in as anyone, press **Reset** in the header. Everyone is signed out and the portfolio is reseeded, so the "changed 2 days before the breach" date is fresh.
2. The **Presenter** panel (bottom right) has every beat below with a one-click "Sign in as".
3. Open a second tab B on `/?stage` and leave it on the sign-in screen (for the race in beat 7).
4. Optional: open the Convex dashboard for prod (`judicious-tiger-712`) in a third tab, Data → `payments`.

## The script

| Time | Beat | Who (tab A) | Click | Say |
|---|---|---|---|---|
| 0:00 | **1. The money moment** | Jamie Chen, AP clerk, Summit Home Health | Sign in as Jamie → **Fire incident** | "Summit Home Health was about to pay **$480,000** to its payroll vendor, Brightline. Two days before Brightline was breached, someone changed Brightline's bank account by email. Nobody at Summit knew. Sidecall just **held** the payment and flagged it: the old account, confirmed by phone, ends 2208; the new one, 7731, came in by email. And it's due in 20 hours, so Sidecall already escalated it to the controller: it knows when to ask." |
| 0:25 | **2. Segregation of duties** | Jamie | Type a note → **Release payment** | "Jamie requested this payment, so Jamie can't release it. The refusal happens inside the backend and it's logged." |
| 0:40 | **3. The controller verifies** | Rosa Alvarez, controller | Sign in as Rosa → note: "Called Brightline at the number on file, …" → **Release** or **Reject** | "Rosa calls the number **on file**, never one from a recent email, writes down what the vendor said, and decides. Cash moves only on release: watch the ledger." |
| 1:05 | **4. Zoom out to the firm** | Jordan Ames, PE firm | Sign in as Jordan | "Here's the PE firm's view. One compromised vendor: **3 companies exposed, 4,200 people behind them, $612K in payments held**. Only this view names the company that reported it." *(If Rosa released in beat 3, the line under the headline shows "$480,000 released after verification".)* |
| 1:25 | **5. Evidence, not noise** | Jordan | Click **Bayview Veterinary Partners**, then **Cedar Ridge** | "Same vendor isn't the same weakness. Cedar Ridge shares a credential: urgent. Bayview only uses the same vendor, inferred from DNS: advisory, and we call that link a *candidate*. Companies that don't share Brightline aren't touched. (In the Ironclad scenario, Summit has its own login, so a leaked shared credential doesn't alert it.) Discipline over noise." **[after 11pm: Role 3's map]** |
| 1:50 | **6. One letter to the vendor** | Jordan | Scroll to **Tailored alerts** and the **Letter to the shared vendor** → Copy | "Each company gets an alert written for its own exposure, and the vendor gets one coordinated letter instead of eight separate ones. The AI only writes; it never decides who's exposed or what gets held." **[after 11pm: Role 4's AI text]** |
| 2:05 | **6b. The timeline** | Jordan | Point at the **Timeline** card under the headline | "Real timestamps: the payments were held in the same transaction as the report, alerts written in about 200 milliseconds, first acknowledgement seconds later." |
| (opt.) | **6c. Discipline** | Jamie | Header menu → **Ironclad shared login leaked** → **Fire incident** | "A shared Ironclad login leaks. Summit uses Ironclad too, but with its own login, so Summit gets no alert. Same vendor isn't the same weakness." Then Jordan → **Incident** menu to flip between the two incidents. |
| 2:15 | **7. Convex guarantees** | Tab A: Jamie · Tab B: Kwame Mensah (IT, Summit) | **Replay webhook**, then **Acknowledge** in both tabs at once | "Replay the same webhook: nothing duplicates, no second hold. Two people acknowledge the same alert at once: exactly one wins, and the app says who." |
| 2:35 | **8. Proof** | Jordan | Scroll to **Controls log** → **Export CSV**, then **Proof** | "Every hold, flag, refusal and release is in the controls log, exportable for the auditor. What's real, what's simulated, and the scorecard against the planted answer key: caught, missed, false holds." **[after 11pm: Role 4's scorecard numbers]** |
| 2:55 | **Close** | | | "Sidecall fills the **AP payment-controls seat across a private equity portfolio**: it holds payments for a person to verify, and it knows when to ask." |

## If something goes wrong

- **Blank or stuck screen:** reload. If it lands on sign-in, sign in again from the Presenter panel.
- **"Fire incident: duplicate"** on the first press: the incident was already fired. Press **Reset**, sign in as Jamie, fire again.
- **Release refused with "Describe the verification call…"**: the note is too short. Say who you called and what they confirmed.
- **Headline shows $132K instead of $612K:** a payment was already released. Point at the "released after verification" line, or Reset.

## Words to avoid on stage

From CLAUDE.md "Never say": don't say "we stop fraud" or "we block payments" (we **hold** payments for a person to verify), don't call an inferred link "validated", don't quote accuracy numbers we haven't measured, and don't say "we integrate with Armadin".
