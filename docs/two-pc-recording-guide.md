# Sidecall: two-PC recording guide

Author: Pegasus · 2026-10-25 (Pacific time)
Audience: Marco, Marco’s agent (Role 2), and the demo operators.

This is the current recording procedure for the release through PR #139. It supersedes conflicting reset, release and navigation instructions in `docs/demo-script.md`. Technical architecture is explained in the slides; this video shows actions and visible outcomes. The full rehearsal below is longer than the edited video.

## Before recording

1. Open **https://sidecall.vercel.app** on both PCs. Do not use localhost or 127.0.0.1; that is a separate development backend. `?stage` is optional for presenter helpers.
2. PC 1 is the left panel: sign in as **Jordan Ames**, the PE portfolio viewer. PC 2 is the right panel: start as **Jamie Chen**, AP at Summit Home Health. Change people through the sidebar account selector as needed.
3. Only PC 1 operates **Simulator**. Open it, click **Reset** once, and wait for **“Reset [number] complete. Ready to run a scenario.”** No presenter key or extra reset confirmation is required. Reset preserves sign-ins and real response history; refreshing a page does not reset the shared demo.
4. Keep Ashwa’s Mac awake, online, and its receiver/tunnel processes running. Vercel hosts the frontend, but the real Okta receiver currently runs on that Mac. The receiver permits three new pauses per hour; rehearse finance freely, but plan real pause takes around this limit.
5. On PC 2, open the existing Okta Admin Console in a separate tab: **Directory → People**, search **Sidecall public demo**, and open **Sidecall public demo SidecallReceiverTest**. Confirm **Active** before the take. Use only this disposable public-demo account, never an administrator or the separate DEV target.
6. Record each screen at a readable desktop resolution, ideally 1920×1080. Record a spoken countdown or clap for synchronization. Keep Jordan on the left and company operations on the right when editing. Close unrelated tabs/notifications and keep credentials, keys and admin profile details out of the recording.
7. This is shared practice data: ask other teammates not to Reset or Fire while recording. Do not create extra bills or import companies during this take; those change the expected totals.

## Full capture sequence: actions and success criteria

| Step | PC 1: portfolio / left | PC 2: company / right | Evidence to capture |
|---|---|---|---|
| 1. Baseline | Jordan, Map & evidence. | Jamie, Held payments; show the pending Brightline $480,000 payment. | One portfolio, separate company role. |
| 2. Incident | Simulator → **Brightline payroll breach** → **Fire incident**. | Leave Jamie’s screen visible, without reloading. | Live update: **3 companies exposed, $612,000 held** after a clean reset; Jamie’s $480,000 becomes held. |
| 3. Scope and evidence | Show affected companies and relationship evidence; optionally select an unaffected/advisory company to explain scoped action. | Show **2208 last confirmed by phone** versus **7731 changed by email**. | The system explains which payments need verification; it does not freeze the whole portfolio. |
| 4. Requester refusal | Leave the shared view visible. | Jamie → **Try to release**. | Refusal says requester cannot approve; the audit log records it. |
| 5. Wrong destination | Observe the portfolio. | Switch to **Rosa Alvarez**. Enter **2208** in **Account ending confirmed by the vendor**. | Mismatch warning; Release payment remains unavailable because this request targets 7731. |
| 6. Reject | Capture the portfolio updating. | Note: **“Practice callback: vendor confirmed account 2208; destination 7731 is incorrect.”** Click **Reject**. | Original payment is **Rejected / Never paid**, with Rosa’s name and note. |
| 7. Verify correction | Keep Jordan visible. | Under **Recover this bill**, click **Verify corrected destination** if the form is not already open. Enter **2208**, tick the practice callback checkbox, and fill **Who confirmed the corrected destination?** with **“Practice callback: Brightline finance confirmed account 2208 is current for this $480,000 bill.”** Click **Prepare corrected request**. | **Correction prepared for AP**. The note is mandatory (15–2,000 characters); digits and checkbox alone leave the button disabled. |
| 8. AP requests | Leave Jordan visible. | Switch to **Jamie**. On the original rejected payment’s recovery section, click **Request corrected payment**. | A replacement request to 2208 is created and held; the original stays rejected. |
| 9. Independent release | Show updated held amount. | Switch to **Rosa**, open the replacement in Held payments, enter **2208**, tick the practice callback checkbox, and add **“Practice callback: Brightline finance confirmed $480,000 to account 2208.”** Click **Release payment**; accept its confirmation if shown. Open **Ledger** / **Controls log** to show the result. | Replacement is released in the simulated ledger, original remains rejected. Do not read the original 7731 card as the new payment. |
| 10. Automatic protection | Simulator → **Ironclad shared login leaked** → **Fire incident**. | Switch to **Sam Kowalski**, Cedar Ridge Manufacturing → **Incident & evidence**. | **Your pre-approved steps → Pause the shared login → Pause confirmed** and receipt **Okta reported SUSPENDED**. Use the actual measured time shown, not a fixed promised latency. |
| 11. Independent proof | Keep the portfolio’s response visible. | Switch to the prepared Okta user tab and refresh. | Disposable public-demo user shows **Suspended** in Okta itself. Capture before resetting. |
| 12. Recovery / next take | Simulator → **Reset**, once. Wait for completion; do not Fire during reset. | Watch Sidecall’s shared reset state, then refresh the Okta user page. | Account returns **Active**; demo finances are reseeded. Recovery/audit evidence is retained. Reset is practice cleanup, not proof that a real attacker has been remediated. |

