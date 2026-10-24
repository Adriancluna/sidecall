# Track depth: Convex, Visa, Hyphenate and Armadin

Author: Pegasus · researched 2026-10-24

The [official Cal Hacks prizes](https://cal-hacks-13-0.devpost.com/) name Hyphenate's **The Hyphenated Enterprise: Autonomous Systems for Finance** and Armadin's **Best Security Hack**. The choices below are our interpretation of fit, not undisclosed sponsor judging rules. No previous winner of these exact Cal Hacks 13 tracks is claimed: the event is still running.

## What comparable winners demonstrate

- [DataHub's official winner announcement](https://datahub.com/blog/meet-the-winners-of-build-with-datahub-the-agent-hackathon/) names BlackBox its grand-prize winner; [BlackBox's repository](https://github.com/alejandro-publius/blackbox-datahub) demonstrates an evidence gate, actual remediation, verification and write-back. The useful lesson for Sidecall is a completed, inspectable response loop. No third-party code was copied or executed.
- [Cronos's official x402 winner announcement](https://blog.cronos.com/p/announcing-the-cronos-x402-hackathon) names AgentFabric first in the main track. Its scoped programmable permissions suggest another applicable lesson: autonomous finance needs explicit authority boundaries and an audit trail. We are not adding crypto or another track.
- [Hyphenate](https://hyphenate.ai/) emphasizes finance workflows and traceable outcomes; [Armadin's platform](https://www.armadin.com/platform) emphasizes adversarial validation. These support our focus on payment evidence and verifiable, scoped response rather than a longer feature list.

## Implemented depth in the review-fix branch

1. Durable report receipts distinguish duplicate IDs from fresh evidence in an active episode, preventing repeated reports from repeating business disruption while allowing genuinely new incidents after containment or inactivity.
2. Notify-only unconfirmed reports reach linked companies without freezing money or changing access; confirmed vendor and credential responses retain their separate scopes.
3. A downloadable case record ties finding provenance, relationship evidence, policy versions, approvals, response checks, payment outcomes and audit events together, with explicit simulation and truncation labels.
4. Owned sandbox steps record access before/after; regression tests exercise actual HTTP denial, unrelated access, authorized Undo, replay and a fresh post-containment episode.

The automation is event-driven; it does not wait for an email response. Human acknowledgment and decisions about held payments remain human actions; the purchasing extension below uses a controller’s explicit prior approval for safe demo purchases. External identity providers are still simulated; the sandbox is a real authorization boundary owned by Sidecall, not an Armadin or Okta integration.

## One demo, two track narratives

**Hyphenate:** import an AP export, investigate a changed-account invoice, show literal evidence and the trusted callback, refuse an unauthorized release, and export the controller's actual decision. A repeated alert must not undo that decision. A field match is not proof that an invoice is authentic.

**Armadin:** ingest a finding, distinguish the source's validated claim from sister-company reachability, run the company's pre-approved response against the owned sandbox, prove targeted access goes 200→403 while unrelated access stays 200, then show Undo and replay resistance. Download the response record.

The next substantive extension, after this PR is reviewed, would be one authorized test-tenant connector with a real provider API and an independent access recheck; it requires that provider's credentials and scoped test tenant. Until then, do not claim production identity containment. Spend remaining demo time proving this loop and rehearsing adversarial cases rather than adding another dashboard or touching the chatbot.

## Actual sponsor briefs received Oct 24 — Convex + Visa focus

Pegasus read all pages of Ashwa's `CalHacks_Hyphenate_Track.pdf` (4 pages) and `Visa_ Reimagining Shopping with AI - Hacker Starter Pack.pdf` (7 pages), and visually checked the rubric pages. The PDFs are reference material, not authorization to contact sponsors, install a stack, or alter accounts. Do not upload the source PDFs as part of this PR.

**Visa, pages 3–7:** Payments includes spending assistance, budget planning and fraud awareness; merchant outcomes count alongside consumer experience. Visa will not provide proprietary APIs. Meaningful generative AI is required: a chatbot alone is insufficient. Weights are innovation 25%, execution 20%, UX 20%, commerce impact 20%, trust/responsibility 15%. Secure procurement is our interpretation of fit, not a guarantee of eligibility or a claim of Visa integration.

**Hyphenate, pages 1–3:** focus on a finance seat, realistic conflicting sources, time/history, approvers and least privilege. Judges ask whether it is realistic, hireable, novel and has a memorable demonstrated outcome; submit a live demo/video, seat definition and honest proof. Accounts payable and changed vendor bank details are explicitly listed examples. The new purchasing approval preserves requester/controller separation while letting pre-approved work complete without another prompt or email response per transaction.

**Convex:** [the supplied documentation](https://docs.convex.dev/home) explains live queries and server functions; [the official rate-limiter component](https://www.convex.dev/components/rate-limiter) supplies transactional, keyed quotas. We use it for independent human/agent allowances, and use Convex's transaction across approval, budget, payment, ledger and receipt. Reactive UI updates show the same committed result. No polling service or extra database is introduced.

### One workflow with four judging views

- **Visa:** a business purchaser sets consent and budget; an assistant can understand shopping/payment documents and use the existing scoped MCP tools; unchanged approved purchases settle automatically in the demo ledger while substitution, tampering, replay and overspend are refused. Show completed legitimate spend alongside blocked bad requests. No proprietary Visa API is needed from the supplied pack, and no Visa integration is claimed.
- **Convex:** race $180 and $210 purchases against $300, show exactly one settlement, its balanced journal entry and a shared reactive budget; flood one agent and show its human owner and another company still work. Component-backed rate limits are substantive infrastructure, not a sponsor logo.
- **Hyphenate:** AP purchasing assistant + payment-controls analyst; controller consent is pinned to source records, approvals expire/revoke, and historical evidence survives replacement. Exceptions require a person. The sandbox is disclosed, and no actual bank transfer occurs.
- **Armadin:** prove the attack cases, actual owned-resource containment and unaffected business. State that the invoice test checks changed approval-bound data; do not claim universal prompt-injection detection or network DDoS protection.

### What the demo must still prove about AI

The rule engine and rate limiter are deterministic controls, **not generative AI**. Existing invoice investigation can use source-grounded live extraction when its server configuration is available; otherwise it says it is using the deterministic fallback. The existing MCP tools allow an actual assistant to read bills, explain an exception and request an approved purchase, with money authority outside the model. Record that real agent/tool sequence for Visa; prewritten alerts or a chatbot screenshot alone do not satisfy the pack's meaningful-AI requirement. Pegasus has not changed the teammates' chatbot or its prompts.

Do not add loyalty, recommendation feeds, extra dashboards or another payment framework to chase breadth. The owned-provider sandbox still matters for Armadin, but a new live identity-provider connector is lower priority than a truthful completed purchasing demo for these briefs.

### Reproducible evidence

`node scripts/purchases/rehearse.mjs` runs only against a configured owned DEV, refuses prod and Adrian's demo backend, does not reset, signs in real demo users, races HTTP requests, injects attacks only into synthetic sample bills and saves `docs/pegasus-purchase-rehearsal.json` without credentials. Run the normal own-DEV rehearsal first for a fresh fixture. It leaves evidence to inspect under **Bills to pay → Automatic purchasing**. The original four-scenario rehearsal remains unchanged.
