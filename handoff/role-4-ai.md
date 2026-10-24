# Role 4: AI + scorecard + DNS (Waterloo #2, Omar)
Last updated: Oct 23, 21:05 by Adrian's Claude (current brief, matches `main`; Role 4's Claude owns this file from now on)

> **This file replaces any older Role 4 brief** (e.g. `role-4-ai-dns.md` handed out earlier). Where they differ, this file, `CONTRACT.md` and the code on `main` win.

## Status
- Not started. `convex/ai.ts` is a working stub with canned text; it already runs end to end on every incident.

## Setup (once, on your machine)
```
git pull --rebase origin main && npm install
npx convex dev                                    # your own dev database; keep it running or use --once
npx @convex-dev/auth --web-server-url http://localhost:5173 --skip-git-check   # login keys for your dev
npx convex env set DEMO_MODE true                 # Fire / Reset buttons
npx convex run seed:run                           # demo data
npm run dev                                       # app; sign in via the quick-pick, password sidecall-demo
npm test                                          # 21 backend tests, should be green
```

## Your files
`convex/ai.ts`, `prompts/`, `scripts/dns/`, `scripts/scorecard/`, `data/dns_links.json`, `data/scorecard.json`, `data/ai_cache.json` (new, see below), `data/dns_findings.json` (new, optional). Anything else in `convex/` is Role 1: ask in "Needs from others".

## 1. AI writing (`convex/ai.ts`)
- Keep the three exports and their args exactly: `generateAlert({ incidentId })`, `generateVendorLetter({ incidentId })`, `generateHoldNotice({ incidentId })`. Each is an `internalAction`, scheduled **once per incident**; loop inside over every company / payment.
- Read: `ctx.runQuery(internal.alerts.getWritingContext, { incidentId })` → `{ incidentId, externalId, summary, asset: { name, vendorName, kind, phoneOnFile }, companyAlerts: [{ exposureId, companyId, companyName, urgency, reasons, confidence }], heldPayments: [{ paymentId, companyId, companyName, amountCents, accountLast4, bankChangeFlag, holdReasons }] }`. It never contains the reporting company.
- Write: `ctx.runMutation(internal.alerts.saveAlert, { incidentId, exposureId?, companyId?, paymentId?, kind, body })` with `kind` = `"company_alert"` (pass `exposureId` + `companyId`), `"vendor_letter"` (no ids), `"hold_notice"` (pass `paymentId` + `companyId`). It upserts and marks the alert ready.
- Don't write `"escalation"` alerts: the backend does those.
- **Pre-generated for the demo (nothing on stage hits the network except Convex):** generate text off stage into `data/ai_cache.json`, keyed `"<externalId>|<kind>|<companyName or 'vendor'>"`, and have `ai.ts` `import cache from "../data/ai_cache.json"` and use it first. Only call the model when `env.AI_LIVE === "true"` (read `env` from `./_generated/server`; `ANTHROPIC_API_KEY` and `AI_LIVE` are already declared in `convex/convex.config.ts`). Fall back to the current canned text if neither exists. `fetch` works in Convex actions without `"use node"`.
- Copy rules: never name the reporting company; hold notices say "held until verified", never "fraud"; tell readers to call the number on file, never one from a recent email; never call a `dns_inferred` link "validated". Urgency comes from the backend (`urgency` field): don't invent it.

## 2. Scorecard (`scripts/scorecard/` → `data/scorecard.json`)
- Per scenario, on a fresh seed, in this order (the Ironclad credential case expects Ironclad payments untouched, so fire it before the Ironclad MSP one):
  ```
  npx convex run seed:run
  npx convex run seed:fireDemoIncident '{"scenario":"brightline"}'
  npx convex run seed:fireDemoIncident '{"scenario":"ironcladCredential"}'
  npx convex run seed:fireDemoIncident '{"scenario":"ironcladMsp"}'
  npx convex run scoring:exportOutcomes '{"externalId":"demo-brightline-001"}'   # and the other two
  ```
- `exportOutcomes` → `{ incidentId, payments: [{ seedRef, status, held, bankChangeFlag }], bankChanges: [{ seedRef, flagged }] }`. Compare to `data/answer_key.json` by `seedRef` (`ref` there). A payment's actual is `hold_and_flag` / `hold_no_flag` / `no_action`; a bank change is `hold_and_flag` if flagged else `no_action`.
- Write `data/scorecard.json` **exactly** in the CONTRACT.md → "Scorecard" shape (`generatedAt`, `scenarios[]` with `externalId, caught, missed, falseHolds, correctNoAction, cases[{ ref, type, expected, actual, result, why }]`). The Proof panel validates that shape and shows "unreadable" otherwise.
- Nothing in `convex/` may read `data/answer_key.json`; only your script does.

## 3. DNS links (`scripts/dns/` → `data/dns_links.json`)
- Shape (CONTRACT.md → "DNS links"): `[{ "companyDomain": "<seed company domain>", "assetName": "<seed asset name>", "detail": "MX → mx.relaymail.example" }]`. The seed imports it on deploy as `same_vendor_only` / `dns_inferred` candidate links; unmatched entries are skipped (`seed:run` reports `dnsImported`, `dnsSkipped`).
- ⚠ **No links to "Brightline Payroll"** for seed companies: it changes the demo headline (3 · 4,200 · $612K) and the answer key.
- Seed domains are fictional (`*.example`). If you scan **real** public domains to prove the detection works, put those results in `data/dns_findings.json` (`[{ domain, vendor, record, evidence }]`) for the Proof panel ("real"), and keep `dns_links.json` to seed companies only. Tell Role 2 when it exists.

## 4. If you post to `/incident` yourself
Unsigned requests are accepted only for the three demo scenarios. Anything else needs `X-Sidecall-Signature: sha256=<hex HMAC-SHA256 of the raw body, key INCIDENT_WEBHOOK_SECRET>`; ask Adrian for the secret.

## In progress
- (Role 4's Claude: fill in)

## Needs from others
- (Role 4's Claude: fill in)

## Decisions & gotchas
- No new npm packages without telling the team in your handoff first. Plain `fetch` to the model API needs no SDK.
