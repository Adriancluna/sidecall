# Role 4: AI + scorecard + DNS (Waterloo #2, Omar)
Last updated: Oct 24, 04:30 by Omar's Claude

## Status (this PR)
- **AI writing (`convex/ai.ts`):** same three exports and args; writes each batch with one `saveAlerts` call (✓ done for Role 1), live calls 5 at a time. Text comes from `data/ai_cache.json` first (used only if the facts it was written from still match: urgency, reasons, amount, account, flag), then a live call only when `AI_LIVE=true` + `ANTHROPIC_API_KEY`, then the old canned text. Live text that breaks the copy rules falls back to canned. `npm test` 25 green.
- **Prompts + copy rules (`prompts/writing.ts`):** system prompt, one prompt per kind, cache keys, and `checkCopy` (no "fraud"/"scam"/"validated"/"block"/"cancel", no other company names, no phone number except the one on file, hold notices must say "held until verified", alerts must start "Urgent:"/"Advisory:" from the backend's urgency, no markdown).
- **Generator (`prompts/generate.mjs`):** reseeds a DEV deployment, fires the 3 scenarios, writes `data/ai_cache.json` with Claude (Opus 5.5, plain `fetch`, no SDK). Retries a text up to 3 times if it fails the copy rules. Refuses prod.
- **Cache keys:** `"<externalId>|company_alert|<company>"`, `"<externalId>|vendor_letter|vendor"`, and `"<externalId>|hold_notice|<company>|<amountCents>"` (amount added because Bayview has two held payments).
- **Scorecard (`scripts/scorecard/run.mjs`):** reseeds a DEV deployment, fires brightline → ironcladCredential → ironcladMsp, compares `scoring:exportOutcomes` with `data/answer_key.json` (skips `seedRef: null`), writes `data/scorecard.json` in the CONTRACT shape. Refuses prod. Checked the comparison offline against convex-test: 10/3/5 cases all caught or correctly left alone. **`data/scorecard.json` is still the placeholder until the real run.**
- **DNS (`scripts/dns/scan.mjs`):** one detector (MX, SPF includes, TXT verification tokens, CNAMEs) over (a) simulated records for the fictional seed domains (`scripts/dns/seed_records.json`) → `data/dns_links.json`, and (b) live DNS for real domains (`scripts/dns/domains.json`) → `data/dns_findings.json`. Never links to Brightline or Ironclad.
- **`data/dns_links.json` (13 entries):** seed imports 4 new candidate links (Alder → Ledgerly, Summit → Ledgerly, Harborline → Keystone, Pinecrest → Relay); the other 9 pairs already exist in `seed.ts` and are skipped. Checked in convex-test: headlines unchanged (Brightline 3 · 4,200 · $612K; credential 3 · 3,950 · $0; MSP 3 · 4,600 · $116K).

## In progress
1. Run `prompts/generate.mjs`, `scripts/scorecard/run.mjs` and `scripts/dns/scan.mjs` from a cloud session with network + keys, commit the data files.

## How to run (dev deployment only)
```
npx convex dev --once                       # or set CONVEX_DEPLOY_KEY=dev:… (never prod:)
ANTHROPIC_API_KEY=… node prompts/generate.mjs   # → data/ai_cache.json (~16 texts)
node scripts/scorecard/run.mjs              # → data/scorecard.json
node scripts/dns/scan.mjs                   # → data/dns_links.json + data/dns_findings.json
node scripts/dns/scan.mjs --seed-only       # dns_links.json only, no network
```
Each Convex script runs `npx convex dev --once` first (`--no-push` skips it) and reseeds.

## Needs from others
- → Role 1 (optional, nice for the evidence panel): when a `dns_links.json` entry matches a pair that is already `dns_inferred` in `seed.ts` LINKS (Alder/Summit/Harborline/Meridian → Relay Mail, Granite Peak → Keystone), set its `detail` instead of skipping, so those links show the DNS record too. Today they're skipped and carry no detail.
- → Role 2: `data/dns_findings.json` (`[{ domain, vendor, record, evidence }]`, real public domains) will land after the scan run; Proof panel "Real" can list it. The AI vendor letter will be ~150–230 words in several paragraphs (`\n\n`), so render it with `whitespace-pre-wrap`.

## Decisions & gotchas
- No new npm packages: the model is called with plain `fetch` (`prompts/writing.ts` → `callClaude`).
- Day counts are left out of AI text on purpose (they shift if the demo fires a day after seeding); the payment card shows the exact days.
- `scripts/scorecard/convex.mjs` is shared by the generator and the scorecard (`npx convex run` wrapper + prod guard).