The phone calls are role-played, with notes explicitly marked “Practice callback”; do not dial the fixture numbers or claim Sidecall actually placed the call. A checked box records the operator’s assertion, not independent telephone verification.

Optional short proof: click **Replay** before resetting to show “Already recorded” with no duplicate incident. This is not a fresh attack, and it should not cause another account suspension.

## Suggested 110-second edit within the three-minute presentation

Allow roughly 55 seconds for the opening/technical slides, 110 seconds for the video, and 15 seconds for the close. If the speaker talks over the video, avoid a second competing voiceover.

| Video time | Shot / action | Suggested speaker line |
|---|---|---|
| 0:00–0:10 | Two-panel baseline, then Fire Brightline. | “One vendor incident can affect several companies in a private equity portfolio.” |
| 0:10–0:23 | Portfolio updates; zoom into held $480K and account change. | “Sidecall identifies the exposed companies and holds affected payments. This invoice points to a bank account recently changed by email.” |
| 0:23–0:33 | Jamie’s refusal and audit entry. | “The employee who requested the payment cannot approve it.” |
| 0:33–0:58 | Rosa’s mismatch, rejection, correction; Jamie requests; Rosa releases. Trim typing/role-switch waiting, keeping the sequence clear. | “The controller verifies the destination through the stored contact. The wrong request stays rejected, and a corrected request goes through separate approval so business can continue.” |
| 0:58–1:20 | Fire Ironclad, Sam’s automatic pause receipt. | “For a compromised shared login, a pre-approved response runs automatically. Here is the confirmed result.” |
| 1:20–1:32 | Briefly replace the right panel with Okta showing Suspended. | “This is the actual disposable test account in Okta, suspended by that response.” |
| 1:32–1:45 | Reset progress, then Okta Active. | “For another practice run, Reset restores the demo account and clears practice transactions while retaining response evidence.” |
| 1:45–1:50 | Both panels / audit evidence. | “Shared visibility, scoped protection, and a recorded path back to business.” |

Show captions **“Simulated payment ledger”**, **“Synthetic incident”**, and **“Real Okta test account”** on the relevant shots. If waiting is shortened, visibly label the time cut; do not fabricate a result or splice a different target’s status into the take.

## Sponsor evidence and claim boundaries

- **Convex:** capture both screens updating without refresh, the requester refusal, and shared recovery state; explain transactional checks and scheduled response in the technical slides. These shots support the implementation story, not a universal performance claim.
- **Hyphenate:** focus on AP work, checking bank-change evidence, segregation of duties, audit history and recovering a legitimate bill.
- **Security / Armadin theme:** show scoped shared-login response, signed-command/receipt evidence and independent Okta suspension. The simulator is synthetic; do not claim an Armadin API integration, a live discovered attack, or a general attack-detection accuracy result.
- **Visa:** these shots show payment safety and business continuity in a simulated ledger, with no Visa/card/bank transaction. They do not demonstrate AI shopping by themselves. If Visa is declared, pair the pitch with a separately verified bounded AI purchase clip from **Bills to pay** (approved invoice → real model run → simulated receipt / blocked unsafe request), clearly labeled. Do not claim this core clip alone establishes Visa eligibility. The team must use the sponsor’s actual criteria for its final declaration.

This guide does not modify or assign work on Omar’s chatbot. Avoid adding every optional feature to the short video.

## Stop and diagnose instead of filming a false success

- Disabled **Prepare corrected request**: enter 2208, tick the checkbox and enter the required note; if details changed, restart verification as instructed by the UI.
- Other PC not updating: confirm both are on sidecall.vercel.app; roles show different data. Refresh is not Reset.
- **Confirmation pending / unknown / Receiver refused**: capture the reason; do not narrate “paused” or repeatedly Fire. For unknown results use the existing command’s check action; an action may already have happened.
- Pause limit reached: wait for the hourly budget to become available; do not remove it for the video.
- **Reset stopped**: do not assume Okta is Active. Keep the error and verify recovery before another take.
- **Revoke the vendor’s app tokens** is a separate simulated, one-click action; it is not required for the real Okta pause proof. Downstream application logout has not been independently verified.
- The top line “Reset N complete” can remain as the previous reset’s status after a new incident; use the incident and its command receipt to judge the current action.

## Evidence status at handoff

The user’s screenshots show the payment hold, requester refusal, destination mismatch and Rosa’s rejection. Their later screenshot shows a confirmed external pause three seconds after the report and an Okta SUSPENDED receipt. Those screenshots do not independently prove the corrected payment release or the subsequent Okta reset; capture those during this take. Pegasus’s latest availability check found the production deployment Ready, HTTP 200 from sidecall.vercel.app, and the receiver/tunnel running and reachable; it did not reset or interrupt the user’s session.

## Request to Marco’s agent

Read this guide and `handoff/pegasus.md`, report the recording order and claim boundaries to Marco, and confirm pickup in your own `handoff/role-2-frontend.md`. Flag a missing clip or UI mismatch before recording; do not silently change the workflow. Pegasus has published these instructions, but has not claimed that your agent has read them or that Marco has acknowledged them.
