# Breach fix advice: "What to do now" (ready to wire, not mounted)

For Ashwa's agent (Pegasus) to put into the UI later. Owner: Role 4 (Omar). Nothing in `src/` imports these files yet, so merging them changes no screen.

## What it is

After an incident lands, each exposed company gets an ordered plan: secure the shared access, verify sign-ins and held payments, recover, and tell the right people. Every item has an owner (IT lead, controller, AP clerk or the firm), a priority (now / next / later), a one-line reason, concrete steps and a live status (done / ready / to do).

**Who decides what:** fixed rules in `prompts/breachFix.ts` pick every item from backend rows (the company's link to the asset, the vendor type, held payments and bank-change flags, the response playbook's steps, the red-team "What to check" line). The AI only writes the summary paragraph and each item's one-line "why", pre-generated into `data/ai_breach_fix.json`. On stage nothing calls the model: the query reads the cache, or falls back to the rules' own standard text (`source: "canned"`). This keeps CLAUDE.md's rule that AI writes but never decides.

## Use it

```tsx
import { BreachFixCard } from "../ai/fixPlan/BreachFixCard";

<BreachFixCard
  exposureId={exposure._id}
  onOpenPlaybookStep={(action) => /* scroll to "Your pre-approved steps" */ undefined}
  onOpenHeldPayments={() => /* switch to the Held payments tab */ undefined}
/>
```

- `BreachFixCard` subscribes with `useQuery` (no polling) and renders a skeleton, then the plan. It renders nothing when the viewer may not see that exposure.
- `BreachFixView({ advice, ... })` is the same card for data you already have.
- `useBreachFixAdvice(exposureId | null)` → `BreachFixAdvice | null | undefined`, typed from the query's return type.
- Both callbacks are optional. Without them the card is read-only. It never runs a step, releases a payment or acknowledges anything itself; those keep their own buttons and rules in the existing panels.

## Where it fits

- **Company view (IT lead, controller):** under the exposure hero, next to "Your pre-approved steps". Get the exposure id from `api.blastRadius.getMyExposures`.
- **Firm view:** in the map's evidence panel for the selected company (`EvidencePanel` already has the `exposureId`). The firm can read any company's plan, but it only reads: the company acts.

## Backend contract

`api.ai.getBreachFixAdvice({ exposureId })` (in `convex/ai.ts`) returns `null` or:

```ts
{
  scope: "company";
  companyId: Id<"companies">;
  companyName: string;            // the reader's own company; never the reporter
  summary: string;                // starts "Urgent:" or "Advisory:" (backend urgency)
  source: "cache" | "canned";     // cache = AI-written off stage; canned = the rules' text
  recommendations: {
    id: string;                   // stable: acknowledge, confirm_vendor, pause_login, rotate_login,
                                  // vendor_admin, revoke_tokens, check_access, confirm_separate_login,
                                  // verify_payments, check_pending_payments, bank_change,
                                  // restore_access, tell_people, close_out
    title: string;
    why: string;
    steps: string[];
    priority: "now" | "soon" | "later";
    owner: "firm" | "controller" | "it" | "ap_clerk";
    playbookAction: "hold_payments" | "pause_shared_login" | "revoke_vendor_tokens" | null;
    recommendedMode: null;        // only the stop-loss advice sets it
    phase?: "secure" | "verify" | "recover" | "notify";
    status?: "done" | "ready" | "todo";
  }[];
}
```

The shape matches the stop-loss advice (`src/ai/stopLoss/`), so one list component can render both.

- A company user sees only its own exposures; the firm sees any.
- Which items appear depends only on facts fixed when the incident lands, so the list never jumps. Statuses update live: acknowledging, the pre-approved pause running or being undone, a controller deciding the last held payment, the firm closing the incident.

## Copy rules (enforced in `checkBreachFixCopy`, tested)

- Never names the reporting company or another sister.
- Never "fraud", "block", "cancel", "contain", "auto-mitigate", "protect" or "stop the attack". Never says the reader was breached.
- "Validated" only with a red-team finding, and always next to "not tested".
- The only phone number allowed is the one on file. Simulated steps say "(simulated)" and never name an identity provider.

## Regenerate the text (dev deployment only)

```
ANTHROPIC_API_KEY=… node prompts/generateBreachFix.mjs   # reseeds dev, fires the 4 scenarios, reuses matching entries
node --test prompts/breachFix.test.mjs                   # rules + copy rules + committed cache
npx vitest run convex/ai.test.ts                         # the query: scoping, no leak, live statuses
```
