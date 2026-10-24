# MCP Agent Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Before any Convex code, read `convex/_generated/ai/guidelines.md` (or load the `convex` skill). Use superpowers:test-driven-development for every task and superpowers:verification-before-completion before claiming any task done.

**Goal:** Let one AI assistant ("Summit AP assistant") use Sidecall over MCP with exactly the controls a human AP clerk has: it sees only its own company, a payment it requests to a compromised vendor is held, it cannot release, and every call is audited.

**Architecture:** One Convex HTTP action at `POST /mcp` speaks MCP (Streamable HTTP, JSON responses only, no SSE, no sessions) with a hand-written JSON-RPC handler. A bearer token is hashed and looked up in a new `agents` table. Each agent acts *on behalf of* one seeded human (by email), so the existing `Viewer` scoping, holds and segregation of duties apply unchanged. Tools call the same functions the UI uses, after those functions are split into `xxxFor(ctx, viewer, args)` helpers.

**Tech Stack:** Convex (HTTP actions, internal queries/mutations/actions), `convex-test` + Vitest, TypeScript. Client for the demo: Claude Code (`claude mcp add --transport http … --header`). **No new npm packages.**

**Spec:** `docs/specs/mcp-research.md` (feasibility, sources, track fit). This plan implements the "side feature" scope agreed after it.

## Who does what

| Owner | Tasks | Budget |
|---|---|---|
| **Adrian (Role 1)** | Gate 0, Tasks 1–5 (all `convex/` + `CONTRACT.md`) | ≤ 3h total; hard stop rules below |
| **Marco (Role 2)** | Tasks 6–8 (`src/panels/PaymentCard.tsx`, `docs/`, smoke test + recording) | ~1h |
| Roles 3, 4 | Nothing. Don't touch `convex/schema.ts`. | 0 |

**Team impact (checked against `main` at cb5c07b):** no Role 3 (`src/map/`) or Role 4 (`convex/ai.ts`, `scoring.ts`, `scripts/`, `prompts/`, `data/`) code reads `auditLog` or the agent paths. The only side effects:
- An agent-requested held payment goes through the same `requestPayment` logic, so it creates the same `hold_notice` alert and notification outbox row as a clerk's request. Omar's `notify.ts` needs no change.
- `scoring:exportOutcomes` already skips payments with `seedRef: null` (agent-requested ones have none).
- Running the clip without a reset afterwards changes the PE headline (an extra $38K held). Task 8 Step 4 resets.

Ownership rule (from `CLAUDE.md`): only the owner edits a file. Marco's agent must not edit `convex/`; Adrian's agent must not edit `src/`.

## Gate 0: go / no-go (Adrian, 2 min, before any code)

- [ ] All must-haves for the main demo are merged, and the convex-reviewer pass is done. If not → **stop; MCP stays a Devpost "What's next" paragraph.**
- [ ] Start a timer. Checkpoints:
  - **T+45m:** Tasks 1–2 green (`npm test`). If not → stop.
  - **T+100m:** Task 3 green (read tools over `/mcp`). If not → stop.
  - **T+120m:** Task 4 smoke test from Claude Code passes. If not → stop and revert the route.
  - Task 5 (write tools) only if T+100m was hit early. It's optional.
- [ ] Tell the team in Slack: "Adding `agents` table + `/mcp` route, no new packages, schema change is additive."

## Global Constraints

- No new npm packages. `package.json` must not change. (`npx` one-off tools are fine on your own machine, never added as deps.)
- No `release_payment` or `reject_payment` tool, ever. Release stays a human action in the UI.
- An agent never sees or returns `reportedByCompanyId` / the reporting company's name. Reuse the `Viewer` logic; never add a firm-scoped agent tonight.
- Every `tools/call` from an authenticated agent writes exactly one `auditLog` row with `action: "agent_call"`.
- Tokens: generate in an **action** (`crypto.getRandomValues`), never in a mutation (mutation randomness is seeded and not secret). Store only `sha256` hex. Show the token once.
- Use `.withIndex`, never `.filter` on table scans; bound reads with `.take(n)`.
- Copy rules: hold text says "held until verified", never "fraud". Tell the reader to call **the number on file, not one from a recent email**. Never write "we stop fraud", "we block payments" or "we integrate with Armadin".
- Stage rule: nothing on stage hits the network except Convex, so MCP is shown **only as a recorded clip**, never live.
- MCP protocol versions accepted: `"2025-11-25"`, `"2025-06-18"`, `"2025-03-26"`. Default reply version: `"2025-06-18"`.

