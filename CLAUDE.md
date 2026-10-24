# Sidecall — Portfolio Blast Radius (Cal Hacks 13.0)

For Claude / coding agents. Read this first, then `CONTRACT.md` (exact data shapes) and your role file.
If this conflicts with your role file on *what* to build, ask your human. On *which files you may touch*, your role file wins.

## Folder ownership (only the owner edits)

| Role | Person | Owns |
|---|---|---|
| 1 Backend | Adrian | `convex/schema.ts`, `convex.config.ts`, `access.ts`, `seed.ts`, `incidents.ts`, `blastRadius.ts`, `alerts.ts`, `payments.ts`, `scoring.ts`, `http.ts`, `data/answer_key.json`, `CONTRACT.md`, `CLAUDE.md` |
| 2 Frontend | Marco | `src/App.tsx`, `src/main.tsx`, `src/layout/`, `src/panels/`, `src/demo/`, `src/auth/`, styles |
| 3 Map + evidence | Waterloo #1 | `src/map/` |
| 4 AI + scorecard + DNS | Waterloo #2 | `convex/ai.ts`, `prompts/`, `scripts/dns/`, `scripts/scorecard/`, `data/dns_links.json`, `data/scorecard.json` |

**Stop and ask Adrian before touching `convex/schema.ts` or any Role 1 file.** Need a new field, index or query? Ask; don't add it.

Rules for every agent:
- Only create or edit files in your role's folders.
- No new npm packages unless your human has told the team first (package.json conflicts).
- Small PRs into `main`. `git pull --rebase origin main` before each push.
- Feature freeze ~6 hours before the deadline. After that: bug fixes, recording, Devpost.

## Brand (read before any UI work)

All branding lives in `brand/`. **Read `brand/README.md` before building or styling any UI.** It covers the logo files, colour and type tokens (`brand/tokens.css` for Tailwind v4), the favicon set, and the UI do's and don'ts.
- Dark-first: graphite background, paper text, Signal Amber `#F5A524` as the brand/advisory colour. No navy/electric blue.
- Use the logo SVGs in `brand/logo/`; never retype "Sidecall" as a logo. Ignore `brand/concepts/` (rejected drafts).
- No shield, padlock, radar, siren or warning-triangle icons. Sidecall warns; it doesn't defend.
- `brand/` is read-only for agents. Ask Adrian before changing it.

## What we are building

Companies owned by the same private equity (PE) firm quietly share IT contractors, payroll providers, login systems and other vendors. When one of them, or a shared vendor, is compromised, the others are exposed and nobody connects the dots.

Sidecall receives the incident, works out which sibling companies *genuinely* share the compromised thing (not just the same vendor name), sends each a tailored warning at the right urgency, shows the PE firm a live blast-radius map, and drafts one letter to the shared vendor.

When the compromised thing is a vendor, it also holds every pending payment to that vendor at companies that opted in, flags recent bank-detail changes, and requires a different person to verify by phone and release each payment. That is our Hyphenate (autonomous finance) entry: the seat is AP payment controls across a PE portfolio.

**Stack:** Convex (DB, functions, live updates, HTTP endpoint, auth) + React/Vite/TypeScript + one LLM. Deployed on Vercel. No Supabase, Firebase, Postgres, Express, Clerk or Apify.

## Demo story

1. ~8 portfolio companies; several share an IT contractor and a payroll vendor.
2. Fire incident (one button → `POST /incident`): the shared vendor is compromised.
3. **The money moment (video opens here):** Company C was about to pay $480,000 to that vendor, at a bank account "updated" by email two days before the breach. Held and flagged.
4. The AP clerk who requested it tries to release → refused (segregation of duties). The controller calls the number on file, then releases or rejects. Audit log records everything; cash moves only on release.
5. Zoom out: map lights up. "3 companies exposed · 4,200 people behind them · $612K in payments held."
6. Click a company → evidence panel: reasons, confidence, held payments.
7. Tailored alerts (urgent / advisory) plus one vendor letter.
8. Convex beats: replay the webhook (nothing duplicates), two browsers acknowledge at once (exactly one wins), Convex dashboard on screen.
9. Scorecard: caught / missed / false holds against the planted answer key.

## Design rules the code must follow

