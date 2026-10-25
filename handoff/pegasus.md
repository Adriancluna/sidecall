# Pegasus: readiness depth and Claude work assignments
Last updated: 2026-10-24 by Pegasus

## Current work: purchasing intent and decision evidence

**Implemented on `feat/pegasus-purchase-intent`, source commit `891999a`, based on main `79192b4` after #120 merged.** [Draft PR #125](https://github.com/Adriancluna/sidecall/pull/125) is open with Adrian requested as reviewer; it remains draft because Adrian's real-model acceptance step is blocked by Anthropic authentication (HTTP 401); no real Claude execution has been claimed. No production deployment or self-merge. Pegasus DEV `tangible-koala-842` now runs this candidate.

The existing Bills panel now supports exact saved-bill/payee approvals, optional controller-selected agent scope, per-purchase and atomic total budgets, stable executor-scoped request IDs, immutable decision snapshots with ledger references, and a live read-only preview using the same evaluator. Exact retries retrieve historical decisions without a second debit, receipt, audit or quota charge; revoked agents still fail authentication. A new approval supersedes older ones, and revocation cannot reactivate them. No chatbot changes, new dashboard, package addition, Visa/bank connector, or claim of AP2/TAP integration.

Independent review also fixed status/history bugs: a paid payment hidden behind rejected attempts, an active vendor incident hidden behind hundreds of reviewed/legacy records, same-name agent revocation hidden behind old revoked credentials, and company/role/tool changes between HTTP authentication and internal tool execution. Ordinary repeated observations already correlate; this is not a claim of a new raw-report flood bypass. The live deploy also caught and fixed Convex's 64-character index-name limit.

**Validation:** 169 application/backend tests + 63 prompt/scorecard/assistant tests = **232 passing**; app/backend types, lint and build pass. Original full live rehearsal passes unchanged, including the $480K flow and red-team response. **17 live purchasing checks pass**, with concurrent budget requests, twenty exact retries, invoice/payee tampering, revoked approvals, scoped agents, caller quotas and unrelated-company continuity. All three harness-issued agent credentials were revoked and verified HTTP 401; five test sessions signed out. Report: `docs/pegasus-purchase-rehearsal.json`. Full-app browser QA at 1280 and 375 px verifies controller approval, AP eligibility, a $210 demo settlement, live budget/duplicate updates and keyboard evidence disclosures; no horizontal overflow or console errors. The normal build still warns about its roughly 504 kB main chunk; purchasing is lazy-loaded.

**Actual Claude proof is blocked by authentication.** The user ran the local launcher; Claude returned HTTP 401 before generation (0 model calls, 0 tokens, $0 estimated generation cost). MCP tool discovery passed, and cleanup revoked the approval and agent (verified 401) and signed out both sessions. Redacted failed-attempt evidence: `docs/pegasus-assistant-attempt.json`. A valid Anthropic API key is required before retry; no key was displayed or committed. `scripts/assistant/` is implemented and has 23 offline tests, including failure cleanup and exact receipt/ledger checks; offline tests are not actual model evidence. The runner reads an untrusted invoice/email through a fixed document tool, forwards actual model choices to the existing four MCP tools, verifies a $180 settlement plus changed-bill refusal and stored hold guidance, then revokes approval/credential and signs out. It does not score the factual accuracy of the final model narrative. Local key precedence is process > `.env.local` > `.env`. User already has an API key and is entering it by hand using the private local launcher `/Users/ashwathram/Documents/ChatGPT/Job/pegasus-assistant-proof.command`; the launcher prepares only Pegasus DEV, accepts the key without echo or saving it, and uses a $5 estimated application budget (not a provider billing cap). No key is in the repository. Do not run another reset while that launcher is active. Its report will be `scripts/assistant/report.json`.

Research, contract and limits: `docs/pegasus-purchase-intent.md`, `CONTRACT.md`, `scripts/assistant/README.md`. Visa intent validation, AP2 transaction binding, Convex serializable mutations and idempotency patterns informed this combination; they do not establish track eligibility or external payment guarantees. Request IDs have no retention job yet; reset clears purchase evidence/requests.

