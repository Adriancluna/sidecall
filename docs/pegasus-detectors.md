# Scoped detector intake

Pegasus — 2026-10-24. Implemented on `feat/pegasus-source-controls`; production release requires Role 1 review.

Each detector can now have its own credential, exact asset and reporter allowlists, expiry, authority and request budget. An observation-only sender cannot authorize money holds or access changes. A confirm-capable sender must also explicitly submit `assessment: "confirmed"` and nonempty evidence references before existing company response policy is evaluated. Authentication establishes who sent a claim; it does not establish that the claim is true.

This adds depth to the existing Convex and finance/security response story. It is not a new shopping feature, a real Armadin integration, a Visa payment API integration, or a chatbot change.

## Authority and replay rules

- Credentials are generated with 32 cryptographically random bytes in an internal action. Only their SHA-256 hash is stored. Minting, rotating and revoking are operator-only internal functions, unavailable through public application mutations or the MCP tools.
- Register 1–20 exact existing asset names and 0–20 exact existing company domains. A nonempty reporter allowlist requires a listed reporter on every report, including a reporter derived from a finding; omission is a 403. An empty domain list permits only reports without a reporter; it is not a wildcard for arbitrary reporters.
- Registration defaults to observation authority and a one-day expiry; explicit expiry must be in the next 30 days. Rotation preserves expiry, scope, source identity and quota. To change scope or authority, register a new source and revoke the old one.
- Credential validity, source scope, request budget, deduplication and accepted report effects are checked within one Convex mutation. Revocation cannot be missed between a separate authentication lookup and a later acceptance write.
- Receipt identity is `(authenticated source ID, externalId)`. Two sources can use the same external ID and retain independent evidence receipts. Rotation cannot replay an old effect. A duplicate returns its original effective assessment even if the resent body changes it.
- Detector external IDs cannot equal one of the four built-in scenario IDs or start with `review:`; these namespaces belong to stage scenarios and internal human-review decisions. Reserved IDs receive 400 before any receipt or incident is created.
- Episode correlation remains global to the asset and response class. Adding sources or changing report IDs does not restart actions, payment holds or the fixed review deadline within an active episode. Existing containment/inactivity rules still determine when a genuinely new episode may start.
- The official Convex rate-limiter component gives each source a burst capacity of 10 requests and refills 30 requests per minute. Scope failures and replays consume this budget; an inactive or unknown credential is refused. Rotation does not reset the budget. A limited source gets HTTP 429 plus `Retry-After`, while another source keeps its own capacity.
- The executor rechecks the creating detector's active confirm authority before **every** queued step, including one already approved by a company user. A company approval does not replace the evidence's source authority. Revoked-source waiting steps show a generic authorization warning and no approval button; direct approval attempts against revoked/expired sources expire the step and return `detector_authority_inactive`. Queued steps also expire at execution. Queries remain clock-free: expiry is enforced at approval/execution, while revocation changes the subscribed plan immediately. Revocation does not scan or rewrite every historical incident.
- Revocation never releases already-held payments or undoes completed access changes. Controllers still review held money, and authorized company users retain Undo. Firm confirmation of an observation remains an independent human decision.

