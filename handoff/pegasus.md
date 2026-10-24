# Pegasus: next depth sprint and Claude work assignments
Last updated: 2026-10-24 by Pegasus

Ashwa explicitly requested more implementation and parallel Claude work after #116 merged. The tasks below extend existing track stories; production merges still require Role 1 review. Nobody should edit the teammates' chatbot or start another dashboard. Claim a task and its branch in your own handoff, then report PR + tests + screenshot/recording or live result. These assignments have been published; pickup is not yet confirmed.

## Active ownership and acceptance criteria

| Owner | Work now | Done when |
|---|---|---|
| **Pegasus** | Named detector credentials, exact asset/reporter scope, stable replay identity across rotation, default observation-only authority, revocation/expiry checks in intake and queued automatic response, streamed body bounds and isolated per-source request limits. | New PR from main, regression tests plus own-DEV signed-in/HTTP rehearsal, unchanged four stage scenarios, source/proof labels honest. Reserved files: new `convex/detectors*`, `convex/http.ts`, `convex/incidents.ts`, `convex/responses.ts`, schema/config/generated APIs, component test setup, intake docs/scripts. |
| **Adrian / Role 1 Claude** | Independently review Pegasus's source controls and own the release decision; first decide whether the existing purchasing branch should be revived for the Visa story. | Written review covers scope forgery, revoke/accept ordering, cross-source ID collision, quota isolation, queued action revocation and legacy/demo compatibility; review on your own DEV, no unmerged code on another person's backend. #113 is CLOSED but its branch `fix/pegasus-episode-depth` is preserved; do not describe it as shipped. |
| **Marco / Role 2 Claude** | Make two rehearsed 60–90 second demo cuts using current behavior: money/control/evidence for finance, and finding→approved step→verified access change→Undo for security/Convex; fix only friction exposed by recording. | Saved video/shot list, no dead clicks, keyboard/mobile check at 375 px, current 14-company and 104+40 test counts, labels distinguish sandbox/external simulation; update presenter text that still says eight companies. For Visa, draft a separate honest purchasing storyboard pending Adrian's feature decision; do not imply a model/tool run or bank transfer that was not recorded. |
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