## Review Focus

1. **Stale identity after `seed:run` / `resetDemo`:** user and company ids change on reseed. The agent must keep working (it stores `onBehalfOfEmail`, resolved per call), and a revoked agent or a missing user must give `401`, not a 500. *Test in Task 2.*
2. **Cross-company probe:** `explain_hold` with another company's `paymentId` (or a garbage id) returns a tool error "Payment not found." and leaks no company or vendor name. *Test in Task 3.*
3. **Reporter leak:** no tool output contains the reporting company (`Pinecrest Staffing`) after the Brightline incident. *Test in Task 3.*
4. **Protocol edge cases:** a notification (no `id`) gets `202` with an empty body; an unknown method gets `-32601`; bad JSON gets `-32700`; a JSON array (batch) gets `-32600`; `GET /mcp` gets `405`; a request with an `Origin` header gets `403`. *Test in Task 3.*
5. **Segregation of duties through the agent:** a payment the agent requests on behalf of Jamie Chen cannot be released by Jamie (refused, `segregation_of_duties`); Rosa Alvarez can release it. *Test in Task 5.*

---

### Task 1: Schema, viewer helper and timeline guard (Adrian)

**Files:**
- Modify: `convex/schema.ts` (new `agents` table; `auditLog.actor`; `auditAction`)
- Modify: `convex/access.ts` (extract `viewerForUser`)
- Modify: `convex/blastRadius.ts:301` (skip `agent_call` rows in the timeline)
- Modify: `convex/payments.ts:625` area (actor label helper; `actorName` on `getPaymentAudit` rows)
- Test: `convex/backend.test.ts` (existing suite must stay green)

**Interfaces:**
- Produces:
  - Table `agents: { name: string, tokenHash: string, onBehalfOfEmail: string, tools: string[], createdAt: number, revokedAt?: number }`, indexes `by_tokenHash` (`["tokenHash"]`) and `by_name` (`["name"]`). **Do not add `agents` to `seed.ts` `TABLES`**: agents survive resets.
  - `auditLog.actor: v.union(v.literal("system"), v.id("users"), v.id("agents"))`
  - `auditAction` gains `v.literal("agent_call")`
  - `export function viewerForUser(user: Doc<"users">): Viewer` in `access.ts`, which throws `ConvexError("User has no company")` like today. `getViewer` calls it.
  - `export async function actorLabel(ctx: QueryCtx, actor: Doc<"auditLog">["actor"]): Promise<string>` in `payments.ts`: `"System"` | the user's name | `` `${agent.name} (agent)` ``. Tell the two apart with `ctx.db.normalizeId("agents", actor)`.
  - `getPaymentAudit` rows become `Doc<"auditLog"> & { actorName: string }` (additive).

