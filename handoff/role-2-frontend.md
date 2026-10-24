# Role 2: Frontend (Marco)
Last updated: Oct 23, 19:24 by Marco's Claude

## Status (on main after this PR)
- App shell, "Viewing as" switcher (passes `actingUserId`), PE portfolio view, company view, held payment cards (release/reject, refusals inline), ledger panel (cash + AP from `getLedger` balances).
- Company alerts: **Acknowledge + Close** (`closeExposure`), refusals shown inline.
- Audit log on each payment shows **who** (user name or "System"), the rule, and **which incident** ("Brightline Payroll incident").
- PE view: headline, blast radius + evidence, **held payments for the selected company** under the evidence panel, **tailored alerts list** (urgent first, with status), all held payments (read-only), vendor letter.
- Demo controls: Fire incident and Replay webhook `POST /incident` (`brightline` scenario). Reset (`seed.resetDemo`) only on `/?stage`.
- Title "Sidecall" + brand favicon. Webhook host derived from `VITE_CONVEX_URL` when `VITE_CONVEX_SITE_URL` is unset.
- Verified on Marco's dev deployment: $480K held + flagged at Summit; requester refused; controller release moves cash $5.00M → $4.52M, AP → $0; PE headline "3 companies exposed · 4,200 people · $612,000 held"; evidence; replay = duplicate; two-tab acknowledge race, exactly one wins.
- Dev login keys set on Marco's dev (`npx @convex-dev/auth`), pulled #17, dev reseeded (users have demo emails). `npm test` 14/14.

## In progress
1. Smoke-test the full flow on https://sidecall.vercel.app now that prod is seeded (✓ seen in Role 1's file).
2. `src/auth/` sign-in UI (Role 1's backend is ready): `ConvexAuthProvider` in `main.tsx`, email + password form, "Sign in as" quick-pick (seeded email + `sidecall-demo`, signIn then signUp fallback), `api.access.me` picks PE vs company view, then drop `actingUserId` from every call.
3. Then: scorecard panel (when Role 4's `data/scorecard.json` exists), demo script, Devpost, backup video.

## Needs from others
- → Role 1: `getHeldPayments` → add the vendor's **previous** account last 4 to `bankChange` (e.g. `previousAccountLast4`, the change before the flagged one). Role file asks for "old vs. new account last 4" on the red flag; today only the new one is available.

## Decisions & gotchas
- ✓ Agree with Role 1's auth decision (Password only, no Anonymous, quick-pick for judges).
- Demo opens as Jamie Chen (Summit Home Health AP clerk, requester of the $480K). Presenter URL: `/?stage` (shows Reset).
- Row types come from `FunctionReturnType` of the Convex queries (`src/panels/types.ts`), so contract changes break at compile time.
- `src/map/BlastRadiusMap.tsx` and `src/map/EvidencePanel.tsx` are working placeholders. Role 3 replaces the insides, keeps the props. The selected company's held payments live in `PortfolioView`, not in the map files.
- Switching "Viewing as" remounts the company view (`key={user._id}`), so refusals and notes never carry over between users.
