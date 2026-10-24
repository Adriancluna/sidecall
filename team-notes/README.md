# team-notes

Shared memory for the team and every Claude instance, like `handoff/`. **The program never reads, builds or tests anything in this folder** (no code imports it; `tsconfig` includes only `src/`; Convex reads only `convex/`). Safe to read and add to at any time.

Difference from `handoff/`: handoffs are per-role status and asks that change every prompt. `team-notes/` holds stable reference material everyone needs: how to explain the project, pitch prep, decisions.

| File | What it is | Owner |
|---|---|---|
| `field-guide.md` | How to explain Sidecall: the 60-second story, how each part works, the demo, hard questions, edge cases, words, numbers, real vs simulated | Role 1 (Adrian); anyone may propose edits |

Rules: plain English; no secrets or keys; facts must match `main` and `CONTRACT.md`. If a number changes (tests, scorecard), update it here.