**Advice decision:** ship #119+#123 readiness in the existing Response playbook after Role 1 review; hold #114 for now because it overlaps the existing post-incident workflow and needs outcome validation. #114 is labelled `held: whats next`, with a Devpost What's next line in this branch. **Marco:** prepare the combined #119/#123 mounting candidate with role checks, reactive completion, keyboard/375 px QA; avoid the Bills purchasing files. **Omar:** continue map evidence/outcomes and the >=20 adversarial writing fixtures. **Adrian:** review purchasing once actual Claude proof is recorded, then batch one production release. Recording/DaVinci remains at the very end.

— Pegasus

Earlier entries below describe completed branches and their original validation; this section is the current status.

Ashwa explicitly requested more implementation and parallel Claude work after #116 merged. The tasks below extend existing track stories; production merges still require Role 1 review. Nobody should edit the teammates' chatbot or start another dashboard. Claim a task and its branch in your own handoff, then report PR + tests + screenshot or live result. Role 1 confirmed pickup and reviewed #120; Marco/Omar pickup of #118 is not yet confirmed.

**Shared task queue:** [GitHub issue #118](https://github.com/Adriancluna/sidecall/issues/118), assigned to Adriancluna, marcodonghiaa and Omar-Ibrahim123. Latest work is on `feat/pegasus-readiness-depth`, based on Omar's #119; source controls remain separately reviewed in #120. No direct access to the teammates' running Claude sessions is available; the GitHub assignments are the coordination mechanism.

## User correction: product work first, demo editing last

Ashwa will use Claude with DaVinci Resolve at the very end. **No recording, editing or video work is assigned now.** This supersedes the earlier Marco recording assignment in #118. Current focus is complete product behavior and automation depth.

Pegasus reviewed #119 at `36eec3d` and Omar's 23:35 recommendations handoff. Reserved on the readiness branch: `convex/ai.ts` stop-loss input/query section, readiness preview/backend tests, `prompts/stopLoss.ts` correctness fixes, generator guard, stop-loss hook/card and documentation. Work remains a reviewable development branch; no production merge and no chatbot interaction.

## Readiness companion implemented

**Ready for review: [PR #123](https://github.com/Adriancluna/sidecall/pull/123)**, implementation `02f06ea`, targeting Omar's #119 branch so only the companion changes are shown. Adrian and Omar are requested as reviewers; no self-merge.

- Recent bank changes now appear through the live Convex subscription; a one-shot expiry timer maintains the rolling 90-day window. It is a live assessment, not a historical snapshot.
- Strongest relationship wins, candidate DNS links do not count as confirmed shared credentials, and recommendations use the incident engine's actual action caps. Same-vendor-only customers are not promised a token revoke.
- Per-asset readiness shows configured and eligible modes with the limiting reason. It never changes policy, fires an incident or holds money. Missing and truncated evidence is explicit rather than a false all-clear.
- Cache delivery and generation validate copy, private company names, callback numbers and supported financial/account references. Changed summaries fall back to standard wording; no AI regeneration was performed. This is bounded deterministic validation, not a general truth guarantee.
- Generator defaults to reading existing own DEV, with explicit named-deployment opt-ins for push/reset, and rejects production, Adrian DEV, conflicting selectors, deployment keys/tokens and self-hosted overrides.
- **129 app/backend + 80 prompt/generator/scorecard tests = 209 passing**; app/backend typechecks, lint and build pass. Original full live rehearsal passes. **Seven new live checks pass** with real sessions and a WebSocket subscription; the synthetic hold policy is restored and verified. Report: `docs/pegasus-readiness-rehearsal.json`. Desktop/375 px component QA, keyboard disclosure, no overflow or console errors. The component is still **unmounted**; Marco owns full-app integration.
- This companion was verified on Pegasus DEV, then that DEV was switched to the #120 release fixes for their final rehearsal. No other person's DEV or production was changed.

## New incoming release review

**All five #120 release requests are fixed** in `8772087` on `feat/pegasus-source-controls`, with current main `980e1fa` merged for compatibility. Revoked-source waiting approvals are flagged and refused; execution rechecks even after approval. Legacy signed traffic has its own transactionally enforced quota, detectors cannot claim demo/review IDs, seed ordering is safe and the collision matcher is exact. Required reporter omission is also refused, detector list has a return validator, and the rehearsal rejects deployment-token aliases.

**177 tests pass (137 app/backend + 40 prompt/scorecard)**, both TypeScript checks, lint/build, the original full live rehearsal and **13 live detector checks**. The new live checks verify omitted reporters/reserved IDs and revocation hiding, refusing and expiring a waiting company approval. A 20-request burst refused 15 while another source stayed HTTP 200; owned access changed 200→403 in an observed 995 ms, unrelated access stayed 200, and Undo/replay passed. All three test credentials were revoked and verified HTTP 401. These are network-inclusive DEV observations, not production benchmarks. Current Pegasus DEV runs this reviewed candidate. Role 1 independently rechecks and merges; no self-merge. The #119 companion does not contain detector work.

Adrian confirmed in #118 that **bounded purchasing is wanted for Visa**. Revive the preserved #113 branch only after #120 merges; add an actual assistant/source-document/scoped-MCP sequence and preserve deterministic money authority. Preparing the product flow is compatible with Ashwa's instruction; recording/editing still waits until the very end. No Visa/bank API claim, no chatbot changes, no release tool. See Adrian's full acceptance criteria in #118.

## Source controls implemented separately in #120

**Release fixes ready: [PR #120](https://github.com/Adriancluna/sidecall/pull/120)**, original implementation `2144877`, review fixes `8772087`. Tested only on Pegasus DEV; Role 1 owns merge/deploy.

- Each detector has exact asset/reporter scope, default observation authority, expiry and its own hashed credential. Operator-only mint/rotation/revoke; caller JSON cannot choose its identity or authority.
- Intake and authority checks share a Convex transaction. Separate source+external-ID receipts preserve replay identity across rotation; global asset/class correlation still prevents restarted active-episode effects. A replay returns its original accepted assessment.
- Official Convex rate-limiter: burst 10, refill 30/minute per source; rotation preserves quota, another source has its own capacity. Streamed body cap is 32 KiB with bounded fields. Legacy HMAC and all 4 stage scenarios remain compatible.
- Waiting approvals and queued actions require the creating source's active confirm authority. Revocation blocks approval/execution but never releases existing money holds or undoes completed actions. Company approval cannot override revoked source authority.
- Firm-only evidence includes authenticated source and requested/effective assessment. Company incident external IDs are now opaque local references to prevent sender-chosen reporter-name leakage.
- Setup, contracts and limits: `docs/pegasus-detectors.md` and `CONTRACT.md`. Credential reset behavior and legacy-route limitations are explicit; this is not a DDoS guarantee, real detector integration, external identity-provider action or Visa payment integration.
- Latest validation is the 177 tests and 13 live checks above. Redacted report on the #120 branch: `docs/pegasus-detector-rehearsal.json`. No chatbot, purchasing or advice code changed in #120.

## Latest incoming handoff checked

Omar's `2c48d93` recommendation handoff asks Pegasus to review #114 with Adrian's OK and Marco to mount it only after merge; its updated shared advice types are already on Omar's branch. The new stop-loss feature is now **PR #119**, explicitly unmounted and requiring Adrian's OK; it is not shipped. → **Role 1:** include #114 and #119 in the explicit release decision; → **Role 4:** continue the assigned adversarial evaluation while those features remain unmounted. Pegasus has not merged them or changed the chatbot.

## Active ownership and acceptance criteria

| Owner | Work now | Done when |
|---|---|---|
| **Pegasus** | #119 readiness companion and #120 release fixes complete; prepare the approved purchasing revival after Role 1 merges #120. | Reviewable PRs and measured tests; recent bank changes appear reactively, strongest relationship wins, advice matches permitted actions, and preview never writes business state. |
| **Adrian / Role 1 Claude** | Recheck #120 fixes and own all production release decisions, including advice and revived purchasing. | Review on your own DEV; no unmerged code on another person's backend. #113 is CLOSED but its preserved branch is approved for revival, not shipped. |
| **Marco / Role 2 Claude** | Prepare product integration for #114 + #119 on a candidate branch: before-incident stop-loss advice, after-incident response advice, links to the correct existing playbook/payment section, and live completed-state transitions. **No demo/video work now.** | Company and firm flows work at 375 px and with keyboard; role permissions and cache/canned labels are retained; firm has no action buttons; opening advice never executes or adopts a control. Coordinate branch dependencies with Omar and Pegasus; Adrian owns production release. |
| **Omar / Role 3 Claude** | Improve the existing map's evidence-to-outcome explanation using current response-tracker data, without a new map design. | A selected exposed company can show its relationship evidence, authorized step and observed result; unconfirmed/candidate/untested stays visibly distinct, unrelated companies remain unchanged, 14/15-company desktop and 375 px screens checked. Source details remain firm-only. Keep changes in `src/map/` and your own handoff. |
| **Omar / Role 4 Claude** | Build a reproducible adversarial evaluation of existing non-chatbot writing/source-evidence paths: reporter-name leakage, invented callback numbers, unsupported certainty, malformed or conflicting evidence and malicious instructions embedded in source text. | At least 20 labelled fixtures, expected behavior and machine-readable pass/fail results with observed failures fixed; preserve working cache keys and distinguish authored test cases from real-world accuracy. Do not touch or integrate chatbot code, and do not mount held #114 without the team's decision. Coordinate one agent per file if the same Claude handles Roles 3+4. |

**Dependency notice:** #120 adds official `@convex-dev/rate-limiter` 0.4.x, announced before installation. The readiness companion adds no package.

## Current release truth
- #116 was approved and merged by Adrian as `f206628`; Role 1 independently verified tests and the full rehearsal. Main is now `980e1fa`, including #121's release handoff and #122's demo site gate; readiness stays based on #119.
- #113 purchasing is closed with implementation preserved on `fix/pegasus-episode-depth`, now approved for revival after #120. #114/#119 advice remains unmounted pending release review. No feature will be silently merged.
- Pegasus uses only `tangible-koala-842` for development. Do not reset/deploy Adrian DEV or production; do not paste tokens into handoffs, logs or PRs.
- Pegasus is an agent alias, without an @ mention; GitHub writes use `ashwathram-prathap`.

## Previous lifecycle implementation and validation

## Role 1 review addressed
1. Correlation ends at containment or 30 days without a report, including legacy episodes. Fresh evidence returns `correlated:true`; exact external-ID replay returns `duplicate:true`. Every accepted ID has a durable receipt, including IDs first correlated into another report.
2. **Decision B: warn immediately, act on confirmation**, with the existing explicit detector-enrollment exception. Observations create clearly unconfirmed company warnings, no holds/response steps/validated claims/vendor letter/AI rewrite. Confirmation or dismissal closes the old warning exposures. The 4 built-in stage scenarios retain confirmed behavior.
3. New-payment holds use the original incident's 30-day window. Repetition cannot extend it; already-held payments still require a controller's decision.
4. Prior-action restrictions apply only within the active episode. Fresh episodes regain current pre-approval; queued work rechecks policy and episode activity.
5. The fixed deadline says "Scheduled review" and never releases money/restores access. Firm channel notices coalesce in fixed 15-minute intervals; every accepted report remains in the live count and receipt history.
6. The firm-only response record ties reports, relationship evidence, policy/approval, payment outcomes, execution checks and audit together, with explicit truncation. Owned sandbox checks preserve before/after access and Undo history; simulations never claim external verification.
7. Human acknowledgment, payroll's one-click cap, company privacy and Ironclad's automatic pre-approved step are preserved.

## Validation
- **104 app/backend tests + 40 prompt/scorecard tests = 144 passing**, plus application/backend typechecks, ESLint and build. Main chunk retains the ~501 kB build advisory.
- Full original live rehearsal passed on Pegasus DEV with main's 14-company seed: $480K hold/release, acknowledgment race, new request, AP import, privacy, red-team path and automatic Cedar response. The 4 scenario inputs remain unchanged.
- **8 new live lifecycle checks passed**, saved in `docs/pegasus-episode-rehearsal.json`: concurrent fresh reports and exact-ID replay, notice coalescing, unchanged deadline, reporter privacy, continued $38K request flow, unauthorized review refusal, confirmation holding exactly $650K, durable post-review replay and new episode after containment. Intake uses the operator-only internal mutation; this script does not claim to test HMAC transport.
- Run `node scripts/episodes/rehearse.mjs --report <path>` after the full rehearsal on your own clean DEV. It refuses prod, Adrian DEV, deploy keys and mismatched deployment/URL, and never resets or changes flags. Data is synthetic; no live payment is sent.
- The sandbox rehearsal passed again on this branch: it independently checks HTTP 200→403 for the target, unrelated 200, firm-only record, authorized Undo, replay and retained verification history. Previous browser verification of the same lifecycle UI remains applicable; no new UI changes were introduced by this split.

