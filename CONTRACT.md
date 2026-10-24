# CONTRACT.md

The data shapes and function signatures every role builds against. Owned by Role 1 (Adrian).
`convex/schema.ts` is the executable version of this file; if they disagree, the schema wins and this file gets fixed.

**Don't change the schema yourself.** Need a field, index or query? Tell Adrian.

## Tables

```ts
companies: { name, domain, sector, headcount, holdRuleEnabled: boolean }

users:     { companyId?, name, role: "ap_clerk" | "controller" | "it" | "pe_partner",
             tokenIdentifier? }                  // companyId absent for pe_partner; tokenIdentifier set once auth lands

assets:    { name, vendorName, kind: "msp" | "idp" | "payroll" | "email" | "other",
             phoneOnFile }                       // the number to call when verifying a held payment

links:     { companyId, assetId,
             shareType: "shared_credential" | "shared_admin_access" | "same_vendor_only",
             source: "self_reported" | "dns_inferred" }

incidents: { externalId, assetId, reportedByCompanyId?, summary?, createdAt }

exposures: { incidentId, companyId, status: "open" | "acknowledged" | "closed",
             urgency: "urgent" | "advisory",
             score,                              // 0..100
             confidence,                         // 0..1
             reasons: string[],
             evidence: { kind: string, detail: string }[] }

alerts:    { incidentId, exposureId?, companyId?, paymentId?,
             kind: "company_alert" | "vendor_letter" | "hold_notice",
             status: "pending" | "ready", body }

// ---- Money layer ----

bankDetailChanges: { assetId, changedAt, accountLast4,
                     requestChannel: "email" | "portal" | "verified_call" }

bills:     { companyId, assetId, amountCents, dueDate, description }

payments:  { billId, companyId, assetId, amountCents, accountLast4,
             status: "pending" | "held" | "released" | "rejected" | "paid",
             requestedBy, approvedBy?, heldByIncidentId?,
             bankChangeFlag?, flaggedBankChangeId?, holdReasons?: string[],
             verificationNote?, decidedAt? }

ledgerEntries: { companyId, date, memo, paymentId?, billId?,
                 lines: { account: "cash" | "accounts_payable" | "expense" | "equity",
                          debitCents, creditCents }[] }

auditLog:  { at, actor: "system" | userId,
             action: "hold" | "flag" | "release" | "reject" | "refused",
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

```ts
[blastRadius] listIncidents() -> (Incident & { assetName, vendorName })[]   // newest first

[blastRadius] getBlastRadius({ incidentId }) -> null | {      // PE firm view only
  incident: Incident & { reportedByName: string | null },
  asset,
  nodes: { companyId, name, headcount, exposed,
           relation: "exposed" | "reporter" | "same_vendor_separate_access" | "linked_not_exposed" | "unrelated",
           exposureId | null, urgency | null, score, confidence | null, status | null,
           heldCents }[],                                    // heldCents counts status "held" only
  edges: { companyId, assetId, shareType, source, compromised: boolean }[],
  totals: { companiesExposed, peopleExposed, heldCents, paymentsHeld }
}

[blastRadius] getExposureEvidence({ exposureId }) -> null | { reasons, confidence, evidence, urgency, score, status }
[blastRadius] listCompanies() · listUsers({ companyId? }) · listAssets()   // pickers / demo user switcher

[payments] getHeldPayments({ incidentId?, companyId? }) -> {   // every payment the incident held, incl. later paid/rejected
  payment, companyName, vendorName, phoneOnFile,
  bankChange: null | { changedAt, accountLast4, requestChannel, daysBeforeIncident },
  holdReasons, notice: string | null
}[]

[payments] getPaymentAudit({ paymentId }) -> AuditLog[]

[payments] getLedger({ companyId }) -> {
  entries: LedgerEntry[],                                    // newest first
  balances: { cash, accounts_payable, expense, equity }      // cents, natural sign
}

[alerts] getMyAlerts({ actingUserId }) -> Alert[]            // only that user's company
[alerts] getIncidentAlerts({ incidentId }) -> Alert[]        // PE view, includes vendor_letter
```

## Mutations (UI)

```ts
[incidents] acknowledgeExposure({ exposureId }) -> { ok: true } | { ok: false, reason: "not_found" | "already_acknowledged" | "closed" }
[incidents] closeExposure({ exposureId })       -> same shape

[payments] releasePayment({ paymentId, actingUserId, verificationNote }) -> { ok: true } | { ok: false, reason: string }
[payments] rejectPayment({ paymentId, actingUserId, note? })             -> same shape
```

`reason` is human-readable; show it as-is (e.g. "The person who requested a payment cannot also approve it.").

`actingUserId` is temporary. Once login lands it is removed and identity comes from `ctx.auth`.

## Internal (Role 4 calls)

```ts
internal.alerts.saveAlert({ incidentId, exposureId?, companyId?, paymentId?, kind, body })

// Everything a writer needs for one incident. Never contains the reporting company.
internal.alerts.getWritingContext({ incidentId }) -> null | {
  incidentId, summary, asset: { name, vendorName, kind, phoneOnFile },
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

## Demo data commands

```
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

200 { "incidentId", "duplicate": false }   first time
200 { "incidentId", "duplicate": true }    replay of the same externalId (nothing new written)
400 bad body · 404 unknown asset
```
