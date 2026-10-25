# Full MVP technical rehearsal

Pegasus · October 24, 2026, approximately 10:28–10:35 PM Pacific · solo session.

**Result: the three core workflows passed on Pegasus DEV. This is not yet a verified public release or a timed three-minute presentation.**

The rehearsal used the current local website at http://127.0.0.1:5180/ and Convex DEV `tangible-koala-842`. The backend was the already-deployed `a06e234` implementation. Small frontend wording corrections and safer rehearsal scripts were added locally afterward; no backend deployment, database reset, production deployment, GitHub push or teammate chatbot change occurred.

## What passed

| Workflow | Live checks | What happened |
| --- | ---: | --- |
| Payment protection | 10 | A synthetic vendor incident held the seeded payments. Wrong destination, missing callback attestation, requester self-approval, another company's controller, and stale bank-record context were refused. Two simultaneous valid releases produced one $480,000 demo-ledger posting. Cedar Ridge's separate $92,000 payment retained its own original destination. |
| AI purchasing | 5, including 8 individual defense challenges | Two real `claude-opus-5-5` runs made four model calls in total. The malicious redirected invoice was declined without a debit. The legitimate $210 invoice was paid once in the demo ledger. Eight concurrent submissions created one saved job. A historical retry made no additional model call or payment. |
| Signed account response | 5 | An authorized synthetic detector report automatically suspended the allowlisted disposable Okta account. The control account remained ACTIVE. Exact report replay retained the same command. After local approval of the synthetic test cleanup, the actual website sent restoration; the signed receipt and independent Okta read-back both reported ACTIVE. The firm evidence query contained both outcomes. |
| Business continuity under repeated reports | 8 | Six observation reports merged into one episode without restarting its review deadline or creating holds/account actions. The observer could not promote itself, and a company clerk could not confirm its report. Concurrent $180/$210 requests against a $300 approval settled $180 and left the $210 request pending. Twenty exact retries returned the original receipt with no further debit. Scope/privacy and credential revocation checks passed. |

**28 top-level live checks passed.** This count includes eight defense challenges inside one AI check; those are not counted twice. The tests demonstrate these specific authored cases, not general fraud-detection accuracy or resistance to arbitrary denial-of-service attacks.

Also passed: 286 application/backend/UI automated tests, 26 receiver tests, lint, frontend production build and Convex TypeScript checks. After the wording changes, lint/build passed again. Existing large-bundle warnings remain.

## What the actual website showed

- The controller view showed the $480,000 payment released, its simulated callback statement, and the refusal audit trail.
- The AP clerk's Bills to pay view showed the new $210 Claude decline and successful run, four total model calls across the two jobs, and the eight defense results. The successful run displayed about 3.4 seconds from submission.
- The IT view showed the fresh pause confirmed about three seconds after the report, then ACTIVE after the restore was sent through the UI.
- The portfolio graph showed three exposed companies, $572,000 released and the separate $40,000 Bayview payment still held. Leaving that unverified payment held is correct; this rehearsal did not authorize its release.
- Selecting Summit in the graph opened Summit's evidence and released payment, not another company's data.
- Notification outbox entries were visibly labelled simulated. No Slack/email notification was actually sent.

Most attack and payment inputs were submitted through authenticated API harnesses; the UI was then inspected against the saved results. The Okta restore was submitted by clicking the actual UI button. This was not a human performance of every form or every website feature.

## Issues found and handled

1. **AI execution was switched off.** The server API key existed, but `PURCHASE_CONSOLE_LIVE` was unset. It is now `true` on Pegasus DEV. Paid calls still require the presenter key, an AP requester, a valid company approval and the existing execution limits. Background `AI_LIVE` and external notification delivery remain off.
2. **Old scripts assumed a clean reset.** We preserved the external command history. A new console runner used the remaining unused Summit test bill; a continuity runner used new Cedar test samples. The receiver harness now accepts an explicit run ID for a new report file, while still requiring earlier target incidents to be contained and both disposable accounts to start ACTIVE. It also signs out its temporary auth sessions.
3. **Historical text looked current.** The graph evidence now says “Reasons recorded at report time” and “Payments held at report time.” Its payment card says “Payment outcomes.” Company alerts label their original saved notice and explain that vendor containment and company review are separate. Live payment state was already correct.
4. **One harness attempt failed before testing continuity.** It attempted sign-in for a seeded person whose demo auth account had not yet been initialized. The revised runner follows the site's existing first-use sign-up fallback. The failed report is retained alongside the successful retry; no payment or incident setup had occurred in the failed attempt.

