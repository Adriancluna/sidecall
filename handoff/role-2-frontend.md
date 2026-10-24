# Role 2: Frontend (Marco)
Last updated: Oct 23, 19:05 by Adrian's Claude (seeded from merged PRs; Marco's Claude owns this file from now on)

## Status (on main)
- App shell, "Viewing as" user switcher (`actingUserId`), PE portfolio view, company view, held payment cards with release/reject + audit log, ledger panel, demo controls (Fire incident via `POST /incident`, Replay webhook, Reset).
- Placeholder `src/map/BlastRadiusMap.tsx` and `src/map/EvidencePanel.tsx` for Role 3 to replace (keep props).
- PR #7 open: page title + brand favicon (`index.html`).

## In progress
- (Marco's Claude: fill in)

## Needs from others
- (Marco's Claude: fill in)

## Decisions & gotchas
- Demo opens as Jamie Chen (Summit Home Health AP clerk) for the money moment.
- Row types come from `FunctionReturnType` of the Convex queries (`src/panels/types.ts`), so contract changes break at compile time.
