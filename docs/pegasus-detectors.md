# Scoped detector intake

Pegasus — 2026-10-24. Implemented on `feat/pegasus-source-controls`; production release requires Role 1 review.

Each detector can now have its own credential, exact asset and reporter allowlists, expiry, authority and request budget. An observation-only sender cannot authorize money holds or access changes. A confirm-capable sender must also explicitly submit `assessment: "confirmed"` and nonempty evidence references before existing company response policy is evaluated. Authentication establishes who sent a claim; it does not establish that the claim is true.

This adds depth to the existing Convex and finance/security response story. It is not a new shopping feature, a real Armadin integration, a Visa payment API integration, or a chatbot change.

## Authority and replay rules

- Credentials are generated with 32 cryptographically random bytes in an internal action. Only their SHA-256 hash is stored. Minting, rotating and revoking are operator-only internal functions, unavailable through public application mutations or the MCP tools.
- Register 1–20 exact existing asset names and 0–20 exact existing company domains. A supplied reporter must be on the allowlist, including a reporter derived from a finding. An empty domain list permits reports without a reporter; it is not a wildcard.
- Registration defaults to observation authority and a one-day expiry; explicit expiry must be in the next 30 days. Rotation preserves expiry, scope, source identity and quota. To change scope or authority, register a new source and revoke the old one.
- Credential validity, source scope, request budget, deduplication and accepted report effects are checked within one Convex mutation. Revocation cannot be missed between a separate authentication lookup and a later acceptance write.
- Receipt identity is `(authenticated source ID, externalId)`. Two sources can use the same external ID and retain independent evidence receipts. Rotation cannot replay an old effect. A duplicate returns its original effective assessment even if the resent body changes it.
- Episode correlation remains global to the asset and response class. Adding sources or changing report IDs does not restart actions, payment holds or the fixed review deadline within an active episode. Existing containment/inactivity rules still determine when a genuinely new episode may start.
- The official Convex rate-limiter component gives each source a burst capacity of 10 requests and refills 30 requests per minute. Scope failures and replays consume this budget; an inactive or unknown credential is refused. Rotation does not reset the budget. A limited source gets HTTP 429 plus `Retry-After`, while another source keeps its own capacity.
- The executor rechecks the original detector's active confirm authority before a queued automatic step runs. Revocation or expiry cancels that queued step. A separate company user's explicit approval uses that person's authority and remains subject to the existing execution policy checks.
- Revocation never releases already-held payments or undoes completed access changes. Controllers still review held money, and authorized company users retain Undo. Firm confirmation of an observation remains an independent human decision.

Convex provides [transactional mutations](https://docs.convex.dev/functions/mutation-functions) behind the [HTTP action](https://docs.convex.dev/functions/http-actions). These limits bound accepted work per registered source; they are not a claim of complete DDoS protection. Legacy HMAC intake is still available and does not acquire these source-specific quotas or scopes.

## Operator setup

Select and verify your own DEV deployment first. Pegasus uses `dev:tangible-koala-842`; never run rehearsals on Adrian DEV or production. The examples below return a secret once: store it in the detector's secret configuration, not in source, a browser bundle, a handoff, a recording or a PR.

```sh
npx convex run detectors:mint '{"name":"Payroll observer","assetNames":["Brightline Payroll"],"reporterDomains":["pinecreststaffing.example"],"mode":"observe"}'
npx convex run detectors:rotate '{"sourceId":"<source ID from mint>"}'
npx convex run detectors:revoke '{"sourceId":"<source ID from mint>"}'
```

The caller sends `Authorization: Bearer <detector token>` to `POST /incident`, with the existing incident JSON. Omit `assessment` for an observation. The server derives source identity from the credential; JSON `sourceId`, `sourceName`, or a finding's declared `source` cannot establish authority. `finding.source: "armadin"` remains the sender's claim, not provider verification.

An Authorization header selects this authentication path exclusively. Invalid, rotated, expired or revoked credentials cannot fall back to a valid HMAC signature or a built-in demo ID. Without Authorization, legacy HMAC rules (`INCIDENT_WEBHOOK_SECRET`, and `INCIDENT_AUTO_RESPONSE` for enrolled confirmation) and the four presenter-gated demo scenarios retain their existing behavior. Named-source `confirm` registration is explicit per-source enrollment; it does not require the legacy global enrollment flag.

Success adds `assessment: "observation" | "confirmed"` to the existing `{incidentId, duplicate, correlated}` JSON. Refusals use 400 for invalid fields, 401 for inactive credentials, 403 for scope, 404 for unknown data, 413 for oversized bodies, and 429 for quota. Scope and credential checks happen before deduplication.

The body is capped at 32 KiB of streamed UTF-8 bytes, including when Content-Length is absent; malformed UTF-8 and JSON arrays are rejected. Identifier/asset strings are capped at 200 characters, reporter domains at 253 and summaries at 4,000. Existing finding and evidence-reference bounds still apply.

## Private evidence and compatibility

`detectors.list({})` returns the latest 100 source metadata records only to firm users, without credential hashes. Expiry is a timestamp; the query does not read wall-clock time. Companies receive an empty list. `responseEvidence.getRecord` includes authenticated source ID/name and each receipt's requested/effective assessment only in the existing firm-only record. It remains an ordinary recorded audit history, not cryptographic attestation.

Company `blastRadius.listIncidents` results now use the opaque local incident ID as `externalId`, because arbitrary sender IDs can contain reporter names. Firm callers keep the raw external ID. The field remains a string for existing export filenames. Company alerts still omit source names, reporter identity and raw report text.

Existing rows without a source ID remain in the legacy namespace, using the new compound indexes with an undefined source ID. No data backfill is required. The demo scorecard selects only this legacy namespace. `seed.reset` deletes detector registrations along with other demo state, so resetting invalidates issued detector credentials.

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

The original rehearsal resets its selected deployment before and after; verify that target first. The new detector rehearsal refuses production, Adrian DEV, deploy keys and mismatched deployment/URL. It does not reset, deploy or change flags; it creates synthetic observations and owned sandbox resources, captures credentials only in memory and revokes every created detector in `finally`. A cleanup failure fails the run. Review the saved JSON for observed checks and limitations; synthetic fixtures do not establish real-world detection accuracy.
