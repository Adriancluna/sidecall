# Role 3: Map + evidence (Waterloo #1)
Last updated: Oct 23, 19:05 by Adrian's Claude (starter; Role 3's Claude owns this file from now on)

## Status
- Not started (team joins ~11pm).
- Placeholders from Role 2 exist: `src/map/BlastRadiusMap.tsx` (props: `blast`, `selected`, `onSelect`) and `src/map/EvidencePanel.tsx` (props: `exposureId`, `companyName`, `actingUserId`). Replace the insides, keep the props.

## Getting started
- Data: `api.blastRadius.getBlastRadius({ incidentId, actingUserId })` (PE user only). Nodes carry `relation` (`NodeRelation` union), `urgency`, `score`, `confidence`, `heldCents`; edges carry `shareType`, `source`, `compromised`. See `CONTRACT.md`.
- Evidence: `api.blastRadius.getExposureEvidence({ exposureId, actingUserId })`.
- Copy rules: never call a `dns_inferred` link "validated"; say "candidate" or "reachability". Companies with `relation: "same_vendor_separate_access"` are the discipline beat: show them, clearly not exposed.

## In progress
- (Role 3's Claude: fill in)

## Needs from others
- (Role 3's Claude: fill in)

## Decisions & gotchas
- No new npm packages (e.g. a graph library) without announcing to the team first.
