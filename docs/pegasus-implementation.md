# Pegasus implementation: Hyphenate + Armadin

Author: Pegasus · 2026-10-24 · latest review fixes on `fix/pegasus-episode-depth` (PR review before merge)

## What this changes

Sidecall separates an incoming signal from authority to disrupt operations. A signed request authenticates its sender; it does not by itself establish a compromise. Existing built-in demo scenarios still exercise the confirmed response path.

### Incident response under repeated reports

- Signed `/incident` reports default to `observation`: linked companies receive explicitly unconfirmed, notify-only alerts, with no payment holds or response steps. The firm can see and review the report; map payloads do not claim a validated compromise.
- Automatic confirmation requires the operator to enroll the detector with `INCIDENT_AUTO_RESPONSE=true`, a signed body containing `assessment: "confirmed"`, and 1–20 `evidenceRefs`. References are provenance pointers, not independently validated proof; enrolling an unreliable detector remains a risk.
- The server derives a correlation key from the actual asset and response class, never the sender's event ID. While uncontained and reported within 30 days, fresh IDs return `correlated:true` and update the existing episode without repeating fan-out, resetting holds or moving the review deadline. Each accepted ID has a durable receipt: its replay returns `duplicate:true`, even after containment. Firm channel notices coalesce into fixed 15-minute intervals; receipts update immediately.
- Observation and confirmed episodes use different keys, so low-grade signals cannot suppress a confirmed compromise. A recent observation also cannot hide an existing active incident from new payment requests.
- A fixed 15-minute deadline escalates once. It does not pay money, restore access, dismiss evidence or declare containment. It is a prototype policy value, not a measured operational SLA.
- A new confirmed report after containment or 30 idle days creates a fresh episode and evaluates current company policies. Historical actions do not permanently disable pre-approval. Replays within the same active episode cannot reverse an undo.
- Credential-only findings never trigger vendor-payment holds, including when mapped onto a payee asset.
- Holds apply to the incident's asset and opted-in companies. Payments to other vendors continue unchanged. Already paid/rejected payments cannot be re-held. Only incidents within 30 days of their original creation hold new payments; already-held payments continue to need a controller decision.
- This is not a network flood defense: request-volume controls at the ingress and per-source credentials/revocation remain deployment work. The guard limits repeated business side effects, not all resource consumption or all false positives from a compromised trusted detector.

### Payment investigation

Company users get **Investigate payments** under Held payments; the firm gets it under Payments & controls log and can select a company. Paste plain-text invoice/bank-change evidence, using masked account details. PDF/OCR and email-provider ingestion are not implemented.

The deterministic parser accepts `Vendor:`, `Invoice:`, `Amount:` and `Account:` / `New account:` fields. Unstructured inputs can use the existing `AI_LIVE` + `ANTHROPIC_API_KEY` configuration. Model extraction returns only literal source spans, validated against the supplied text, and has no tools or authority to mutate vendor data or payments. Model failures fall back to an explicit review-required packet. Source consistency does not prove a document is authentic.

The reconciler compares normalized exact vendor identity, invoice reference and amount, the last account confirmed by phone, and this company's payment context. Missing/contradictory fields, ambiguous vendors, unmatched invoices and bank changes require review. `consistent` means fields reconcile; it does not mean safe to pay. Account suffixes cannot uniquely identify a bank account and are never used to authorize payment.

The packet contains quotes, reasons, trusted contact from existing records, related payment IDs and measured processing duration. Existing hold/approval workflows remain the only payment decision path. The company-scoped CSV exports actual queue statuses and neutralizes spreadsheet formulas. Duplicate source submissions reuse the existing packet. No customer content is sent to a model unless live AI is enabled.

CSV AP imports now reject duplicate vendor references and multiple possible payees (a vendor with one payee plus credential assets still resolves), and no longer match a vendor by name prefix. This intentionally trades recall for avoiding silent payee misidentification.

### Owned sandbox security demonstration

`GET /sandbox/resource` checks a randomly generated test bearer token against hashed credentials in `sandboxResources`. Set `RESPONSE_SANDBOX=true` and provision an explicitly owned test resource. The existing response executor really pauses that resource's access or revokes its token. This is a functional authorization boundary in Sidecall's own sandbox, not an Okta/Entra connector or an Armadin integration.

- With no matching provisioned resource, identity-provider actions remain simulated and are labelled accordingly.
- Pause can be undone by the company's existing authorized IT/controller role.
- Revoked tokens cannot be resurrected by Undo; provisioning a fresh token is required.
- The generated token must be `sc_test_` followed by 64 random hexadecimal characters; store only its SHA-256 in provisioning arguments.
- Provisioning is an internal function and requires both `DEMO_MODE=true` and `RESPONSE_SANDBOX=true`; never use real identity-provider or bank tokens.

Example provisioning (on your own configured development deployment):