Convex provides [transactional mutations](https://docs.convex.dev/functions/mutation-functions) behind the [HTTP action](https://docs.convex.dev/functions/http-actions). Legacy HMAC intake now has its own shared `legacy-hmac` bucket, also 10 burst / 30 requests per minute, checked in the same mutation as receipt/effect writes. It has no named-source scopes; multiple legacy senders share that one bucket. Named sources retain independent buckets. Valid signed replays consume quota and return 429 with `Retry-After` when exhausted. The unsigned presenter/demo path and internal operator intake do not consume the legacy bucket. JSON cannot select or bypass the transport budget.

These quotas bound accepted application work; they are not complete DDoS protection. Well-formed unknown or inactive credentials still cause one indexed credential lookup and return 401 without a quota. A shared limiter after that lookup would not remove the authentication read and would add a shared write target; ingress/global traffic protection remains outside this implementation.

**Correlation authority boundary:** execution and approval check the incident's **creating** source, not every correlated receipt. A detector report correlated into a legacy/demo episode does not give that episode a detector source to recheck. Conversely, revoking a detector that created an episode disables its pending steps even if a second source also supplied evidence. The firm must review evidence and obtain a new independently confirmed episode when necessary; the system does not automatically transfer authority between receipts.

## Operator setup

Select and verify your own DEV deployment first. Pegasus uses `dev:tangible-koala-842`; never run rehearsals on Adrian DEV or production. The examples below return a secret once: store it in the detector's secret configuration, not in source, a browser bundle, a handoff, a recording or a PR.

```sh
npx convex run detectors:mint '{"name":"Payroll observer","assetNames":["Brightline Payroll"],"reporterDomains":["pinecreststaffing.example"],"mode":"observe"}'
npx convex run detectors:rotate '{"sourceId":"<source ID from mint>"}'
npx convex run detectors:revoke '{"sourceId":"<source ID from mint>"}'
```

The caller sends `Authorization: Bearer <detector token>` to `POST /incident`, with the existing incident JSON. Omit `assessment` for an observation. The server derives source identity from the credential; JSON `sourceId`, `sourceName`, or a finding's declared `source` cannot establish authority. `finding.source: "armadin"` remains the sender's claim, not provider verification.

Any Authorization header selects the detector authentication path exclusively, including a header inserted by a proxy in front of a legacy HMAC sender. Such a sender must remove that header or adopt a valid detector credential. Invalid, superseded, expired or revoked credentials cannot fall back to a valid HMAC signature or a built-in demo ID. Replays using these credentials receive 401, not `duplicate`; a newly rotated credential retains the source's replay namespace. Without Authorization, legacy HMAC rules (`INCIDENT_WEBHOOK_SECRET`, and `INCIDENT_AUTO_RESPONSE` for enrolled confirmation) and the four presenter-gated demo scenarios retain their authority behavior, with the new HMAC quota described above. Named-source `confirm` registration is explicit per-source enrollment; it does not require the legacy global enrollment flag.

Success adds `assessment: "observation" | "confirmed"` to the existing `{incidentId, duplicate, correlated}` JSON. Refusals use 400 for invalid fields, 401 for inactive credentials, 403 for scope, 404 for unknown data, 413 for oversized bodies, and 429 for quota. Scope and credential checks happen before deduplication.

The body is capped at 32 KiB of streamed UTF-8 bytes, including when Content-Length is absent; overflow now returns **413 rather than the legacy 400**. Invalid UTF-8 and JSON arrays return 400. Identifier/asset strings are capped at 200 characters, reporter domains at 253 and summaries at 4,000; the `externalId` and summary caps are new for legacy senders too. Existing finding and evidence-reference bounds still apply.

## Private evidence and compatibility

`detectors.list({})` returns the latest 100 source metadata records only to firm users, without credential hashes. Expiry is a timestamp; the query does not read wall-clock time. Companies receive an empty list. `responseEvidence.getRecord` includes authenticated source ID/name and each receipt's requested/effective assessment only in the existing firm-only record. It remains an ordinary recorded audit history, not cryptographic attestation.

Company `blastRadius.listIncidents` results now use the opaque local incident ID as `externalId`, because arbitrary sender IDs can contain reporter names. Firm callers keep the raw external ID. The field remains a string for existing export filenames. Company alerts still omit source names, reporter identity and raw report text.

Existing rows without a source ID remain in the legacy namespace, using the new compound indexes with an undefined source ID. No data backfill is required. The demo scorecard selects only this legacy namespace. Demo Reset (`seed.resetDemo`, or the internal `seed.run`) deletes detector registrations **after incidents and report receipts**, so a batched reset retains the source until its dependent rows are removed. Reset invalidates all issued detector credentials; mint new ones afterwards.

The existing presenter key check is outside this change: it uses a plain equality comparison, and demo scenarios are open on a `DEMO_MODE=true` deployment when `PRESENTER_KEY` is unset. Role 1 owns the planned constant-time comparison update. This branch does not change presenter configuration or claim to address that pre-existing behavior.

## Reproduce validation

```sh
npm test
npm run lint
npx tsc -p convex/tsconfig.json --noEmit
npm run build
node --test prompts/writing.test.mjs scripts/scorecard/score.test.mjs
```

After deploying to your verified own DEV with existing `DEMO_MODE` and `RESPONSE_SANDBOX` enabled:

```sh
node scripts/rehearsal/run.mjs
node scripts/detectors/rehearse.mjs --report docs/pegasus-detector-rehearsal.json
```

The original rehearsal resets its selected deployment before and after; verify that target first. The new detector rehearsal refuses production, Adrian DEV, both `CONVEX_DEPLOY_KEY` and its `CONVEX_DEPLOYMENT_TOKEN` alias, and mismatched deployment/URL. It does not reset, deploy or change flags; it creates synthetic observations and owned sandbox resources, captures credentials only in memory and revokes every created detector in `finally`. It also checks omitted required reporters (403), reserved scenario/review identifiers (400), and a revoked source's waiting company approval through real authenticated queries and a refused approval mutation. A cleanup failure fails the run. The saved live JSON predates these release-review fixes; they have additional local regression tests and require Role 1's fresh live rehearsal before merge. Synthetic fixtures do not establish real-world detection accuracy.
