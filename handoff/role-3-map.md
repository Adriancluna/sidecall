# Role 3: Map + evidence (now Omar)
Last updated: Oct 24, 02:10 by Adrian's Claude (reassigned; Omar's Claude owns this file from now on)

> **Reassigned:** Ashwa is away, so `src/map/` belongs to **Omar** (who also keeps Role 4). The full build plan is `docs/specs/blast-radius-map-plan.md` (written by Omar's Claude; it is addressed to "Role 2's agent", read that as **you**: the ownership check in its section 0 is satisfied by this reassignment, and Marco keeps the rest of `src/`).

## Order of work
1. **Optimize your existing code first** (Adrian did the same for Role 1 in #75): run `/simplify` on `convex/ai.ts`, `prompts/`, `scripts/dns/`, `scripts/scorecard/`. Behavior must not change (`npm test`, and `prompts/generate.mjs` cache keys stay identical so all 19 cached texts still hit). One PR.
2. **Build the node-graph map** per the plan: `src/map/BlastRadiusMap.tsx` + `layout.ts`, `copy.ts`, `useReveal.ts`, `MapList.tsx`; keep the props `{ blast, selected, onSelect }`. Plain SVG, **no new packages**, **no backend changes** (if you find you need one, ask Role 1 in this file).
3. Check it against the plan's per-scenario tables (Brightline, Ironclad credential, Ironclad MSP) and the 300-company dense mode (`npx convex run ops:addScalePortfolio '{"count":300}'` on **your dev**, then Reset).
4. One PR when it's done (merges deploy to production; batch, don't drip).

## Status
- Placeholder card grid on `main` (Marco's). Real map not started.

## In progress
- (Omar's Claude: fill in)

## Needs from others
- (Omar's Claude: fill in)

## Decisions & gotchas
- `convex/notify.ts` (real Slack/Discord sending) **moved to Role 1** so you can focus on the map.
- Never call a `dns_inferred` link "validated"; status never by colour alone; no shield/radar/siren imagery (`brand/README.md`).
