# Blast radius map: implementation plan (for Role 2's agent)

From: Role 4 (Omar's Claude), Oct 24 2026, checked against `main` at `d3eb64a`.
To: **Role 2's agent (Marco's Claude).** Omar asked for this plan to go to you.

You are replacing the card-grid placeholder in `src/map/BlastRadiusMap.tsx` with a real map: the breached vendor in the middle, the portfolio around it, lines showing *how* each company is linked, and colour showing *who is exposed and how urgently*. This is the "zoom out" beat (demo story step 5) and Role 1's CEO review lists it as one of the biggest remaining levers.

## 0. Before you start

1. `git pull --rebase origin main`, read every file in `handoff/` (house rule).
2. **Ownership.** `src/map/` belongs to Role 3 (Waterloo #1). `handoff/role-3-map.md` still says "Not started". Before editing `src/map/`, confirm with Marco that Role 2 is taking the map over, and write that in `handoff/role-2-frontend.md` ("Role 2 builds `src/map/` with Role 3's OK / because Role 3 hasn't started"). If Role 3 has started by the time you read this, hand them this file instead and stop.
3. Read `brand/README.md` and `PRODUCT.md` (stage legibility wins, status never by colour alone, no radar/shield/siren imagery).
4. Read `docs/specs/ui-audit-2026-10-24.md` issue 5 and Role 1's reply in `handoff/role-1-backend.md`: **show the deciding reason on the tile, hide the raw score.** This plan does that.
5. **No new npm packages.** No d3, react-flow, framer-motion. Plain SVG + React + the Web Animations API. 8 to 10 nodes don't need a graph library.
6. **No backend changes needed.** Everything below uses queries already on `main`. Don't touch `convex/`.

## 1. What you have to work with (verified)

### Props (keep them exactly; `PortfolioView` renders the map)

```ts
type Props = {
  blast: BlastRadius;                    // src/panels/types.ts, = getBlastRadius result, non-null
  selected?: Id<"companies">;
  onSelect: (id: Id<"companies">) => void;
};
```

`PortfolioView` (`src/panels/PortfolioView.tsx:122-128`) puts the map in the left column of `lg:grid-cols-[1fr_360px]`, so on a laptop it gets roughly 760 to 900 px of width. The right column shows `EvidencePanel` for `selectedNode.exposureId` and the held payments of the selected company.

### `blast` (from `convex/blastRadius.ts` `getBlastRadius`, PE firm only)

- `blast.asset`: the breached asset `{ _id, name, vendorName, kind, phoneOnFile }`.
- `blast.incident`: the incident doc plus `reportedByName`. Has `containedAt?` (set once the firm marks it contained), `createdAt`, `externalId`.
- `blast.totals`: `{ companiesExposed, peopleExposed, heldCents, paymentsHeld }` (the headline already shows these; don't repeat them big).
- `blast.nodes[]`: **every company in the portfolio** (8 seeded, 9 after the Lakeside AP import, 300+ in Role 1's scale test):
  `{ companyId, name, headcount, exposed, relation, exposureId | null, urgency | null, score, confidence | null, status | null, heldCents }`
  - `relation: NodeRelation` (import the type from `convex/blastRadius.ts`): `"reporter" | "exposed" | "linked_not_exposed" | "same_vendor_separate_access" | "unrelated"`. `reporter` wins over everything: the reporter has **no exposure** (`exposed: false`, `exposureId: null`).
  - `heldCents` counts only payments still `held`. It drops live when a controller releases.
  - `status`: `"open" | "acknowledged" | "closed"` (live; flips when someone acknowledges).
- `blast.edges[]`: `{ companyId, assetId, shareType, source, compromised }`.
  - Only links to the **breached asset** (`compromised: true`) and to **other assets of the same vendor** (`compromised: false`, e.g. "Ironclad IT Services" when "Ironclad shared admin account" was hit). No other vendors appear.
  - A company can have two edges (one to each Ironclad asset). Use the compromised one for "how linked".
  - `shareType`: `shared_credential | shared_admin_access | same_vendor_only`. `source`: `self_reported | dns_inferred`.
  - Only the breached asset is in `blast`. For the name of a sibling asset, read `useQuery(api.blastRadius.listAssets, {})` (public, ≤100 rows) and look it up by `assetId`.

### One extra query the map should read

`useQuery(api.payments.getHeldPayments, { incidentId: blast.incident._id })`. `PortfolioView` already subscribes with the same args, so Convex shares the subscription: no extra cost. Per company, derive:

- `flaggedHeld`: rows with `payment.status === "held"` and `bankChange !== null` (a held payment going to bank details changed within 30 days).
- `releasedCents`: rows with `decision?.status === "paid"` (for "$480,000 released after verification").

This is a display of facts the backend already decided; the map never decides urgency or exposure (CLAUDE.md: business logic stays in Convex).

### What each demo scenario actually returns

I seeded and fired each scenario in `convex-test` and dumped `getBlastRadius` as the PE user. Use this table to check your work.

**Brightline Payroll (default demo).** Headline 3 · 4,200 · $612,000. Reporter: Pinecrest Staffing.

| Company | relation | urgency (score) | edge to Brightline | held |
|---|---|---|---|---|
| Cedar Ridge Manufacturing (2,100) | exposed | urgent (90) | shared_credential, self_reported | $92,000 |
| Summit Home Health (1,600) | exposed | urgent (70) | **same_vendor_only**, self_reported | **$480,000** (flagged ••7731) |
| Bayview Veterinary Partners (500) | exposed | advisory (60), confidence 0.5 | same_vendor_only, **dns_inferred** | $40,000 (one flagged) |
| Pinecrest Staffing (140) | reporter | — | shared_admin_access | $0 (hold rule off) |
| Alder, Granite Peak, Harborline, Meridian | unrelated | — | none | — |

After Jamie requests the $38K November bill, Summit holds $518,000 and the headline says $650,000. After Rosa releases the $480K, Summit's `heldCents` drops to $38,000 (or 0 if the bill wasn't requested) and `getHeldPayments` shows it as paid.

**Ironclad shared admin account (discipline beat).** Headline 3 · 3,950 · $0. Reporter: Pinecrest. Sibling asset: Ironclad IT Services.

| Company | relation | urgency | edges |
|---|---|---|---|
| Cedar Ridge | exposed | urgent (90) | admin account: shared_credential |
| Granite Peak Software | exposed | urgent (90) | admin account: shared_credential |
| Harborline Foods | exposed | urgent (80) | admin account: shared_admin_access; IT Services: same_vendor_only |
| Pinecrest | reporter | — | admin account: shared_credential; IT Services: shared_admin_access |
| **Summit Home Health** | **same_vendor_separate_access** | — | IT Services only: same_vendor_only |
| **Alder Freight** | **same_vendor_separate_access** | — | IT Services only: same_vendor_only |
| Bayview, Meridian | unrelated | — | none |

**Ironclad IT Services (MSP itself).** Headline 3 · 4,600 · $116,000. Harborline urgent (70, $92K, a flagged one), Alder advisory (40, $24K), Summit advisory (40, $0). Cedar Ridge and Granite Peak are `same_vendor_separate_access` (they only touch the admin account). Pinecrest reporter. Bayview, Meridian unrelated.

Notes from this:
- `linked_not_exposed` never appears in the seed. Handle it anyway (exhaustive `switch`).
- **Summit is the separate-access company only in the Ironclad credential scenario.** In the Brightline demo, Summit is the urgent $480K tile linked by a `same_vendor_only` line. So the line style must not make Summit look unimportant: line *weight* says how they share, tile *colour* says how exposed, and the tile's reason line says why ("payment to a changed account").

## 2. What the map must show (acceptance)

A judge at the back of the room should get, in one look:

1. The **breached vendor** in the centre, named ("Brightline Payroll", vendor + kind small underneath).
2. Every portfolio company as a **rounded tile** around it (brand: tiles echo the logo), sized by headcount.
3. **Exposed companies light up**: urgent tiles in coral (`danger`), advisory in amber, each with the word "Urgent" / "Advisory" printed (never colour alone).
4. A **deciding reason** under the urgency word, no raw score:
   - `flaggedHeld > 0` → "Payment to a changed account"
   - else by the compromised edge's `shareType`: "Shared login" (`shared_credential`), "Shared admin access" (`shared_admin_access`), "Customer of the vendor" (`same_vendor_only`)
   - `source === "dns_inferred"` adds "· candidate link". **Never "validated" or "confirmed".**
5. **Money badge** on tiles with `heldCents > 0`: "$480,000 held" (tabular-nums). When `releasedCents > 0` and nothing is still held, show "$480,000 released" in green (`ok`). Both can show if both are non-zero.
6. **Reporter** tile (PE view only, allowed here): neutral, dashed outline, label "Reported this incident". Not coloured as exposed.
7. **Separate access** tiles (the discipline beat): visible, outlined green (`ok`), label "Separate access · not exposed", connected by a faint line to the **sibling asset** node (a smaller, grey circle labelled e.g. "Ironclad IT Services · not affected").
8. **Unrelated** tiles: faded (opacity ~0.45), label "Not linked", no lines.
9. **Lines** (edge styles below): thick solid for a shared login/admin access, thin solid for same-vendor-only, dotted for `dns_inferred` with a "candidate" label.
10. **Acknowledged** exposures show a small "✓ Acknowledged" under the reason (live; the race beat changes it on screen).
11. **Contained** incident (`blast.incident.containedAt != null`): centre label adds "Contained" in green; compromised lines drop to 50% opacity. Holds stay as they are (held, never cancelled).
12. **Click / Enter / Space on an exposed tile** → `onSelect(companyId)`; the evidence panel and "Payments held" card on the right update (already wired in `PortfolioView`). The selected tile gets an amber 2 px ring.
13. **Click on a non-exposed tile** does *not* call `onSelect` (the evidence panel only explains exposures). Instead, show a one-line caption under the map for that tile, e.g.:
    - separate access: "Summit Home Health uses Ironclad IT Services with its own login, not the shared admin account. Not alerted."
    - reporter: "Pinecrest Staffing reported this incident. Only the firm sees this."
    - unrelated: "Meridian Dental Group has no link to Brightline Payroll Inc."
    - linked_not_exposed: "Alder Freight is linked to <asset> but its link isn't one that exposes it."
14. **Reveal animation** when an incident first appears (see §6), skipped under `prefers-reduced-motion`.
15. Works at **375 px** with no horizontal scroll (phone list, §7). Keyboard reachable, visible focus.

## 3. Files (all in `src/map/`)

| File | What |
|---|---|
| `BlastRadiusMap.tsx` | Container. Keeps the props. Card, header aside, desktop SVG (`hidden sm:block`), phone list (`sm:hidden`), legend, caption. Reads `getHeldPayments` + `listAssets`. |
| `layout.ts` | **Pure** function `layoutBlast(blast, assetNames) → MapLayout`. No React. Positions, label sides, edge geometry. Easy to reason about and to console.log. |
| `copy.ts` | Labels per `NodeRelation` / `shareType` (exhaustive `switch` so a new relation fails the typecheck), reason line, caption text, aria-labels. |
| `useReveal.ts` | The reveal animation with `element.animate()`, keyed on the incident id. |
| `MapList.tsx` | Phone fallback: the current placeholder's tile list, updated to the copy in `copy.ts` (no raw score). |
| `EvidencePanel.tsx` | Small touch-ups only (§8). Keep its props. |

Match the house style: a one-line comment at the top of each file saying what it is, few comments, Tailwind classes, `Card` / `Chip` / `Empty` from `../panels/ui`, `money` from `../panels/format`.

## 4. Layout (`layout.ts`)

Fixed coordinate system, scaled by the SVG `viewBox`:

```ts
const W = 960, H = 600;
const CX = W / 2, CY = H / 2;
const INNER = { rx: 250, ry: 175 };  // reporter, exposed, linked_not_exposed
const OUTER = { rx: 390, ry: 240 };  // separate access, unrelated
```

1. **Order** the nodes (clockwise from the top):
   1. reporter
   2. exposed, by `score` desc, then name
   3. linked_not_exposed, by name
   4. same_vendor_separate_access, by name
   5. unrelated, by name
   Sort by name as the final tiebreak so positions are stable between renders (live updates must not shuffle tiles).
2. **Angle**: `angle_i = -π/2 + i · 2π / N` across all N nodes. Each node sits on INNER or OUTER by its group: `x = CX + rx·cos(angle)`, `y = CY + ry·sin(angle)`. With 8 nodes that's 45° apart and no overlaps.
   - If a group straddles the bottom, fine; the order keeps exposed tiles at the top and right where the eye goes first.
3. **Tile size** by headcount: `side = clamp(36, 26 + 0.95·√headcount, 72)` (Pinecrest 140 → 37, Bayview 500 → 47, Cedar Ridge 2,100 → 70). Corner radius `side · 0.22` (soft, echoes the logo's tiles).
4. **Centre** (breached asset): circle `r = 46` at (CX, CY). Label inside: asset name (2 lines max), and below the circle, small: `vendorName · kind`.
5. **Sibling assets** (any `assetId` in `edges` that isn't `blast.asset._id`): circle `r = 26`, placed at 55% of the way from the centre toward the mean position of the companies linked to it. If that lands within 90 px of the centre, push it out along the same angle. Label: `<asset name> · not affected`.
6. **Labels** go on the outward side of each tile so they never sit on a line into the centre:
   - `sin(angle) < -0.35` (top): label above the tile, `text-anchor="middle"`.
   - `sin(angle) > 0.35` (bottom): label below the tile, middle.
   - otherwise (sides): label beside the tile, `start` on the right, `end` on the left.
   - Name over 18 chars → split into two lines at the space nearest the middle ("Bayview Veterinary / Partners").
   - Under the name: status line (e.g. "Urgent · Payment to a changed account"), then the money badge, then "✓ Acknowledged" if set.
7. **Edges**: straight lines from the centre circle's edge to the tile's edge (shorten both ends so lines don't run under shapes). Edge label (shareType words, 11 px, ash, `paint-order="stroke"` with a graphite stroke for a halo) at 45% along the line, only on compromised edges. Sibling-asset edges get no label.
8. **Dense mode** (N > 14, e.g. the 300-company scale test): put only reporter, exposed, separate-access and linked nodes on the rings with labels. Collapse all unrelated nodes into one small grey text at the bottom: "+ 297 other companies, not linked". Don't render 300 tiles. Exposed count above 14: shrink tiles to `side = 28`, drop the reason line, keep name + urgency word + money.

Return a plain object, e.g.

```ts
type MapLayout = {
  viewBox: string;
  centre: { x: number; y: number; r: number; title: string; subtitle: string };
  siblings: { assetId: Id<"assets">; x: number; y: number; r: number; label: string }[];
  tiles: { node: Node; x: number; y: number; side: number; labelSide: "above" | "below" | "left" | "right"; nameLines: string[] }[];
  edges: { key: string; x1: number; y1: number; x2: number; y2: number; edge: Edge; companyId: Id<"companies">; order: number }[];
  hiddenUnrelated: number;
};
```

`order` is the tile's reveal index (§6).

## 5. Visual spec

Use the colours already defined in `src/index.css` (`graphite`, `panel`, `line`, `paper`, `ash`, `amber`, `danger`, `ok`). Tailwind v4 generates `fill-*` / `stroke-*` for them, so `className="fill-panel stroke-danger"` works in SVG. Don't edit `src/index.css` for this, and don't import `brand/tokens.css` here (that's a separate Role 2 styling decision).

| Element | Style |
|---|---|
| Card | `Card` with title `Blast radius · {asset.name}`; `aside` = small ash text "3 exposed · 2 separate access · 2 not linked" (counts from nodes). |
| SVG | `viewBox="0 0 960 600"`, `className="h-auto w-full"`, background transparent (card is `panel`). |
| Centre | `fill-graphite stroke-paper` 2 px. Text paper 15 px / 600. Contained → add "Contained" in `fill-ok`. |
| Sibling asset | `fill-graphite stroke-line` 1.5 px, text ash 12 px. |
| Tile, urgent | `fill-panel stroke-danger` 2.5 px; status word `fill-danger`. |
| Tile, advisory | `fill-panel stroke-amber` 2.5 px; status word `fill-amber`. |
| Tile, reporter | `fill-panel stroke-paper` 1.5 px, `strokeDasharray="5 4"`; text "Reported this incident" ash. |
| Tile, separate access | `fill-panel stroke-ok` 1.5 px; "Separate access · not exposed" in `fill-ok`. |
| Tile, linked_not_exposed | `fill-panel stroke-ash` 1.5 px; "Linked · not exposed" ash. |
| Tile, unrelated | `fill-panel stroke-line` 1 px, group opacity 0.45; "Not linked" ash. |
| Tile glyph | Inside the tile, the company's initials (2 letters, paper, 600). No icons. |
| Selected | Extra rounded rect 6 px outside the tile, `stroke-amber` 2 px, no fill. |
| Focused (keyboard) | Same ring, dashed. Track focus in state (`onFocus`/`onBlur`); SVG `:focus-visible` outlines are unreliable in Safari. |
| Edge, compromised, `shared_credential` / `shared_admin_access` | 3.5 px, coloured like the company's tile (danger / amber; reporter = paper at 60%). |
| Edge, compromised, `same_vendor_only` | 1.75 px, same colour rule. |
| Edge, `dns_inferred` | Add `strokeDasharray="1.5 6"` + `strokeLinecap="round"` (dotted); label "candidate · DNS". |
| Edge, to sibling asset | 1 px `stroke-ash` at 40%. |
| Money badge | Rounded rect `fill-graphite stroke-amber` 1 px, text `fill-amber` 13 px / 600, `font-variant-numeric: tabular-nums`: "$480,000 held". Released: `stroke-ok fill-ok` text "$480,000 released". |
| Text sizes | Name 14 px / 600 paper. Status 12 px / 500. Never below 11 px in viewBox units (it scales down with the card). |

Legend (HTML under the SVG, `text-xs text-ash`, flex-wrap): a thick line "Shared login or admin access" · a thin line "Customer of the same vendor" · a dotted line "Candidate (public DNS, not confirmed)" · coral swatch "Urgent" · amber "Advisory" · green outline "Separate access, not exposed" · dashed outline "Reported (firm view only)". Draw the legend swatches as tiny inline SVGs so they match exactly.

Caption (HTML under the legend): the §2 item 13 text for the last clicked non-exposed tile, else "Select an exposed company to see why it was flagged." Use `aria-live="polite"`.

Hover: an SVG `<title>` on each tile group with the full aria-label text (cheap native tooltip).

## 6. Reveal animation (`useReveal.ts`)

Goal: when the PE view first shows an incident (and whenever the selected incident changes), the map assembles itself in about 1.2 s: centre, then lines, then tiles light up in urgency order. It must never look like radar (no sweeping arm, no expanding sonar rings; brand rule).

Mechanics:

- `PortfolioView` shows "Loading…" until `blast` arrives, so the map remounts on every new incident. Key the reveal on `blast.incident._id`: keep a `useRef` of the last revealed id; run once per id.
- Use the **Web Animations API** (`el.animate(keyframes, { duration, delay, easing: "cubic-bezier(.2,.7,.2,1)", fill: "backwards" })`) on refs. No CSS file needed, no package.
- If `matchMedia("(prefers-reduced-motion: reduce)").matches`, skip everything (final state renders immediately).
- Sequence (ms):
  1. 0: centre circle `opacity 0 → 1`, `scale .9 → 1` (200).
  2. 150 + 90·order: each compromised edge draws from the centre out. For solid lines set `pathLength={1}` and animate `strokeDasharray: "1 1"`, `strokeDashoffset: 1 → 0` (350). Dotted (`dns_inferred`) lines can't use the dash trick: fade `opacity 0 → 1` (350) instead.
  3. Same delay + 250: the tile's coloured stroke and status text `opacity 0 → 1` (250); unrelated tiles just fade to 0.45 at the end.
  4. +150: money badge `opacity 0 → 1`, `scale .92 → 1` (220). The $480K tile should land last-but-visible; if you want it to be the final beat, give Summit's badge an extra 200 ms (it's the highest `heldCents`; pick "max heldCents" generically, not by name).
  5. Sibling-asset lines and separate-access tiles fade in last (300), quietly.
- Animate `transform` on an inner `<g>` with `transform-box: fill-box; transform-origin: center` so scaling doesn't fight the positioning `translate`.
- **Live changes after the reveal** (no replay): tile positions use a CSS `transition: transform 400ms` on the positioned `<g>` so a newly imported company (Lakeside) slides the ring over smoothly; a new tile fades in. Badge text swaps (held → released) just re-render; optionally a 200 ms opacity blink.
- Cancel running animations on unmount (`anim.cancel()` in the effect cleanup).

## 7. Phone and accessibility

- **Under 640 px** (`sm:hidden`): render `MapList` instead of the SVG. It's today's placeholder list with the new copy: tiles sorted in the §4 order, coloured border by state, status + reason line, money badge, caption on tap for non-exposed. At 375 px the SVG text would scale to ~5 px, so don't try to shrink the SVG. Check `document.documentElement.scrollWidth === 375`.
- SVG wrapper: `<figure>` with `<figcaption className="sr-only">Blast radius of {asset.name}: {n} companies exposed…</figcaption>`.
- Each tile `<g role="button" tabIndex={0} aria-pressed={selected === id} aria-label="Summit Home Health, urgent, payment to a changed account, $480,000 held, 1,600 people">`. Enter and Space call the same handler as click (`preventDefault` on Space).
- Non-interactive shapes (`edges`, labels): `aria-hidden="true"`.
- Status is always in words, never colour alone (PRODUCT.md, WCAG 2.2 AA).

## 8. EvidencePanel touch-ups (same folder, keep props)

Small, optional, after the map works:
- Under the title, show urgency as a `Chip` (danger / amber) and the confidence in words next to the bar: "90% · self-reported link" or "50% · candidate link from public DNS". Confidence comes from `evidence.confidence`; tell self-reported vs DNS from the `source` evidence item.
- Show "Acknowledged" when `acknowledgedBy` is set (Role 2 already has `ExposureAcknowledgedBy` in `src/panels/AcknowledgedBy.tsx`; you can import it).
- Keep the copy rule: never "validated". Leave the reasons list as is (they come from `scoring.ts`).

## 9. Rules this must not break

- **The reporter's name only appears in the PE view.** `getBlastRadius` returns `null` to company users and `PortfolioView` is PE-only, so you're fine, but never reuse `BlastRadiusMap` in `CompanyView`.
- **Don't decide anything in React.** Urgency, exposure and holds come from the backend. The reason line only *describes* facts (`shareType`, flagged held payments).
- **"Candidate" / "reachability", never "validated" / "confirmed"** for `dns_inferred`.
- **No alarm words** ("BREACH", "ATTACK", "compromised!" in caps). "Incident open", "Contained", "Not affected".
- **No shields, padlocks, radar, sirens, warning triangles** or any icons beyond initials, dots and checks. No glows, gradients or neon.
- **No `useEffect` polling**; `useQuery` only. No new packages.
- Don't change `PortfolioView`'s props or layout for this (if you want the map wider or full-width, that's a separate Role 2 layout change; say so in your handoff).

## 10. Steps, in order

1. `copy.ts` + `layout.ts` (pure). Log `layoutBlast` output for the Brightline incident in the console once to sanity-check positions.
2. Static SVG in `BlastRadiusMap.tsx`: centre, tiles, edges, labels, badges, legend. No animation yet. Compare against the §1 tables for all three scenarios.
3. Selection, keyboard, focus ring, caption for non-exposed tiles.
4. `getHeldPayments` derivations: reason "Payment to a changed account", released badge.
5. `MapList.tsx` phone fallback, check 375 px.
6. `useReveal.ts`, then reduced-motion check.
7. Dense mode (fire Brightline after `internal.ops.addScalePortfolio({ count: 50 })` on dev; DEMO_MODE only).
8. EvidencePanel touch-ups.
9. Verify (§11), update your handoff file, one PR.

## 11. How to verify

- `npm run lint` (includes typecheck) and `npm run build` green. `npm test` unchanged (backend tests only; nothing in `convex/` changes).
- On your dev deployment: `npx convex run seed:run`, open `/?stage`, sign in as Jordan Ames.
  - **Brightline** (scenario picker → Fire): 3 lit tiles (Cedar Ridge urgent "Shared login" $92,000; Summit urgent "Payment to a changed account" $480,000; Bayview advisory dotted line "candidate" $40,000), Pinecrest dashed "Reported this incident", four faded "Not linked" tiles. Animation plays once.
  - Sign in as Jamie, request the $38K bill → back as Jordan, Summit shows $518,000 held. As Rosa, release the $480K → Summit shows "$38,000 held" and "$480,000 released" live.
  - Acknowledge Cedar Ridge as Tom Becker in another tab → "✓ Acknowledged" appears on the tile live.
  - **Ironclad credential**: Cedar Ridge, Granite Peak, Harborline urgent; Summit and Alder green "Separate access · not exposed" with faint lines to a grey "Ironclad IT Services · not affected" node; clicking Summit shows the caption, not the evidence panel. $0 badges nowhere.
  - **Ironclad MSP**: Harborline urgent $92,000, Alder advisory $24,000, Summit advisory (no badge); Cedar Ridge and Granite Peak separate access.
  - Mark contained → centre says "Contained", lines dim, badges unchanged.
  - AP import (Lakeside, if Role 2's card is in) → a 9th tile slides in, urgent/advisory with $66,400 held after Brightline.
  - Incident selector: switching incidents replays the reveal for the newly selected one.
- Keyboard: Tab through tiles, Enter selects, the right column updates. Devtools → Rendering → "prefers-reduced-motion: reduce": no animation, same final picture.
- 375 px: list fallback, no horizontal scroll.
- Attach a desktop screenshot of the Brightline map and the Ironclad credential map to the PR (Playwright works: `require('playwright')`).

## 12. Handoff when done

- Your handoff file: "✓ Real blast radius map in `src/map/` (plan: `docs/specs/blast-radius-map-plan.md`)", plus anything you skipped.
- `docs/demo-script.md` and `docs/video-shot-list.md`: the `[after 11pm]` lines waiting on the map can now say what the map shows (beat 5: "map lights up"; discipline beat: green "separate access" tiles).
- One PR into `main`, batched with any other Role 2 work in flight (every merge is a production deploy).
