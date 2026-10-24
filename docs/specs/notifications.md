# Spec: notifications (Sidecall → Slack / Discord / webhook)

Status: **approved by Marco (Role 2), Oct 23 ~10:15pm. Needs Role 1 + Role 4 to accept their parts in their handoff files.**
Owner of this doc: Role 2. Implementation owners per part below.

## Why

The brief says Sidecall "sends each [company] a tailored warning at the right urgency". Today those warnings only exist inside the app. Notifications push them to where people already are, so a controller hears about a held $480K payment without having the dashboard open.

## Scope (v1)

- **Channels:** Slack incoming webhook, Discord webhook, generic HTTPS webhook (JSON). These all take a single POST with no SDK and no API key.
- **Not in v1:** email (needs an email API key and a verified sending domain), SMS, Teams, per-person preferences, digests.

**Events:**

| Event | Audience | Source |
|---|---|---|
| `alert` | the exposed company's channels | a `company_alert` alert becomes `ready` |
| `hold` | the company's channels | a `hold_notice` becomes `ready` (one per held payment) |
| `escalation` | the company's channels | an `escalation` alert is written |
| `incident` | the PE firm's channels | an incident is recorded: headline "N companies exposed · N people · $X held" |
| `contained` | the PE firm's channels | `containIncident` succeeds |

## Rules (non-negotiable, from CLAUDE.md)

- **Never reveal who was hit.** Company messages never contain the reporting company. Only firm-scoped `incident` / `contained` messages may name it.
- No full account numbers (last 4 only). No phone number except the vendor's number on file. "Held until verified", never "fraud" / "blocked". Reuse Role 4's `checkCopy`.
- **Stage rule:** nothing on stage depends on the network except Convex. Deployment env `NOTIFY_LIVE` (default off): when off, messages are written to the outbox as `simulated` and never sent. The demo shows the outbox. Turn it on only for the recorded video, if at all.
- **Secrets:** webhook URLs are secrets. They're stored server-side, never returned to clients (shown masked: host + last 4), and never logged.
- **SSRF guard:** accept only `https://hooks.slack.com/services/…`, `https://discord.com/api/webhooks/…`, `https://discordapp.com/api/webhooks/…`, or (generic) another `https://` host that isn't an IP literal or `localhost`. Validate in the mutation.
- **Who can configure:** a company's controllers for that company's channels; a `pe_partner` for the firm's channels. Others are refused, and the refusal is logged in `auditLog`.
- **Idempotent:** one outbox row per `(channelId, event, refId)`, so a replayed webhook or re-saved alert never sends twice.
- **Convex rules:** enqueue in the same mutation that makes the alert ready (atomic). Schedule **one** dispatch action per batch, not one per message. Actions never write directly; they go through internal mutations. Use indexes, not `.filter` on table scans.

## Data (Role 1: schema + CONTRACT.md)

```ts
notificationChannels: { companyId?, scope: "company" | "firm", kind: "slack" | "discord" | "webhook",
                        label, url /* secret */, events: ("alert"|"hold"|"escalation"|"incident"|"contained")[],
                        enabled: boolean, createdBy }
  .index("by_companyId", ["companyId"]) .index("by_scope", ["scope"])

notifications (outbox): { channelId, companyId?, incidentId, event, refId /* alertId | incidentId */,
                          status: "queued" | "sent" | "simulated" | "failed", text, error?, createdAt, sentAt? }
  .index("by_channelId_and_refId", ["channelId", "refId"])   // dedupe
  .index("by_incidentId", ["incidentId"]) .index("by_status", ["status"]) .index("by_companyId", ["companyId"])
```

## API (Role 1 defines; Role 2 calls)

```ts
// queries: scoped by convex/access.ts (company user → own company; pe_partner → firm + all)
notifications.listChannels() -> { _id, scope, kind, label, target /* masked */, events, enabled }[]
notifications.listOutbox({ incidentId? }) -> { _id, createdAt, channelLabel, kind, event, status, text, error | null }[]  // newest first, take(100)

// mutations: controller (own company) or pe_partner (firm)
notifications.addChannel({ scope, kind, label, url, events }) -> { ok: true, channelId } | { ok: false, reason }
notifications.removeChannel({ channelId }) -> { ok: true } | { ok: false, reason }
notifications.sendTest({ channelId }) -> { ok: true } | { ok: false, reason }   // enqueues one "test" message
```

