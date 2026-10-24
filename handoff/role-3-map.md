# Role 3: Map + evidence (Waterloo #1)
Last updated: Oct 23, 21:05 by Adrian's Claude (current brief, matches `main`; Role 3's Claude owns this file from now on)

> **This file replaces any older Role 3 brief.** Where they differ, this file, `CONTRACT.md` and the code on `main` win.

## Status
- Not started. Working placeholders from Role 2: `src/map/BlastRadiusMap.tsx` and `src/map/EvidencePanel.tsx`. Replace the insides; **keep the props** (`PortfolioView` renders them).

## Setup (once)
```
git pull --rebase origin main && npm install
npx convex dev
npx @convex-dev/auth --web-server-url http://localhost:5173 --skip-git-check
npx convex env set DEMO_MODE true
npx convex run seed:run
npm run dev        # open /?stage, sign in as Jordan Ames (PE firm) to see the map; Fire incident
```

## Your files
`src/map/` only. Need data the queries don't give you? Ask Role 1 under "Needs from others".

## Data (no ids needed: identity is the signed-in session)
- `BlastRadiusMap` props: `{ blast, selected?, onSelect(companyId) }`. `blast` = `api.blastRadius.getBlastRadius({ incidentId })` (PE user only; null for others):
  - `nodes[]`: `{ companyId, name, headcount, exposed, relation, exposureId | null, urgency | null, score, confidence | null, status | null, heldCents }`
  - `relation` (`NodeRelation`, exported from `convex/blastRadius.ts`): `"reporter" | "exposed" | "linked_not_exposed" | "same_vendor_separate_access" | "unrelated"`
  - `edges[]`: `{ companyId, assetId, shareType, source, compromised }` (`compromised` = the edge to the breached asset)
  - `asset` (the breached one), `incident` (incl. `reportedByName`), `totals`
- `EvidencePanel` props: `{ exposureId?, companyName? }`; data from `api.blastRadius.getExposureEvidence({ exposureId })` → `{ reasons, confidence, evidence[{ kind, detail }], urgency, score, status, acknowledgedBy }`.

## What the map must say
- Exposed companies light up by urgency (urgent / advisory) and show $ held.
- The reporter is marked "reported" (PE view only, it's allowed there).
- **Discipline beat:** `same_vendor_separate_access` companies are visible and clearly *not* exposed (fire the Ironclad credential scenario: Summit uses Ironclad with its own login).
- `dns_inferred` edges are "candidate" / "reachability", never "validated"; lower confidence, show it.
- Brand: read `brand/README.md` (dark-first, Signal Amber, no shields/padlocks/radar).

## In progress
- (Role 3's Claude: fill in)

## Needs from others
- (Role 3's Claude: fill in)

## Decisions & gotchas
- No new npm packages (e.g. a graph library) without announcing in your handoff first; plain SVG is fine for 8 nodes.
