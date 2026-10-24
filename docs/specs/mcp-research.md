# MCP server: feasibility research

Status: research only, Oct 23 ~10:30pm. No code written. Decision owner: team (backend work is Adrian's).

## Recommendation (TL;DR)

**Put it in Devpost "What's next" now. Build it only as a timeboxed stretch (≤2h for Adrian, read-only tools, Claude Code client, recorded clip, never live on stage), and only once the freeze list is done.**

Why: a Convex HTTP action can serve MCP with zero new packages, and Claude Code connects to it with a bearer header. The catch is that every public query reads identity from the Convex Auth session (`getViewer`), so an agent token needs a schema change plus internal versions of the queries. All of that is Role 1 work in Role 1 files, on the night before freeze. Claude Desktop custom connectors don't accept a bearer token for most orgs (needs OAuth), so the "Claude Desktop" demo judges imagine isn't available tonight. And a live MCP demo calls Anthropic's API on stage, which breaks "nothing on stage hits the network except Convex".

## 1. Can it run as a Convex HTTP action?

**Yes, no new npm packages.** A hand-written JSON-RPC handler on one route in `convex/http.ts` covers it.

- Streamable HTTP needs one endpoint taking POST (and GET). For a JSON-RPC request the server may answer with plain `Content-Type: application/json`; SSE is optional. Notifications get `202` with no body. GET may return `405` if the server offers no SSE stream. `Mcp-Session-Id` is optional (stateless is fine). Servers MUST validate `Origin`. ([transports, 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports))
- Convex HTTP actions take a Fetch `Request` and return a `Response`, can call internal queries and mutations, need manual CORS, and route by exact `path` or `pathPrefix` at `https://<deployment>.convex.site`. No automatic retries. ([Convex HTTP actions](https://docs.convex.dev/functions/http-actions)) `@modelcontextprotocol/sdk`'s server transport wants Node req/res, so skip it. Hand-rolling is about 120 lines.

**Minimum protocol surface (legacy, handshake-based revision `2025-06-18` / `2025-11-25`):**

| Method | Reply |
|---|---|
| `initialize` | `{ protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "sidecall", version } }`; echo the client's version if supported, else your latest ([lifecycle](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle)) |
| `notifications/initialized` | `202`, empty |
| `ping` | `{}` |
| `tools/list` | `{ tools: [{ name, description, inputSchema }] }` |
| `tools/call` | `{ content: [{ type: "text", text }], isError? }` (text = JSON string) |
| anything else | JSON-RPC error `-32601` |
| `GET /mcp` | `405` |

**Spec version risk.** The *current* MCP revision is `2026-07-28`, which drops the `initialize` handshake (per-request `_meta`, mandatory `server/discover`). Dual-era clients fall back to `initialize` when a modern request gets a 4xx without a modern error body; modern-only clients fail against a legacy server. ([versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)) So: implement the legacy handshake, answer an unknown modern request with a plain `400`, and **smoke-test against the Claude Code build we'll actually use before committing to any demo.** Adding `server/discover` makes the server dual-era for about 30 more lines.

**Clients:**
- **Claude Code: works.** `claude mcp add --transport http sidecall https://<deployment>.convex.site/mcp --header "Authorization: Bearer $SIDECALL_AGENT_TOKEN"`, or `.mcp.json` with `"headers": { "Authorization": "Bearer ${SIDECALL_AGENT_TOKEN}" }`. If the header is rejected it reports a failure and doesn't fall back to OAuth. ([Claude Code MCP](https://code.claude.com/docs/en/mcp))
- **Claude Desktop / claude.ai custom connector: not with a bearer token for us.** Supported auth: OAuth (DCR or CIMD), `none`, and `static_headers`, which is a **beta for a limited set of organizations**, entered by an org Owner. Tokens in the URL query are not supported. Requests come from Anthropic's egress `160.79.104.0/21`, so the server must be public (`.convex.site` is). ([connector auth](https://claude.com/docs/connectors/building/authentication.md)) Convex Auth isn't an OAuth authorization server with DCR, so OAuth means building one. Not tonight. Authless would expose portfolio data: no.

## 2. Auth model and what Role 1 would change

Goal: per-agent token → agent identity; read-mostly; **no release/reject tool**; every call audited; `access.ts` scoping unchanged.

Problem: `getViewer` reads `getAuthUserId(ctx)` (Convex Auth session). A static token in an HTTP action has no session, so calling the public queries returns "Not signed in".

Changes (all Adrian's files):
1. **`schema.ts`**: new table
   `agents: { name, tokenHash, firm: boolean, companyId?, onBehalfOf?: Id<"users">, tools: string[], revokedAt? }`, index `by_tokenHash`.
   `auditLog.actor` gains `v.id("agents")`; `auditAction` gains `"agent_call"` (and `"agent_refused"`).
2. **`access.ts`**: export a `Viewer` builder from an agent row (firm agent → `{ firm: true }`, company agent → `{ firm: false, companyId }`), so `canSeeCompany` and the "never name the reporter" rules apply unchanged.
3. **Queries**: split `getHeldPayments` / `getPaymentAudit` / `getIncidentAudit` handlers into `impl(ctx, viewer, args)`; public query = `impl(ctx, await getViewer(ctx), args)`; new `internalQuery` wrappers take `agentId` and build the viewer. No logic duplicated.
4. **`http.ts`**: `/mcp` route. `sha256(token)` → `internal.agents.byTokenHash` → check `revokedAt` and the tool allowlist → dispatch → one `internal.agents.logCall` mutation (tool, args summary, outcome) per `tools/call`. Reject a present-but-unknown `Origin`.
5. Token minting: an internal mutation run from the CLI (`npx convex run agents:mint`); show the token once, store only the hash.

## 3. Tools

| Tool | R/W | Input | Output | Maps to |
|---|---|---|---|---|
| `list_held_payments` | R | `{ incidentId?, status?: "held"\|"paid"\|"rejected" }` | `[{ paymentId, companyName, vendorName, amountUsd, status, bankChangeFlag, holdReasons, dueDate }]` | `getHeldPayments` impl (company agent pinned to own company) |
| `explain_hold` | R | `{ paymentId }` | `{ holdReasons, bankChange: { daysBeforeIncident, requestChannel, accountLast4, lastVerifiedAccountLast4 }, phoneOnFile, decision, audit: [{ at, action, actorName, reason }], nextStep }`; `nextStep` is always "a controller other than the requester calls the number on file, then releases or rejects in Sidecall" | `getHeldPayments` row + `getPaymentAudit` impl |
| `request_payment` | W | `{ billId }` | `{ ok, paymentId, held, flagged } \| { ok:false, reason }` | `requestPayment` logic with `requestedBy = agent.onBehalfOf` (must be an `ap_clerk`), so segregation of duties still blocks that person from releasing. **Stretch-of-stretch; skip.** |
| `report_finding` | W | `{ externalId, assetName, summary? }` | `{ incidentId, duplicate }` | `internal.incidents.recordIncident`. Token needs the `report_finding` tool grant (equivalent to an HMAC signature, never the unsigned demo path). `reportedByDomain` comes from the agent's company, never from input. Same `externalId` dedupe. |
| ~~`release_payment` / `reject_payment`~~ | — | — | — | **Never exposed.** Release stays a human action in the UI. |

## 4. Effort, risks, track fit

**Effort (hours):**

| Role | Work | Read-only (2 tools) | Full (4 tools) |
|---|---|---|---|
| 1 Adrian | schema + agents table + mint, impl split, `/mcp` handler, audit, tests | 2–2.5 | 4–5 |
| 2 Marco | Devpost/docs paragraph, record Claude Code clip, optional "agent" label in the audit view | 0.5–1 | 1–1.5 |
| 3, 4 | none | 0 | 0 |

**Risks:**
- **Security surface:** a new public endpoint returning financial data. Mitigations: hashed tokens, constant-time compare, revocable, allowlisted tools, company-scoped by default, no write tools in the minimal set, no CORS `*` on `/mcp`. Convex has no built-in rate limiting.
- **Prompt injection:** tool output includes human-written notes (verification notes, vendor names). An agent reading them could be steered. Read-only tools cap the damage; no money-moving tool exists.
- **Stage rule:** a live MCP call means Claude (the client) hits Anthropic's API. That breaks "nothing on stage hits the network except Convex". Pre-record it or keep it in Devpost.
- **Spec drift:** see the version note in §1. Untested client/server pairing is the most likely failure.
- **Schedule:** it's Role 1 work landing in `schema.ts`/`http.ts` right before freeze, competing with the convex-reviewer pass and Role 4 integration.
- **Judges:** "MCP" lands well with Convex/AI judges if shown as one 15-second clip ("ask Claude why Summit's $480K is held → it explains and says a controller must call the number on file"). A shaky live demo costs more than it earns.

**Hyphenate fit (autonomous finance seat):** this is exactly the "agent with limited access" story. Scoped token, read-mostly tools, every call written to `auditLog` with the agent as actor, and the agent *knows when to ask*: it cannot release, and `explain_hold.nextStep` tells it to hand off to a human controller.

**Armadin angle:** `report_finding` lets an offensive-security finding arrive as our input through the same contract as `POST /incident` (signed, deduped on `externalId`). Copy: "a finding from an offensive-security tool can be reported straight in". **Do not say "we integrate with Armadin."**

## 5. Recommendation

1. **Now (Role 2, 15 min):** add a "What's next: agent access over MCP" paragraph to `docs/devpost.md` using §4's Hyphenate/Armadin framing.
2. **Timeboxed stretch (Adrian, ≤2h hard stop, only after must-haves and the convex-reviewer pass):** read-only `list_held_payments` + `explain_hold`, company/firm-scoped agent token, `agent_call` audit rows, Claude Code over `--header`. Smoke-test first (10 min: `initialize` → `tools/list` from Claude Code). If it isn't working by the timebox, drop it; nothing else depends on it.
3. **Not tonight:** Claude Desktop connector (OAuth), `request_payment`, `report_finding` over MCP (the signed webhook already covers the Armadin story), any live MCP on stage.

## Sources

- MCP Streamable HTTP transport (2025-06-18): https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- MCP lifecycle / initialize: https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle
- MCP versioning, current 2026-07-28 and legacy compatibility: https://modelcontextprotocol.io/specification/versioning, https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning
- Claude connector authentication (OAuth / static_headers beta / none, egress IPs): https://claude.com/docs/connectors/building/authentication.md
- Claude Code remote HTTP MCP with headers: https://code.claude.com/docs/en/mcp
- Convex HTTP actions: https://docs.convex.dev/functions/http-actions
- Repo: `convex/access.ts` (`getViewer`), `convex/http.ts` (`/incident` HMAC), `convex/payments.ts` (`requestPayment`, `getHeldPayments`), `convex/schema.ts` (`auditLog.actor`, `auditAction`)