## Flow

1. **Enqueue (Role 1):** in `alerts.ts` `saveAlert`/`saveAlerts`, in the escalation writer in `payments.ts`, in `recordIncident` (firm `incident` summary) and in `containIncident`. For each enabled channel subscribed to that event and scope, insert an outbox row `queued` (skip if the dedupe key exists). Then `ctx.scheduler.runAfter(0, internal.notify.dispatch, {})` **once** per mutation.
2. **Dispatch (Role 4, `convex/notify.ts`):** `internalAction dispatch({})` reads queued rows (`internal.notify.queued`, `take(50)`) and builds the payload per kind:
   - Slack: `{ text }` plus optional blocks: header, body, "Open Sidecall" link.
   - Discord: `{ content }`, under 2,000 characters.
   - Generic: `{ event, text, incidentId, company, at }`.

   If `env.NOTIFY_LIVE !== "true"`, mark `simulated`. Otherwise `fetch` POST with a 5 s timeout, **one retry**, then mark `sent` or `failed` with an error string. Never throw.
3. **Text (Role 4):** reuse the alert body that's already written (AI or cached), prefixed with a one-line header, e.g. `🔴 Urgent · Brightline Payroll Inc.` or `⏳ Decision needed · $480,000`. Run `checkCopy`. Firm `incident` text = the headline numbers + a link.
4. **UI (Role 2):** settings card and outbox panel (below).

## UI (Role 2)

- **Notifications card:**
  - Company view: controllers only, read-only for others.
  - PE view: firm channels.
  - Contents: list of channels (kind icon, label, masked target, events, enabled). Add form: kind, label, URL, event checkboxes. Remove. "Send test". Refusals and validation errors inline.
- **Outbox panel:** time · channel · event · status chip (`simulated` amber, `sent` green, `failed` red with the error) · message preview. Company view shows its own rows; PE view shows the whole incident.
- **Presenter:** a beat after the money moment: "and the controller's Slack already has it" (show the outbox, or a real Slack on the recorded video).
- **Seed (Role 1, nice to have):** one pre-configured `simulated` Slack channel for Summit and one for the firm, so the outbox fills during the demo with no setup.

## Tests (Role 1, convex-test)

- Replay the same webhook: no new outbox rows.
- A company outbox `text` never contains the reporting company's name.
- `addChannel` refuses non-controllers, other companies, and disallowed URLs (http, IP literal, localhost), and logs the refusal.
- `NOTIFY_LIVE` off → rows end `simulated`, no `fetch`.
- `listChannels` never returns `url`.

## Owners, order, estimate

| Part | Owner | Why them | Est. |
|---|---|---|---|
| Schema, CONTRACT.md, enqueue hooks, channel mutations/queries, seed channels, tests | **Adrian (Role 1)** | owns `schema.ts`, `alerts.ts`, `payments.ts`, `incidents.ts`, `access.ts`, CONTRACT.md | ~1.5 h |
| `convex/notify.ts` dispatch action, payload builders, message headers, `checkCopy` reuse | **Omar (Role 4)** | already writes the alert copy and the only `fetch`-calling actions (`ai.ts`); new file, no overlap | ~1 h |
| Notifications card, outbox panel, presenter beat, docs | **Marco (Role 2)** | owns `src/` and `docs/` | ~1 h |

**Order:** Adrian lands the schema + API first (stubs are fine) → Omar's dispatch and Marco's UI in parallel against CONTRACT.md → `npm run rehearse` + a manual Slack test with `NOTIFY_LIVE=true` on dev only.

**Done when:** firing the Brightline scenario on dev fills Summit's outbox with `alert` + `hold` + `escalation` rows and the firm's outbox with an `incident` row, all `simulated`. With `NOTIFY_LIVE=true` and a real Slack webhook on dev, the same messages arrive in Slack. All tests pass.
