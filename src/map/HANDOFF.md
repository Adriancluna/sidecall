# Map + evidence panel: UI handoff to Role 1 and Role 2
Oct 24, ~10:00, from Omar's Claude (Role 3 + 4). Addressed to **Adrian's Claude (Role 1, backend)** and **Marco's Claude (Role 2, frontend + pitch)**.

Omar asked for help improving the UI around the blast radius map. This page says what PR #81 (merged) built, how it fits together, how to preview it, and what is open, split by who can pick it up. The short version of each ask is also in `handoff/role-3-map.md` → "Needs from others".

## 1. What PR #81 built (merged to `main`, so live on production)
The firm view's map is now a **tree**: the parent firm sits in the middle, each portfolio company is a node on a branch around it, and the breached vendor sits on the right with lines to the companies that share it.

- **Branch colour = how exposed.** Red = urgent, amber = advisory, green = separate access (not exposed), grey = linked or not linked. The word is always printed under the node too ("Urgent", "Separate access · not exposed"); status is never colour alone.
- **Vendor line weight = how linked.** Thick = shared login / shared admin access, thin = customer of the vendor, dotted = candidate link from public DNS.
- **Under each exposed company:** the deciding reason ("Payment to a changed account", "Shared login", "… · candidate link"), money badges ("$480,000 held", "$X released"), "✓ Acknowledged".
- **Click any node to zoom in** (the SVG viewBox animates over ~450 ms; instant under reduced motion). A detail card opens top-left; Esc or "← Back to portfolio" zooms out. Exposed companies also drive the evidence panel through `onSelect`; other companies get a one-line caption ("Summit uses Ironclad IT Services with its own access, separate from Ironclad shared admin account. Not alerted.").
- **Reveal:** about 1.2 s per incident (centre, branches drawn outward, then companies and money). Skipped under `prefers-reduced-motion`.
- **Fallbacks:** phones get a list (`MapList`); `?map=grid` forces the list everywhere (stage fallback if the SVG misbehaves). Above 14 companies the unrelated ones collapse into "+ N other companies, not linked".
- **Props unchanged:** `BlastRadiusMap({ blast, selected, onSelect })`, `EvidencePanel` as before. No backend change, no new packages.
- Screenshots of all three seeded scenarios, two zooms, dense mode and the phone list: project files `screenshots/map/` (Omar can share them), or run the preview below.

## 2. Files (all in `src/map/`, Omar owns them)
| File | What it does |
|---|---|
| `BlastRadiusMap.tsx` | `BlastRadiusMap` reads `getHeldPayments` (same args as `PortfolioView`, so the subscription is shared) and `listAssets`, then renders `MapCard`: SVG, nodes, lines, zoom card, legend, caption. `MapCard` takes plain data, so it renders without Convex. |
| `layout.ts` | Pure geometry, no React: `layoutBlast(blast, assetNames, factsFor)` → tiles, lines, vendor and sibling assets, dense-mode count. Ring order puts the exposed block facing the vendor. `zoomBox()` gives the zoom window. Constants at the top (`CX`, `CY`, `RING`, radii, `DENSE_AT`). |
| `copy.ts` | Every word on the map (status words, reasons, badges, captions, aria-labels). Change wording here only, so the SVG and the list stay identical. It describes what the backend decided; it decides nothing. |
| `MapList.tsx` | Phone list and `?map=grid`. |
| `useReveal.ts` | The once-per-incident reveal (Web Animations API on `data-reveal` marks). |
| `EvidencePanel.tsx` | Urgency chip, confidence bar with "self-reported link" / "candidate link from public DNS", reasons, evidence, "Acknowledged by …". |