**Exposure**
- Same vendor ≠ shared weakness. Links carry `shareType`. Alert on dangerous types; `same_vendor_only` companies are exposed only when the incident is on that vendor/asset itself.
- Incidents are asset-centric. The reporting company is optional.
- **Never reveal who was hit.** Company views, alerts and hold notices never name the reporting company. Only the PE firm view does.
- Self-reported links outweigh `dns_inferred`. Never call an inferred link "validated"; say "reachability" or "candidate".
- Discipline over noise. Not alerting a company with a separate credential, and not flagging an honest bank change from months ago, are features.

**Money**
- A payment is held, never cancelled. Holds apply only where `holdRuleEnabled`.
- `bankChangeFlag` = vendor bank details changed within 30 days of the incident.
- `releasePayment` / `rejectPayment` refuse inside the mutation if the actor is the requester, isn't a controller at that company, or the payment isn't `held`. Refusals are logged.
- Every hold, flag, release, reject and refusal writes an `auditLog` row with incident, rule and reason.
- Double-entry ledger: bill booked Dr expense / Cr AP; release Dr AP / Cr cash. Held payments never touch cash.
- `data/answer_key.json` holds the planted cases. **Nothing in `convex/` reads it.** Only the scorecard script does.
- The PE firm sees holds but never presses release. A person at the portfolio company does.

**Convex (judges read the code)**
- `convex/schema.ts` is the contract. Use `.withIndex`, never `.filter` on table scans. Bound reads with `.take(n)`.
- Mutations never call an LLM. They write pending text and `ctx.scheduler.runAfter(0, internal.ai.…)`. Actions call the model and write back through `internal.alerts.saveAlert`.
- Schedule AI **once per incident**, not per company or payment. Loop inside the action.
- Never call actions from the client. Subscribe with `useQuery`; never poll.
- Business logic lives in Convex functions, not React.
- Identity comes from `ctx.auth` once login exists. Until then a temporary `actingUserId` arg. Company A must not read Company B's alerts.
- `/incident` dedupes on `externalId`; a replay creates no second incident and no second hold.
- Read `convex/_generated/ai/guidelines.md` before writing Convex code.

**AI**
- AI writes only: company alerts, vendor letter, hold notices. It does not detect, decide exposure, urgency or holds.
- All demo AI output is pre-generated. Nothing on stage hits the network except Convex.
- Hold notices say "held until verified", never "this is fraud". Tell the reader to call the number on file, never one from a recent email.

## Never say (pitch, Devpost, prompts, UI)

- "Three weeks or never." · "MSPs hide breaches."
- "Stolen credentials are the #1 attack vector" (exploitation leads at 31%).
- Anything about raising exit valuations, or any accuracy % we haven't measured.
- "We integrate with Armadin" unless we do.
- The "MSP Credential Risk Report" / "73% of MSPs share admin credentials".
- "We stop fraud" / "we block payments". We hold payments for a person to verify.
- Any public case of one shared vendor hitting several companies of one PE firm. None exists.

## Real vs. simulated

- **Simulated:** the portfolio, companies, users, bills, payments, amounts, incidents, bank changes.
- **Real:** the Convex backend and its guarantees (atomic fan-out, same snapshot, idempotency, race safety), exposure and hold logic, AI writing, the scorecard against the planted answer key, DNS-based vendor detection on real public domains.

## Background facts (for pitch / copy)

- PE employs ~13.3M Americans directly, about 1 in 12 workers (industry figure; critics say ~12M).
- Shared-vendor cascades: Kaseya 2021 (~60 providers → up to 1,500 victims); Miljödata Aug 2025 (one Swedish HR/payroll supplier, 200+ municipalities lost systems without being breached); Salesloft Drift 2025 (700+ orgs in ten days); CDK Global 2024 (~15,000 dealerships, ~$1.02B losses, ~3 weeks); Kronos/UKG Dec 2021 (~8M employees, payroll disrupted).
- Those vendors were PE/asset-manager owned (UKG–Hellman & Friedman, Kaseya–Insight Partners, CDK–Brookfield, PowerSchool–Bain Capital).
- Bain ruling, Mar 18, 2026: a federal judge let a breach suit proceed against Bain Capital, citing its control over the portfolio company's vendors, board and IT staffing. Hence: the firm sees, the company executes.
- 48% of breaches involve a third party (Verizon 2026). Vendors take a median 73 days to disclose; attackers move laterally in ~29 minutes (present as a gap, not a ratio). Only 12% of smaller PE firms have a formal portfolio security requirement (vs. 55% of the largest).
- CISA 2015 lets private companies share cyber threat indicators (in force through Dec 11, 2026). Indicators, not full reports.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
