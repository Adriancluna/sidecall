# Role 1: Backend (Adrian)
Last updated: Oct 23, 19:05 by Adrian's Claude

## Status (on main)
- Schema, `CONTRACT.md` (with changelog), `CLAUDE.md` are the source of truth.
- `POST /incident` (CORS on, dedupes on `externalId`) → one transaction: incident, payment holds + bank-change flags, scored exposures, pending alerts, AI scheduled once per incident.
- Release/reject: requester ≠ approver, controller at that company only, verification note required, refusals logged, release posts Dr AP / Cr cash.
- Every query/mutation takes `actingUserId`, scoped in `convex/access.ts` (pe_partner sees all; others their own company only).
- `seed:run`, `seed:fireDemoIncident` (scenarios: `brightline`, `ironcladCredential`, `ironcladMsp`), `seed:resetDemo` (needs `DEMO_MODE=true`).
- Verified on dev: 3 exposed · 4,200 people · $612K held; answer key matches all 3 scenarios.
- `vercel.json` + README deploy steps. Vercel project just created; not deployed yet.

## In progress
1. Vercel + Convex production: Adrian adds `CONVEX_DEPLOY_KEY` and `VITE_CONVEX_SITE_URL` in Vercel, first deploy, then `npx convex env set DEMO_MODE true --prod` and `npx convex run seed:run --prod` (Adrian runs these; Claude is blocked from prod).
2. Review/merge PR #7 (Role 2, favicon + title) once Adrian OKs.
3. convex-test suite (idempotent replay, race-safe acknowledge, segregation of duties, ledger balances). Waiting on team OK to add `convex-test`, `vitest`, `@edge-runtime/vm` as devDependencies.
4. Fresh-clone test by 10:45pm.
5. After 11pm: import `data/dns_links.json` into seed (as `same_vendor_only` / `dns_inferred`), switch identity to `ctx.auth` once Role 2's auth lands.

## Needs from others
- → Role 2: show the Reset button only when the URL has `?stage` (prod will have `DEMO_MODE=true`). Drop the local find-skills skill (`git checkout skills-lock.json`, delete `.agents/skills/find-skills/`).
- → Role 2: tell Role 1 when auth is ready, and which provider; Role 1 merges auth tables into the schema.
- → Role 4: deliver `data/dns_links.json` as `[{ companyDomain, assetName }]` (domains must match seed company domains, or tell Role 1 the real domains to use).

## Decisions & gotchas
- Never edit `convex/schema.ts` or other Role 1 files; ask here instead.
- `ai.ts` is a canned-text stub. Role 4 replaces the insides, keeps the three function names/args, writes through `internal.alerts.saveAlert`, and reads context from `internal.alerts.getWritingContext` (never contains the reporter).
- Scorecard input: `npx convex run scoring:exportOutcomes '{"externalId":"demo-brightline-001"}'`, compare to `data/answer_key.json` by `seedRef`.
- Demo bank-change dates are relative to seeding: reseed shortly before firing the demo incident, or the "2 days before" turns into more.
- Production deploys only through Vercel builds (`vercel.json` runs `npx convex deploy --cmd 'npm run build'`).
