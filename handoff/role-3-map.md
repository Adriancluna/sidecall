# Role 3: Map + evidence (now Omar)
Last updated: Oct 24, 10:00 by Omar's Claude

> **Reassigned:** Ashwa is away, so `src/map/` belongs to **Omar** (who also keeps Role 4). Plan: `docs/specs/blast-radius-map-plan.md`. Marco keeps the rest of `src/`; nothing outside `src/map/` changed.

## Status
- **Blast radius map as a tree, merged in #81 (live on prod).** Omar asked for a tree: parent firm in the middle, companies on branches (red = urgent, amber = advisory), the breached vendor wired to the companies that share it, click any node to zoom in (Esc / "Back to portfolio" to zoom out). Props unchanged (`{ blast, selected, onSelect }`), no backend change, no new packages.
  - `BlastRadiusMap.tsx`: card, SVG map, legend, caption. Reads `getHeldPayments` (same args as `PortfolioView`, so the subscription is shared) and `listAssets`.
  - `layout.ts` (pure geometry), `copy.ts` (every word on the map), `MapList.tsx` (phones, and everywhere with `?map=grid`), `useReveal.ts` (~1.2 s reveal, skipped under reduced motion).
  - `EvidencePanel.tsx`: urgency chip, "90% · self-reported link" / "50% · candidate link from public DNS", "Acknowledged by …".
- Checked against real `getBlastRadius` output for all three seeded scenarios (convex-test dump), the plan's §1 tables match; 300-company dense mode with fixtures; 375 px has no horizontal scroll. Screenshots: project files `screenshots/map/`.
- `npm run lint`, `npm run build`, `npm test` green (rebased on main @ 839735c).
- Open in `src/map/`: Armadin Part A edge `path` labels (planned for the zoom card), EvidencePanel path block, B2 words-first confidence. Listed in `src/map/HANDOFF.md` §4.

## In progress
- Not yet seen live with a signed-in Jordan (container can't drive the login); whoever runs `/?stage` first, please check it.

## Needs from others
- **UI handoff for Roles 1 and 2: `src/map/HANDOFF.md`**. Omar asked for help improving the map UI: what was built, files, how to preview, open items per role, and the rules for helping inside `src/map/` (Role 2 may, after claiming the item in its handoff "In progress").
- → Role 1 (Adrian), optional: `firmName` for the centre node ("Northpass Capital"), `acknowledgedByName` on blast nodes. Details in `src/map/HANDOFF.md` §4.
- → Role 2 (Marco): the map is merged, so `docs/demo-script.md` / `docs/video-shot-list.md` beat 5 can say what the map shows (vendor centre, 3 lit tiles, $480,000 badge on Summit; discipline beat: green "Separate access · not exposed" tiles). `?map=grid` is the stage fallback if the SVG misbehaves.

## Decisions & gotchas
- Branch colour = how exposed; vendor-line weight = how linked (dotted = candidate DNS link); the reason line under each company = why. Summit in Brightline has a thin "customer of the vendor" line but a red branch and "Payment to a changed account".
- Ring order: the exposed block faces the vendor on the right; separate-access companies sit opposite, next to the grey sibling asset (e.g. Ironclad IT Services · not affected). The reporter's own vendor link isn't drawn.
- The centre says "Parent firm": there's no firm name in the schema. → Role 1: a firm name (e.g. on `getBlastRadius`) would let it say "Northpass Capital"; optional.
- Zoom animates the SVG viewBox (rAF, ~450 ms, instant under reduced motion).
- Above 14 companies the unrelated ones collapse into "+ N other companies, not linked".
- Never a `dns_inferred` link "validated"; status never by colour alone; no shield/radar/siren imagery (`brand/README.md`).
- `convex/notify.ts` (real Slack/Discord sending) moved to Role 1.
