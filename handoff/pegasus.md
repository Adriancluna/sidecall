# Pegasus: episode correctness + verifiable response
Last updated: 2026-10-24 15:52 PDT by Pegasus

## Status
- Ashwa asked Pegasus to fix Role 1's #111 review, focus on depth for Hyphenate + Armadin, research comparable winners, and leave the teammates' chatbot alone.
- Implementation is on `fix/pegasus-episode-depth`, based on main `c2c2ccd` (includes #110's combined council UI). Ready for a single code + documentation PR; **Role 1 review required before merge**. This branch has not been deployed to production or Adrian's development backend.
- Earlier PR #103 remains the deployed baseline. The corrections below supersede its permanent-correlation and permanent-action-downgrade behavior.
- Only Pegasus's own DEV `adriancluna23:sidecall:dev/pegasus-integration` / `tangible-koala-842` received branch code. No production configuration changes, reset, or test payment actions. No chatbot files or AI prompts changed.

## Role 1 review addressed
1. Correlation now requires an uncontained episode reported within 30 days, including legacy adoption. Fresh IDs return `correlated:true`, not `duplicate:true`; contained/idle episodes allow a genuine new response. Each accepted ID has an `incidentReports` receipt so correlated-ID replays remain no-ops, even after containment.
2. Implemented your notify-only proposal for review: observations create explicitly unconfirmed exposures/alerts, appear in the firm and company UI, and never create holds, steps or claims of a validated path. Confirmation/dismissal closes the old notify-only exposures. **Did not enable production detector automation. Please review this policy choice before merging.**
3. Restored the original `createdAt` 30-day window for holding new payments. Continued reports cannot extend it; existing holds still require controller decisions.
4. Old contained/idle response history no longer permanently downgrades current pre-approval. Repeat-action caps apply only to the same active correlation key. Queued execution still rechecks current policy; expired episodes cannot execute stale jobs.
5. The fixed deadline now requests a routine "Scheduled review". It never auto-releases money or restores access.
6. CONTRACT and implementation docs updated; own DEV only. PR must wait for Role 1 review, as requested.
7. Human acknowledgment, payroll's one-click cap and the Ironclad pre-approved response are preserved.

Correlated-report receipts/counts update immediately. Firm channel notices coalesce through the existing outbox dedupe into fixed 15-minute intervals (first additional report in each interval notifies immediately), preventing notification floods while keeping every accepted report available. Company alerts and business actions are not repeated.

## Track depth added
- Firm-only **Evidence and execution record**, inside Response safety: report receipts, finding provenance, relationship evidence, policy/version, approvals, response state, payment outcomes and audit events in one downloadable JSON record. Each section is capped at 500 with explicit truncation flags. No sandbox token/hash or bank details in the record.
- Owned sandbox actions record authorization state before/after and check time in the execution transaction. Simulations have no verification; Undo preserves the historical check and records the later change separately. This is not external IdP verification or cryptographic attestation.
- `scripts/sandbox/rehearse.mjs` now checks real HTTP denial, unrelated access, firm-only record access, authorized Undo, replay resistance and preservation of the historical execution check.
- Research, sources and the two-track demo narrative: `team-notes/pegasus-track-depth.md`. Comparable winners informed the complete evidence/action/verification loop; no claim that these were past winners of our exact tracks. No third-party code copied or executed.

## Validation
- **104 app/backend tests + 40 prompt/scorecard tests = 144 passing**, plus application/backend typechecks, ESLint and production build.
- New regressions cover durable correlated-ID replays, contained and idle/legacy episodes, the original payment window despite fresh reports, coalesced notification delivery, observation review/privacy, restored future pre-approval, truthful simulation records, and explicit export truncation.
- Full live demo rehearsal passed on Pegasus DEV: HTTP fire/replay, permissions, acknowledgment race, payment/ledger decisions, AP import, red-team reachability labels and automatic response. Rehearsal reset only Pegasus DEV.
- Extended live sandbox rehearsal passed: target HTTP 200→403; unrelated 200; after authorized Undo and replay both 200; policy `playbook:pause_shared_login:act:v1`; audit and firm-only record verified; historical check preserved. Observed 1,261 ms includes CLI/network/scheduling and is not a production benchmark.
- Browser checked: firm unconfirmed overview and continued Payments/Onboard navigation; expanded response record with verified check + Undo; JSON link payload matches backend record; Jamie's unconfirmed view still shows pending $480K and available $38K bill with no holds. Browser download-event capture timed out, so an actual saved browser download is not claimed; the JSON link payload was parsed and verified.

## Needs from others
- **Role 1 / Adrian:** review this PR, especially notify-only observations and fixed-interval firm notifications; merge through the normal Vercel/Convex pipeline after review. Do not deploy this branch onto `reminiscent-caribou-128` just to inspect it.
- **Role 2:** #110's grouped tabs are retained; unconfirmed reports have their own clear overview without treating their map edges as compromised, and still allow finance/onboarding navigation. Response record is within the existing safety panel.
- **Chatbot teammates:** Pegasus has not edited or integrated chatbot work; read CONTRACT's observation/correlated semantics if your bot consumes those APIs.
- Next meaningful depth extension needs one explicitly authorized identity-provider test tenant and credentials, followed by an independent access recheck. No live provider connection is claimed here.

## Operational limits
- Last production configuration check (earlier release): no `INCIDENT_WEBHOOK_SECRET`, `INCIDENT_AUTO_RESPONSE` or `RESPONSE_SANDBOX`. This turn did not enable any of them. Stage scenarios still evaluate confirmed policies; external-provider effects remain simulated.
- Pegasus DEV has `DEMO_MODE=true` and `RESPONSE_SANDBOX=true`; no detector/signing configuration was changed this turn. Dev now contains the completed sandbox rehearsal (pause undone) plus a synthetic notify-only report used for UI verification.
- Signing authenticates the sender, not its claims. Correlation limits repeated business effects, not network floods; per-source credentials and ingress limits remain deployment work. An enrolled unreliable detector can still cause a bad initial response.
- Keep all handoff/doc updates batched with the code PR. Do not self-merge or trigger repeated documentation-only production deploys.
