# Role 1: Backend (Adrian)
Last updated: Oct 23, 19:45 by Adrian's Claude

## Status (on main)
- **Production:** https://sidecall.vercel.app → Convex prod `judicious-tiger-712`. Presenter URL: https://sidecall.vercel.app/?stage
  - ✓ Prod is **seeded** (8 companies, 21 users with demo emails), `DEMO_MODE=true` (Reset works on `?stage`), login keys set (JWKS serving). Login code deployed via Vercel.
- **Login backend is live on dev (and ships to prod with the next Vercel build):** Convex Auth, Password provider, invite-only (sign-in links to a seeded user by email; unknown emails refused). Session always wins over `actingUserId`; `actingUserId` is optional and only used when nobody is signed in. Verified on dev: sign-up/sign-in, wrong password refused, stranger refused, `access.me` returns the user, and a signed-in clerk passing the controller's id is still refused.
- ✓ Fresh-clone test passed (clone → `npm ci` → typecheck, lint, 14 tests, build, `convex dev --once`).
- **Session-only switch ready:** deployment env `REQUIRE_SESSION=true` makes the backend ignore `actingUserId` (only signed-in users get data). Off on dev and prod until Role 2's login UI is merged.
- **DNS importer ready:** `seed.ts` imports `data/dns_links.json` (placeholder `[]` for now) as `dns_inferred` candidate links with the DNS record shown in evidence. Tested with sample data: imports, skips duplicates and unknown domains.
- ✓ done for Role 2: `getHeldPayments` → `bankChange.previousAccountLast4` and `bankChange.lastVerifiedAccountLast4`. For the $480K: new 7731, previous 4419 (also an email change), last verified **2208**. Show "2208 → 7731" on the red flag.
- Reviewed Role 2's #20 (Close, audit who/incident, PE tailored alerts): tsc, lint, build, tests green.
- Fixed: CONTRACT.md was accidentally emptied in #21; restored with all changes.
- `npm test`: 15 tests, all green (added: signed-out refused, session beats spoofed id).
- Everything from before: `/incident` fan-out, holds/flags, release/reject + audit + ledger, scoping, `resetDemo` (also wipes sign-ins now).

## In progress
1. When Role 2's login UI is on main: Adrian runs `npx convex env set REQUIRE_SESSION true --prod` (and on dev), Claude verifies, then removes the `actingUserId` arg from the API in a follow-up.
2. After 11pm: import `data/dns_links.json` into seed; review Waterloo PRs; run convex-reviewer.

## Needs from others
- → Role 2: **login backend is ready, you can start `src/auth/` now.** Everything you need is in CONTRACT.md → "Sign-in":
  - `src/main.tsx`: swap `ConvexProvider` for `ConvexAuthProvider` from `@convex-dev/auth/react` (package already installed).
  - `useAuthActions().signIn("password", { email, password: "sidecall-demo", flow })`: `flow: "signUp"` the first time for an email, `"signIn"` after. Quick-pick: try signIn, fall back to signUp.
  - `api.access.me` → current user (`role`, `companyId`, `companyName`) to choose PE vs company view.
  - When signed in you can stop passing `actingUserId`; it's ignored anyway.
  - After Reset everyone is signed out (users are recreated).
- → Role 2: **prod is ready**: re-test the full flow on https://sidecall.vercel.app (and `/?stage` for Reset). Login works on prod too once your UI lands.
- → Role 4: overwrite `data/dns_links.json` (placeholder `[]`) with `[{ companyDomain, assetName, detail }]`. Format and rules in CONTRACT.md → "DNS links". ⚠ No links to Brightline Payroll for seed companies (changes the demo headline and answer key). If your DNS work runs on real public domains, list them in your handoff and Role 1 will decide how to show them.
- → Role 2: tell Role 1 the moment the login UI is merged, so `REQUIRE_SESSION` gets flipped on prod.

## Decisions & gotchas
- **Packages added:** `@convex-dev/auth`, `@auth/core@^0.41` (runtime); `convex-test`, `vitest`, `@edge-runtime/vm` (dev). Run `npm install` after pulling. (`@auth/core@0.37.0` from older docs conflicts with the current `@convex-dev/auth`.)
- Demo emails: `first.last@<company domain>` (e.g. `rosa.alvarez@summithomehealth.example`, PE `jordan.ames@northpasscapital.example`), password `sidecall-demo`.
- Each dev deployment needs the auth signing keys once: `npx @convex-dev/auth --web-server-url http://localhost:5173 --skip-git-check` (Adrian's dev is done; teammates run it on theirs).
- Never edit `convex/schema.ts` or other Role 1 files (now incl. `convex/auth.ts`, `convex/auth.config.ts`); ask here.
- `ai.ts` is a canned-text stub for Role 4: keep function names/args, write via `internal.alerts.saveAlert`, read `internal.alerts.getWritingContext`.
- Demo bank-change dates are relative to seeding: Reset shortly before the demo.
