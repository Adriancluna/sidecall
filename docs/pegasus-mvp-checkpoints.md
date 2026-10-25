# Sidecall MVP checkpoints

Updated 2026-10-24 by Pegasus. User authorized step-by-step execution after the planning session. This is the implementation acceptance plan, not a claim that proposed features have shipped.

## Agreed product promise

Sidecall coordinates a company-approved response to shared-vendor incidents: it protects affected payments, requests targeted access restrictions, and keeps unrelated approved business moving. Payment and credential incidents remain distinct policy paths. Retain the bounded invoice assistant; do not add shopping discovery, another chatbot, or unrelated features to pursue Visa.

## Checkpoint 1: verified baseline and scope

Fresh read-only checks:

- GitHub main is `fd8839e7954638388f5c3328d93be91d7e21912c` (#134, original map default; G6 opt-in).
- GitHub's Vercel status for that commit is successful: https://vercel.com/adriancluna23-3084s-projects/sidecall/Fb1wMUqCzDaHeocEJbN8ZHe9nASD . This does not establish the production alias, backend version/configuration, or end-to-end acceptance.
- PR #132 is OPEN at `59cf011e2b0d5b786881f99bce83d5e2084855c3`; GitHub reports no posted reviews/comments. The user-supplied Claude note separately requests console visibility and live-execution enable-switch fixes; accept these as the next implementation scope.
- Local checkout is `feat/pegasus-purchase-console`, clean before this checkpoint documentation. Its existing guide describes an older source snapshot; newer map/release facts must be reconciled before final delivery.
- Existing proof artifacts describe successful DEV runs, not fresh tests in this session and not production acceptance.
- External identity actions in the inspected source remain simulated; the owned sandbox is real enforcement only on a Sidecall-owned resource. No outbound identity-provider receiver is established by this inspection.
- Pegasus DEV remains `tangible-koala-842`; Adrian owns other backends and production release. Do not run reset/rehearsal fixtures on production from Pegasus.
- Test-tenant availability is unknown. Asked Ashwa for provider and teammate with admin access; no credentials requested. Choose one provider only after access is established.

Checkpoint status: source baseline and scope recorded; production backend/alias verification and test-tenant selection remain explicit open items. Console fixes can proceed independently; no external account operation before a dedicated owned test target is established.

## Checkpoint 2: release-safe purchasing console

Hide the unavailable console without displacing ordinary bill controls. Add a dedicated default-off backend switch for live model execution, checked at launch and before later model/tool work. Preserve already-committed outcomes. Verify disabled execution, permissions, cancellation, normal bill visibility and enabled approved purchase behavior. Maintain a reviewable candidate; production is not changed by completing local tests.

## Checkpoint 3: signed command and real test-account effect

Pegasus owns implementation in this session. Sidecall signs a bounded company/target/action/command ID; a separate company receiver holds provider credentials and enforces its own allowlist, freshness, persistent duplicate handling, limits and disable switch. Pause and restoration have distinct command identities. Retry retrieves a durable result; changed payload under the same command ID is refused. Timeout means confirmation unknown, with reconciliation before further action. Restoration checks prior state, ownership and other active restrictions. One provider and dedicated disposable account only. Completion requires observed provider state and unrelated access remaining available, not just an HTTP success.

## Checkpoint 4: abuse and continuity proof

Verify untrusted report refusal; repeated incident correlation without repeated disruption; forged/expired/altered signal refusal; duplicate command stability; unlisted-account refusal; lost-response reconciliation; stale restoration refusal; unrelated access and approved purchase continuing. Record precise observed results, not universal security guarantees or an instantaneous-session-revocation claim.

## Checkpoint 5: final deployment and team understanding

Verify the selected frontend/backend/configuration together before final release. Rehearse payment incident, credential incident and unrelated approved purchasing as distinct scenes twice on the intended final setup. Update guide, short briefing, real/simulated matrix and track declarations to match the released version. Convex/Hyphenate have clear fit; Armadin benefits from response proof; Visa's business-purchasing interpretation still needs sponsor confirmation. Recording/DaVinci is last, after acceptance, with a three-minute narrative and evidence available for Q&A.

## Solo execution and open dependencies

The user has superseded the proposed team assignments: Pegasus works solo in this session, with no further handoffs or delegation. Ashwa has now created an Okta Integrator Free Plan tenant and saved receiver-only credentials privately. Live local receiver proof is recorded below; website delivery remains a separate prerequisite.

Checkpoint 2 implementation is complete locally: the default-off PURCHASE_CONSOLE_LIVE switch guards job admission, worker claim, each model admission and tool execution. Unavailable empty consoles render nothing; saved outcomes and Stop remain accessible. Eight additional backend regressions and three rendered-UI cases pass. Full release/deployment acceptance remains pending; no new paid model run is claimed.

The candidate now includes main fd8839e. Validation after integration: 267 application/backend/rendered-UI tests pass, lint and frontend build pass, and backend TypeScript passes; the 70 Node checks also passed before this UI-only main integration. Existing bundle-size warnings remain. No deployment or new paid model proof is claimed.

## Checkpoint 3A: receiver foundation, October 24 — implemented locally

[Receiver code and simple operating guide](../integrations/company-receiver/README.md) implement authenticated commands/receipts, persistent SQLite history and pause budgets, bounded HTTP handling, an Okta adapter, status reconciliation and company-local restoration consent. The sender transport checks matching signed receipts and returns unknown on lost/untrusted replies without retrying a write. The receiver is a separate Node 24 service needing persistent storage, not an ephemeral Vercel function.

Validation: 26 new receiver tests pass, including actual loopback HTTP and controlled provider fault cases; 267 existing application/backend/rendered-UI tests, lint, frontend build and backend TypeScript pass. Existing bundle-size warnings remain. No real Okta API request, new paid model call, deployment, handoff or delegation occurred in this checkpoint.

Progress toward the MVP: the receiving half and transport contract now exist and are tested. The final external response is not yet implemented end to end. Unknown operations remain blocked for manual review if read-back cannot establish the desired state; restoration never assumes an uncertain suspension belongs to us.

Website sync: Convex's response executor and the response UI do not yet use this receiver. They still report the existing simulated/owned-sandbox modes. Neither this receiver nor the previous console switch has been deployed in this session. Do not label the public website as externally connected.

Human progress: the user's screenshot now shows a signed-in Okta Admin Console on the Integrator Free Plan, with one active user. Signup is complete; API connectivity and test-account behavior are not yet verified. Prepared a hidden-entry local credential launcher: it stores a receiver-only token and generated signing secret outside Git, mode 0600, with provider actions OFF and no target allowlist. Verified parsing with Node, URL normalization, file permissions and no-overwrite behavior using dummy credentials. The next human step is creating a dedicated test-tenant API token and entering it into that launcher; no key should be sent in chat. A dedicated non-admin test user and an HTTPS receiver route remain outstanding.

Next checkpoint: connect Convex's authorized response jobs to the protocol, persist command/receipt state, and update the response UI for pending/unknown/refused/confirmed outcomes. Then configure and test one disposable real account and unrelated access. No external-account success will be claimed before that test.

## Checkpoint 3B: real disposable Okta effect — passed October 24

Pegasus verified the saved token with read-only API access, checked configuration mode 0600, and created two labelled disposable accounts with no assigned admin roles. The local signed-HTTP harness passed eight checks against the real Okta tenant, including target suspension, unaffected control-account state, restart-safe duplicate handling, refusal of unapproved restoration, approved synthetic-test cleanup, forged/unlisted refusal, and disable behavior. Exactly one suspend, one session-revocation request and one unsuspend occurred. Independent final reads show the original administrator and both disposable accounts ACTIVE. [Redacted evidence](evidence/okta-receiver-live-proof.json).

Progress: the signed receiving half now has actual external-provider evidence, replacing the earlier test-double-only claim. All 26 receiver regressions and lint/typecheck also pass. No existing frontend/backend source changed at this checkpoint.

Limits and silent failures: an acknowledged revocation request is not proof of terminating a live application session; no test-user sessions were established. A network timeout can hide a completed operation and must retain its original command ID for reconciliation. A valid historical receipt does not prove the account is still in that state later. The standalone process needs persistent storage and a reachable HTTPS route before Convex can call it.

Website sync: local receiver proof only. Convex policy/executor jobs and response UI are still not connected, and no production or DEV deployment happened. Persistent receiver configuration stays disabled with an empty allowlist; only the isolated local proof process had effects enabled for the disposable target, and that process is stopped.

Next: integrate durable outbound commands/receipts with the existing authorized Convex response workflow, represent pending/unknown/refused/confirmed truthfully in the UI, then verify the full DEV path through an HTTPS receiver route. No additional human action is required to finish this checkpoint; any hosting or operator setup needed for the next checkpoint must be surfaced explicitly.
