# Role 1: Backend (Adrian)
Last updated: Oct 23, 19:25 by Adrian's Claude

## Status (on main)
- **Production:** https://sidecall.vercel.app → Convex prod `judicious-tiger-712`. Presenter URL: https://sidecall.vercel.app/?stage
  - ⚠ Still **not seeded** and **login keys not set** on prod. Adrian runs once (Claude can't touch prod):
    ```
    npx convex env set DEMO_MODE true --prod
    npx convex run seed:run --prod
    npx @convex-dev/auth --prod --web-server-url https://sidecall.vercel.app
    ```
- **Login backend is live on dev (and ships to prod with the next Vercel build):** Convex Auth, Password provider, invite-only (sign-in links to a seeded user by email; unknown emails refused). Session always wins over `actingUserId`; `actingUserId` is optional and only used when nobody is signed in. Verified on dev: sign-up/sign-in, wrong password refused, stranger refused, `access.me` returns the user, and a signed-in clerk passing the controller's id is still refused.
- `npm test`: 14 tests, all green (added: signed-out refused, session beats spoofed id).
- Everything from before: `/incident` fan-out, holds/flags, release/reject + audit + ledger, scoping, `resetDemo` (also wipes sign-ins now).

## In progress
1. Fresh-clone test by 10:45pm.
2. Once Role 2's login UI is on main: remove the `actingUserId` fallback entirely (session only).
3. After 11pm: import `data/dns_links.json` into seed; review Waterloo PRs; run convex-reviewer.

## Needs from others
- → Role 2: **login backend is ready, you can start `src/auth/` now.** Everything you need is in CONTRACT.md → "Sign-in":
  - `src/main.tsx`: swap `ConvexProvider` for `ConvexAuthProvider` from `@convex-dev/auth/react` (package already installed).
  - `useAuthActions().signIn("password", { email, password: "sidecall-demo", flow })`: `flow: "signUp"` the first time for an email, `"signIn"` after. Quick-pick: try signIn, fall back to signUp.
  - `api.access.me` → current user (`role`, `companyId`, `companyName`) to choose PE vs company view.
  - When signed in you can stop passing `actingUserId`; it's ignored anyway.
  - After Reset everyone is signed out (users are recreated).
- → Role 2: re-test the full flow on prod once Adrian runs the three commands above.
- → Role 4: deliver `data/dns_links.json` as `[{ companyDomain, assetName }]`.

## Decisions & gotchas
- **Packages added:** `@convex-dev/auth`, `@auth/core@^0.41` (runtime); `convex-test`, `vitest`, `@edge-runtime/vm` (dev). Run `npm install` after pulling. (`@auth/core@0.37.0` from older docs conflicts with the current `@convex-dev/auth`.)
- Demo emails: `first.last@<company domain>` (e.g. `rosa.alvarez@summithomehealth.example`, PE `jordan.ames@northpasscapital.example`), password `sidecall-demo`.
- Each dev deployment needs the auth signing keys once: `npx @convex-dev/auth --web-server-url http://localhost:5173 --skip-git-check` (Adrian's dev is done; teammates run it on theirs).
- Never edit `convex/schema.ts` or other Role 1 files (now incl. `convex/auth.ts`, `convex/auth.config.ts`); ask here.
- `ai.ts` is a canned-text stub for Role 4: keep function names/args, write via `internal.alerts.saveAlert`, read `internal.alerts.getWritingContext`.
- Demo bank-change dates are relative to seeding: Reset shortly before the demo.
