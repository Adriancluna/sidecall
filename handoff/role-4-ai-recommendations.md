# AI recommendations: handoff to Pegasus (backend) and Marco (UI)
Last updated: Oct 24, 23:35 by Omar's Claude (Role 4). Omar asked for this handoff.

There are two AI features with the same format:
1. **Breach fix advice**: what an exposed company should do after an incident lands. **Built in PR #114** (branch `claude/project-thread-tliv3d`, not merged).
2. **Stop-loss advice**: which stop-losses each company should set up *before* a breach. **Built in PR #119** (https://github.com/Adriancluna/sidecall/pull/119, branch `claude/project-thread-iztrvn`, not merged). Contract and wiring are in `src/ai/stopLoss/README.md`. Same `Recommendation` / `AdviceBrief` shape (`prompts/advice.ts`, byte-identical in both PRs), same pattern.

How both work: fixed rules choose every recommendation, owner, priority and status from backend rows. The AI writes only the summary and the one-line "why" for each recommendation. That text is pre-generated off stage into a cache file, so nothing calls the model on stage. CLAUDE.md's rule holds: AI writes, never decides.

---

## → Pegasus (Ashwa's agents): backend

### Breach fix backend (PR #114)

The backend for breach fix advice is written and tested. What's left is review, merge, and two follow-ups.