- [ ] **Step 1:** Add the schema changes above. Run `npx convex dev --once` (or `npm run typecheck`). Expected: TypeScript errors only at `blastRadius.ts:302` (`kind` union) and `payments.ts:619` (`nameOf(row.actor, "users")`). Those are the two call sites to fix. Also check `convex/notifications.ts` (it inserts `auditLog` rows with a user actor; widening the union doesn't break it).
- [ ] **Step 2:** `blastRadius.ts`: next to the existing `if (row.action === "contain") continue;`, add `if (row.action === "agent_call") continue;` (agent calls aren't timeline events).
- [ ] **Step 3:** Add `actorLabel`. Use it in `getIncidentAudit` (`actorName`) and in `getPaymentAudit` (map rows to `{ ...row, actorName }`).
- [ ] **Step 4:** Extract `viewerForUser` in `access.ts`; `getViewer` = auth lookup + `viewerForUser(user)`.
- [ ] **Step 5:** Run `npm test && npm run typecheck`. Expected: all existing tests PASS, no type errors.
- [ ] **Step 6:** Commit: `git commit -m "feat: agents table, agent_call audit action, actor labels"`

### Task 2: Agent identity: mint, authenticate, revoke, log (Adrian)

**Files:**
- Create: `convex/agents.ts`
- Create: `convex/mcp.test.ts`

**Interfaces:**
- Consumes: Task 1 schema, `viewerForUser`.
- Produces (all in `convex/agents.ts`):
  - `export async function sha256Hex(text: string): Promise<string>`, via `crypto.subtle.digest("SHA-256", …)`, lowercase hex.
  - `internal.agents.mint({ name: string, onBehalfOfEmail: string, tools: string[] }) -> { token: string }` (**internalAction**). Token = `"sc_agent_" + 32 random bytes as hex`. Calls `internal.agents.insertAgent`.
  - `internal.agents.insertAgent({ name, onBehalfOfEmail, tools, tokenHash }) -> Id<"agents">` (internalMutation). Refuses (`ConvexError`) if an unrevoked agent with that `name` exists.
  - `internal.agents.revoke({ name: string }) -> { revoked: number }` (internalMutation). Sets `revokedAt` on every unrevoked agent with that name.
  - `internal.agents.authenticate({ tokenHash: string }) -> null | { agentId: Id<"agents">, name: string, tools: string[], userId: Id<"users">, companyId: Id<"companies"> }` (internalQuery). Null if there's no row, the agent is revoked, no user has `onBehalfOfEmail` (index `"email"`), or the user has no company.
  - `internal.agents.logCall({ agentId, tool: string, ok: boolean, summary: string, paymentId?: Id<"payments">, incidentId?: Id<"incidents"> }) -> null` (internalMutation). Inserts `auditLog { at: Date.now(), actor: agentId, action: "agent_call", companyId: <agent's company>, paymentId?, incidentId?, rule: \`mcp_tool:${tool}\`, reason: \`${agentName} called ${tool}: ${ok ? "ok" : "refused"}. ${summary}\` }`.

- [ ] **Step 1: Write failing tests** in `convex/mcp.test.ts`. Reuse the `seeded()` pattern from `backend.test.ts` (copy the helper; don't import a test file). Seed an agent with a known token via `t.run(ctx => ctx.db.insert("agents", { …, tokenHash: await sha256Hex("sc_agent_test") }))`.
  - `test("authenticate resolves the agent to the clerk it acts for")`: `authenticate({ tokenHash })` → `toMatchObject({ name: "Summit AP assistant", tools: [...] })`, and `companyId` equals Summit's id.
  - `test("a revoked agent or an unknown token does not authenticate")`: after `revoke({ name })` → `null`; `authenticate({ tokenHash: await sha256Hex("nope") })` → `null`.
  - `test("the agent survives a reseed")`: run `internal.seed.run` again → `authenticate` is still non-null, and `companyId` is the *new* Summit id.
  - `test("logCall writes one agent_call row the company can see")`: after `logCall`, Rosa Alvarez's `getPaymentAudit` / `getIncidentAudit` (when given ids) show `actorName: "Summit AP assistant (agent)"`.
- [ ] **Step 2:** Run `npx vitest run convex/mcp.test.ts`. Expected: FAIL (`internal.agents` missing).
- [ ] **Step 3:** Implement `convex/agents.ts` with the interfaces above. Every function gets arg and return validators.
- [ ] **Step 4:** Run `npx vitest run convex/mcp.test.ts && npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -m "feat: agent tokens (hashed), revoke, audit logging"`

### Task 3: `POST /mcp` with read tools (Adrian)

**Files:**
- Modify: `convex/payments.ts` (extract `heldPaymentsFor`, `paymentAuditFor`; public queries become thin wrappers)
- Modify: `convex/agents.ts` (tool internals)
- Create: `convex/mcp.ts` (JSON-RPC + tool table + `mcpHandler`)
- Modify: `convex/http.ts` (register routes)
- Test: `convex/mcp.test.ts`

**Interfaces:**
- Consumes: Task 2 `authenticate`, `logCall`, `sha256Hex`.
- Produces:
  - `payments.ts`: `export async function heldPaymentsFor(ctx: QueryCtx, viewer: Viewer, args: { incidentId?: Id<"incidents">; companyId?: Id<"companies"> }): Promise<HeldPaymentRow[]>`, with today's `getHeldPayments` body moved in and `type HeldPaymentRow` exported. `export async function paymentAuditFor(ctx: QueryCtx, viewer: Viewer, paymentId: Id<"payments">): Promise<Doc<"auditLog">[]>`. Both public queries call these with `await getViewer(ctx)`. **No behavior change.**
  - `internal.agents.listHeldPayments({ agentId, status?: "held" | "paid" | "rejected" }) -> ListedPayment[]`, where `ListedPayment = { paymentId, vendorName, amountCents, amount /* "$480,000" */, status, bankChangeFlag: boolean, holdReasons: string[], dueDate: number | null, decision: null | { status, byName, at } }`.
  - `internal.agents.explainHold({ agentId, paymentId: string }) -> null | Explanation`. Validate the id with `ctx.db.normalizeId("payments", paymentId)`; return null when the id is invalid or the payment isn't visible. `Explanation = { paymentId, vendorName, amount, status, holdReasons, bankChange: null | { daysBeforeIncident, requestChannel, accountLast4, lastVerifiedAccountLast4 }, phoneOnFile, decision, audit: { at, action, rule, reason }[], nextStep: string }`.
  - `nextStep` copy (exact):
    - held: `` `Held until verified. A controller other than the requester must call ${vendorName} at the number on file (${phoneOnFile}), not a number from a recent email, then release or reject it in Sidecall. This assistant cannot release or reject payments.` ``
    - paid / rejected: `` `Decided (${status}) by ${byName}. No action needed.` ``
    - otherwise: `"Not held."`
  - `convex/mcp.ts`: `export const mcpHandler = httpAction(...)`, `export const mcpMethodNotAllowed = httpAction(...)`.
  - `http.ts`: `http.route({ path: "/mcp", method: "POST", handler: mcpHandler })` plus `GET` and `DELETE` routes → `mcpMethodNotAllowed` (`405`, `Allow: POST`). **No CORS headers on `/mcp`.**

**Request handling in `mcpHandler`, in this order:**

| # | Condition | Response |
|---|---|---|
| 1 | `Origin` header present | `403` |
| 2 | `Authorization` missing, not `Bearer …`, or `authenticate` → null | `401` JSON `{ error: "invalid agent token" }` (no audit: no identity) |
| 3 | body > 64 KB, or not JSON | `400` + JSON-RPC error `-32700` `"Parse error"`, `id: null` |
| 4 | body is an array | `400` + `-32600` `"Batching is not supported"` |
| 5 | no `id` (notification) | `202`, empty body |
| 6 | `MCP-Protocol-Version` header present and not in the accepted list | `400` + `-32600` |
| 7 | `initialize` | `200` result `{ protocolVersion: <client's if accepted, else "2025-06-18">, capabilities: { tools: {} }, serverInfo: { name: "sidecall", version: "0.1.0" }, instructions: INSTRUCTIONS }` |
| 8 | `ping` | `{}` |
| 9 | `tools/list` | `{ tools: TOOLS.filter(t => agent.tools.includes(t.name)) }` |
| 10 | `tools/call` | see below |
| 11 | anything else | `-32601` `"Method not found"` |

`tools/call`: if the tool is unknown or not in `agent.tools` → JSON-RPC `-32602` and `logCall(ok: false)`. Otherwise run it. Success → `{ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }`. Tool-level failure (null from `explainHold`) → `{ content: [{ type: "text", text: "Payment not found." }], isError: true }`. Every outcome calls `logCall` exactly once, with `paymentId` / `incidentId` when known.

`INSTRUCTIONS` (exact): `"Sidecall holds payments to vendors under an active security incident until a person verifies them. You can list and explain held payments for your company. You cannot release or reject payments: a controller other than the requester must call the vendor at the number on file and decide in Sidecall."`

`TOOLS` (exact names and descriptions; `inputSchema` is JSON Schema, `additionalProperties: false`):
- `list_held_payments`: "List payments at your company that Sidecall held because of a vendor security incident, with status and hold reasons." Input `{ status?: enum ["held","paid","rejected"] }`.
- `explain_hold`: "Explain why one payment is held: reasons, any recent bank-detail change, the audit trail, and who must act next. Read-only." Input `{ paymentId: string }` (required).

- [ ] **Step 1: Write failing tests** in `convex/mcp.test.ts`. Use `t.fetch("/mcp", { method: "POST", headers: { Authorization: "Bearer sc_agent_test", "Content-Type": "application/json" }, body })` and a small `rpc(method, params, id = 1)` helper.
  - `test("initialize, tools/list, ping")`: `initialize` with `protocolVersion: "2025-06-18"` → result `protocolVersion === "2025-06-18"`, `capabilities.tools` defined; `tools/list` names `toEqual(["list_held_payments", "explain_hold"])` for an agent granted those two; `ping` → `{}`.
  - `test("protocol edge cases")`: notification → status `202` and `await res.text() === ""`; `GET /mcp` → `405`; bad token → `401`; `Origin: https://evil.example` → `403`; body `"{"` → `-32700`; body `[]` → `-32600`; `foo/bar` → `-32601`.
  - `test("list_held_payments shows Summit's holds only")`: fire Brightline; call the tool → every row's `vendorName === "Brightline Payroll"`; one row has `amountCents === 48000000` and `bankChangeFlag === true`; the raw response text does **not** contain `"Pinecrest"`, `"Cedar Ridge"` or `"Bayview"`.
  - `test("explain_hold says a person must act; other companies' payments are not found")`: Summit's held $480K → `nextStep` contains `"number on file"` and `"cannot release"`; a Cedar Ridge `paymentId` → `isError: true`, text `"Payment not found."`; `paymentId: "garbage"` → same.
  - `test("every tools/call writes one agent_call audit row")`: count `auditLog` rows with `action === "agent_call"` before/after 3 calls (one refused) → `+3`.
- [ ] **Step 2:** Run `npx vitest run convex/mcp.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Extract `heldPaymentsFor` / `paymentAuditFor` first; run `npm test`. Expected: existing suite PASS (pure refactor).
- [ ] **Step 4:** Implement the tool internals in `agents.ts` (build the viewer with `viewerForUser(await ctx.db.get("users", userId))`), then `convex/mcp.ts`, then the routes.
- [ ] **Step 5:** Run `npx vitest run convex/mcp.test.ts && npm test && npm run lint`. Expected: PASS, 0 warnings.
- [ ] **Step 6:** Commit: `git commit -m "feat: POST /mcp with list_held_payments and explain_hold"`

### Task 4: Deploy, mint, smoke test (Adrian, then hand to Marco)

**Files:** none (ops). Use the **dev** deployment, never the stage/prod one.

- [ ] **Step 1:** Push functions: `npx convex dev --once`. Expected: no schema validation errors (the `agents` table is new and empty; `auditLog` union widened).
- [ ] **Step 2:** Mint: `npx convex run agents:mint '{"name":"Summit AP assistant","onBehalfOfEmail":"jamie.chen@summithomehealth.example","tools":["list_held_payments","explain_hold"]}'`. Expected: `{ "token": "sc_agent_…" }`. Send the token to Marco by DM only. Never commit it or paste it in a channel.
- [ ] **Step 3: curl smoke** (replace `<site>` with the `.convex.site` URL):
  ```bash
  curl -s -X POST https://<site>/mcp -H "Authorization: Bearer $SIDECALL_AGENT_TOKEN" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
  ```
  Expected: JSON with `"serverInfo":{"name":"sidecall"…}`.
- [ ] **Step 4: Claude Code smoke** (the real client; this is the spec-version risk check):
  ```bash
  claude mcp add --transport http sidecall https://<site>/mcp --header "Authorization: Bearer $SIDECALL_AGENT_TOKEN"
  ```
  In Claude Code, run `/mcp`. Expected: `sidecall` connected, 2 tools. If it fails to connect → **stop at the T+120m rule**. Look at `npx convex logs` for the first request's method/headers before giving up: if the client sends a modern (no-`initialize`) request, answer it with `400` and a plain body so the client falls back.
- [ ] **Step 5:** Update `CONTRACT.md` changelog (Adrian): "`POST /mcp` (agent access, bearer token). New table `agents`; audit actor may be an agent id; audit action `agent_call`; `getPaymentAudit` rows gained `actorName`. Agents act on behalf of a seeded user by email and survive resets. No release/reject tool." Update `handoff/role-1-backend.md`. Commit + push per the handoff rules.

### Task 5 (optional): `list_bills` + `request_payment` (Adrian)

Only if T+100m was hit early. Otherwise skip, and the clip uses `explain_hold` only.

**Files:** `convex/payments.ts` (extract `billsFor`, `requestPaymentFor`), `convex/agents.ts`, `convex/mcp.ts`, `convex/mcp.test.ts`

**Interfaces:**
- `payments.ts`: `export async function billsFor(ctx: QueryCtx, viewer: Viewer)` (today's `getMyBills` body) and `export async function requestPaymentFor(ctx: MutationCtx, viewer: Viewer, billId: Id<"bills">)` (today's `requestPayment` body; same return union). **Keep its `enqueueAlert` + `scheduleDispatchIfQueued` calls inside the helper**, so agent requests notify exactly like a clerk's. Public functions become wrappers.
- `internal.agents.listBills({ agentId }) -> { billId, vendorName, amount, dueDate, description, payment: null | { paymentId, status } }[]`
- `internal.agents.requestPayment({ agentId, billId: string }) -> same union as payments.requestPayment`. Validate with `normalizeId("bills", …)`. **Write the `agent_call` audit row inside this same mutation** (with `paymentId`, and `incidentId` = the payment's `heldByIncidentId` if held), so the http action must not call `logCall` again for this tool.
- `TOOLS` additions: `list_bills`: "List your company's bills and whether each already has a payment." Input `{}`. `request_payment`: "Request payment of one bill, as the AP clerk you act for. If the vendor is under an active security incident the payment is held until a controller verifies it." Input `{ billId: string }` (required).
- Re-mint with all four tools (`agents:revoke`, then `agents:mint`).

- [ ] **Step 1: Failing tests:**
  - `test("an agent-requested payment to a compromised vendor is held and flagged")`: fire Brightline → `list_bills` finds `"November payroll processing"` with `payment: null` → `request_payment` → result `toMatchObject({ ok: true, held: true, flagged: true })`.
  - `test("the clerk the agent acts for cannot release it; the controller can")`: Jamie Chen `releasePayment` → `ok: false`, and an audit row with `rule === "segregation_of_duties"`; Rosa Alvarez with note `"Called Brightline at number on file, confirmed account"` → `ok: true`.
  - `test("request_payment writes exactly one agent_call row")`.
- [ ] **Step 2:** Run the tests. Expected: FAIL. **Step 3:** Implement. **Step 4:** `npm test && npm run lint` → PASS. **Step 5:** Commit `feat: agent can request a payment (held like a clerk's)`.

### Task 6: Show the agent in the payment audit (Marco)

**Files:** Modify `src/panels/PaymentCard.tsx:38-47,233`

**Interfaces:** Consumes `getPaymentAudit` rows with `actorName: string` (Task 1).

- [ ] **Step 1:** Replace the local `actorName(actor)` function and the `listUsers` lookup with `a.actorName` (keep `listUsers` only if something else in the file uses it). Rows whose `action === "agent_call"` render the actor with a small "agent" chip using brand tokens (amber outline, no new icons; no shield/padlock/radar/siren/warning-triangle icons).
- [ ] **Step 2:** Run `npm run lint && npm run build`. Expected: PASS.
- [ ] **Step 3:** Verify in the browser preview: sign in as Rosa Alvarez, open Summit's held $480K, and after one agent call the log shows "Summit AP assistant (agent)". The controls log panel needs no change (it already renders `actorName`).
- [ ] **Step 4:** Commit `feat: label agent actions in the payment audit`; update `handoff/role-2-frontend.md`.

### Task 7: Copy (Marco)

**Files:** `docs/devpost.md`, `docs/demo-script.md`, `docs/video-shot-list.md`

- [ ] **Step 1:** Devpost, under the Hyphenate section (and "What's next" if Tasks 3–4 didn't land): *"AI AP agents are coming. Sidecall is the hold they can't skip: an agent acting for your AP team sees only your company, gets the same hold your clerk does, can ask why, and only a person can release. Every agent call is in the audit log."* Armadin line stays as is: findings arrive via the signed `POST /incident`.
- [ ] **Step 2:** Shot list: one ≤15s clip after the "clerk tries to release → refused" beat (see Task 8). Demo script: no live MCP; mention it in one sentence over the clip.
- [ ] **Step 3:** Grep your copy for the banned phrases in Global Constraints. Commit `docs: agent access copy`.

### Task 8: Record the clip (Marco, with Adrian's token)

- [ ] **Step 1:** On the **dev** deployment: `resetDemo` → fire Brightline. Put the token in an env var (`export SIDECALL_AGENT_TOKEN=…`), never inline in a recorded terminal.
- [ ] **Step 2:** Screen-record Claude Code + the Sidecall controls log side by side:
  1. Prompt: "Why is Summit's $480,000 Brightline payment held?" → `explain_hold` → answer says held until verified, call the number on file, it can't release.
  2. (If Task 5 shipped) "Pay the November payroll bill." → `request_payment` → `held: true`.
  3. Cut to Sidecall: the agent row appears live in the log.
- [ ] **Step 3:** Revoke right after recording: `npx convex run agents:revoke '{"name":"Summit AP assistant"}'`. Run `claude mcp remove sidecall`.
- [ ] **Step 4:** `resetDemo` before any stage rehearsal so the headline stays "3 companies exposed · 4,200 people · $612K held".

## Gotchas (read before starting)

- **Randomness:** `mint` must be an `internalAction`. `crypto.getRandomValues` in a mutation is deterministic, so the token would be guessable.
- **Reseeds:** `seed:run` / `resetDemo` recreate users and companies with new ids. That's why agents store `onBehalfOfEmail` and are *not* in `seed.ts` `TABLES`.
- **Audit union widening:** every reader of `auditLog.actor` must handle an agent id. Known readers: `payments.ts` (`getIncidentAudit`), `src/panels/PaymentCard.tsx`. Writers that stay valid: `payments.ts`, `incidents.ts`, `notifications.ts`. Known readers of `action`: `blastRadius.ts:301` (timeline), `src/panels/ControlsLogPanel.tsx` (renders as text; fine).
- **Company audit index:** the company controls log reads `by_companyId_and_incidentId`, so an `agent_call` row shows there only when it has `companyId` **and** `incidentId`. Read calls without an incident appear in `getPaymentAudit` (when they carry `paymentId`), not in the incident log. That's expected.
- **No CORS on `/mcp`:** browsers aren't clients; reject any `Origin`.
- **Claude Desktop is out of scope:** its custom connectors need OAuth (bearer headers are a limited beta). Don't try.
- **Spec drift:** current MCP is `2026-07-28` (no `initialize`). Claude Code is expected to fall back to the legacy handshake; Task 4 Step 4 is the proof. If it doesn't connect, cut. Don't debug past the timebox.
- **Prompt injection:** tool output includes human-written notes. Read-only tools and no release tool are the mitigation. Don't add a free-text "notes" write tool.

## Tools and skills to use

| Need | Use |
|---|---|
| Convex API rules | `convex/_generated/ai/guidelines.md`; `convex` skill |
| Write tests first | superpowers:test-driven-development; `npx vitest run convex/mcp.test.ts` |
| Full checks | `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` |
| Push functions / logs | `npx convex dev --once`, `npx convex logs`, `npx convex run agents:<fn> '<json>'` |
| Review before merge | `security-reviewer` agent on the `convex/mcp.ts` + `convex/agents.ts` diff (token handling, scoping); `convex-reviewer` skill on the Convex diff |
| Client check | `claude mcp add … --header …`, `/mcp` inside Claude Code; optional `npx @modelcontextprotocol/inspector` (one-off, never a dep) |
| Before saying "done" | superpowers:verification-before-completion: paste the passing command output |
| Coordination | update your own `handoff/role-N-*.md` after each task; `git pull --rebase origin main` before each push |

## Out of scope (do not build)

`release_payment` / `reject_payment` tools · `report_finding` over MCP (the signed `POST /incident` covers it) · firm-scoped (PE) agents · OAuth / Claude Desktop connector · SSE / sessions / `server/discover` · rate limiting · any UI to mint tokens · live MCP on stage.
