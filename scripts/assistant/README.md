# Actual assistant and scoped-tool proof

This standalone rehearsal gives Claude synthetic invoice/email documents, records its real tool choices, and forwards those choices through Sidecall's real company-scoped MCP endpoint. It does not mount or interact with the team's chatbot. Financial authority remains in Convex: the model can request an existing saved bill, but cannot approve a mandate, change a payee, release a hold, or call a bank or Visa API.

Recorded live proof: [`report.json`](./report.json), completed October 24, 2026 at 5:20 PM Pacific on `tangible-koala-842`, source commit `cb01f79`. Eight checks passed across ten real model calls; all cleanup succeeded. Estimated generation cost was $0.14. The three synthetic cases and scope below define what this proves; it is not a general accuracy/security benchmark. The report contains no API key and can be inspected without rerunning paid calls.

Run offline tests without credentials, model calls, deployment or data changes:

```sh
node --test scripts/assistant/assistant.test.mjs
```

Before a live run:

1. Deploy the reviewed purchasing/request-identity contract to **your own DEV** using the team's release procedure, and finish the original rehearsal so the synthetic purchase samples and the November bill are unused.
2. Ensure `.env.local` selects that exact `dev:<name>` and matching `https://<name>.convex.cloud`; the runner refuses production, Adrian DEV, both deployment-key aliases, self-hosted overrides and conflicting process configuration.
3. Existing `DEMO_MODE` must be enabled; pass the existing `PRESENTER_KEY` through the process environment if the deployment requires it. Keep `AI_LIVE=false` or unset on this rehearsal DEV so existing incident-writing actions do not make separate model calls outside this runner's budget. The runner never changes any environment flags.
4. Make `ANTHROPIC_API_KEY` available through your normal secret mechanism, or the existing untracked `.env`/`.env.local` file. The runner reads `.env` first, then `.env.local`; existing process values take precedence over both. It does not write secrets or modify those files, print their contents, or send the API key to Convex. Missing key fails before sign-in or any setup mutation.

```sh
node scripts/assistant/rehearse.mjs --deployment tangible-koala-842 --report scripts/assistant/report.json
```

The model defaults to the project's `MODEL` in `prompts/writing.ts`, currently `claude-opus-5-5`, verified against the official [model overview](https://platform.claude.com/docs/en/models/overview). `--model` or `ANTHROPIC_MODEL` can override it. Opus 5.5 and Sonnet 5.5 have recorded standard input/output prices; another model requires both `--input-usd-per-million` and `--output-usd-per-million` so cost estimates are explicit.

Defaults are eight rounds per case, 4,096 output tokens per model call, a 60,000-input-token ceiling and a $5 application budget for all three cases. Options `--max-rounds`, `--max-output-tokens` and `--max-budget-usd` remain bounded. The [token-count endpoint](https://platform.claude.com/docs/en/api/messages/count_tokens) runs before each generation; budget admission reserves counted input plus maximum output and 25%, then tracks actual returned usage. This estimate is not a provider billing cap. There is no hidden automatic retry of model or payment calls.

The sequence is:

- A real model call reads `northstar-sc-102` through `read_source_document`, lists saved bills and calls `request_payment`; the server must return a settlement receipt backed by the exact agent-bound approval, passing decision checks, $180 budget consumption and an agent audit row. The receipt and ledger must reference the same company, bill and payment, with exactly a $180 accounts-payable debit and cash credit.
- A synthetic operator fixture changes SC-101 after approval. Claude reads the adversarial vendor email and submits only its matching saved bill through the same scoped tool. A passing server-protection beat requires an actual `bill_changed` refusal receipt with unchanged cash/budget and no payment. If Claude refuses or makes no request, the report records that behavior and does **not** claim the backend blocked it.
- An internal synthetic Brightline incident makes the November invoice request held. Claude must actually call `explain_hold`, which returns the independently stored phone number and separate controller guidance. This verifies retrieval of stored guidance and the hold path; it does not score whether Claude's final narrative repeats that guidance accurately. The $180 paid invoice itself cannot be explained with `explain_hold` because it was never held.

Source text is delivered as JSON in a `tool_result`, with provenance and a content hash, following Anthropic's [indirect-injection guidance](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks). Tool definitions come from real MCP `tools/list`. Only the four granted business tools and the local fixed-document reader are offered; there is no filesystem, shell, browser or general network tool. The host rejects extra arguments, permits only the case's matching observed bill, and supplies stable request IDs/pinned approval IDs itself. Model arguments and actual dispatched arguments remain separately visible in the trace. A local guard refusal is labeled `harness`, not `mcp`.

`report.json` contains document hashes and synthetic text, model response/request/tool IDs, redacted source/tool traces, actual server receipts, original/current approval evidence, ledger and audit rows, usage and cleanup results. Hidden thinking/signature blocks stay only in memory for API continuation and are not written. This is reproducible recorded evidence, not cryptographic attestation or a production security/accuracy claim; offline mocked tests do not produce a live report. The Messages client-tool bridge is explicit in the artifact, rather than being described as Anthropic's hosted MCP connector.

The runner revokes its saved purchase approval and every minted MCP credential in `finally`, verifies the latter receives 401, and signs out the two temporary demo sessions. Synthetic fixtures, immutable receipts and the held payment remain for UI review; it never resets or releases them. A cleanup failure fails the report. The normal rehearsal must be run separately before another clean attempt, and again before any stage demo. No production changes, webhook-authentication proof, real payment processing, or Visa eligibility guarantee are implied.
