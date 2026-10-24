# Stop-loss advice: "Stop-losses to set up" (ready to wire, not mounted)

This is for Ashwa's agent (Pegasus) to put into the UI later. The owner is Role 4 (Omar). Nothing in `src/` imports these files yet, so merging them changes no screen. The full handoff to Pegasus (backend) and Marco (UI) is in `handoff/role-4-ai-recommendations.md`.

## What it is

Before any breach, each portfolio company gets an ordered list of the stop-losses it should set up. These are controls that limit how far one shared vendor's incident can reach and how much money can leave before a person checks:

- turn on payment holds;
- verify by phone a vendor bank-detail change that came in by email;
- prepare a one-click pause for shared logins, or a revoke for vendor app tokens;
- replace a login shared with sister companies by separate accounts with MFA;
- name an IT contact;
- confirm DNS candidate links.

Every item has an owner (IT lead, controller or the firm), a priority (now / next / later), a one-line reason built from the company's own data, and concrete steps. When the item maps to an existing Response playbook step, it also carries the mode the firm recommends (`playbookAction`, `recommendedMode`). The PE firm also gets a portfolio rollup, such as "Ask 3 companies to turn on payment holds", which may name companies because only the firm sees it.

**Who decides what:** fixed rules in `prompts/stopLoss.ts` pick every item from backend rows: links and share types, playbook modes, `holdRuleEnabled`, unpaid payments, bank-detail changes in the last 90 days, and IT users. The AI only writes the summary paragraph at the top. That text is pre-generated with Claude into `data/ai_stop_loss.json`. On stage nothing calls the model: the query reads the cache, or falls back to the rules' own standard text (`source: "canned"`).

## Use it

```tsx
import { StopLossCard } from "../ai/stopLoss/StopLossCard";

// Company view (IT lead / controller): its own advice.
<StopLossCard onOpenPlaybookStep={(action, mode) => /* scroll to that row of PlaybookPanel */ undefined} />

// Firm view: the portfolio rollup, or one company's advice (e.g. in the map's evidence panel).
<StopLossCard />
<StopLossCard companyId={company._id} />
```

- `StopLossCard` subscribes with `useQuery` (no polling). It shows a skeleton while loading, then the card. It renders nothing when the brief isn't there.
- `StopLossView({ brief, onOpenPlaybookStep? })` is the same card, for a brief you already have.
- `useStopLossAdvice()` returns `{ portfolio, companies } | undefined`, typed from the query. It passes `asOf`, the client's time rounded down to the hour and fixed for the component's life, because queries can't read the clock.
- `onOpenPlaybookStep` is optional and only used in the company view; the firm never gets the button. The card never changes a playbook mode itself. Adopting a step goes through the existing switches in `PlaybookPanel`, which keep the two-person rule for raising a step to Pre-approved.

## Where it fits

- **Company view, Response playbook tab** (`PlaybookPanel` in `src/panels/ResponsePlaybook.tsx`): above the switches. The steps already use the panel's words ("Pre-approved", "One click"). Also useful as an empty state before any incident.
- **Firm view:** the portfolio rollup on the portfolio page, before any incident. Per company, use `companyId` in the map's evidence panel next to the breach fix card.

## Backend contract

`api.ai.getStopLossAdvice({ asOf: number })` is in `convex/ai.ts`. It throws "Not signed in" without a session. Otherwise it returns:

```ts
{
  portfolio: AdviceBrief | null;   // firm only
  companies: AdviceBrief[];        // company user: exactly its own; firm: every company, by name
}
// AdviceBrief = prompts/advice.ts, shared with the breach fix advice:
{
  scope: "company" | "portfolio";
  companyId: Id<"companies"> | null;
  companyName: string | null;
  summary: string;
  source: "cache" | "canned";
  recommendations: {
    id: string;          // hold_payments, verify_bank_change:<asset>, pause_shared_login,
                         // revoke_vendor_tokens, separate_credentials:<asset>, name_it_contact,
                         // confirm_candidate_link:<asset>; the firm's are "portfolio:<id>"
    title: string; why: string; steps: string[];
    priority: "now" | "soon" | "later";
    owner: "firm" | "controller" | "it" | "ap_clerk";
    playbookAction: "hold_payments" | "pause_shared_login" | "revoke_vendor_tokens" | null;
    recommendedMode: "notify" | "prepare" | "act" | null;
    phase?: "secure" | "verify" | "recover" | "notify";
    status?: "todo";
  }[];
}
```

- A company's brief never names another portfolio company. It counts sisters ("shared with 3 other portfolio companies") but never names them.
- Held payments count as unpaid, so firing an incident doesn't change the advice (tested). Changing a playbook mode or the hold switch does: the item drops off live.

## Copy rules (tested)

- `checkAdvice` in `prompts/advice.ts`: no "fraud", "block", "cancel", "contain the breach", "auto-mitigate", "stop the attack", "guarantee" or markdown; "validated" only next to "not tested"; no other company's name; no phone number except the one on file.
- `summaryProblems` in `prompts/stopLoss.ts`: a summary never says a payment is held, because nothing is held before a breach, and it is one paragraph.
- The prompts also forbid promising the steps prevent a breach. They say the steps limit how far a breach reaches.

## Regenerate the text (dev deployment only)

```
ANTHROPIC_API_KEY=… node prompts/generateStopLoss.mjs   # pushes, reseeds dev (no incident), reuses matching entries
node --test prompts/stopLoss.test.mjs                   # rules + committed cache pass the copy rules
npx vitest run convex/stopLoss.test.ts                  # the query: scoping, picks, cache hits, incident-stable
```

The cache only hits while the facts match: each item's title, why and priority, and whether holds are on. After a seed change, rerun the generator and commit `data/ai_stop_loss.json`.
