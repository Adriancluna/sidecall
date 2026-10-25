# In-app Claude purchasing and visible control challenges

The Bills to pay page now runs the real Claude purchase request path. A controller first approves exact saved bills through the existing controls. An AP clerk selects one eligible bill, supplies masked invoice text and explicitly starts a bounded model run. The presenter key authorizes provider usage, not financial authority. The company's reactive execution record shows the saved source/hash, actual model calls and tools, the server decision and the existing receipt.

This is a one-shot job with bounded audit events, not a conversation or the teammates' chatbot. The existing CLI/MCP proof remains separate: this UI uses the same transactional payment function through private Convex mutations; it does not claim to call MCP over HTTP.

## Execution boundary

- Identity comes from the signed-in AP clerk. The server pins the company, selected bill, current controller approval, immutable source, source hash and stable request ID; the model cannot supply or override them.
- Start requires an eligible current company-wide AP approval, DEMO_MODE, a configured server Anthropic key, and the matching configured presenter key. Agent-specific approvals cannot be impersonated through the UI.
- Claude Opus 5.5 has only read_selected_bill, request_payment and decline_purchase. Request arguments are a closed selected-bill/amount/masked-account tuple. Unknown tools, overrides, another bill, different amount/destination and requesting before the saved-bill read fail closed.
- Recognized labelled source vendor, amount and account fields are checked independently in the execution mutation. Conflicting, malformed or mismatched labelled facts refuse even if Claude submits the correct saved tuple. Unlabelled natural language still needs model interpretation; this parser is not general prompt-injection detection.
- Cancellation, current requester/company/role, demo mode, expiry and the payment evaluator run in the same mutation as settlement. Existing bill/payee/approval/budget/incident checks are reused. A changed approval may refuse; an expired/revoked approval may leave a manual pending request; an incident may leave it held. Only an actual automatic result is labelled paid.
- Duplicate starts return the original job only for identical requester/company/bill/source. One worker can claim it. Each committed request uses one server-owned idempotency key; provider failures or late cancellation cannot rewrite a completed payment outcome.
- Each run has a three-minute execution deadline, at most four provider calls, 1,400 maximum output tokens per call, a 6,000-character source bound and at most sixteen 3,000-character audit events. Existing official Convex rate limiting caps admitted starts per AP user and company. There is no automatic model retry after a provider failure.
- API/presenter keys never enter stored source, job events or the provider prompt. Model thinking blocks remain only in action memory when required for tool continuation. The UI key field is transient and clears after submission or role switch. The source is deliberately saved and sent to Claude; use synthetic invoices and masked account details.

## Visible defense checks

After an actual request completes, its AP requester can run eight explicit checks: valid request shape, unauthorized release tool, substituted destination, inflated amount, another bill, forged approval/request identity, conflicting labelled source destination and actual historical request replay. The first seven exercise the same input/source guard used for model execution; the last calls the existing idempotent payment function and compares the exact payment journal before and after. Results and timestamps are persisted and exportable.

These checks make no additional model calls. They are authored execution-boundary challenges, not claims about model prompt-injection accuracy or complete attack coverage. An actual malicious-source model run is recorded separately. Replay returns the original decision even if authority was revoked later; it never grants fresh authority. A subsequent human release of a historically held/pending payment is compatible with an unchanged replay journal.

## UI completion

The new panel lives in Bills to pay, is lazy-loaded, and preserves the existing sidebar. Active executions stay visible for their requester even if newer company runs fill the history. Completed tool details collapse so the outcome, receipt and challenge results lead. Source, provider usage, elapsed time and a local evidence export remain available. Historical run status is explicitly separate from later payment review/release.

The direct Request payment path is labelled as a server request without Claude and is available only to AP clerks. Controller approval selection is limited to one vendor and 25 bills, with clear selection and inline positive/bounded/per-purchase-versus-total validation. The total budget may intentionally be below the sum of selected bills to demonstrate aggregate spending control.

## Rehearsal and release

Only Pegasus DEV tangible-koala-842 is used for development. Set ANTHROPIC_API_KEY and PRESENTER_KEY there without committing credentials; background AI_LIVE and NOTIFY_LIVE remain off. Run the original own-DEV rehearsal separately for a clean seed, then:

```sh
node scripts/console/rehearse.mjs --deployment tangible-koala-842 --report scripts/console/report.json
```

The runner does not deploy, reset or change environment flags. It verifies a real legitimate invoice run, an actual malicious-source run, duplicate submission/history and eight guard/replay checks. It revokes its sample purchasing approval, stops outstanding jobs and signs out test sessions. Synthetic records remain as evidence. Live verification results are added after the run; implementation tests are not presented as live proof.

Role 1 owns review, production merge/deployment and the final combined rehearsal. The production environment needs its own API key/presenter configuration; a configured DEV is not production readiness. Recovery remains optional Q&A, the original demo still works, and the chatbot/map are unchanged by this feature.

The provider loop follows Anthropic's [client-tool continuation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use) and [Opus 5.5 guidance](https://platform.claude.com/docs/en/models/opus-5-5/overview): automatic tool choice, one tool per response, original provider blocks retained only for continuation, and no forced-tool or disabled-thinking setting.
