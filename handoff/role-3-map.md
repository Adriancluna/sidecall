# Role 3: Map + evidence (now Omar)
Last updated: Oct 24, 08:40 by Omar's Claude

> **Reassigned:** Ashwa is away, so `src/map/` belongs to **Omar** (who also keeps Role 4). Plan: `docs/specs/blast-radius-map-plan.md`. Marco keeps the rest of `src/`; nothing outside `src/map/` changed.

## Status
- **Real blast radius map on branch `claude/project-thread-eb7miy`** (PR open, not merged; a merge deploys to prod). Props unchanged (`{ blast, selected, onSelect }`), no backend change, no new packages.
  - `BlastRadiusMap.tsx`: card, SVG map, legend, caption. Reads `getHeldPayments` (same args as `PortfolioView`, so the subscription is shared) and `listAssets`.
  - `layout.ts` (pure geometry), `copy.ts` (every word on the map), `MapList.tsx` (phones, and everywhere with `?map=grid`), `useReveal.ts` (~1.2 s reveal, skipped under reduced motion).
  - `EvidencePanel.tsx`: urgency chip, "90% · self-reported link" / "50% · candidate link from public DNS", "Acknowledged by …".
- Checked against real `getBlastRadius` output for all three seeded scenarios (convex-test dump), the plan's §1 tables match; 300-company dense mode with fixtures; 375 px has no horizontal scroll. Screenshots: project files `screenshots/map/`.
- `npm run lint`, `npm run build`, `npm test` (45) green.

## In progress
- Waiting on Omar's review of the PR. Not yet seen live on a Convex deployment with a signed-in Jordan (container can't drive the login); check `/?stage` after merge or on a dev run.

## Needs from others
- → Role 2 (Marco): when the map merges, `docs/demo-script.md` / `docs/video-shot-list.md` beat 5 can say what the map shows (vendor centre, 3 lit tiles, $480,000 badge on Summit; discipline beat: green "Separate access · not exposed" tiles). `?map=grid` is the stage fallback if the SVG misbehaves.

## Decisions & gotchas
- Tile colour = how exposed; line weight = how linked; the reason line = why. Summit in Brightline is a thin "customer of the vendor" line but an urgent tile with "Payment to a changed account".
- Rings: reporter/exposed/linked on the inner ring, separate-access/unrelated on the outer ring in the gaps. Sibling assets (e.g. Ironclad IT Services) sit in a gap, linked only to companies that don't already have a line to the breached asset.
- Line labels only appear when the line is long enough; the tile's reason line always carries the same fact.
- Above 14 companies the unrelated ones collapse into "+ N other companies, not linked".
- Never a `dns_inferred` link "validated"; status never by colour alone; no shield/radar/siren imagery (`brand/README.md`).
- `convex/notify.ts` (real Slack/Discord sending) moved to Role 1.
