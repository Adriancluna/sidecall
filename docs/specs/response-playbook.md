# Spec: Response playbook ("pre-approved steps")

Status: **approved by Adrian (Oct 24); Role 1 builds backend + UI.** Built from four research passes (incident-response practice with sources, pitch/judge fit, Convex design, adversarial review). Audience: every teammate's Claude.

## 0. The request this answers (Adrian, Oct 24)
> A CRX worker said: good idea, but because Sidecall doesn't act on the breach, responsibility may shift and it may cause more calls. Omar: a per-company preset of what Sidecall's agents may do. Some companies want Sidecall to mitigate, some handle things themselves, some only want the notification. A preset set in advance, not decided at breach time. If someone toggles everything on, Sidecall covers it. Tie every piece to the pitch-research findings.

## 1. The idea in one paragraph
Each portfolio company writes down **in advance** which first steps Sidecall may take for it when a shared vendor or login is compromised. Per step it picks **Notify only** (tell us what to do; today's behaviour), **One click** (staged; our IT lead runs it with one click) or **Pre-approved** (Sidecall runs it the moment the report lands, logs it, and offers Undo). The payment hold already works this way (`holdRuleEnabled`, Hyphenate's moment); this extends the same rule to access. The company authors the rule, so responsibility stays with it; the step is already done or one click away, so there are fewer calls, not more.

Positioning: **"Sidecall warns, and runs only the reversible steps a company approved in advance. It never decides what is exposed, never tests anything, and never blocks on its own judgement."** (amends the brand line "a warning system, not a weapon").

## 2. The steps (every one tied to a finding)
| Step (`responseAction`) | What it does (simulated connector; the real call it stands for) | Undo | Modes allowed | Finding it answers |
|---|---|---|---|---|
| `hold_payments` (exists) | Holds pending payments to the breached vendor until a different person verifies by phone | Controller releases / rejects | Pre-approved / Notify (mirrors `holdRuleEnabled`) | Kronos/UKG payroll harm; the $480K email bank change; FBI IC3 froze ~74% of quickly reported BEC wires (2021) |
| `pause_shared_login` | Suspends the shared login in the company's own tenant: every session signed out, credentials kept (Okta `POST /users/{id}/lifecycle/suspend`, Entra `accountEnabled=false` + `revokeSignInSessions`) | Restore access (unsuspend) | All three; **capped at One click** for vendor-admin (MSP) links and payroll vendors | Snowflake: 79.7% of accounts used had prior credential exposure, no MFA; breakout 29 min vs 73-day median disclosure (a gap, not a ratio); the Armadin terminal hop is a shared login |
| `revoke_vendor_tokens` | Revokes the vendor's connected-app / OAuth grants in the company's tenant (Google `tokens.delete`, Entra OAuth2PermissionGrant delete, Okta clear sessions `oauthTokens=true`) | The vendor re-authorises | All three; recommended One click | Salesloft Drift: stolen OAuth tokens, 700+ orgs in 10 days |

Not steps (on purpose):
- **Rotating the password** can't be undone and can break payroll runs. It stays a human step in the IT hero.
- **Cutting the vendor off entirely** caused its own harm in the Change Healthcare advisories (AHA, Feb 22–26, 2024). It stays Notify text.
- **Vendor letter and Slack** already exist at firm level.

