# Role 3: Map + evidence (Omar)
Last updated: Oct 24, 18:35 by Omar's Claude

> `src/map/` is Omar's (Ashwa is away). Since Adrian's scope change (Oct 24, `role-1-backend.md`), Role 1 owns the rest of `src/` (the dashboards, #93); Omar works only in `src/map/` and keeps the props `BlastRadiusMap { blast, selected, onSelect }` and `EvidencePanel { exposureId, companyName }`.

## Status
- On `main`: the portfolio tree map (#81, merged): parent firm in the centre, companies on branches, the breached vendor wired to the companies that share it, click to zoom, `?map=grid` / phones get the list.
- **This PR (red-team finding + Armadin spec B1/B2, Adrian's asks 2 and 5):**
  - **Evidence panel** (`EvidencePanel.tsx`): confidence in words with a bar and no percentage ("High · self-reported link" / "Medium · candidate link from public DNS"; the meter's `aria-valuetext` says the same). "What to check" first when the exposure has one. A "Red-team finding" block: "Proven at another portfolio company · reachable here, not tested", the shared hop and "Attack technique: Valid Accounts (T1078)". Evidence rows use Role 1's `readableEvidence` labels ("How you're connected", "Where the link comes from", "Payments held"…), worded for the firm ("What this means for this company"). "Not acknowledged yet" when nobody has.
  - **Map:** exposed companies on a red-team finding carry "Reachable here · not tested" under their reason (and in the detail card and `aria-label`). The reporter carries "Red-team path validated here" (firm view only; the only "validated" on the map). The figcaption says the same for screen readers. A drawn line from the vendor to the reporter crossed Cedar Ridge, so the fact is a word under the reporter instead.
  - The score was already gone from the tiles (B1); the tile's reason line is the deciding reason.
- Checked live on dev (`brainy-cassowary-804`) as Jordan: `demo-armadin-004` map and Cedar Ridge evidence; `demo-brightline-001` map and Bayview evidence ("Medium · candidate link from public DNS"). `npm run lint`, `npm run build`, `npm test` (66) green.

## In progress
- Nothing running. Not started (spec §6 of `docs/specs/ui-remake-oneshot-prompt.md`): the vendor-centred story map (ripple, particles, auto-play steps). A design brief for it exists from Omar's thread; it would replace the tree, so it needs Omar's go.

## Needs from others
- → Role 1 (optional): a firm name on `getBlastRadius` so the centre can say "Northpass Capital" instead of "Parent firm".
- → Role 1 (optional, from your #95 note): a "first step done" badge on map nodes from `responses.getResponseTracker`; not built, your "Response by company" table already shows it above the map.
- → Role 2 (Marco): demo script beat for the red-team scenario can point at the map's "Reachable here · not tested" lines and the evidence panel's "What to check".

## Decisions & gotchas
- "Validated" appears only on the reporter (firm view). Sister companies are "reachable here · not tested"; DNS links are "candidate".
- Confidence: 0.9 (self-reported) → "High", 0.5 (DNS) → "Medium" (0.5 is the midpoint, so not "Low"). Never print the number, `score` or `finding.confidence`.
- Branch colour = how exposed; vendor-line weight = how linked (dotted = candidate DNS link). Above 14 companies the unrelated ones collapse into "+ N other companies, not linked".
- Status is never colour alone; no shield/radar/siren imagery (`brand/README.md`).
