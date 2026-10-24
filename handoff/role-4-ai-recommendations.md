# AI recommendations: handoff to Pegasus (backend) and Marco (UI)
Last updated: Oct 24, 23:20 by Omar's Claude (Role 4). Omar asked for this handoff.

There are two AI features with the same format:
1. **Breach fix advice**: what an exposed company should do after an incident lands. **Built in PR #114** (branch `claude/project-thread-tliv3d`, not merged).
2. **Stop-loss advice**: which pre-approved steps to set up *before* a breach. **Not built yet.** A separate Role 4 thread is building it on branch `claude/project-thread-iztrvn`, and it will open its own PR. It uses the same `Recommendation` / `AdviceBrief` shape (shared types in `prompts/advice.ts`), the same "rules pick, AI explains, pre-generated cache" pattern, and its UI folder will be `src/ai/stopLoss/`. Every step below applies to it once that PR exists.

How both work: fixed rules choose every recommendation, owner, priority and status from backend rows. The AI writes only the summary and the one-line "why" for each recommendation. That text is pre-generated off stage into a cache file, so nothing calls the model on stage. CLAUDE.md's rule holds: AI writes, never decides.

---

## → Pegasus (Ashwa's agents): backend

The backend for breach fix advice is written and tested. What's left is review, merge, and two follow-ups.

**1. Review and merge PR #114** (https://github.com/Adriancluna/sidecall/pull/114).
- It touches only Role 4 files (`convex/ai.ts`, `prompts/`, `data/ai_breach_fix.json`), plus two new folders: `convex/ai.test.ts` and `src/ai/`.
- It changes no schema and no Role 1 file. It reads `links`, `payments`, `responseSteps`, `exposures`, `incidents`, `assets` and `companies` through existing indexes only.
- CLAUDE.md says Adrian reviews and merges every PR and that every merge to `main` is a production deploy. Get Adrian's OK, then batch the merge with other work.
- Check it on **your own dev deployment** (`tangible-koala-842`), not Omar's (`brainy-cassowary-804`) or Adrian's:
  ```
  npx convex dev --once && npx convex run seed:run && npx convex run seed:fireDemoIncident '{"scenario":"brightline"}'
  npm test                                   # 102 green, 7 of them in convex/ai.test.ts
  node --test prompts/breachFix.test.mjs     # 13 green
  ```
  Then call `ai:getBreachFixAdvice` as a signed-in user, e.g. `npx convex run --identity '{"subject":"<userId>|session"}' ai:getBreachFixAdvice '{"exposureId":"…"}'`. Expect `source: "cache"`.

**2. What's in it** (full contract in `src/ai/fixPlan/README.md`):
- `api.ai.getBreachFixAdvice({ exposureId })`: a public query.
  - A company user sees only its own exposure; the firm sees any.
  - It never reads `reportedByCompanyId`.
  - It returns an `AdviceBrief` with `summary`, `source` ("cache" or "canned") and `recommendations[]`.
- `internal.ai.breachFixContexts({ incidentId })` feeds `prompts/generateBreachFix.mjs`.
- `data/ai_breach_fix.json`: 12 plans (3 companies × 4 demo scenarios), all checked by `checkBreachFixCopy`.
- **The cache only hits while the facts match.** If a seed change alters a company's share type, held payments, bank-change flags, playbook steps or "What to check" text, the query shows the rules' standard text (`source: "canned"`). That is safe, but it isn't the AI text. After any seed change, regenerate on a dev deployment and commit:
  ```
  ANTHROPIC_API_KEY=… node prompts/generateBreachFix.mjs
  ```

**3. Follow-ups (optional, ask Omar before starting):**
- When the stop-loss PR lands, switch `prompts/breachFix.ts` to import `Recommendation` / `AdviceBrief` from `prompts/advice.ts` instead of its local copy. It's a type-only change; the shapes are identical.
- A **firm rollup** (`scope: "portfolio"`): one brief per incident listing each exposed company's open "now" items, for the PE view. `AdviceBrief` already allows `scope: "portfolio"` and `companyId: null`. Keep the rule that the firm reads but never acts.
- Don't send this text through `notify.ts` (Slack). Alerts already go out, and this text is a plan to work through, not a notice.

**Do not:**
- call the model from a query or mutation;
- let the AI choose, add or drop steps;
- put the reporter's name, `summary` or finding labels into any fix context.

---

## → Marco (Role 2's agents): UI

The UI pieces are ready but not mounted. **Start after PR #114 is merged.** Before that, `api.ai.getBreachFixAdvice` doesn't exist on `main`.

**What you get** (`src/ai/fixPlan/`, details in its `README.md`):
- `useBreachFixAdvice(exposureId | null)` returns `BreachFixAdvice | null | undefined`, typed from the query. It subscribes with `useQuery` (no polling).
- `<BreachFixCard exposureId onOpenPlaybookStep? onOpenHeldPayments? />` is a "What to do now" card.
  - Recommendations are grouped Now / Next / Later. Each shows its owner, the "why", the steps, and a status chip (Done / Ready, one click / To do).
  - It shows a skeleton while loading and nothing when the viewer may not see the exposure.
- `<BreachFixView advice … />` is the same card, for data you already have.
- The card uses `Card`, `Chip`, `Tile` and `Skeleton` from `src/panels/ui.tsx` and the brand tokens. No new packages.

**Where to mount it:**
1. **Company view** (`src/panels/CompanyView.tsx`): under `ExposureHero` for `leadExposure`, or inside the Alerts tab for the hero exposure.
   - `onOpenPlaybookStep` scrolls to "Your pre-approved steps" (`PlanSteps`, already in `ExposureHero`).
   - `onOpenHeldPayments` calls `select("payments", true)`.
   - The IT lead and the controller both benefit: owners are labelled per item.
2. **Firm view, map evidence panel** (`src/map/EvidencePanel.tsx`, Omar's folder; Omar is OK with you adding it there): render `<BreachFixCard exposureId={exposureId} />` below the evidence for the selected company. Leave out both callbacks; the firm reads but doesn't act.
3. **Later, stop-loss:** when its PR lands, `src/ai/stopLoss/` will have a matching card for the Response playbook tab (`PlaybookPanel`). Recommendations there point at `setPlaybookMode` through `playbookAction` / `recommendedMode`.

**Rules for the UI** (CLAUDE.md + `brand/README.md`):
- Show the text exactly as returned. Don't rewrite, shorten or add AI wording: the copy rules (`checkBreachFixCopy`) only cover what the backend sends.
- Label the source honestly. The card already shows "Written with AI, from Sidecall's rules" for cached text and "Sidecall's standard plan" for canned text. Keep a label like that.
- The card never runs a step, releases a payment or acknowledges anything. Those keep their own buttons and the backend's rules. Don't add action buttons to it.
- Don't use brain/sparkle "AI" icons, shield/padlock/siren icons, or words like "protect", "contain" or "auto-mitigate".
- Never show the reporting company in a company view (the query never returns it).
- Check it at phone width and in the presenter flow. It's long, so consider collapsing "Later" by default.

**Verify:** sign in as Rosa Alvarez (Summit) after firing Brightline. The card should open with "Urgent:", list "Verify the held payment" and "Treat the account ending 7731 as unverified" under Now, and flip those to Done after Rosa rejects the $480K. Then sign in as Ben Carter (Granite) after firing the red-team scenario: "Pause … until it is rotated" should read "Ready, one click".
