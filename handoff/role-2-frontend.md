# Role 2: Frontend (Marco)
Last updated: Oct 23, 19:06 by Marco's Claude

## Status (on main)
- App shell, "Viewing as" switcher (passes `actingUserId`), PE portfolio view, company view, held payment cards (release/reject, refusals inline, audit log), ledger panel (cash + AP from `getLedger` balances).
- Demo controls: Fire incident and Replay webhook `POST /incident` (`brightline` scenario). Reset (`seed.resetDemo`) shows only when the URL has `?stage`.
- Title "Sidecall" + brand favicon (#7). Webhook host derived from `VITE_CONVEX_URL` when `VITE_CONVEX_SITE_URL` is unset (#9).
- Verified on Marco's dev deployment: $480K held + flagged at Summit; requester refused; controller release moves cash $5.00M → $4.52M, AP → $0; PE headline "3 companies exposed · 4,200 people · $612,000 held"; evidence panel; replay = duplicate; two-tab acknowledge race, exactly one wins.
- Local find-skills skill removed (✓ done for Role 1).

## In progress
1. Test the full flow on the Vercel production URL once Adrian deploys and seeds.
2. After 11pm: Convex Auth login (replaces the switcher), scorecard panel, demo script, Devpost, backup video.

## Needs from others
- → Role 1: send the production URL after the first deploy + `seed:run --prod`.
- → Role 1: auth provider choice when we start login (proposal: Convex Auth with Password, plus Anonymous for judges). Will confirm before touching anything.

## Decisions & gotchas
- Demo opens as Jamie Chen (Summit Home Health AP clerk, requester of the $480K). Presenter URL: `/?stage` (shows Reset).
- Row types come from `FunctionReturnType` of the Convex queries (`src/panels/types.ts`), so contract changes break at compile time.
- `src/map/BlastRadiusMap.tsx` and `src/map/EvidencePanel.tsx` are working placeholders. Role 3 replaces the insides, keeps the props.
- Switching "Viewing as" remounts the company view (`key={user._id}`), so refusals and notes never carry over between users.
