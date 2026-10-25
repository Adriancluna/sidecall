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

Hide the unavailable console without displacing ordinary bill controls. Add a dedicated default-off backend switch for live model execution, checked at launch and before later model/tool work. Preserve already-committed outcomes. Verify disabled execution, permissions, cancellation, normal bill visibility and enabled approved purchase behavior. Update #132 for Role 1 review; no self-merge.

## Checkpoint 3: signed command and real test-account effect

Coordinate ownership before editing response/schema files. Sidecall signs a bounded company/target/action/command ID; a separate company receiver holds provider credentials and enforces its own allowlist, freshness, persistent duplicate handling, limits and disable switch. Pause and restoration have distinct command identities. Retry retrieves a durable result; changed payload under the same command ID is refused. Timeout means confirmation unknown, with reconciliation before further action. Restoration checks prior state, ownership and other active restrictions. One provider and dedicated disposable account only. Completion requires observed provider state and unrelated access remaining available, not just an HTTP success.

## Checkpoint 4: abuse and continuity proof

Verify untrusted report refusal; repeated incident correlation without repeated disruption; forged/expired/altered signal refusal; duplicate command stability; unlisted-account refusal; lost-response reconciliation; stale restoration refusal; unrelated access and approved purchase continuing. Record precise observed results, not universal security guarantees or an instantaneous-session-revocation claim.

## Checkpoint 5: final deployment and team understanding

Role 1 reviews/releases the selected batch and verifies frontend/backend/configuration together. Rehearse payment incident, credential incident and unrelated approved purchasing as distinct scenes twice on the intended final setup. Update guide, short briefing, real/simulated matrix and track declarations to match the released version. Convex/Hyphenate have clear fit; Armadin benefits from response proof; Visa's business-purchasing interpretation still needs sponsor confirmation. Recording/DaVinci is last, after acceptance, with a three-minute narrative and evidence available for Q&A.

## Solo execution and open dependencies

The user has superseded the proposed team assignments: Pegasus works solo in this session, with no further handoffs or delegation. No teammate has an Entra/Okta test tenant. Tenant setup remains a prerequisite for external-provider proof; existing owned-sandbox tests do not substitute for it.

Checkpoint 2 implementation is complete locally: the default-off PURCHASE_CONSOLE_LIVE switch guards job admission, worker claim, each model admission and tool execution. Unavailable empty consoles render nothing; saved outcomes and Stop remain accessible. Eight additional backend regressions and three rendered-UI cases pass. Full release/deployment acceptance remains pending; no new paid model run is claimed.

The candidate now includes main fd8839e. Validation after integration: 267 application/backend/rendered-UI tests pass, lint and frontend build pass, and backend TypeScript passes; the 70 Node checks also passed before this UI-only main integration. Existing bundle-size warnings remain. No deployment or new paid model proof is claimed.

Next: implement the isolated signed-command/receiver protocol with durable receipts and reconciliation. Establish a dedicated test tenant before claiming an external account effect. No external credentials are available or requested in chat.