## 3. Preview and verify
- On production or your dev deployment: sign in as the PE partner (Jordan), open `/?stage`, fire Brightline, then the two Ironclad scenarios (bodies in `handoff/role-1-backend.md`). Check: Brightline lights 3 companies with "$480,000 held" on Summit; Ironclad credential shows Summit green "Separate access · not exposed" next to the grey Ironclad IT Services node; Ironclad MSP lights the MSP customers.
- **Not yet seen live with a signed-in Jordan** (our container can't reach Convex). Whoever runs dev first, please look and note anything off in your handoff file.
- Dense mode: `npx convex run ops:addScalePortfolio '{"count":300}'` on your dev, then Reset.
- Phone: 375 px wide should show the list with no horizontal scroll.

## 4. Open UI items
### → Role 2 (Marco): things in your files
1. **Demo script + video, beat 5** (`docs/demo-script.md`, `docs/video-shot-list.md`): the map is a tree now. Suggested line: "The firm sits in the middle. Red branches are urgent, amber advisory; thick vendor lines are a shared login. Click Summit: $480,000 held, payment to a changed account." Discipline beat: Summit's green "Separate access · not exposed". `?map=grid` is the fallback if anything misrenders on stage.
2. **Give the map more room** (`PortfolioView.tsx:127`, `lg:grid-cols-[1fr_360px]`): at 1280 px the tree is readable, but a full-width map row with the evidence panel below or in a drawer would make the zoom land better on video. Your call; the map scales to its container.
3. **B4 from the Armadin spec** (firm header "Source: finding at Pinecrest Staffing (in scope). Sister companies were not tested…") sits right above the map; worth checking the two read together.
4. **Brand pass**: if anything on the map fights `brand/README.md` or `PRODUCT.md`, write it in your handoff "Needs from others" with a screenshot.

### → Role 1 (Adrian): small backend asks, all optional
1. **Firm name for the centre node.** It says "Parent firm" because the schema has no firm name. A `firmName` on `getBlastRadius` (or `access.me`) would let it say "Northpass Capital". Nice to have.
2. **`acknowledgedByName` on blast nodes** (Marco asked too): the zoom card could say who acknowledged without one `getExposureEvidence` subscription per company.
3. If you change `getBlastRadius` node/edge shapes, ping `handoff/role-3-map.md`; `copy.ts` and `layout.ts` read `relation`, `urgency`, `exposed`, `heldCents`, `status`, `headcount`, and edges' `shareType`, `source`, `compromised`, `assetId`.

### Still on Omar's list (in `src/map/`; help welcome, see rules below)
- **Armadin Part A on the map:** `getBlastRadius().edges[].path` is live on main, but the tree doesn't print it yet. Plan: in the zoom card (not on the lines, to keep the tree clean) show "validated at source" for the reporter and "reachable here · not tested" for exposed sisters; DNS edges keep "candidate". Never "validated" for a sister on its own.
- **EvidencePanel path block** from `getExposureEvidence().path` (technique + shared hop + "validated at another portfolio company · reachable here, not tested").
- **B2 wording:** the panel shows "90% · self-reported link"; the spec asks for words first ("High · self-reported link" / "Low · candidate link from public DNS") with the bar.
- **Polish seen in screenshots:** a company with two badges plus "✓ Acknowledged" gets a tall label stack that can touch the next node on narrow widths; the zoom card covers the top-left nodes when zoomed at under ~900 px; the legend wraps to three lines at tablet width.

## 5. Rules for touching `src/map/`
- Omar owns `src/map/`. **Omar is fine with Role 2 helping there**: before you edit, add a line to your handoff file's "In progress" naming the file and the item, so two agents don't edit the same file. Keep the props, keep `copy.ts` as the only place for words, keep geometry in `layout.ts`.
- `git pull --rebase origin main` first: the tree is on `main` since #81.
- No new packages, plain SVG. No decisions in React: exposure, urgency and holds come from the backend.
- Copy rules: never call a `dns_inferred` link "validated" ("candidate" / "reachability"); never name the reporter outside the PE view; no shield, radar, siren or warning-triangle imagery; no glows or gradients.
- Every merge to `main` deploys to production. Batch your map changes into one PR.
