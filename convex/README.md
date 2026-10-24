# Sidecall backend (Convex)

Everything Sidecall decides happens here. React only subscribes to queries and calls mutations.
`CONTRACT.md` at the repo root has the exact shapes the frontend relies on.

## One request, end to end

`POST /incident` (http.ts) checks the HMAC signature (and parses an optional red-team finding),
then runs `recordIncidentImpl`
(incidents.ts) in **one transaction**:

1. Dedupe on `externalId`: a replayed webhook returns the first incident and writes nothing.
2. Find every company linked to the asset (`links.by_assetId`) and score each link (scoring.ts).
   Only shared credentials or shared admin access count, unless the vendor itself fell.
3. Hold every pending payment to that vendor at companies that opted in, and flag bank details
   changed within 30 days (payments.ts). Each hold and flag writes an `auditLog` row.
4. Open one exposure per company and insert pending alerts, hold notices and the vendor letter
   (template text first).
5. Queue Slack/Discord/webhook notifications (notifications.ts) and schedule the three AI writers
   (ai.ts) **once per incident**, not per company.

Every open dashboard sees the result at the same instant, because they all read the same
committed snapshot.

## Files

| File | What it owns |
| --- | --- |
| `schema.ts` | Every table and index. The data contract. |
| `access.ts` | `getViewer`: identity comes only from the session. The PE firm sees all companies; everyone else sees only their own. |
| `auth.ts`, `auth.config.ts` | Convex Auth, Password provider, invite-only (sign-in links to a seeded person by email). |
| `http.ts` | `POST /incident` (HMAC), `POST /mcp`, auth routes. |
| `incidents.ts` | Incident intake, exposures, acknowledge/close (race-safe), containment. |
| `scoring.ts` | How strongly a link exposes a company, and why; `sisterPath` turns a red-team finding into a "reachable here, not tested" path for each sister. Pure functions. |
| `findings.ts` | Parses an optional validated red-team finding on `POST /incident` (our own schema) and the ATT&CK names sisters may see. |
| `payments.ts` | Holds, bank-change flags, release/reject with segregation of duties, escalation, ledger reads. |
| `ledger.ts` | `postLedgerEntry`: double-entry, balanced by construction. |
| `blastRadius.ts` | Read-side queries for the map, evidence panel, timeline and directory. |
| `alerts.ts` | Alert storage and the writing context the AI reads. |
| `ai.ts` | Actions that call the model and write back through `internal.alerts.saveAlert`. |
| `notifications.ts`, `notify.ts` | Outbox (dedupe per channel + event) and the sender (gated by `NOTIFY_LIVE`). |
| `imports.ts` | AP CSV import: vendor matching, and holds on import during an active incident. |
| `agents.ts`, `mcp.ts` | MCP access for AI assistants: hashed bearer tokens, read and request tools, no release tool, every call audited. |
| `seed.ts`, `ops.ts` | Demo portfolio, reset, readiness checks, scale benchmark. |
| `crons.ts` | Escalate holds near their due date (15 min); requeue stuck notifications (5 min). |
| `shared.ts` | Small helpers and limits (`MAX_FANOUT`, `memo`, `formatUsd`). |

## Rules the code follows

- **Indexes, never `.filter` on a table scan.** Every read is bounded with `take`.
- **No clock reads in queries.** Time-based work (escalation, stuck notifications) runs in crons
  and mutations.
- **Mutations never call the network.** They write template text and schedule an internal action.
- **Payments are held, never cancelled.** The person who requested a payment can't release it, and
  the PE firm never releases anything. Refusals are logged too.
- **A company never learns who was hit.** Only the PE firm view names the reporter.
- **Only `internal.*` functions are scheduled.** Public functions all check the session.

## Environment

Set with `npx convex env set NAME value`. Typed in `convex.config.ts`.

| Name | Effect |
| --- | --- |
| `DEMO_MODE` | `true` enables Reset, the stage buttons, unsigned demo scenarios and the public sign-in picker. Never on a real deployment. |
| `INCIDENT_WEBHOOK_SECRET` | HMAC key for `POST /incident`. |
| `NOTIFY_LIVE` | `true` actually posts notifications. Off, rows end "simulated". |
| `AI_LIVE`, `ANTHROPIC_API_KEY` | `ai.ts` calls the model only when `AI_LIVE=true` and a key is set; otherwise it uses cached text. On stage it stays off. |

## Tests

`npm test` runs `backend.test.ts` and `mcp.test.ts` against the real functions with
convex-test: replay, fan-out, race-safe acknowledge, segregation of duties, ledger balance,
scoping, MCP auth, the notification sender and the reset. `npm run rehearse` drives the full
demo against a dev deployment.