```sh
npx convex run sandbox:provision '{"companyDomain":"cedarridge.example","assetName":"Ironclad shared admin account","tokenHash":"<sha256 of fresh random test token>"}'
```

Call the sandbox resource with that test token before and after firing the Ironclad shared-login scenario. Expected: Cedar access 200 → 403, Summit's separate-access resource remains 200, approved Undo restores Cedar access, repeated reports do not suspend it again. The regression test exercises these same registered handlers and response mutations locally.

### Evidence and execution record

Open **Timeline & close-out → Response safety → Evidence and execution record** to download a firm-only JSON case record linking report receipts, relationship evidence, declared findings, policy versions, approvals, execution state, payments and audit events. Sandbox steps record authorization state before/after in the same transaction; simulations explicitly have no verification. A historical check remains historical after Undo. Each section has a 500-row cap with a visible truncation flag. No tokens, hashes or bank details are exported; this is not cryptographic attestation or a real identity-provider test.

## Demonstration for both tracks

1. Open the investigation tab and paste a previously unseen invoice/email with a changed account and a malicious instruction. Show source quotes, trusted contact and review-required outcome; the instruction has no payment authority.
2. Send low-grade reports with different IDs; show one observation episode and zero new holds/actions.
3. Submit confirmed vendor-compromise evidence through the enrolled detector (or use the built-in vendor scenario) and show the scoped payment hold; separately run the Ironclad credential scenario to show sandbox access changing from 200 to 403 without freezing vendor payments.
4. Show an unrelated company/resource still functioning, repeat the report, then show that neither the deadline nor the controller's decision changed.
5. Complete the existing controller verification and export the actual queue; show the audit trail and a legitimate unfamiliar invoice case.

Keep two narratives over the same implementation: Hyphenate = evidence gathering and reconciliation with payment controls; Armadin = scoped automated response, resistance to response abuse, and a demonstrated authorization boundary. Do not claim sponsor certification, measured real-world accuracy, real customers or a live identity-provider integration.

## Integration and remaining external requirements

- Integrated upstream main through `615713d`, including #98's red-team evidence labels and "What to check"; regenerated Convex declarations with an actual development deployment.
- GitHub write access, Adrian's Vercel team/project, and Convex project access are verified. Application integration is PR #103; main merges run the existing Vercel + Convex deployment pipeline.
- Pegasus's isolated development deployment is `adriancluna23:sidecall:dev/pegasus-integration` (`tangible-koala-842`). It has demo auth, `DEMO_MODE=true` and `RESPONSE_SANDBOX=true`; test signing/enrollment settings were removed after the HTTP rehearsal. Never reset production or another contributor's development database.
- Production detector enrollment is intentionally explicit: generic signed signals remain observations until the operator configures `INCIDENT_AUTO_RESPONSE=true`. Provisioned sandbox resources are development-only; existing external-provider actions remain simulated.
- Live model extraction still requires the team's dev `AI_LIVE` and `ANTHROPIC_API_KEY` configuration and a separate live validation. Structured text extraction is verified without that key.
- Role 2's combined council UI (#110) places investigation inside Payments, response safety inside Timeline/close-out, and company investigation inside Held payments; the review fixes preserve that layout. The teammates' chatbot is outside this change.
- Keep source enrollment credentials separate per detector in a production implementation; the prototype retains the existing shared HMAC key.

## Previous release validation (PR #103; latest review-fix results are in handoff/pegasus.md)

- 95 application/backend tests passed: 54 existing backend tests, 12 MCP tests, 29 Pegasus regression tests. See `docs/pegasus-test-results.json` for individual outcomes. An additional 40 prompt/scorecard tests passed (135 total). These are authored regression cases, not an accuracy benchmark.
- Application typecheck, backend typecheck, ESLint and production build passed; actual Convex dev deployment and code generation succeeded.
- The existing full live demo rehearsal passed on Pegasus's own development backend, including permissions, acknowledgment races, payment/ledger checks, onboarding and automatic response.
- Signed HTTP rehearsal: 100 distinct weak-report IDs produced one observation, unchanged company payment queue and unchanged review deadline; a separate confirmed report held the expected payment; ten further confirmed IDs preserved its deadline and the controller's release.
- Owned sandbox rehearsal: Cedar access changed from HTTP 200 to 403; Summit's separate resource remained HTTP 200. Observed end-to-end duration was 1,223 ms, including CLI, network and scheduling overhead; this is not a production latency benchmark.
- Signed-in browser check: the firm investigation produced a review-required packet for the synthetic changed-account example, displayed the trusted callback number and literal source quotes, and the safety panel displayed the correlated episodes. Live model extraction and external IdP actions remain unverified.
- On a clean, separately seeded own DEV deployment with DEMO_MODE and RESPONSE_SANDBOX enabled, run `node scripts/sandbox/rehearse.mjs` for the HTTP access-before/access-after demonstration. It refuses production, generates fresh test tokens in memory, and never resets data or changes deployment configuration.
