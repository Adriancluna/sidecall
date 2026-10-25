# Purchasing authority and decision evidence

Author: Pegasus · 2026-10-24 · candidate for Role 1 review

Sidecall's purchasing flow connects a controller's saved instructions to the company's current vendor incident state. An assistant can request a purchase, but Convex decides whether the saved bill, payee, executor, expiry and available budget still permit it. Settlement uses the synthetic double-entry ledger. This is our interpretation of secure business purchasing for the Visa track, not confirmation of eligibility or a Visa integration.

## Research translated into implementation

| Primary source | Useful principle | Sidecall implementation |
|---|---|---|
| [Visa Intelligent Commerce](https://developer.visa.com/capabilities/visa-intelligent-commerce/overview) and [Trusted Agent Protocol](https://developer.visa.com/docs/trusted-agent-protocol/trusted-agent-protocol-specifications) | Agent identity and consumer instructions need a verifiable connection to a purchase. | A controller may bind approval to one active AP agent, with saved bill and independently verified payee facts. This is an application-level record, not a TAP signature or Visa credential. |
| [AP2 specification](https://ap2-protocol.org/ap2/specification/) and [agent authorization](https://github.com/google-agentic-commerce/AP2/blob/main/docs/ap2/agent_authorization.md) | Approval should describe the transaction the user actually intended. | Amount, vendor, description, due date and payee-record identity are compared again when requesting payment. A new record with the same account suffix still invalidates approval. No AP2 credentials are issued. |
| [Convex serializable mutations](https://docs.convex.dev/database/advanced/occ) | Concurrent requests must observe a coherent decision and commit together. | Authority checks, duplicate detection, budget consumption, payment, receipt and ledger entry share one mutation. Competing purchases cannot independently consume the same remaining budget. |
| [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests) | A retry should retrieve an earlier result; a changed request must not inherit it. | Optional request IDs are scoped to company plus authenticated human or agent. Exact argument retries return the saved result; another bill or expected approval under the same ID is refused. |
| [OWASP prompt injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/) and [Claude tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls) | Source documents are untrusted, and tool execution requires independent controls. | A standalone real-Claude proof reads synthetic invoice/email fixtures and calls the deployed MCP tools. The model receives no approval, payee-edit, release or operator tool. Its request still faces all backend checks. |

The useful combination is selective continuity: show which purchase still has authority, what fact invalidated another purchase, and why an unrelated company's work can continue. These are established engineering patterns applied together, not a newly invented payment protocol.

## Product flow

1. In the existing Bills panel, a demo controller loads the optional Northstar samples and approves selected bills with a per-purchase limit, total budget and expiry within 24 hours.
2. Approval can cover the company's AP users and their agents, or one explicitly selected active agent; the selected scope is visible before approval.
3. The AP clerk or scoped MCP agent requests payment. Opening the eligibility inspector never requests payment or reserves money.
4. A valid request settles in the demo ledger; an invalid automatic request records the failed checks and spends nothing. A vendor with no purchasing approval keeps the existing manual request/hold behavior.
5. The controller can inspect the immutable decision snapshot or export the latest 50 decisions with their original approvals and saved quotes; truncation is explicit.

The newest approval for a company/vendor supersedes older grants. Revoking or expiring it does not reactivate an older grant. Human and assistant quotas are separate. A confirmed vendor incident removes automatic purchase eligibility even if the company's ordinary hold rule is disabled; the independent controller path remains available. Unconfirmed reports alone do not grant payment-hold authority.

## Receipt and retry boundaries

Each automatic decision records USD cents, evaluation time, expected and observed bill/payee facts, every check's result, executor scope, actual agent when present, and spent budget before/after. Successful decisions also identify the payment and ledger entry. Historical snapshots are not rewritten when live facts change.

`request_payment` and `payments.requestPayment` accept optional `requestId` and `expectedMandateId`. A stable request ID retrieves its original committed result, including a refusal, even if approval subsequently changes. Use a new ID for a new decision. Current caller authorization still applies: a revoked agent cannot retrieve a result through MCP. Duplicate replays add no new payment, debit, receipt, request audit or quota use. Without an ID, an existing pending, held or paid payment is refused normally. Rate-limit and invalid-input refusals before decision execution are not saved as terminal request results.

Request IDs currently persist until the demo is reset; no retention job is configured. This gives exactly-once effects only within this Convex transaction and retained request namespace. There is no claim of exactly-once delivery to an external bank. A production payment connector would need its own idempotency, reconciliation and uncertain-outcome handling; [Convex actions](https://docs.convex.dev/functions/actions) cannot make an external service part of a database transaction.

Three history-dependent checks now use the relevant indexed status rather than a short mixed history: existing live payments, uncontained payment-relevant vendor incidents, and active agents sharing a name. An old paid payment cannot disappear behind rejected attempts, and an active vendor incident cannot disappear behind hundreds of reviewed observations. Ordinary repeated observations already correlate into one episode; the latter fix covers long reviewed/legacy histories. Agent revocation handles up to 500 legacy active duplicates atomically and explicitly fails before modifying anything above that limit. Internal MCP tools also recheck the delegated user's current company/role and tool capability after HTTP authentication.

Preview uses the same evaluator but an explicit client-supplied `asOf`; it is advisory, not a historical reconstruction or reservation. Execution uses server time and rereads authority. The UI subscribes to data changes and refreshes once at approval expiry, with manual refresh available for other time boundaries. It does not poll or change roles when selecting a preview executor.

## Reproducible verification

Use only your own DEV. Pegasus uses `tangible-koala-842`. `scripts/scorecard/ownedDev.mjs` rejects production, Adrian's DEV, deploy-key/token aliases, self-hosted overrides and conflicting deployment/URL selectors. Neither purchase nor assistant proof deploys or resets; prepare a clean DEV with the original rehearsal first.

```sh
npm test
npm run lint
npm run build
npm run rehearse
node scripts/purchases/rehearse.mjs
```

The purchase rehearsal verifies concurrent budget competition, 20 exact retries, changed-argument conflicts, invoice/payee tampering, preview without writes, revoked approvals, independent caller quotas, cross-company privacy/continuity and selected-agent binding. It revokes its temporary agents and checks HTTP 401, then signs out its test sessions. Its redacted report is `docs/pegasus-purchase-rehearsal.json`.

The separate assistant proof requires an Anthropic API key configured locally without committing it. Read `scripts/assistant/README.md` for its explicit deployment, cost bounds, source fixtures and cleanup. It must produce actual provider/tool evidence before anyone claims the AI flow was demonstrated. Offline fixture tests are not evidence that a live model called the tools. Do not run it against the state left by the purchase rehearsal: the original rehearsal must prepare clean synthetic samples again.

## Limits

The portfolio, invoices, payee-verification rows and money are synthetic. The receipts are database evidence, not cryptographic attestations. No Visa API, AP2 network, bank verification service or external payment processor is connected. The assistant proof is separate from the team's chatbot. No changes to the four existing stage scenarios or the $480K verification flow are intended; Role 1 reviews and owns production release. Demo recording and editing remain the last step.
