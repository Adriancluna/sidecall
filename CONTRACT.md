# CONTRACT.md

The data shapes and function signatures every role builds against. Owned by Role 1 (Adrian).
`convex/schema.ts` is the executable version of this file; if they disagree, the schema wins and this file gets fixed.

**Don't change the schema yourself.** Need a field, index or query? Tell Adrian.

## Changelog

- **Oct 24, Pegasus payment-recovery candidate.** `paymentRecovery` adds company-scoped prepare/request/withdraw for a bill-specific correction of a rejected payment. Corrections bind existing verified bank provenance and invoice/contact snapshots, expire after 15 minutes and create exactly one held replacement, never automatic settlement or a global vendor edit. Additive `paymentRecoveries` and payment origin links; see `docs/pegasus-payment-recovery.md`.

- **Oct 24, Pegasus verified-release candidate.** `getHeldPayments` adds `releaseContext` for held rows. `releasePayment` requires a matching structured controller attestation, validates current bill/payment/contact/bank context, and writes `payments.releaseVerification` with the exact ledger reference atomically; old note-only calls receive an audited refusal. Full contract and limitations: `docs/pegasus-verified-release.md`.

- **Oct 24, ~10am.** Response playbook (`docs/specs/response-playbook.md`). Tables `responsePolicies`, `responseSteps`; audit actions `respond`, `approve`, `undo`, `expire`, `policy` (also timeline event kinds). New `convex/responses.ts`: queries `getMyPlaybook()`, `getMyResponsePlan({ incidentId })`, `getResponseTracker({ incidentId })` (firm); mutations `setPlaybookMode({ action, mode })`, `approveStep({ stepId })`, `undoStep({ stepId })`. `containIncident` expires waiting steps. Seed: Cedar Ridge pause = act, tokens = prepare; Granite Peak pause = prepare; Harborline notify. Brightline numbers unchanged.
- **Oct 24, ~9am.** Presenter lock (council A1): env `PRESENTER_KEY`. Where set (prod), `seed.resetDemo({ presenterKey? })` and unsigned demo `POST /incident` (header `X-Sidecall-Presenter`) need it; signed senders are unaffected. Unset = unchanged (dev, tests). Readiness gained "Presenter lock" (advisory) and stricter freshness (bank change < 2.5 days, $480K due in 18–20h). Lakeside sample due dates moved past Oct 30.
- **Oct 24, ~2:45am.** "What to check" for sister companies' IT leads: `exposures.path.whatToCheck?`, `getExposureEvidence().path.whatToCheck`, evidence kind `what_to_check`, `getWritingContext().companyAlerts[].whatToCheck`. Built from the technique, our own asset row and the time the path was proven, e.g. "What to check: sign-ins to Ironclad shared admin account in the last 30 days, especially after Oct 24, 08:12 UTC. Rotate that login today, even if nothing looks wrong." The action differs by link type.
- **Oct 24, ~3am.** Red-team findings, one step ahead (spec `docs/specs/armadin-one-step-ahead.md` Part A; **our own finding schema**, not Armadin's). `POST /incident` takes an optional `finding` (see HTTP); `404 unknown_reporter` when its scope isn't a portfolio company. Incidents gained `finding?` (firm-only); exposures gained `path?` and evidence kinds `technique` and `path`. `listIncidents` rows gained `findingSource` (firm only); `getBlastRadius` edges gained `path`; `getExposureEvidence` gained `path`; `getWritingContext` gained `technique` and `companyAlerts[].pathSummary`. New scenario `armadinFinding` (`demo-armadin-004`). A finding never changes score, urgency or confidence; a credential finding skips `same_vendor_only` links. Unsigned demo requests now run the stored scenario as-is (body text and findings ignored).
- **Oct 24, ~2am.** Access and robustness: `listCompanies` / `listUsers` / `listAssets` are public only where `DEMO_MODE=true` (the sign-in quick-pick); elsewhere they return `[]` when signed out, and a company user gets `email`/`phone` only for their own colleagues. `getIncidentTimeline` returns `null` to a company the incident never touched. `resetDemo` / `seed:run` return `continuing: boolean` (true: the wipe was too big for one transaction and finishes in a moment). Notifications gained `claimedAt?`; a 5-min cron requeues rows stuck in `sending`. Bank-change seed refs renamed `*_fraud` → `*_email_change` (answer key updated; `data/scorecard.json` needs a regenerate).
- **Oct 23, ~10:25pm.** MCP agent access (plan `docs/specs/mcp-implementation-plan.md`, Tasks 1–5): `POST /mcp` (bearer token). New table `agents` (survives resets); audit `actor` may be an agent id; audit action `agent_call`; `getPaymentAudit` rows gained `actorName` (and `getIncidentAudit` labels agents "<name> (agent)"). Tools: `list_held_payments`, `explain_hold`, `list_bills`, `request_payment`. No release/reject tool.
- **Oct 23, ~11:15pm.** AP import: `imports.previewApImport({ vendorsCsv, billsCsv })` and `imports.importPortfolioCompany({ vendorsCsv, billsCsv, company })` (PE partner only). Audit action `import`. Sample files in `data/samples/`.
- **Oct 23, ~10:50pm.** Notifications (spec `docs/specs/notifications.md`), backend part: tables `notificationChannels`, `notifications` (outbox); `notifications.listChannels / listOutbox / addChannel / removeChannel / sendTest`; enqueue hooks on ready alerts, holds, escalations, incidents (firm) and containment (firm); `internal.notifications.claimQueued / markResults` for Role 4's `convex/notify.ts` (stub in place); env `NOTIFY_LIVE`. Seed adds `#summit-finance` (Summit) and `#northpass-portfolio-risk` (firm) simulated Slack channels.
- **Oct 23, ~9:45pm.** Scale: `getBlastRadius` totals now come from the incident's exposures and payments (were capped by reading only 100 companies); fan-out reads bounded at 500 everywhere. New `internal.alerts.saveAlerts({ alerts: [...] })` (batch upsert, same fields as `saveAlert`). Dev/test-only `internal.ops.addScalePortfolio({ count })` (DEMO_MODE only).
- **Oct 23, ~9:25pm.** Containment: `incidents.containIncident({ incidentId, note })` (PE partner only; note ≥ 15 chars). Incidents gained `containedAt?`, `containedBy?`, `containmentNote?`; `listIncidents` rows gained `containedAt | null`; audit action `contain`; timeline event `contain` + `stats.msToContained`. After containment new requests to that vendor are not held; existing holds stay held. `scoring:exportOutcomes` may list payments with `seedRef: null` (created by `requestPayment`): scorecard scripts should skip them.
- **Oct 23, ~9:15pm.** New `payments.requestPayment({ billId })` (AP clerk; pays the vendor's latest bank details; held + flagged on creation if the vendor had an incident in the last 30 days) and `payments.getMyBills()`. Seed adds one unpaid Summit → Brightline bill ($38K). Summit's AP no longer reaches $0 after releasing the $480K (the $38K bill is still owed).
- **Oct 23, ~8:35pm.** Escalation: held payments due within 24h get one `escalation` alert to the company's controllers + an `escalate` audit row (at hold time, and by a 15-min cron). Payments gained `dueDate`, `escalatedAt`; alerts `readyAt`; exposures `acknowledgedAt`. New `blastRadius.getIncidentTimeline`. Alert kind `escalation` and audit action `escalate` added (handle unknown kinds gracefully).
- **Oct 23, ~8:20pm.** `POST /incident` needs an HMAC signature (`X-Sidecall-Signature`) except for the built-in demo scenarios on `DEMO_MODE` deployments (stage buttons unchanged). `resetDemo` needs a signed-in user. `getLedger` balances now cover every entry.
- **Oct 23, ~8:10pm.** `getHeldPayments` rows gained `decision` (who released/rejected, their note, when); `notice` is null once a payment is decided. `releasePayment` refuses notes that don't describe the call (min 15 chars, words, not just an amount).
- **Oct 23, ~8pm.** **`actingUserId` removed from every function** (identity = signed-in session only; `REQUIRE_SESSION` is gone, always on). Sign-up only accepts the demo password. New `payments.getIncidentAudit` (controls log). `data/scorecard.json` format defined (see "Scorecard").
- **Oct 23, ~7:45pm.** `getHeldPayments` `bankChange` gained `previousAccountLast4` and `lastVerifiedAccountLast4` (for Role 2's old-vs-new flag).
- **Oct 23, ~7:30pm.** `REQUIRE_SESSION=true` (deployment env) turns off the `actingUserId` fallback: only signed-in users get data. `links.detail?` holds the DNS record behind a `dns_inferred` link and shows up in exposure evidence. `data/dns_links.json` is imported by the seed (see "DNS links").
- **Oct 23, ~7:20pm.** Login (Convex Auth, email + password) on the backend. `actingUserId` is now **optional** everywhere: a signed-in session always wins and the arg is ignored; without a session the arg is the fallback. New query `api.access.me`. Users have `email`. See "Sign-in" below.
- **Oct 23, ~7pm.** `getBlastRadius` `nodes[].relation` is now typed as the `NodeRelation` union (exported from `convex/blastRadius.ts`), not `string`.
- **Oct 23, ~6:45pm (PR #3).** Every query and mutation takes `actingUserId`, except `listCompanies`, `listUsers`, `listAssets` and `resetDemo`. New: `getMyExposures`, `getMyAlerts`, `getIncidentAlerts`, `listCompanies`, `listUsers`, `listAssets`, `seed.resetDemo` (needs `DEMO_MODE=true`). `getBlastRadius` nodes gained `relation`, `exposureId`, `confidence`; edges gained `compromised`; incident gained `reportedByName`. `getHeldPayments` returns every payment an incident touched (held, paid, rejected). `getLedger` returns `{ entries, balances }`. `rejectPayment` takes optional `note`.

## Tables

```ts
companies: { name, domain, sector, headcount, holdRuleEnabled: boolean }

users:     { companyId?, name, role: "ap_clerk" | "controller" | "it" | "pe_partner",
             email?, ...Convex Auth optional fields }   // companyId absent for pe_partner

assets:    { name, vendorName, kind: "msp" | "idp" | "payroll" | "email" | "other",
             phoneOnFile }                       // the number to call when verifying a held payment

links:     { companyId, assetId,
             shareType: "shared_credential" | "shared_admin_access" | "same_vendor_only",
             source: "self_reported" | "dns_inferred",
             detail? }                           // dns_inferred: the record behind it, e.g. "MX → mx.relaymail.example"

incidents: { externalId, assetId, reportedByCompanyId?, summary?, createdAt }

exposures: { incidentId, companyId, status: "open" | "acknowledged" | "closed", acknowledgedBy?, acknowledgedAt?,
             urgency: "urgent" | "advisory",
             score,                              // 0..100
             confidence,                         // 0..1
             reasons: string[],
             evidence: { kind: string, detail: string }[] }

alerts:    { incidentId, exposureId?, companyId?, paymentId?,
             kind: "company_alert" | "vendor_letter" | "hold_notice" | "escalation",
             status: "pending" | "ready", body, readyAt? }

// ---- Money layer ----

bankDetailChanges: { assetId, changedAt, accountLast4,
                     requestChannel: "email" | "portal" | "verified_call" }

bills:     { companyId, assetId, amountCents, dueDate, description }

payments:  { billId, companyId, assetId, amountCents, accountLast4,
             status: "pending" | "held" | "released" | "rejected" | "paid",
             requestedBy, approvedBy?, heldByIncidentId?,
             bankChangeFlag?, flaggedBankChangeId?, holdReasons?: string[],
             verificationNote?, decidedAt?, dueDate?, escalatedAt? }

ledgerEntries: { companyId, date, memo, paymentId?, billId?,
                 lines: { account: "cash" | "accounts_payable" | "expense" | "equity",
                          debitCents, creditCents }[] }

auditLog:  { at, actor: "system" | userId,
             action: "hold" | "flag" | "release" | "reject" | "refused" | "escalate" | "contain" | "import" | "agent_call",
             companyId?, paymentId?, incidentId?, rule, reason }
```

All money is integer cents. All times are ms since epoch.

## Rules the data follows

**Exposure**
- Dangerous links (`shared_credential`, `shared_admin_access`) are exposed by any incident on their asset.
- `same_vendor_only` links are exposed only when the incident is on that asset itself (it always is today, since incidents point at an asset; the distinction matters for urgency and for credential-scoped incidents).
- Urgency is decided by scoring, never by the AI.
- A company's view, alert or hold notice never names `reportedByCompanyId`. Only the PE firm view may.

**Payments**
- When an incident lands, every `pending` payment whose `assetId` is the incident's asset, at a company with `holdRuleEnabled`, becomes `held` (the reporting company included). Nothing is cancelled.
- `bankChangeFlag: true` when that vendor has a `bankDetailChanges` row within 30 days before or after the incident. `flaggedBankChangeId` points at it.
- `releasePayment` refuses if the acting user is the requester, isn't a `controller` at the payment's company, or the status isn't `held`. Refusals are logged.
- Release also requires structured verification of this payment’s exact masked destination and a controller assertion of a callback to the stored number. The context returned with the held row must still match current payment, bill, vendor contact and latest bank-record facts; stale/mismatched context is audited and refused. The note is 15–2,000 characters. `verification` is optional in the argument validator only to return a useful refusal to old callers; omission never releases money.
- Release moves `held → paid` in one transaction (`released` is unused, kept for compatibility), checks the indexed already-paid bill range, and stores immutable `releaseVerification` with the reviewed context, actor/time and journal ID. Historical destinations can be explicitly verified; no account is automatically redirected. The stored attestation does not prove a call happened or identify a full real bank account.
- Every hold, flag, release, reject and refusal writes one `auditLog` row.

**Ledger (double-entry, every entry balances)**

| Event | Debit | Credit |
|---|---|---|
| Opening balance (seed) | cash | equity |
| Bill booked (seed) | expense | accounts_payable |
| Payment released | accounts_payable | cash |
| Payment held or rejected | (no entry) | |

## Queries (UI subscribes with `useQuery`)

Module prefix in brackets: `api.blastRadius.listIncidents`, etc. `null` means "none" (Convex has no `undefined`).

**Identity comes only from the signed-in session.** No function takes a user id. The backend scopes every call to the signed-in person:
- `pe_partner` (Jordan Ames, Northpass Capital) = PE firm view: sees every company, the map and who reported. Cannot acknowledge or release.
- Anyone else sees only their own company. Passing another company's id returns your own data (or nothing), never theirs.
- Signed out: every scoped function throws "Not signed in". Public (no sign-in needed): `access.me` (returns null), and on `DEMO_MODE` deployments `listCompanies`, `listUsers`, `listAssets` (otherwise they return `[]` when signed out).

## Notifications (Slack / Discord / webhook)

```ts
notificationChannels: { scope: "company" | "firm", companyId?, kind: "slack" | "discord" | "webhook", label,
                        url /* secret, never returned */, events: ("alert"|"hold"|"escalation"|"incident"|"contained")[],
                        enabled, createdBy }
notifications (outbox): { channelId, companyId?, incidentId?, event: <event> | "test",
                          refId /* "<event>:<alert or incident id>" | "test:<time>" */,
                          status: "queued" | "sending" | "sent" | "simulated" | "failed", text, error?, createdAt, claimedAt?, sentAt? }

[notifications] listChannels() -> { _id, scope, kind, label, target /* masked: host/…last4 */, events, enabled, canEdit }[]
[notifications] listOutbox({ incidentId? }) -> { _id, createdAt, channelLabel, kind | null, event, status, text, error | null, sentAt | null }[]
                // newest first, ≤ 100; firm: all (or the incident's), company: own rows
[notifications] addChannel({ scope, kind, label, url, events }) -> { ok: true, channelId } | { ok: false, reason }
[notifications] removeChannel({ channelId }) -> { ok: true } | { ok: false, reason }
[notifications] sendTest({ channelId }) -> { ok: true } | { ok: false, reason }
                // controller: own company's channels; pe_partner: firm channels. Refusals logged (rule notification_settings).

internal.notifications.claimQueued({ limit? }) -> { notificationId, event, text, incidentId, companyName, createdAt,
                                                    channel: { kind, url, label } | null }[]   // marks them "sending"
internal.notifications.markResults({ results: { notificationId, status: "sent" | "simulated" | "failed", error? }[] })
```

- Who gets what: company channels get `alert`, `hold`, `escalation` (text reuses the company's own alert, never names the reporter); firm channels get `incident` (headline numbers, may name the reporter) and `contained`.
- One row per (channel, refId): replays and re-saved alerts never notify twice. One `notify.dispatch` scheduled per mutation.
- URLs: https only; Slack must be `hooks.slack.com/services/…`, Discord `discord(app).com/api/webhooks/…`; generic webhooks can't be localhost, `.local`/`.internal` or an IP literal.
- `NOTIFY_LIVE` (deployment env) off by default: rows end `simulated`, nothing leaves Convex (stage rule).
- Sending (`convex/notify.ts`, Role 1): Slack `{ text }`, Discord `{ content }` (≤ 2,000 chars), generic `{ event, text, incidentId, company, at }`; 5 s timeout; one retry on network error/timeout/429/5xx (not 4xx); rows end `sent` (with `sentAt`) or `failed` (`error` like "HTTP 503", never the URL).
- **For the recorded video only (dev deployment):** add a real Slack incoming webhook as a channel in the Notifications card, `npx convex env set NOTIFY_LIVE true`, fire, record, then `npx convex env remove NOTIFY_LIVE`. Never on production.

## AP import (onboard a company from its own AP exports)

```ts
// PE partner only. Files are the CSV text (vendor master + open bills from any AP system).
[imports] previewApImport({ vendorsCsv, billsCsv }) -> null | {     // writes nothing; null for non-PE
  vendors: { name, bankLast4 | null, matchedTo /* tracked vendor */ | null, warning | null, openBills }[],
  bills, totalCents, problems: string[]                            // skipped rows, with reasons
}
[imports] importPortfolioCompany({ vendorsCsv, billsCsv,
  company: { name, domain, sector, headcount, apClerkName, controllerName } }) -> {
  companyId, vendors: { name, matchedTo | null, warning | null }[], newVendors, bills, totalCents,
  held, flagged, heldCents, exposedTo: string[], problems,
  logins: { name, role, email }[]                                  // sign in with password sidecall-demo
}   // throws ConvexError with a readable message for bad files, duplicate domain, non-PE
```

- Columns are matched by common AP export names: vendor master needs a vendor name (`Vendor Name` / `Vendor` / `Payee` / `Supplier`), optional `Vendor ID`, `Phone`, `Bank Account` (masked `****7731` is fine). Open bills need vendor (ID or name), amount (`Amount Due` / `Open Balance` / `Amount`) and due date (`YYYY-MM-DD` or `MM/DD/YYYY`).
- Vendors are matched to tracked vendors by normalized name; unknown vendors become new tracked vendors. Each becomes a self-reported link.
- `warning` appears when the file pays a different account than the last one confirmed by phone, even before any incident.
- During an active incident on a vendor: the new company's payments to it are held on import (flagged when the account changed recently), it gets an exposure and alert, and the PE headline includes it.
- Limits: 200 vendors, 500 bills. Samples: `data/samples/lakeside-vendor-master.csv`, `data/samples/lakeside-open-bills.csv`.

## MCP agent access (`POST /mcp`)

An AI assistant (e.g. Claude Code) uses Sidecall as **one person's AP clerk**, with exactly that person's limits. Streamable HTTP, JSON responses only; protocol versions 2025-11-25 / 2025-06-18 / 2025-03-26.

```
npx convex run agents:mint '{"name":"Summit AP assistant","onBehalfOfEmail":"jamie.chen@summithomehealth.example","tools":["list_held_payments","explain_hold","list_bills","request_payment"]}'
   -> { token: "sc_agent_…" }      // shown once; only its sha256 is stored. Never commit or paste it.
npx convex run agents:revoke '{"name":"Summit AP assistant"}'
claude mcp add --transport http sidecall https://<deployment>.convex.site/mcp --header "Authorization: Bearer <token>"
```

| Tool | Does |
|---|---|
| `list_held_payments({ status? })` | The company's held / paid / rejected payments with reasons and flags |
| `explain_hold({ paymentId })` | Reasons, bank change (new vs last verified), audit trail, `nextStep` ("…must call the number on file… This assistant cannot release or reject payments.") |
| `list_bills()` | Bills and whether each has a payment |
| `request_payment({ billId, requestId?, expectedMandateId? })` | Same request path as the company's AP clerk, including incident holds and bounded controller-approved demo purchases; see the purchasing contract below |

- Scoped to the person's company via the same `Viewer` logic; another company's or a garbage id → "Payment not found."; never the reporter.
- Each new `tools/call` writes an `auditLog` row (`action: "agent_call"`, `rule: "mcp_tool:<tool>"`); payment requests log in the same transaction as the decision. Replaying an existing `requestId`, including conflicting reuse, does not add another agent-call row. The controls log shows the actor as "Summit AP assistant (agent)".
- Segregation of duties holds: the agent requests as Jamie, so Jamie can't release it; Rosa can, in the UI.
- Errors: `Origin` header → 403; bad/missing token → 401; bad JSON → -32700; batch → -32600; unknown method → -32601; unknown tool → -32602; `GET`/`DELETE` → 405.
- Stage rule: shown only as a recorded clip, never live.

## Sign-in (Convex Auth, Password provider)

- Invite-only: only emails that exist in `users` can sign up; anyone else gets "That email isn't on a portfolio team."
- Demo emails are `first.last@<company domain>`, e.g. `jamie.chen@summithomehealth.example`, `rosa.alvarez@summithomehealth.example`, PE: `jordan.ames@northpasscapital.example`. Demo password (any user): `sidecall-demo`.
- Client: wrap the app in `ConvexAuthProvider` from `@convex-dev/auth/react` (instead of `ConvexProvider`), then `const { signIn, signOut } = useAuthActions()`.
  - First time for an email: `signIn("password", { email, password, flow: "signUp" })`. Afterwards: `flow: "signIn"`. A "Sign in as" quick-pick can try `signIn` and fall back to `signUp`.
- `api.access.me` → `null | { _id, name, email, role, companyId, companyName }`. Use it to choose PE vs company view.
- Sign-up only accepts the demo password, so a first sign-in with any other password can't lock a person out of the quick-pick.
- `seed.resetDemo` also wipes sign-ins (users are recreated), so everyone is signed out after a reset.

```ts
[blastRadius] listIncidents() -> { _id, externalId, assetId, createdAt, assetName, vendorName,
                                                  reportedByCompanyId | null, summary | null,
                                                  findingSource: "armadin" | "manual" | null }[]   // null for company users
                                                // firm: all, newest first. company: only incidents that touch it,
                                                // reportedByCompanyId and summary always null

[blastRadius] getBlastRadius({ incidentId }) -> null | {   // PE firm only; null for company users
  incident: Incident & { reportedByName: string | null },   // incident.finding?: the full finding (firm only)
  asset,
  nodes: { companyId, name, headcount, exposed,
           relation: NodeRelation,   // "exposed" | "reporter" | "same_vendor_separate_access" | "linked_not_exposed" | "unrelated"
           exposureId | null, urgency | null, score, confidence | null, status | null,
           heldCents }[],                                    // heldCents counts status "held" only
  edges: { companyId, assetId, shareType, source, compromised: boolean,
           path: "validated_at_source" | "reachable_not_tested" | null }[],
           // with a finding: reporter's compromised edge = validated_at_source; exposed sister's = reachable_not_tested
  totals: { companiesExposed, peopleExposed, heldCents, paymentsHeld }
}

[blastRadius] getExposureEvidence({ exposureId }) -> null | { exposureId, incidentId, companyId,
                                       reasons, confidence, evidence, urgency, score, status, acknowledgedBy | null,
                                       path: null | { techniqueId, techniqueName: string | null, sharedHop,
                                                      linkType, source: "validated_at_source", here: "reachable_not_tested",
                                                      whatToCheck?: string } }
// evidence may include { kind: "technique", detail: "T1078 Valid Accounts" } and { kind: "path", detail: <sister-safe sentence> }
[blastRadius] getMyExposures() -> Exposure[]       // company user's home screen; [] for the firm
[blastRadius] listCompanies() · listUsers({ companyId? }) · listAssets()   // sign-in quick-pick directory (public on DEMO_MODE; company users see only colleagues' emails)
[access]      me() -> null | { _id, name, email, role, companyId, companyName }

[payments] getHeldPayments({ incidentId?, companyId? }) -> {   // every payment the incident held, incl. later paid/rejected
                                                                         // companyId is a firm-only filter
  payment, companyName, vendorName, phoneOnFile,
  bankChange: null | { changedAt, accountLast4, requestChannel, daysBeforeIncident,
                       previousAccountLast4 | null,       // the change just before this one (may itself be suspect)
                       lastVerifiedAccountLast4 | null }, // last account confirmed by phone: the real "old" account
  holdReasons,                                  // why it was held (stays after the decision)
  notice: string | null,                        // the hold notice; null once paid or rejected
  decision: null | { status: "paid" | "rejected", byName, note, at }
}[]

[payments] getPaymentAudit({ paymentId }) -> AuditLog[]

[payments] getLedger({ companyId? }) -> null | {      // company users: own ledger; firm: pass companyId
  entries: LedgerEntry[],                                    // newest first
  balances: { cash, accounts_payable, expense, equity }      // cents, natural sign
}

[payments] getMyBills() -> { bill, vendorName, payment: null | { _id, status } }[]   // company users; [] for the firm

[payments] getIncidentAudit({ incidentId }) -> { _id, at, action, rule, reason, paymentId | null,
                                                 actorName ("System" or a person), companyName | null }[]
                                             // controls log, newest first: firm = whole portfolio, company = own rows

[blastRadius] getIncidentTimeline({ incidentId }) -> null | {   // null: no such incident, or it never touched the viewer's company
  events: { at, kind: "reported" | "hold" | "flag" | "escalate" | "refused" | "release" | "reject"
                     | "alert_ready" | "vendor_letter_ready" | "acknowledged",
            label, companyName | null }[],                       // oldest first, scoped to the viewer
  stats: { holdsInReportTransaction: boolean, msToFirstAlert, msToVendorLetter,
           msToFirstAcknowledgement, msToFirstRelease }          // ms after the report, or null
}

[alerts] getMyAlerts() -> Alert[]            // only that user's company
[alerts] getIncidentAlerts({ incidentId }) -> Alert[]   // PE firm only, includes vendor_letter
```

## Mutations (UI)

```ts
[incidents] acknowledgeExposure({ exposureId }) -> { ok: true } | { ok: false, reason: "not_found" | "not_your_company" | "already_acknowledged" | "closed" }
[incidents] closeExposure({ exposureId })       -> same shape
[seed]      resetDemo({ presenterKey? }) -> counts & { continuing }                        // "Reset demo" button; throws unless DEMO_MODE=true and someone is signed in

[incidents] containIncident({ incidentId, note }) -> { ok: true } | { ok: false, reason }   // PE partner only

[payments] requestPayment({ billId }) -> { ok: true, paymentId, held, flagged } | { ok: false, reason }
                                     // AP clerk at the bill's company only; one live payment per bill
[payments] releasePayment({ paymentId, verificationNote, verification?: { context: ReleaseContext, confirmedAccountLast4: string, calledPhoneOnFile: boolean } }) -> { ok: true } | { ok: false, reason: string }
[payments] rejectPayment({ paymentId, note? })             -> same shape
```

`reason` is human-readable; show it as-is (e.g. "The person who requested a payment cannot also approve it.").

Identity for every mutation is the signed-in session.

## Internal (Role 4 calls)

```ts
internal.alerts.saveAlert({ incidentId, exposureId?, companyId?, paymentId?, kind, body })
internal.alerts.saveAlerts({ alerts: [ /* same objects as saveAlert */ ] })   // batch: use when looping over many companies

// Everything a writer needs for one incident. Never contains the reporting company.
internal.alerts.getWritingContext({ incidentId }) -> null | {
  incidentId, externalId, summary, asset: { name, vendorName, kind, phoneOnFile },
  technique: null | { id, name: string | null },          // from a finding; names only from our ATT&CK table
  companyAlerts: { exposureId, companyId, companyName, urgency, reasons, confidence,
                   pathSummary: string | null, whatToCheck: string | null }[],        // sister-safe; never write "validated" for a sister without "not tested"
  heldPayments: { paymentId, companyId, companyName, amountCents, accountLast4, bankChangeFlag, holdReasons }[]
}

// Role 4 implements (stub in place); scheduled ONCE per incident from recordIncident, loop inside.
internal.ai.generateAlert({ incidentId })
internal.ai.generateVendorLetter({ incidentId })
internal.ai.generateHoldNotice({ incidentId })

// Scorecard input, keyed by seedRef:
internal.scoring.exportOutcomes({ externalId }) -> { incidentId, payments: { seedRef, status, held, bankChangeFlag }[],
                                                     bankChanges: { seedRef, flagged }[] }
```

## DNS links (Role 4 → seed)

`data/dns_links.json` (Role 4 owns it) is bundled into the seed at deploy time:

```json
[{ "companyDomain": "harborlinefoods.example", "assetName": "Relay Mail", "detail": "MX → mx.relaymail.example" }]
```

- `companyDomain` must equal a seed company's `domain`, `assetName` a seed asset's `name`. Unmatched entries and pairs that already have a self-reported link are skipped; `seed:run` returns `dnsImported` and `dnsSkipped`.
- Every entry becomes `shareType: "same_vendor_only"`, `source: "dns_inferred"` (lower score and confidence; shown as "candidate").
- ⚠ A DNS link to **Brightline Payroll** adds an exposed company to the main demo and changes the headline (3 / 4,200 / $612K) and the answer key. Don't, unless Role 1 updates both.

## Scorecard (Role 4 → UI)

`data/scorecard.json` (Role 4 owns it; placeholder `{ "generatedAt": null, "scenarios": [] }` until then). The UI imports it directly:

```ts
{
  generatedAt: string | null,              // ISO time the script ran
  scenarios: {
    externalId: string,                    // e.g. "demo-brightline-001"
    caught: number,                        // expected hold/flag and the system did it
    missed: number,                        // expected hold/flag, system didn't
    falseHolds: number,                    // expected no_action, system held or flagged
    correctNoAction: number,               // expected no_action, system left it alone
    cases: { ref: string, type: "payment" | "bankChange", expected: "hold_and_flag" | "hold_no_flag" | "no_action",
             actual: "hold_and_flag" | "hold_no_flag" | "no_action",
             result: "caught" | "missed" | "false_hold" | "correct_no_action", why: string }[]
  }[]
}
```

## Demo data commands

```
npx convex env set DEMO_MODE true                                  # once per dev deployment, enables resetDemo
npx convex run seed:run                                            # wipe + reseed
npx convex run seed:fireDemoIncident '{"scenario":"brightline"}'   # the main demo (also: ironcladCredential, ironcladMsp, armadinFinding)
curl -X POST https://<deployment>.convex.site/incident -H 'Content-Type: application/json' \
  -d '{"externalId":"demo-brightline-001","assetName":"Brightline Payroll","reportedByDomain":"pinecreststaffing.example"}'
```

| Scenario | What it shows |
|---|---|
| `brightline` | 3 exposed (Cedar Ridge urgent, Summit urgent, Bayview advisory), 4,200 people, $612K held, Summit's $480K flagged |
| `ironcladCredential` | Shared admin login leaked: Cedar Ridge, Granite Peak, Harborline exposed. Summit uses Ironclad with its own login → not exposed. No holds. |
| `ironcladMsp` | The vendor itself fell: every customer exposed, Harborline's $37K to a new account flagged |
| `armadinFinding` | `demo-armadin-004`: a validated red-team path at Pinecrest ending at Ironclad's shared admin login. Same exposures as `ironcladCredential`, each with a "reachable here · not tested" path; the firm sees the full finding. No holds. |

## HTTP

```
POST https://<deployment>.convex.site/incident
{ "externalId": string, "assetName": string, "reportedByDomain"?: string, "summary"?: string }

Header (real senders): X-Sidecall-Signature: sha256=<hex HMAC-SHA256 of the raw body, key = INCIDENT_WEBHOOK_SECRET>

200 { "incidentId", "duplicate": false, "correlated": false }   new episode
200 { "incidentId", "duplicate": false, "correlated": true }    new externalId, existing active episode
200 { "incidentId", "duplicate": true, "correlated": false }    replay of any previously accepted externalId (nothing new written)
400 bad body · 401 missing/invalid signature, or "presenter-only" · 404 unknown_asset / unknown_reporter
```

Optional `finding` (our own schema, modelled on autonomous red-team output; parsed in `convex/findings.ts`):

```
"finding": {
  "source": "armadin" | "manual",
  "findingId": "ARM-2026-0412",                       // /^[A-Za-z0-9._:-]{1,128}$/
  "validatedAt": "2026-10-24T08:12:00Z" | <ms>,       // not in the future
  "scope": { "organizationDomain": "pinecreststaffing.example", "engagementId"?: "ENG-..." },   // must be a portfolio company
  "technique": { "id": "T1078", "name"?: "Valid Accounts" },                                  // ATT&CK id
  "path": [ { "kind": "foothold" | "system" | "credential" | "vendor_tenant", "label": "...", "validated": true } ],  // 1–12
  "terminalAsset": { "assetName": "Ironclad shared admin account", "kind": "credential" | "vendor_tenant" },     // = last hop's kind
  "evidence"?: [ { "kind": "session", "summary": "..." } ],   // ≤ 10
  "confidence"?: 0.92
}
```

- `externalId` defaults to `"<source>:<findingId>"`, `assetName` to `terminalAsset.assetName`, `reportedByDomain` to `scope.organizationDomain`; if you send them they must agree (else 400). Body ≤ 32 KB. Any hop without `validated: true` → 400.

- Unsigned requests are accepted **only** for the built-in demo scenarios (`seed.ts` `SCENARIOS`: same `externalId` and `assetName`) and only where `DEMO_MODE=true`; the stored scenario runs as-is (body summary/finding ignored). That keeps the stage Fire / Replay buttons working without putting a secret in the browser.
- Real senders (e.g. a red-team tool posting a finding in our schema) set `INCIDENT_WEBHOOK_SECRET` on the deployment and sign every request.

## Response playbook (pre-approved steps)

Steps (`responseAction`): `pause_shared_login`, `revoke_vendor_tokens`; plus `hold_payments` (mirrors `companies.holdRuleEnabled`). Modes: `notify` ("Notify only") · `prepare` ("One click") · `act` ("Pre-approved"). External effects are simulated; each step names the real call it stands for.

```
[responses] getMyPlaybook() -> { action, label, mode, allowedModes, version | null, setByName | null, confirmedByName | null,
                                 setAt | null, proposedMode | null, proposedByName | null, canEdit, undo, wouldCall, finding,
                                 recommendedMode }[]                // company users; [] for the firm
[responses] getMyResponsePlan({ incidentId }) -> { stepId | null, action, label, effect, undo, wouldCall, mode,
                                 status: "awaiting_approval" | "queued" | "done" | "undone" | "expired" | "failed" | "recommended",
                                 capNote | null, policyRule | null, approvedByName | null, undoneByName | null,
                                 executedAt | null, msAfterReport | null, canApprove, canUndo }[]   // never names the reporter
[responses] getResponseTracker({ incidentId }) -> null | { companies: { companyId, done, ready, firstStepMs | null,
                                 notifyOnly, lowered: string[] }[], totals: { exposed, firstStepDone, ready, notifyOnly },
                                 simulated: true }               // PE firm only (throws for companies)
[responses] setPlaybookMode({ action, mode }) -> { ok: true, applied, awaitingSecondPerson } | { ok: false, reason }
[responses] approveStep({ stepId }) / undoStep({ stepId }) -> { ok: true } | { ok: false, reason }
```

Rules (enforced in Convex):
- Effective mode = min(company mode, cap). `same_vendor_only` links get no steps; `dns_inferred` caps at notify; pause caps at one click on vendor-admin (`shared_admin_access`) links and payroll vendors.
- At most 3 companies get `act` steps from one incident; the rest are lowered to one click (`capNote`).
- Steps are planned in the incident's transaction after the `externalId` dedupe (replays plan nothing); one row per (incident, company, action); the executor is scheduled once per incident.
- Only the company's `it` lead or `controller` approves, undoes or changes the playbook (holds: controller only); the firm and AP clerks are refused and logged. Raising a step to `act` takes two different people (propose, then confirm).


## Pegasus extension and Role 1 review fixes

- **Intake policy (Pegasus decision, Role 1 #112): warn immediately on signed unconfirmed reports; holds and pre-approved access steps wait for firm confirmation or an explicitly enrolled detector's confirmed report; the four built-in demo scenarios remain instant.**
- `incidents` gains optional `responseClass` (observation/vendor/credential), server-derived `correlationKey`, bounded `correlatedReports` and `evidenceRefs`, `lastReportedAt`, fixed `reviewDueAt`, `reviewedAt`, and `reviewEscalatedAt`; new index `by_correlationKey`.
- Signed HTTP intake defaults to observation. It opens explicitly unconfirmed, notify-only exposures and company alerts, visible in `listIncidents` and `getBlastRadius`; no holds, response steps, vendor letter or AI alert rewrite. Observation map payloads have zero confirmed exposure totals, `compromised:false` and no validated paths; `totals.companiesNotified` counts notified companies. Company payloads still omit reporter identity and raw summary.
- Confirmed automation requires `INCIDENT_AUTO_RESPONSE=true`, `assessment: "confirmed"`, and nonempty bounded `evidenceRefs`, as well as the existing `INCIDENT_WEBHOOK_SECRET` HMAC signature. Stage scenarios retain their confirmed behavior. Signing authenticates the sender, not the truth of its claims; these flags do not connect a real detector.
- Correlation requires the same server-derived asset/class key, no containment, and a last report within 30 days. New IDs in that episode return `correlated:true`, add an `incidentReports` receipt, and increment the count without repeating effects. Every accepted ID, including a correlated one, remains an idempotent replay after containment. Old installations without receipts retain their original-ID lookup.
- Firm report counts/receipts update on each correlated report; channel notices use the existing outbox dedupe to coalesce within fixed 15-minute intervals. The first additional report in an interval notifies immediately. No repeated company alerts or automation.
- `incidents.getResponseSafety({})` is firm-only; `reviewReport({incidentId, decision: "confirm"|"dismiss", note})` requires an independent-evidence note. Reviewing an observation closes its notify-only exposures; confirmation evaluates the confirmed episode. Contained/idle episodes do not permanently downgrade future pre-approved actions; repeat-action safeguards apply only to the same active correlation key.
- The fixed 15-minute deadline requests a routine "Scheduled review" once; it never releases payment or restores access. New payments are held only while an uncontained confirmed vendor incident is within 30 days of `createdAt`, even if reports keep arriving. Payments already held still require their controller decision.
- `investigations.submit({companyId?, sourceText})` schedules source extraction and deterministic reconciliation; `list({companyId?})` returns up to 20 company-scoped packets; `paymentQueue({companyId?})` returns `{csv, truncated}` for up to 500 company payments. None of these functions can release money or alter vendor details. New `investigations` table is scoped by `companyId`.
- AP import now rejects ambiguous/duplicate vendor identities and uses exact normalized matching, removing prefix matching.
- `sandboxResources` is an owned-test authorization table, not external identity-provider state. `sandbox.provision` is internal and demo-gated; `/sandbox/resource` verifies a test bearer credential. `RESPONSE_SANDBOX=true` lets the response executor change only explicitly provisioned resources. `responseSteps.executionMode?` is `sandbox` or `simulated`; `verification?` records owned resource access before/after and check time in the execution transaction. It is not an external HTTP/provider attestation. Undo preserves the historical check and records the undo separately.
- `responseEvidence.getRecord({incidentId})` is a firm-only, read-only JSON record: report receipts, declared findings, relationship evidence, policy/version, approvals, execution modes/checks, payment state and audit events. It returns `null` to company users; no sandbox tokens/hashes or bank details are included. Each section is bounded to 500 rows with explicit truncation flags. The record is not cryptographically attested.
- Detailed limits, deployment prerequisites and demo: `docs/pegasus-implementation.md` (Pegasus).

## Named detector authority (Pegasus source-controls branch)

- `detectors.mint` / `rotate` / `revoke` are operator-only internal functions. Each source has exact existing asset/reporter allowlists, observation or confirm authority, expiry and a hashed bearer credential; only mint/rotate return the plaintext credential once. `detectors.list({})` exposes at most 100 metadata rows to firm users and `[]` to companies, never hashes.
- `POST /incident` accepts `Authorization: Bearer sc_detector_<64 hex characters>`. Supplied Authorization exclusively selects this path: invalid/revoked/expired tokens cannot fall back to HMAC or demo auth. Source identity comes from the credential, never JSON. Legacy HMAC and the 4 demo scenarios retain the rules above when Authorization is absent.
- Named sources default to observation. Explicit `confirm` enrollment plus `assessment: "confirmed"` and nonempty `evidenceRefs` evaluates existing company response policy; the legacy global enrollment flag applies only to HMAC senders. Authentication is not independent verification of a finding's claimed truth or provider.
- Source validation, exact scope checks, official per-source rate limit (10 burst / 30 per minute) and incident intake share one mutation. Quota survives rotation and returns 429 + `Retry-After`. Scope failure returns 403. A nonempty reporter allowlist requires a listed reporter (omission is forbidden); an empty list permits only reporterless reports. Queued response and approval both recheck the incident creator's source authority, including previously company-approved steps. Revoke never releases money or undoes completed steps.
- New `detectorSources` table; optional `sourceId`/`sourceName` on incidents and receipts; optional requested/effective assessment on receipts; `by_sourceId_and_externalId` compound indexes. A receipt's replay namespace survives rotation, while global asset/class correlation prevents new sources from restarting an active episode. Undefined source ID preserves the legacy namespace without migration.
- Named intake adds the accepted receipt's `assessment` to success JSON, including on replay. The firm-only evidence record adds authenticated source metadata and receipt requested/effective assessment. Companies' `listIncidents.externalId` now contains the opaque local incident ID; raw external IDs may reveal reporter names.
- All intake is capped at 32 KiB of streamed UTF-8 bytes (413 on overflow), rejects malformed UTF-8/JSON arrays, and bounds externalId/asset at 200 characters, reporter at 253, summary at 4,000. Demo Reset (`seed.resetDemo` or internal `seed.run`) deletes source registrations after reports/incidents and invalidates every named credential; re-mint after resetting.
- Setup, boundaries and reproducible tests: `docs/pegasus-detectors.md`; live HTTP/auth/source-control report: `docs/pegasus-detector-rehearsal.json`.

### PR #120 release-review changes (Pegasus, Oct 24)

- Revoked-source waiting steps are visibly blocked in `responses.getMyResponsePlan` without revealing source identity. `approveStep` returns `{ok:false, reason:"detector_authority_inactive"}` and expires a waiting step if its creating source is revoked, expired, missing or no longer confirm-capable. Execution repeats this check even when `approvedBy` is set. Expiry is evaluated by mutations; queries do not read the clock. Completed actions and held payments keep their existing human decision/Undo rules.
- Approval/execution authority follows only the incident's creating source. Correlating detector reports into a legacy/demo episode does not add a source recheck; revoking the creator disables pending steps even when another source also submitted evidence. Authority is not automatically transferred between receipts.
- Legacy signed HTTP intake uses a separate shared `legacy-hmac` token bucket (10 burst / 30 per minute) in the incident mutation, including valid replays. Quota failures return 429 + `Retry-After`; the demo/presenter and operator paths are exempt. A sender cannot override this by supplying a JSON transport field. Named detectors keep their independent quotas.
- Detectors cannot use the four built-in scenario external IDs or the `review:` prefix (400). Named-source replay after revocation/expiry returns 401 rather than `duplicate`. Any Authorization header exclusively selects detector authentication; proxies adding one to legacy HMAC requests must remove it or supply a valid detector credential.
- Legacy transport changes: the streamed body limit is **32 KiB in bytes**, overflow now returns **413 (previously 400)**, invalid UTF-8 returns 400, and the new external-ID/summary limits are 200/4,000 characters. Named-source scope failures include a missing reporter when the registration has a nonempty reporter allowlist.
- Unknown/inactive credentials still incur one indexed lookup and have no global quota. These application limits are not ingress/DDoS protection. The pre-existing presenter check uses plain equality and allows demo requests when `PRESENTER_KEY` is unset; Role 1 owns that separate follow-up.
- `detectors.list` now has an explicit return validator; no response fields changed. Reset ordering and the exact `/fresh credential/` rotation-collision assertion have regression coverage. Detector rehearsal guards also reject the `CONVEX_DEPLOYMENT_TOKEN` deploy-key alias.

## Controller-approved purchasing and scoped MCP requests

Purchasing uses saved bills, controller approvals and deterministic Convex checks. An assistant's text, vendor document or tool description grants no financial authority. Automatic settlement requires `DEMO_MODE=true` and posts only to Sidecall's synthetic double-entry ledger; it does not call Visa, verify a real bank account or move real money. The four MCP tools above remain the complete catalog: there is no approval, preview, bank-change, release or reject tool.

### Approval and executor scope

```ts
[purchases] approve({
  billIds: Id<"bills">[], perPurchaseCents: number, budgetCents: number,
  expiresAt: number, executorAgentId?: Id<"agents">
}) -> Id<"purchaseMandates">
[purchases] revoke({ mandateId: Id<"purchaseMandates"> }) -> null
```

- Approval is refused while the vendor has an active confirmed payment-relevant incident. Only the signed-in company's controller can approve or revoke. An approval covers 1–25 distinct saved bills from one vendor at that company, each without an existing pending, held or paid payment. Amounts and limits must be positive safe integers no greater than 100,000,000 cents; the per-purchase limit cannot exceed the total budget. Expiry must be a safe timestamp later than server time and no more than 24 hours away.
- Approval stores each bill's vendor, amount, description and due date, plus the latest payee record's ID, account last four digits and change timestamp. That record must have `requestChannel: "verified_call"`. A new payee record invalidates the saved match even if its last four digits are unchanged.
- Supplying `executorAgentId` restricts execution to that exact active agent, acting for an AP clerk at the same company with the `request_payment` grant. Omitting it explicitly permits that company's AP clerks and their eligible agents (`executorScope: "company_ap"`); it is not restricted to the controller's current session or one implied agent.
- The newest mandate for the company and vendor governs every new decision, including bills omitted from that mandate. Expiry, revocation or a failed check never reactivates an older approval. The original approver must still be a controller at that company and different from the requester; an agent must still be active for the requesting AP clerk with its payment grant.
- Rejecting a held payment revokes its current applicable purchase mandate in the same transaction. An indexed rejected-bill check independently refuses older/legacy grants. Only an explicit new controller approval can acknowledge the latest rejection via a server-written `purchaseQuotes.priorRejectionId`; no requester or model supplies it. Saved earlier quotes remain unchanged.
- Revocation prevents future automatic settlement under that mandate and preserves past payments and evidence. It does not itself release, reject or reverse a payment.

### Payment decisions and retries

The UI mutation and MCP tool share the same request path:

```ts
[payments] requestPayment({
  billId: Id<"bills">, requestId?: string,
  expectedMandateId?: Id<"purchaseMandates">
}) -> PaymentRequestResult
// MCP request_payment uses string IDs and returns this JSON in a text content block.
type PaymentRequestResult =
  | { ok: true; paymentId: Id<"payments">; held: boolean; flagged: boolean;
      automatic?: boolean; receiptId?: Id<"purchaseReceipts"> }
  | { ok: false; reason: string; receiptId?: Id<"purchaseReceipts"> };
```

- Only an authenticated AP clerk or its scoped agent can request payment. Company and executor identity come from authentication, never caller-supplied company/user fields. `expectedMandateId`, when supplied, must match the current mandate when evaluating an existing approval; it pins the selected approval rather than authorizing the request itself.
- Every new request evaluates current saved data in one mutation using server time. Checks cover demo mode, requester/approver/agent authority, executor scope, approval expiry/revocation/replacement, active confirmed vendor incidents, inclusion in the approved bills, exact saved bill and payee matches, per-purchase limit, remaining total budget and absence of an existing live payment. Pending, held and paid payments prevent another payment; rejected history cannot hide one. Irrelevant observations or contained/credential incidents cannot crowd an active vendor incident out of the hold lookup.
- An approved decision creates the paid demo payment, increments `spentCents`, posts the payment ledger entry, records the receipt and writes audit evidence atomically. Its result has `automatic: true`, `held: false` and a `receiptId`. Concurrent requests cannot spend the same remaining budget independently.
- With no mandate for the vendor, the normal pending/incident-hold path applies. If every failed automatic check is `bill_not_approved`, `purchase_limit`, `total_budget`, `approval_inactive` or `executor_scope`, the request falls back to that normal path and records the refused automatic decision without moving cash or spending the approval budget. Changed bill/payee/approval, a controller rejection or failed authority still prevents automatic settlement and cannot use this ordinary fallback. If an active incident is the only additional failed check and the company's hold rule requires a hold, the same request can still return `ok: true, held: true` with that **refused automatic-purchase** receipt; `ok: true` alone does not mean paid. A held payment consumes no purchase budget and still requires the separate controller decision. Early failures such as an existing payment may have no purchase receipt.
- `requestId` is optional and must match `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`. Its namespace is the server-derived company plus actual agent ID or human user ID. Reuse with the identical `billId` and identical optional `expectedMandateId` returns the **original stored result**, before quota or financial effects; changing the bill or adding/removing/changing the approval pin returns a conflict refusal. Omit the ID for the existing non-idempotent request behavior.
- An exact retry remains a historical result after bill/payee changes, mandate expiry, revocation or replacement. It is not a fresh authorization check and does not prove the payment's current status. Current authentication, company/AP-clerk role and agent capability are still required; a revoked agent cannot replay via MCP and receives HTTP 401. Use a new request ID for a new decision, and query current state to display current payment status.
- Quotas are per agent, so an AP clerk with several agents has several independent buckets; approval/budget checks still cap money. New requests use an independent per-executor token bucket: capacity 10, replenished at 20 requests per minute. Exact retries and conflicts consume no further quota. A rate-limit refusal is not retained as a request result, so the same ID can be retried later. Admitted results, including refusals, are retained in `purchaseRequests` with no automatic TTL or purge; demo reset deletes these records before purchase receipts. Receipt export limits below do not bound request retention. No raw bearer token is stored in these rows.
- A new agent request records its agent-call audit in the same mutation. Exact replays and conflicting reuse of an already stored request ID add neither another decision receipt nor another agent-call audit row. MCP marks `ok: false` results with `isError: true`; the JSON result remains the authoritative business outcome.

### Advisory preview and company overview

```ts
[purchases] preview({ billId: Id<"bills">, asOf: number,
  executorAgentId?: Id<"agents"> }) -> null | {
    decision: "manual" | "refused" | "approved"; reason: string;
    evidence: PurchaseEvidence | null; mandateId: Id<"purchaseMandates"> | null;
    existingPaymentId: Id<"payments"> | null;
  }
[purchases] overview({}) -> null | {
  eligibleAgents, canApprove, demoOnly: true, enabled, mandates, receipts
}
```

Preview is read-only and company-scoped; PE or another company's bill returns `null`. `asOf` must be a nonnegative safe integer timestamp. It is a caller-selected evaluation time against **current database records**, not a historical snapshot, reservation or authority to spend. A selected eligible agent supplies the executor context for the shared evaluator; a revoked or otherwise ineligible selected agent returns an explicit refusal. Without a selected agent, the signed-in user is the executor. Execution always checks again with server time, regardless of an earlier approved preview. Clients can retain preview's mandate ID as `expectedMandateId` on a later request.

Eligible agents are read through the `by_onBehalfOfEmail_and_revokedAt` index for this company's AP clerks, not a global recent-agent scan. Public purchasing functions have explicit return validators. Overview is a bounded company view: it considers up to 100 mandate rows, keeps one per vendor within that window, returns the latest 50 receipts and supplies eligible agent labels without credentials. It is not a complete history or the source of execution authority. `canApprove` reflects the viewer's controller role; `enabled` reflects demo mode. PE viewers receive `null`.

### Decision evidence and bounded export

New `purchaseReceipts` include the company, mandate, bill, requesting user (`actorId`), optional actual `agentId` and `requestId`, decision time/amount, `outcome: "paid_demo" | "refused"`, rule and reason. `paymentId` is present for paid purchases and incident-held requests; `ledgerEntryId` links paid demo receipts to their payment journal entry. Earlier receipts can omit the newly optional evidence/agent/request/ledger fields.

```ts
type PurchaseEvidence = {
  version: 1; currency: "USD"; evaluatedAt: number;
  executorScope: "company_ap" | "specific_agent";
  executorAgentId: Id<"agents"> | null; // approval's selected executor, if any
  checks: { code: string; passed: boolean; reason: string }[];
  expected: {
    mandateId: Id<"purchaseMandates">; quoteId: Id<"purchaseQuotes"> | null;
    bill: BillFacts | null; payee: PayeeFacts;
    approvedBy: Id<"users">; expiresAt: number;
  };
  current: {
    bill: BillFacts; payee: PayeeFacts | null;
    agentId: Id<"agents"> | null; incidentId: Id<"incidents"> | null;
  };
  budget: { beforeCents: number; afterCents: number; limitCents: number };
};
type BillFacts = { assetId: Id<"assets">; amountCents: number;
  description: string; dueDate: number };
type PayeeFacts = { bankDetailId: Id<"bankDetailChanges">; accountLast4: string;
  changedAt: number; requestChannel: string };

[purchases] getRecord({}) -> null | {
  format: "sidecall.purchase-record.v1"; settlement: "demo_ledger";
  companyId: Id<"companies">;
  receipts: PurchaseReceipt[]; receiptsTruncated: boolean;
  approvals: (PurchaseMandate & { quotes: PurchaseQuote[]; quotesTruncated: boolean })[];
  scope: string;
}
```

Evidence stores expected and evaluated facts at decision time, plus every check; the first failing check determines a refusal's rule/reason. `budget.beforeCents` and `afterCents` are **spent amounts**, not remaining balances; a refusal leaves them equal. The snapshot remains evidence of that decision even when current records change. Exported approval rows are the referenced original mandates with their current spent/revoked fields; use the receipt's evidence for the decision-time values.

`getRecord` returns only the signed-in company's latest 50 decision receipts and the original approvals they reference, with up to 25 saved quotes per approval. It reads one extra row to expose `receiptsTruncated` and `quotesTruncated`; PE viewers receive `null`. This is a bounded demo record, not a full ledger dump, payment-network receipt, signed attestation or proof of real-world payee verification.

### Purchasing review boundaries (Oct 24, Pegasus)

`loadSamples` requires demo mode, a company controller, and a configured nonempty `PRESENTER_KEY` that exactly matches the request; unset configuration fails closed. These synthetic assets can appear on the firm map, and demo Reset clears them. Rehearsal preflight requires the matching local presenter key without printing it.

The payment-relevant incident window remains 30 days from original creation: a still-uncontained incident older than that stops blocking new automatic purchases, matching the existing hold policy. Previously held payments remain held until a controller decides. This is a demo policy, not permanent account-verification authority.
