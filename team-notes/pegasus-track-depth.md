# Track depth: Hyphenate + Armadin

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

The automation is event-driven; it does not wait for an email response. Human acknowledgment and controller payment decisions remain human actions. External identity providers are still simulated; the sandbox is a real authorization boundary owned by Sidecall, not an Armadin or Okta integration.

## One demo, two track narratives

**Hyphenate:** import an AP export, investigate a changed-account invoice, show literal evidence and the trusted callback, refuse an unauthorized release, and export the controller's actual decision. A repeated alert must not undo that decision. A field match is not proof that an invoice is authentic.

**Armadin:** ingest a finding, distinguish the source's validated claim from sister-company reachability, run the company's pre-approved response against the owned sandbox, prove targeted access goes 200→403 while unrelated access stays 200, then show Undo and replay resistance. Download the response record.

The next substantive extension, after this PR is reviewed, would be one authorized test-tenant connector with a real provider API and an independent access recheck; it requires that provider's credentials and scoped test tenant. Until then, do not claim production identity containment. Spend remaining demo time proving this loop and rehearsing adversarial cases rather than adding another dashboard or touching the chatbot.