## 3. Rules (MUST)
1. **Effective mode = min(company's mode, cap).**
   - The cap is *Notify* for `dns_inferred` and `same_vendor_only` links: only confirmed shared access acts (precision; "validated" stays sacred).
   - The cap is *One click* for `pause_shared_login` on `shared_admin_access` links (the MSP may be running your recovery) and on payroll-kind assets (Kronos in reverse).
2. **Blast cap:** at most 3 companies get Pre-approved steps from one incident. The rest are downgraded to One click and the firm sees why. This stops a forged or buggy report from causing a portfolio-wide outage.
3. **Planned in the incident's own transaction:** steps are planned after the `externalId` dedupe, so a replay re-runs nothing. There's one row per (incident, company, step). The executor is scheduled once per incident.
4. **Only the company sets its playbook:**
   - The `it` lead or the `controller` sets the steps.
   - The PE firm and AP clerks are refused, and the refusal is logged.
   - The firm only **recommends** a baseline (the Bain ruling: the firm sees, the company decides).
   - **Turning a step to Pre-approved needs two different people** (one proposes, the other confirms). Turning a step down takes one.
5. **Versioned and audited:**
   - Every change bumps the playbook version and writes an audit row naming who changed it.
   - Every step keeps the version and setter that allowed it.
   - Audit rule string: `playbook:<step>:<mode>:v<n>`.
6. **Race-safe:** status changes in one mutation (awaiting → queued → done → undone). Two clicks produce exactly one winner, the same pattern as acknowledge.
7. **Containment:** when the firm marks an incident contained, steps still awaiting approval expire. Paused logins stay paused until someone at the company restores them.
8. **Honest about simulation:**
   - Every step row is `simulated: true` and shows the exact call it stands for.
   - No live connector exists. Say "Sidecall would pause … (simulated)", never "Sidecall paused your Okta account".
9. **Never names who was hit:** step text is built from our own asset and link rows, never from finding labels.
10. **Payments:** held, never cancelled. Releasing still needs a controller who isn't the requester.

## 4. Words
**Use:**
- "pre-approved step"
- "the company's own rule, run on its behalf"
- "one click to undo"
- "set by Sam Kowalski, confirmed by Elena Ruiz"
- "first step done"
- "shared access"

**Never use:**
- "auto-mitigate", "we block", "we stop the attack", "we contain the breach", "protect", "defend", "autonomous response"
- "Sidecall covers everything"
- "contained" for a sister company (that word is the firm's vendor-fixed state)

**Judge answers:**
- **"Who authorized you to touch the sibling?"** "The sibling did, in advance, for one reversible step. With its switch off, nothing is touched."
- **"Isn't that what APTS forbids?"** "APTS governs testing infrastructure nobody authorized. This is a defensive change in the company's own tenant that the company pre-approved; Sidecall never tests or probes anything."
- **"Liability?"** "The company sets the rule; every step is logged with who approved it, the same model as Microsoft Defender's automation levels. We make its plan run in seconds instead of days."
- **"Real?"** "The rules, timing and audit trail are real Convex code; the identity-provider call is simulated, like the Slack outbox."

## 5. Demo (Ironclad red-team case, `demo-armadin-004`; adds no time)
**Seed playbooks:**
- **Cedar Ridge:** pause = Pre-approved, tokens = One click.
- **Granite Peak:** pause = One click.
- **Harborline:** Notify only. Its link is vendor admin access anyway.

**On Fire:**
- Cedar's shared login is paused about 0.3 s after the report (timed from real timestamps).
- Granite has "Pause the shared login" ready to run.
- Harborline gets the steps as text.

**The firm's tracker reads "First step done at 1 of 3 · 1 ready · 1 notified".**
- One click as Ben Carter at Granite makes it 2 of 3.
- Brightline is unchanged: Cedar's Brightline link is a payroll vendor, so it's capped at One click, and no number in the rehearsal changes.

## 6. Build (Role 1)
**Backend:**
- `convex/responses.ts`, plus `responsePolicies` and `responseSteps` in `schema.ts`.
- The rule function `responseFor` in `scoring.ts`.
- `planResponses` called from `openExposure`, and an `execute` internalAction.
- Mutations: `approveStep`, `undoStep`, `setPlaybookMode`.
- Queries: `getMyResponsePlan`, `getMyPlaybook`, `getResponseTracker`.
- Audit actions `respond` / `approve` / `undo` / `expire` / `policy` added to the timeline.

**UI:**
- Pre-approved steps block in `ExposureHero`.
- "Response playbook" tab, where the switches live.
- "First step" column in the PE response tracker.

**Tests, CONTRACT, rehearsal:**
- Tests: replay, race, authorization, caps, blast cap, two-person upgrade, holds unchanged, no reporter leak.
- CONTRACT.md updates.
- Rehearsal beat 9b.

**Deferred:**
- Live connectors.
- A 24 h review cron for pauses (today the pause shows "review by" and stays until restored).
- A firm "downgrade everything" switch.
- Per-sender webhook secrets.
