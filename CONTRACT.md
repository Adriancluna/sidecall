# CONTRACT.md

The data shapes and function signatures every role builds against. Owned by Role 1 (Adrian).
`convex/schema.ts` is the executable version of this file; if they disagree, the schema wins and this file gets fixed.

**Don't change the schema yourself.** Need a field, index or query? Tell Adrian.

## Changelog

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
             action: "hold" | "flag" | "release" | "reject" | "refused" | "escalate",
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
- Release moves `held → paid` in one transaction (`released` is unused, kept for compatibility).
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
- Signed out: every scoped function throws "Not signed in". Public (no sign-in needed): `listCompanies`, `listUsers`, `listAssets`, `access.me` (returns null).

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
                                                  reportedByCompanyId | null, summary | null }[]
                                                // firm: all, newest first. company: only incidents that touch it,
                                                // reportedByCompanyId and summary always null

[blastRadius] getBlastRadius({ incidentId }) -> null | {   // PE firm only; null for company users
  incident: Incident & { reportedByName: string | null },
  asset,
  nodes: { companyId, name, headcount, exposed,
           relation: NodeRelation,   // "exposed" | "reporter" | "same_vendor_separate_access" | "linked_not_exposed" | "unrelated"
           exposureId | null, urgency | null, score, confidence | null, status | null,
           heldCents }[],                                    // heldCents counts status "held" only
  edges: { companyId, assetId, shareType, source, compromised: boolean }[],
  totals: { companiesExposed, peopleExposed, heldCents, paymentsHeld }
}

[blastRadius] getExposureEvidence({ exposureId }) -> null | { exposureId, incidentId, companyId,
                                       reasons, confidence, evidence, urgency, score, status, acknowledgedBy | null }
[blastRadius] getMyExposures() -> Exposure[]       // company user's home screen; [] for the firm
[blastRadius] listCompanies() · listUsers({ companyId? }) · listAssets()   // sign-in quick-pick directory (public)
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

[blastRadius] getIncidentTimeline({ incidentId }) -> null | {
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
[seed]      resetDemo({}) -> counts                          // "Reset demo" button; throws unless DEMO_MODE=true and someone is signed in

[incidents] containIncident({ incidentId, note }) -> { ok: true } | { ok: false, reason }   // PE partner only

[payments] requestPayment({ billId }) -> { ok: true, paymentId, held, flagged } | { ok: false, reason }
                                     // AP clerk at the bill's company only; one live payment per bill
[payments] releasePayment({ paymentId, verificationNote }) -> { ok: true } | { ok: false, reason: string }
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
  companyAlerts: { exposureId, companyId, companyName, urgency, reasons, confidence }[],
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
npx convex run seed:fireDemoIncident '{"scenario":"brightline"}'   # the main demo (also: ironcladCredential, ironcladMsp)
curl -X POST https://<deployment>.convex.site/incident -H 'Content-Type: application/json' \
  -d '{"externalId":"demo-brightline-001","assetName":"Brightline Payroll","reportedByDomain":"pinecreststaffing.example"}'
```

| Scenario | What it shows |
|---|---|
| `brightline` | 3 exposed (Cedar Ridge urgent, Summit urgent, Bayview advisory), 4,200 people, $612K held, Summit's $480K flagged |
| `ironcladCredential` | Shared admin login leaked: Cedar Ridge, Granite Peak, Harborline exposed. Summit uses Ironclad with its own login → not exposed. No holds. |
| `ironcladMsp` | The vendor itself fell: every customer exposed, Harborline's $37K to a new account flagged |

## HTTP

```
POST https://<deployment>.convex.site/incident
{ "externalId": string, "assetName": string, "reportedByDomain"?: string, "summary"?: string }

Header (real senders): X-Sidecall-Signature: sha256=<hex HMAC-SHA256 of the raw body, key = INCIDENT_WEBHOOK_SECRET>

200 { "incidentId", "duplicate": false }   first time
200 { "incidentId", "duplicate": true }    replay of the same externalId (nothing new written)
400 bad body · 401 missing/invalid signature · 404 unknown asset
```

- Unsigned requests are accepted **only** for the built-in demo scenarios (`seed.ts` `SCENARIOS`: same `externalId` and `assetName`) and only where `DEMO_MODE=true`. That keeps the stage Fire / Replay buttons working without putting a secret in the browser.
- Real integrations (e.g. an Armadin finding) set `INCIDENT_WEBHOOK_SECRET` on the deployment and sign every request.