## Cleanup and current state

- Target Okta account ACTIVE; control Okta account ACTIVE.
- Receiver SQLite ledger: four confirmed commands across the two integrated rehearsals; zero active restriction holds; earlier command history preserved.
- Fresh Okta incident contained; its detector credential revoked.
- Noise observation dismissed; its detector credential revoked.
- Both new purchase approvals revoked; model jobs terminal; temporary harness auth sessions signed out.
- Synthetic payment decisions and receipts remain for inspection. Cedar Ridge has a pending $210 over-budget request; Bayview retains its separate $40,000 incident-held payment. Neither was automatically paid during cleanup.
- The receiver, tunnel and local frontend remain running. There is no recurring Codex automation to create; incident events trigger Convex scheduled jobs.

## Still needed before calling the presentation ready

1. **Prepare fresh, repeatable stage fixtures without erasing history.** Summit's three sample purchase bills are now paid, and the seeded $480,000 stage payment has been released. Clicking the old fixed incident again is intentionally deduplicated. Do not run the old reset-based `npm run rehearse` to try to rewind this; reset is blocked while external-command history exists. New stage fixtures need unique identities and an append-only preparation workflow.
2. **Choose and verify the final demo surface.** This run established local-frontend/DEV behavior. The public Vercel sign-in page was reachable, but its full current frontend/backend parity was not rehearsed or deployed here. Do not substitute the public link and assume these results apply to it.
3. **Stabilize the receiver route for a public demo, or explicitly present from this Mac.** The current receiver and temporary tunnel depend on this Mac staying awake, online and running. Preserve its SQLite database. A changed tunnel hostname requires review of existing command bindings; never silently redirect unresolved commands.
4. **Rehearse the three-minute explanation aloud.** This technical test does not establish that four presenters can deliver it in three minutes. Show one attack, the affected-company graph, the bounded automatic action and its receipt; use the AI/continuity proof as a concise supporting beat or Q&A evidence.

No human intervention was required to complete this rehearsal. For another live account restoration, the company operator must approve the exact restore command locally after checking remediation; that deliberate gate remains part of the MVP.

## Claims the pitch can and cannot make

| Area | Supported statement | Boundary |
| --- | --- | --- |
| Convex | Policies, role checks, transactional payment decisions, durable command records, scheduled delivery and live query updates work together. | A remote Okta operation is not atomic with a database transaction; the receiver explicitly handles uncertain outcomes. |
| Hyphenate / AP workflow | A vendor incident reaches relevant companies; risky payments wait for a separate controller decision with recorded context. | Callback statements in this rehearsal were synthetic. No actual phone call or bank verification occurred. |
| Security / Armadin | Scoped detector credentials, limited response authority, replay protection and a signed receiver produce a real disposable-account suspension. | Synthetic detector input; no Armadin API integration or real detected breach is proved. No downstream app-session termination was tested. |
| Visa / AI purchasing | Real Claude requests a saved, controller-approved purchase; deterministic controls prevent destination substitution and duplicate demo-ledger settlement. | No Visa API, card authorization, real bank transfer or payment-network settlement. Sponsor acceptance of this business-purchasing framing still needs confirmation; Okta does not establish Visa fit. |

## Evidence

- [Payment release checks](evidence/full-rehearsal-payment-release.json)
- [AI checks and actual model usage](evidence/full-rehearsal-ai-purchase.json)
- [Fresh signed Okta cycle](evidence/full-rehearsal-okta.json)
- [Continuity and concurrency checks](evidence/full-rehearsal-continuity-retry.json)
- [Initial continuity setup failure](evidence/full-rehearsal-continuity.json)
- [Controller screenshot](evidence/full-rehearsal-payment-ui.jpg)
- [AI results screenshot](evidence/full-rehearsal-ai-ui.jpg)
- [Paused-account screenshot](evidence/full-rehearsal-okta-paused-ui.jpg)
- [Restored-account screenshot](evidence/full-rehearsal-okta-restored-ui.jpg)
- [Portfolio screenshot](evidence/full-rehearsal-portfolio-ui.jpg)

Report files were checked against the configured private token, signing secret, tenant origin and local presenter key before retaining them as evidence. The keys remain in private configuration, not these reports.
