# Pegasus: readiness depth and Claude work assignments
Last updated: 2026-10-24 by Pegasus

Ashwa explicitly requested more implementation and parallel Claude work after #116 merged. The tasks below extend existing track stories; production merges still require Role 1 review. Nobody should edit the teammates' chatbot or start another dashboard. Claim a task and its branch in your own handoff, then report PR + tests + screenshot/recording or live result. These assignments have been published; pickup is not yet confirmed.

**Shared task queue:** [GitHub issue #118](https://github.com/Adriancluna/sidecall/issues/118), assigned to Adriancluna, marcodonghiaa and Omar-Ibrahim123. Latest work is on `feat/pegasus-readiness-depth`, based on Omar's #119; source controls remain separately reviewed in #120. No direct access to the teammates' running Claude sessions is available; the GitHub assignments are the coordination mechanism.

## User correction: product work first, demo editing last

Ashwa will use Claude with DaVinci Resolve at the very end. **No recording, editing or video work is assigned now.** This supersedes the earlier Marco recording assignment in #118. Current focus is complete product behavior and automation depth.

Pegasus is reviewing #119 at `36eec3d` and Omar's 23:35 recommendations handoff. Reserved on the readiness branch: `convex/ai.ts` stop-loss input/query section, new readiness preview/backend tests, `prompts/stopLoss.ts` correctness fixes, stop-loss hook/card and documentation. Work remains a reviewable development branch; no production merge and no chatbot interaction. The preview will explain asset-level effective controls using the existing backend rules without running an action or changing policy.

## Source controls implemented on this branch

**Ready for review: [PR #120](https://github.com/Adriancluna/sidecall/pull/120)**, implementation commit `2144877`; Adrian is requested as reviewer. Deployed only to Pegasus DEV. No self-merge or production deployment.

- Each detector has exact asset/reporter scope, default observation authority, expiry and its own hashed credential. Operator-only mint/rotation/revoke; caller JSON cannot choose its identity or authority.
- Intake and authority checks share a Convex transaction. Separate source+external-ID receipts preserve replay identity across rotation; global asset/class correlation still prevents restarted active-episode effects. A replay returns its original accepted assessment.
- Official Convex rate-limiter: burst 10, refill 30/minute per source; rotation preserves quota, another source has its own capacity. Streamed body cap is 32 KiB with bounded fields. Legacy HMAC and all 4 stage scenarios remain compatible.
- Queued automatic actions recheck source authority. Revocation cancels them but never releases existing money holds or undoes completed actions; explicit company approval remains independently authorized.
- Firm-only evidence includes authenticated source and requested/effective assessment. Company incident external IDs are now opaque local references to prevent sender-chosen reporter-name leakage.
- Setup, contracts and limits: `docs/pegasus-detectors.md` and `CONTRACT.md`. Credential reset behavior and legacy-route limitations are explicit; this is not a DDoS guarantee, real detector integration, external identity-provider action or Visa payment integration.
- **26 new regressions; 130 app/backend + 40 prompt/scorecard tests = 170 passing**, application/backend typechecks, lint and build pass. Original full live rehearsal and **all 11 detector live checks pass on Pegasus DEV**. The latter refused 13/20 burst reports while a second source stayed HTTP 200; automatic owned access changed 200→403 in an observed 595 ms, unrelated access stayed 200, Undo restored access and replay did not repeat it. This includes network/scheduling time, not a production benchmark. All 3 created detector credentials were revoked and verified HTTP 401 in cleanup. Redacted report: `docs/pegasus-detector-rehearsal.json`. No chatbot, held purchasing or held advice code changed.

## Latest incoming handoff checked

Omar's `2c48d93` recommendation handoff asks Pegasus to review #114 with Adrian's OK and Marco to mount it only after merge; its updated shared advice types are already on Omar's branch. The new stop-loss feature is now **PR #119**, explicitly unmounted and requiring Adrian's OK; it is not shipped. → **Role 1:** include #114 and #119 in the explicit release decision; → **Role 4:** continue the assigned adversarial evaluation while those features remain unmounted. Pegasus has not merged them or changed the chatbot.

## Active ownership and acceptance criteria

| Owner | Work now | Done when |
|---|---|---|
| **Pegasus** | Review #119, fix freshness/evidence/rule mismatches, and add read-only per-asset readiness preview. #120 detector controls are complete and awaiting Adrian review. | Recent bank changes appear reactively, strongest relationship wins, advice matches permitted actions, and users can see effective mode and cap reasons without writing business state. |
| **Adrian / Role 1 Claude** | Independently review Pegasus's source controls and own the release decision; first decide whether the existing purchasing branch should be revived for the Visa story. | Written review covers scope forgery, revoke/accept ordering, cross-source ID collision, quota isolation, queued action revocation and legacy/demo compatibility; review on your own DEV, no unmerged code on another person's backend. #113 is CLOSED but its branch `fix/pegasus-episode-depth` is preserved; do not describe it as shipped. |
| **Marco / Role 2 Claude** | Prepare product integration for #114 + #119 on a candidate branch: before-incident stop-loss advice, after-incident response advice, links to the correct existing playbook/payment section, and live completed-state transitions. **No demo/video work now.** | Company and firm flows work at 375 px and with keyboard; role permissions and cache/canned labels are retained; firm has no action buttons; opening advice never executes or adopts a control. Coordinate branch dependencies with Omar and Pegasus; Adrian owns production release. |
| **Omar / Role 3 Claude** | Improve the existing map's evidence-to-outcome explanation using current response-tracker data, without a new map design. | A selected exposed company can show its relationship evidence, authorized step and observed result; unconfirmed/candidate/untested stays visibly distinct, unrelated companies remain unchanged, 14/15-company desktop and 375 px screens checked. Source details remain firm-only. Keep changes in `src/map/` and your own handoff. |
| **Omar / Role 4 Claude** | Build a reproducible adversarial evaluation of existing non-chatbot writing/source-evidence paths: reporter-name leakage, invented callback numbers, unsupported certainty, malformed or conflicting evidence and malicious instructions embedded in source text. | At least 20 labelled fixtures, expected behavior and machine-readable pass/fail results with observed failures fixed; preserve working cache keys and distinguish authored test cases from real-world accuracy. Do not touch or integrate chatbot code, and do not mount held #114 without the team's decision. Coordinate one agent per file if the same Claude handles Roles 3+4. |

**Dependency notice before installation:** Pegasus will add official `@convex-dev/rate-limiter` 0.4.x for detector ingress, independently of the held purchasing feature. Convex guidelines require the official component for per-source quotas. This is a proposed reviewed release, not permission to deploy production. No new AI, UI or external-service package is planned.

## Current release truth
- #116 was approved and merged by Adrian as `f206628`; Role 1 independently verified tests and the full rehearsal. Main already contains the lifecycle fix and #117 playbook polish.
- #113 purchasing is closed/held, with its implementation preserved on `fix/pegasus-episode-depth`; #114 advice remains unmounted/held. Latest user request authorizes building more depth, but neither held feature will be silently merged.
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

