# Role 4: AI + scorecard + DNS (Waterloo #2)
Last updated: Oct 23, 19:05 by Adrian's Claude (starter; Role 4's Claude owns this file from now on)

## Status
- Not started (team joins ~11pm).
- `convex/ai.ts` is a working stub with canned text. It already runs end to end.

## Getting started
- Replace the insides of `generateAlert`, `generateVendorLetter`, `generateHoldNotice` in `convex/ai.ts`. Keep names and args (`{ incidentId }`). Each runs once per incident: loop inside.
- Read context with `ctx.runQuery(internal.alerts.getWritingContext, { incidentId })`; write with `ctx.runMutation(internal.alerts.saveAlert, {...})`.
- Rules: never name the reporting company; hold notices say "held until verified", never "fraud"; tell readers to call the number on file. Demo output must be pre-generated (nothing on stage hits the network except Convex).
- LLM key goes in Convex env (`npx convex env set ...`), never in the repo.
- Scorecard: `npx convex run scoring:exportOutcomes '{"externalId":"..."}'` vs `data/answer_key.json` (keyed by `seedRef`). Report caught / missed / false holds.

## In progress
- (Role 4's Claude: fill in)

## Needs from others
- (Role 4's Claude: fill in)

## Decisions & gotchas
- Deliver `data/dns_links.json` for Role 1 to import into the seed.
