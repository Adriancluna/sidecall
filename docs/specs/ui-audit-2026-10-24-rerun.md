# UI audit, round 2: what's still open after #74 (Oct 24)

Owner: Role 2 (Marco). **For a second opinion only. Nobody acts on this yet.** Follows `docs/specs/ui-audit-2026-10-24.md` and Role 1's reply in #71.

## Ask for Role 1 (Adrian's agent)

Please review the open issues below and give a second opinion. **Review only:** make no code edits, commits, deploys or Convex changes because of it. Marco decides what gets fixed.

- Do you agree that each issue is real and has the right priority? Is anything wrong, or missing?
- **Issue 1:** is skipping the confirm for the requester fine, given that the backend refuses and logs the refusal anyway? Or would you rather keep it?
- **Issue 3:** does showing held payments first to IT users hurt the acknowledge race in beat 7?

Reply in `handoff/role-1-backend.md` or straight to Marco.

## How this was checked

- **Re-critique:** a fresh two-agent critique scored a local variant of the round-1 fixes at **26/40, up from 23**. That variant was dropped, because #74 shipped its own version of the same fixes.
- **This list:** each issue was then checked by reading `main`'s source at `8100425` (after #74–#77). This list was **not re-rendered** against #74.
- **Round-1 issues 1–4:** fixed in #74 (held payment first and large, card trimmed, Release confirm, call line per role). Round-1 issue 5 (map) is still open.

## Still open on main

1. **[P1] The requester gets a Release confirm, then a refusal.**
   - What happens: in beat 2, Jamie clicks Release and a native dialog appears ("Release $480,000 to Brightline Payroll Inc. account ••7731, …?"). Only after that is she refused.
   - Why it hurts: it adds a stage click, the dialog text is tiny on a projector, and it asks a question the line above it has already answered ("You requested this payment, so a controller must release it…").
   - Where: `PaymentCard.tsx` `decide()`, which confirms for every viewer.
   - Fix: skip the confirm when `viewer.id === payment.requestedBy`.
2. **[P1] The map tile shows a score instead of a reason.** This is round-1 issue 5, unchanged.
   - What happens: Summit shows "urgent" next to "same vendor only · score 70".
   - Where: `src/map/BlastRadiusMap.tsx:68` (Role 3's file).
   - Fix: replace the score with the reason that decided the urgency, e.g. "bank change · $480K held".
3. **[P2] IT's Acknowledge is pushed down.**
   - What happens: the held panel now sits above Alerts for every company user, so Kwame's Acknowledge button lands near the bottom of the screen. In beat 7 two narrow tabs sit side by side, which makes it worse.
   - Where: `CompanyView.tsx`.
   - Fix: put held payments first only for controllers and AP clerks; IT keeps Alerts first.
4. **[P2] Status chips are lowercase in places.**
   - What happens: some chips show raw values ("held", "urgent", "open"), while the card says "Held until verified".
   - Where: `PortfolioView.tsx:156,180,183` and `CompanyView.tsx:139,141`.
   - Fix: map the values to labels ("Held", "Urgent", "Open", "Acknowledged").
5. **[P2] The PE grid repeats huge amounts.**
   - What happens: every card uses `text-4xl md:text-5xl`, so six of them compete with the PE headline.
   - Fix: use a smaller amount when there is no viewer (the firm view).
6. **[P2] Alert text on the PE view has no width cap.**
   - What happens: lines run to about 150 characters.
   - Where: `PortfolioView.tsx:188`. The vendor letter at `:223` is `max-w-3xl`, about 140 characters.
   - Fix: add `max-w-prose`.
7. **[P3] The old and new accounts are both coral.**
   - Where: the bank-change block in `PaymentCard.tsx`.
   - Fix: show the trusted old account (••2208) in neutral grey and only ••7731 in coral, so "trusted → suspicious" reads at a glance.
8. **[P3] Small items.**
   - "Decision needed" shows to IT as well (no action for them).
   - The due-time copy reads "about 1 hours" or "about 0 hours" at the edges.
   - Release and Reject have no busy label ("Releasing…").
   - The subtitle repeats `••7731`, which is already in the bank-change block.

## No longer an issue on main

- **Escalation hidden in a tooltip:** not the case on `main`. #74 shows "Decision needed · due in about N hours" as visible text.
