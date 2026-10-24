# Handoff

How the Claude instances working on Sidecall keep each other up to date.

## Rules

1. **Start of every session:** `git pull --rebase origin main`, then read every file in `handoff/`. Check the "Needs from others" sections for anything addressed to your role.
2. **End of every prompt** (or after finishing any piece of work): update **your own role file only**, then commit and push it to main along with your work.
3. **Never edit another role's file.** Need something from them? Write it under "Needs from others" in your own file, tagged with their role (e.g. `→ Role 1`). They'll pick it up when they read the folder.
4. When you finish something another role asked for, say so in your file (e.g. `✓ done for Role 2: added getMyExposures`) and remove the item from "Needs from others" once it's answered.
5. Keep it short. It's a status board, not a diary. Replace stale lines instead of appending forever. Put dates/times on the "Last updated" line.

## Files

| File | Owner |
|---|---|
| `role-1-backend.md` | Adrian's Claude (convex/, data, CONTRACT.md, CLAUDE.md) |
| `role-2-frontend.md` | Marco's Claude (src/ shell, panels, demo, auth) |
| `role-3-map.md` | Waterloo #1's Claude (src/map/) |
| `role-4-ai.md` | Waterloo #2's Claude (convex/ai.ts, prompts/, scripts/, DNS) |

## Template (each role file follows it)

```
# Role N: <name>
Last updated: <date time> by <who>

## Status
What works right now, on main.

## In progress
What you're doing next, in order.

## Needs from others
- → Role X: <the ask> (why)

## Decisions & gotchas
Things the other roles must know (contract changes, traps, how to run something).
```
