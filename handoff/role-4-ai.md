# Role 4: AI + scorecard + DNS (Waterloo #2, Omar)
Last updated: Oct 24, 13:30 by Omar's Claude

## Status (this PR: red-team finding text + scorecard)
- ✓ done for Role 1 (asks #4 and #6): **`convex/ai.ts` canned alert** now appends the sister-safe `pathSummary` and then `whatToCheck` (each when non-null; the check replaces the generic "rotate and review" line because it already says what to do). **Canned vendor letter** names the technique with a finding ("An authorized test validated use of T1078 Valid Accounts against Ironclad shared admin account held by a Northpass portfolio company", then tenant-wide rotation, isolation, 30 days of admin-console logs). Latent bug fixed: the canned letter said payments were held even for the credential scenarios, which hold none.
- **Prompts (`prompts/writing.ts`):** `WritingContext` carries `technique`, `pathSummary`, `whatToCheck`. With a path, the alert prompt tells the model that "validated" always travels with "not tested", never to say the reader was tested, and to keep the `whatToCheck` instruction (asset name + time stamp) as the first step; the letter prompt asks for the spec A4 content. SYSTEM_PROMPT has the finding rule; nothing ever sees `summary` (it names the reporter).
- **`checkCopy` is kind-aware about "validated":** hold notices never; company alerts only when the incident carries a finding (`finding: true`) *and* the text says "not tested"; vendor letters only with a finding. New: "Armadin" banned in every kind; an alert may not claim the reader was tested ("tested at your company", "validated at <reader>", "validated here", negations allowed). Signature: `checkCopy(kind, text, { phoneOnFile, otherCompanies, urgency?, finding?, readerName? })`.
- **Cache keys unchanged for the 19 existing texts:** the new facts fields are added only when non-null and only after the old keys, so `data/ai_cache.json` entries for the three older scenarios match byte for byte (pinned by tests). `prompts/generate.mjs` now **reuses** a cached body when key + facts match and it still passes today's rules, and only calls the model for the rest (`--regenerate` rewrites everything); fires all four scenarios (`scripts/scorecard/convex.mjs` SCENARIOS, `armadinFinding` last).
- ✓ **`data/ai_cache.json`: `demo-armadin-004` entries generated** (see the cache's `generatedAt`): 3 company alerts (Cedar Ridge, Granite Peak, Harborline) + 1 vendor letter, no hold notices; the 19 older texts are byte-identical.
- ✓ done for Role 1 (B3): **`data/scorecard.json` regenerated** against dev after the `*_email_change` rename: Brightline 6/0/0/4 · Ironclad credential 0/0/0/3 · Ironclad MSP 4/0/0/1 (same numbers as before, refs now match the key).
- **Scorer no longer passes by default (`scripts/scorecard/score.mjs`):** a planted ref that *no* fired scenario exported (renamed/missing seedRef) makes `buildScorecard` throw and `run.mjs` exit 1 without writing the file. A ref another scenario exports but this incident did not touch still scores "left alone" (`exportOutcomes` only returns rows on the incident's own asset: cred-002's planted payments live on Ironclad IT Services).
- **Tests (node:test, outside `npm test` because `vitest.config.ts` only runs `convex/`):** `node --test prompts/writing.test.mjs scripts/scorecard/score.test.mjs` → 16 + 24 green. `npm run lint`, `npm test` (55) green.

## Status (earlier PRs, still true)
- ✓ **`data/ai_cache.json` generated** (05:17Z, Claude Opus 5.5, dev deployment brainy-cassowary-804): 19 texts. Brightline 8 (3 alerts, 4 hold notices, 1 letter), Ironclad credential 4 (3 alerts, 1 letter, no holds), Ironclad MSP 7 (3 alerts, 3 hold notices, 1 letter). All pass `checkCopy` first try. Checked by hand against CLAUDE.md copy rules: no reporter named, no "fraud"/"block"/"cancel"/"validated", only the phone on file, Bayview's DNS link called a candidate. Re-fired all three on dev after pushing: all 19 AI rows in `alerts` match the cache (the 20th row is Role 1's escalation, not AI).
- **Prompt fix (`prompts/writing.ts`):** the first run's Ironclad-credential vendor letter said payments were held when that incident holds none, and the credential alerts said "keep them held". The vendor letter now only mentions holds when `paymentsHeld > 0`, and alerts say a payment is held only when the backend's reasons say so. Facts keys unchanged; `npm test` 31 green.
- **AI writing (`convex/ai.ts`):** same three exports and args; writes each batch with one `saveAlerts` call (✓ done for Role 1), live calls 5 at a time. Text comes from `data/ai_cache.json` first (used only if the facts it was written from still match: urgency, reasons, amount, account, flag), then a live call only when `AI_LIVE=true` + `ANTHROPIC_API_KEY`, then the old canned text. Live text that breaks the copy rules falls back to canned. `npm test` 25 green.
- **Prompts + copy rules (`prompts/writing.ts`):** system prompt, one prompt per kind, cache keys, and `checkCopy` (no "fraud"/"scam"/"validated"/"block"/"cancel", no other company names, no phone number except the one on file, hold notices must say "held until verified", alerts must start "Urgent:"/"Advisory:" from the backend's urgency, no markdown).
- **Generator (`prompts/generate.mjs`):** reseeds a DEV deployment, fires the 3 scenarios, writes `data/ai_cache.json` with Claude (Opus 5.5, plain `fetch`, no SDK). Retries a text up to 3 times if it fails the copy rules. Refuses prod.
- **Cache keys:** `"<externalId>|company_alert|<company>"`, `"<externalId>|vendor_letter|vendor"`, and `"<externalId>|hold_notice|<company>|<amountCents>"` (amount added because Bayview has two held payments).
- **Scorecard (`scripts/scorecard/run.mjs`):** reseeds a DEV deployment, fires brightline → ironcladCredential → ironcladMsp, compares `scoring:exportOutcomes` with `data/answer_key.json` (skips `seedRef: null`), writes `data/scorecard.json` in the CONTRACT shape. Refuses prod. Checked the comparison offline against convex-test: 10/3/5 cases all caught or correctly left alone. **`data/scorecard.json` is still the placeholder until the real run.**
- **DNS (`scripts/dns/scan.mjs`):** one detector (MX, SPF includes, TXT verification tokens, CNAMEs) over (a) simulated records for the fictional seed domains (`scripts/dns/seed_records.json`) → `data/dns_links.json`, and (b) live DNS for real domains (`scripts/dns/domains.json`) → `data/dns_findings.json`. Never links to Brightline or Ironclad.
- **`data/dns_links.json` (13 entries):** seed imports 4 new candidate links (Alder → Ledgerly, Summit → Ledgerly, Harborline → Keystone, Pinecrest → Relay); the other 9 pairs already exist in `seed.ts` and are skipped. Checked in convex-test: headlines unchanged (Brightline 3 · 4,200 · $612K; credential 3 · 3,950 · $0; MSP 3 · 4,600 · $116K).

## In progress
1. Nothing running for Role 4. The UI remake (Marco's handoff in `role-2-frontend.md`, all of `src/`) is on branch `feat/ui-remake`, tracked in `handoff/role-3-map.md`.

## How to run (dev deployment only)
```
npx convex dev --once                       # or set CONVEX_DEPLOY_KEY=dev:… (never prod:)
ANTHROPIC_API_KEY=… node prompts/generate.mjs   # → data/ai_cache.json (reuses matching texts; --regenerate rewrites all)
node scripts/scorecard/run.mjs              # → data/scorecard.json (exit 1 and no file if a planted ref is unknown)
node --test prompts/writing.test.mjs scripts/scorecard/score.test.mjs   # Role 4 unit tests
node scripts/dns/scan.mjs                   # → data/dns_links.json + data/dns_findings.json
node scripts/dns/scan.mjs --seed-only       # dns_links.json only, no network
```
Each Convex script runs `npx convex dev --once` first (`--no-push` skips it) and reseeds.

## Needs from others
- → **Role 1 (Adrian), optional:** `internal.alerts.getWritingContext` could return `portfolioCompanyNames: string[]` (every company, reporter included). The live AI path's "names another company" check builds its list from the exposed companies only, so the reporter's name is not on it (the prompts never carry it, so a leak would need a hallucination; `prompts/generate.mjs` already uses `listCompanies`). Must not go into any facts object or the cache keys change.
- → **Role 1 (Adrian), optional:** add `prompts/**/*.test.mjs` and `scripts/scorecard/*.test.mjs` to a test script if you want them under `npm test` (they are node:test files; `vitest.config.ts` is yours).
- Nothing else open. Thanks: Role 1's `pathSummary` / `whatToCheck` / `technique` shapes fit as-is.

## Decisions & gotchas
- No new npm packages: the model is called with plain `fetch` (`prompts/writing.ts` → `callClaude`).
- Day counts are left out of AI text on purpose (they shift if the demo fires a day after seeding); the payment card shows the exact days.
- `scripts/scorecard/convex.mjs` is shared by the generator and the scorecard (`npx convex run` wrapper + prod guard). Both fire all four scenarios; `demo-armadin-004` has no answer-key entry and is not scored.
- A copy rule change does not change cache keys, so the generator re-checks reused bodies against the current `checkCopy` and regenerates any that fail; `prompts/writing.test.mjs` pins that every committed body passes the committed rules.
