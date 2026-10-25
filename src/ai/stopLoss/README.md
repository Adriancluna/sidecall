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
- `StopLossView({ brief, readiness?, onOpenPlaybookStep? })` is the same card, for a brief you already have.
- `useStopLossAdvice()` returns `{ portfolio, companies, readiness, nextReviewAt } | undefined`, typed from the query. `asOf` starts at the exact current time and anchors the rolling 90-day lower bound, not a historical upper bound; new bank-change records remain visible through Convex updates. A one-shot timer advances the anchor at the returned next expiry (with the browser's timeout limit respected), without periodic polling. This is a live assessment, not an as-of historical snapshot.
- `onOpenPlaybookStep` is optional and only used in the company view; the firm never gets the button. The card never changes a playbook mode itself. Adopting a step goes through the existing switches in `PlaybookPanel`, which keep the two-person rule for any increase in access-action authority, including Notify only → One click. The controller's payment-hold rule uses its existing separate authorization.

## Where it fits

- **Company view, Response playbook tab** (`PlaybookPanel` in `src/panels/ResponsePlaybook.tsx`): above the switches. The steps already use the panel's words ("Pre-approved", "One click"). Also useful as an empty state before any incident.
- **Firm view:** the portfolio rollup on the portfolio page, before any incident. Per company, use `companyId` in the map's evidence panel next to the breach fix card.

## Backend contract

`api.ai.getStopLossAdvice({ asOf: number })` is in `convex/ai.ts`. It throws "Not signed in" without a session. Otherwise it returns:

```ts
{
  portfolio: AdviceBrief | null;   // firm only
  companies: AdviceBrief[];        // company user: exactly its own; firm: bounded list, by name
  readiness: CompanyReadiness[];   // same company scope; read-only, see below
  nextReviewAt: number | null;     // earliest included bank-change expiry in milliseconds
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

### Readiness preview (Pegasus companion branch)

Each `CompanyReadiness` has `companyId`, `companyName`, `status` (`assessed`, `needs_evidence`, `partial`), `paymentHoldsEnabled`, `limits`, and `assets`. Each asset has its name, source and relationship, recorded unpaid cents, and access actions with `configuredMode`, nullable `eligibleMode`, and a reason. The caps come from the incident engine's existing `responseFor` function. They are eligibility ceilings under current company policy; observations, active episodes, portfolio limits and execution authority can prevent or lower a real action. No preview writes a policy, creates a response, holds money or tests an external system.

`StopLossCard` includes this preview for a company or firm-selected company. `StopLossView` accepts optional `readiness`; pass the matching entry when rendering it manually. The portfolio summary stays read-only; its recommendations remain a company-owned adoption workflow. Assets expand with native keyboard-operable disclosure controls. Do not mount the card into production until the dependent PRs are approved; Marco owns the candidate app integration.

The input reducer uses the strongest relationship per company/asset, with the same ranking as incident fan-out. Candidate DNS rows do not establish shared credentials, and same-vendor-only customers are not promised a revoke. Every bounded scan uses an overflow sentinel: incomplete data is labelled partial and cannot reuse a confident cached summary. No relationships means evidence is needed, even when the recommendation list is empty. `assessed` never means every real-world relationship is known or that external accounts are verified.

Company-name validation context stays internal; it is excluded from facts, public brief and readiness projections. Both generation and delivery recheck cached summaries against copy rules, other-company names, and dollar/account references present in the recorded facts. These deterministic checks are not a general truth guarantee. Changed recommendations invalidate affected old summaries; those entries correctly show standard text until Omar regenerates them with the updated facts. The shared `prompts/advice.ts` file is unchanged for #114 compatibility.

## Copy rules (tested)

- `checkAdvice` in `prompts/advice.ts`: no "fraud", "block", "cancel", "contain the breach", "auto-mitigate", "stop the attack", "guarantee" or markdown; "validated" only next to "not tested"; no other company's name; no phone number except the one on file.
- `summaryProblems` in `prompts/stopLoss.ts`: a summary never says a payment is held, because nothing is held before a breach, and it is one paragraph.
- The prompts also forbid promising the steps prevent a breach. They say the steps limit how far a breach reaches.

## Regenerate the text (dev deployment only)

```
ANTHROPIC_API_KEY=… node prompts/generateStopLoss.mjs   # reads existing own DEV; no push/reset; writes local cache
ANTHROPIC_API_KEY=… node prompts/generateStopLoss.mjs --deployment <your-own-dev> --push --seed  # explicit destructive DEV opt-ins
node --test prompts/stopLoss.test.mjs                   # rules + committed cache pass the copy rules
npx vitest run convex/stopLoss.test.ts                  # the query: scoping, picks, cache hits, incident-stable
```

The cache only hits while the facts match and its summary passes delivery checks. Generator safeguards require matching DEV selector/cloud URL; mutations additionally require the explicit expected deployment name. Production, Adrian DEV, deployment key/token aliases, self-hosted overrides and conflicting environment selectors are refused before any CLI call. Cache reuse needs no model key; stale summaries require `ANTHROPIC_API_KEY`, and a failed generation never overwrites the existing cache. Missing/partial evidence uses standard text instead of generated assurance.

## Verification

Pegasus's companion branch passes 129 app/backend tests and 80 prompt/generator/scorecard tests, both TypeScript checks, lint and build. The existing full live rehearsal passes on Pegasus DEV. `node scripts/readiness/rehearse.mjs --report docs/pegasus-readiness-rehearsal.json` adds seven live checks using real company/firm sessions and a Convex WebSocket subscription: scope, grounded advice, authorized hold-rule adoption, reactive gap closure and verified restoration. Run after the original rehearsal on your own clean DEV; it does not reset or deploy, but temporarily toggles Summit's synthetic hold policy and restores it in `finally` before bounded socket cleanup.

The component was checked with returned synthetic DEV data at desktop and 375 px, including keyboard disclosure, with no horizontal overflow or browser console errors. It remains unmounted: this verifies the component, not the full app integration assigned to Marco. No AI cache was regenerated in this pass; invalidated summaries use the standard fallback.