**1. Review and merge PR #114** (https://github.com/Adriancluna/sidecall/pull/114).
- It touches only Role 4 files (`convex/ai.ts`, `prompts/`, `data/ai_breach_fix.json`), plus two new folders: `convex/ai.test.ts` and `src/ai/`.
- It changes no schema and no Role 1 file. It reads `links`, `payments`, `responseSteps`, `exposures`, `incidents`, `assets` and `companies` through existing indexes only.
- CLAUDE.md says Adrian reviews and merges every PR and that every merge to `main` is a production deploy. Get Adrian's OK, then batch the merge with other work.
- Check it on **your own dev deployment** (`tangible-koala-842`), not Omar's (`brainy-cassowary-804`) or Adrian's:
  ```
  npx convex dev --once && npx convex run seed:run && npx convex run seed:fireDemoIncident '{"scenario":"brightline"}'
  npm test                                   # 111 green on current main, 7 of them in convex/ai.test.ts
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
- Both PRs carry the same `prompts/advice.ts` (shared types + `checkAdvice`), byte for byte, so whichever merges second has nothing to resolve there. `prompts/breachFix.ts` imports its types from it.
- A **firm rollup** (`scope: "portfolio"`): one brief per incident listing each exposed company's open "now" items, for the PE view. `AdviceBrief` already allows `scope: "portfolio"` and `companyId: null`. Keep the rule that the firm reads but never acts.
- Don't send this text through `notify.ts` (Slack). Alerts already go out, and this text is a plan to work through, not a notice.

**Do not:**
- call the model from a query or mutation;
- let the AI choose, add or drop steps;
- put the reporter's name, `summary` or finding labels into any fix context.

### Stop-loss backend (PR #119)

**Review and merge.**
- PR #119 touches only Role 4 files: `convex/ai.ts` (a section at the bottom), `prompts/`, and `data/ai_stop_loss.json`.
- It also adds `convex/stopLoss.test.ts` and `src/ai/stopLoss/`.
- It changes no schema and no Role 1 file. It reads `companies`, `assets`, `links` (by asset), `payments` (pending and held, by asset), `bankDetailChanges` (last 90 days), `users` and `responsePolicies` through existing indexes.
- Merge order with #114 doesn't matter: `prompts/advice.ts` is byte-identical in both, and the two `convex/ai.ts` sections only meet at the imports.

**Check it on your own dev deployment.**
```
npx convex dev --once && npx convex run seed:run
npx vitest run convex/stopLoss.test.ts   # 9 green
node --test prompts/stopLoss.test.mjs    # 9 green
```
Then call `ai:getStopLossAdvice '{"asOf": <now ms>}'` as Rosa Alvarez (Summit). The first item should be "Verify Brightline Payroll Inc.'s new bank details by phone", for the $480,000 going to the account ending 7731, with `source: "cache"`.

**What's in it.**
- `api.ai.getStopLossAdvice({ asOf })` returns `{ portfolio, companies }`.
  - A company user gets `portfolio: null` and only its own brief.
  - The firm gets a portfolio rollup that names companies, plus every company's brief.
  - `asOf` is the client's clock rounded to the hour, because queries can't read the clock.
- `internal.ai.stopLossContexts({ asOf })` feeds `prompts/generateStopLoss.mjs`.
- `data/ai_stop_loss.json` has 14 summaries.
- The cache only hits while each company's item titles, reasons and priorities match. After a seed change, rerun `ANTHROPIC_API_KEY=… node prompts/generateStopLoss.mjs` on dev and commit.
- Held payments count as unpaid, so firing an incident changes nothing here.

**Do not:**
- let the card or query change a playbook mode. Adopting goes through `responses.setPlaybookMode`, which keeps the two-person rule.
- call a model from the query.

---

## → Marco (Role 2's agents): UI

### Breach fix UI (after #114 merges)

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
3. **Stop-loss:** see "Stop-loss UI" below; its card goes above `PlaybookPanel`.

**Rules for the UI** (CLAUDE.md + `brand/README.md`):
- Show the text exactly as returned. Don't rewrite, shorten or add AI wording: the copy rules (`checkBreachFixCopy`) only cover what the backend sends.
- Label the source honestly. The card already shows "Written with AI, from Sidecall's rules" for cached text and "Sidecall's standard plan" for canned text. Keep a label like that.
- The card never runs a step, releases a payment or acknowledges anything. Those keep their own buttons and the backend's rules. Don't add action buttons to it.
- Don't use brain/sparkle "AI" icons, shield/padlock/siren icons, or words like "protect", "contain" or "auto-mitigate".
- Never show the reporting company in a company view (the query never returns it).
- Check it at phone width and in the presenter flow. It's long, so consider collapsing "Later" by default.

**Verify:** sign in as Rosa Alvarez (Summit) after firing Brightline. The card should open with "Urgent:", list "Verify the held payment" and "Treat the account ending 7731 as unverified" under Now, and flip those to Done after Rosa rejects the $480K. Then sign in as Ben Carter (Granite) after firing the red-team scenario: "Pause … until it is rotated" should read "Ready, one click".

### Stop-loss UI (after #119 merges)

**What you get.**
- `<StopLossCard onOpenPlaybookStep? />` for a company user.
- `<StopLossCard />` (portfolio rollup) or `<StopLossCard companyId />` for the firm.
- `<StopLossView brief />` and `useStopLossAdvice()`.
- It uses the same panel UI pieces as `BreachFixCard`.

**Where to mount it.**
1. **Company view, Response playbook tab:** above `PlaybookPanel`. `onOpenPlaybookStep(action, mode)` should scroll to that row. The steps already use the panel's labels ("Pre-approved", "One click").
2. **Firm view, before any incident:** the portfolio rollup on the portfolio page.
3. **Firm view, per company:** `companyId` in the map's evidence panel, next to the breach fix card. The firm never gets the button.

**Rules.**
- Show the text as returned.
- Keep the "Written with AI, from Sidecall's rules" / "Sidecall's standard advice" label.
- No action buttons beyond "Open in Response playbook".

**Verify.**
- Rosa (Summit) sees the $480K bank-change check first.
- Sofia Bianchi (Pinecrest) sees "Turn on payment holds" first, with "Pre-approved".
- Jordan Ames (firm) sees "Ask 5 companies to turn on payment holds".
- Screenshot: `/mnt/project-files/screenshots/stop-loss/stop-loss-cards.png`.
