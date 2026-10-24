# Role 1: Backend (Adrian)
Last updated: Oct 23, 19:20 by Adrian's Claude

## Status (on main)
- **Production:** https://sidecall.vercel.app → Convex prod `judicious-tiger-712` (webhook `https://judicious-tiger-712.convex.site/incident`). Presenter URL: https://sidecall.vercel.app/?stage
  - ⚠ Prod has **no seed data yet** (Role 2 saw it too). Adrian runs once: `npx convex env set DEMO_MODE true --prod`, then `npx convex run seed:run --prod`. Claude can't touch prod.
- Every Vercel build deploys Convex prod first (`vercel.json`). Only Vercel env var needed: `CONVEX_DEPLOY_KEY`.
- Backend: `POST /incident` fan-out (holds, flags, scored exposures, pending alerts, AI scheduled once), release/reject with segregation of duties + audit + ledger, every query scoped by `actingUserId` (`convex/access.ts`), `seed:resetDemo` gated by `DEMO_MODE`. Seed scenarios: `brightline`, `ironcladCredential`, `ironcladMsp`.
- **Tests:** `npm test` runs 12 convex-test cases (replay writes nothing, 3 / 4,200 / $612K headline, flagging, same-vendor-not-exposed, ack race exactly one wins, cross-company ack refused, release refusals logged, release moves cash once, reject leaves ledger alone, every ledger entry balances, scoping, reset gate). All green.
- ✓ done for Role 2: merged #5, #7, #9, #12, #13 (Reset only on `?stage`, find-skills dropped).

## In progress
1. Fresh-clone test by 10:45pm.
2. Auth backend (decision below), so Role 2 isn't blocked after 11pm.
3. After 11pm: import `data/dns_links.json` into seed; review Waterloo PRs; run convex-reviewer.

## Needs from others
- → Role 2: prod URL is above. Re-test the full flow on prod once Adrian seeds it.
- → Role 2: auth decision below. Disagree? Say so in your file; otherwise Role 1 builds the backend half.
- → Role 4: deliver `data/dns_links.json` as `[{ companyDomain, assetName }]` (domains must match seed domains, or list the real domains you used).

## Decisions & gotchas
- **New devDependencies (announced here):** `convex-test`, `vitest`, `@edge-runtime/vm`, and an `npm test` script. Run `npm install` after pulling.
- **Auth decision:** Convex Auth (`@convex-dev/auth`) with the **Password** provider only. No Anonymous: an anonymous user has no company, so it can see nothing. Each seeded user gets a demo email (e.g. `jamie.chen@summithomehealth.example`) and one shared demo password. On sign-in the backend links the auth account to the existing seeded user by email, so the signed-in id is our `users` id and `convex/access.ts` switches from `actingUserId` to `ctx.auth` in one place.
  - Role 1 owns `convex/auth.ts`, `convex/auth.config.ts`, auth routes in `http.ts`, the schema merge and the email field.
  - Role 2 owns the `src/auth/` sign-in UI. Keep a "Sign in as" quick-pick for the demo (signs in with the seeded email + demo password) so judges can still switch roles.
  - Until it lands, keep passing `actingUserId`.
- Never edit `convex/schema.ts` or other Role 1 files; ask here instead.
- `ai.ts` is a canned-text stub. Role 4 replaces the insides, keeps the three function names/args, writes through `internal.alerts.saveAlert`, reads `internal.alerts.getWritingContext` (never contains the reporter).
- Scorecard input: `npx convex run scoring:exportOutcomes '{"externalId":"demo-brightline-001"}'`, compared to `data/answer_key.json` by `seedRef`.
- Demo bank-change dates are relative to seeding: reseed (Reset on `?stage`) shortly before the demo, or "2 days before" drifts.
