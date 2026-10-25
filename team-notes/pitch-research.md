# Pitch research (the problem chain, numbers and sponsor angles)

Adrian's research, pasted Oct 24 ("Pitch Numbers & Sponsor Angles"). This is the condensed working copy Role 1's Claude used for the Armadin spec and the field guide. Source tags: [P] primary or regulator, [S] secondary, [V] vendor self-reported. **How it's used:** the plain-English version is in `field-guide.md` §2 and §11; the hard rules are CLAUDE.md "Background facts" and "Never say". If a number here and the field guide disagree, check the source before quoting.

---


## The chain (pitch spine)
1. PE owns a big slice of US working life: 13.3M direct employees at PE-backed companies (AIC, industry's own count [V]); critics (PESP) say 12M. ~1 in 12 US workers (our arithmetic vs 159.2M BLS payroll; say "by the industry's own count"). ≥27% of US emergency departments staffed by PE-backed groups [V, PESP] (another figure says 40%; cite range).
2. PE pools vendors across portfolios and inherits them by acquisition. Blackstone Equity Healthcare pools benefits across 50+ portfolio companies [S, soft]. Payroll/HR consolidation plausible but NOT quantified: never state a percentage. PowerSchool litigation: PE owner allegedly held veto rights over material vendor contracts [P, S.D. Cal. ruling Mar 18 2026, pleading stage only].
3. One shared vendor falls, everyone dependent falls: Kaseya Jul 2021 ~60 MSPs → 800–1,500 businesses [P]; Miljödata Aug 2025 one Swedish HR/payroll supplier → 200+ municipalities lost HR/payroll, none individually breached (ENISA 2026 lead example); Salesloft Drift Aug 2025 → 700+ orgs in 10 days [P]; CDK Global Jun 2024 ~15,000 dealerships, ~3 weeks [S].
4. Reaches where people are served: CDK $1.02B direct dealer losses, ~56,200 lost new-vehicle sales [S]; Coop Sweden most of ~800 stores closed, Coop had no Kaseya relationship (vendor's vendor); Change Healthcare 74% of hospitals reported direct patient-care impact [P, AHA].
5. Harm lands on one person: Kronos/UKG Dec 2021 (Hellman & Friedman) ~8M employees, ~2,000 client orgs [S]. Larry Kroeck, cafeteria worker at Allegheny General, lost ~54 hours of pay, told nothing could be done because ~2,000 others had the same problem. 250+ nurses short-paid in Missoula; UF Health Jacksonville no overtime/holiday pay 6 weeks; Cleveland ~8,000 city workers paid on estimates. Change Healthcare: 31% of surveyed practices could not make payroll [V, AMA convenience sample]. CDK: Norm Phillips, 71, sent home a week not knowing if paid.
6. Recovery slow, small, nobody warned siblings: UMass Memorial settled Kronos wage claims $1.2M ≈ $245/worker, years later, denying wrongdoing. UKG $6M breach settlement doesn't cover lost wages. Median vendor disclosure to customers 73 days (mean 117) [V, Black Kite 2026].
Closer: every one of these vendors was itself PE/asset-manager owned: Kronos/UKG (Hellman & Friedman ~50%), Kaseya (Insight Partners), CDK (Brookfield), PowerSchool (Bain Capital; Dec 2024 breach, possibly 72M+ people).

## 8 strongest numbers
1. 48% of breaches involve a third party, up ~60% in a year (Verizon DBIR 2026, 22,000+ breaches) [S].
2. Miljödata: one supplier → 200+ municipalities, none breached themselves.
3. Kaseya: ~60 providers → up to 1,500 businesses (~25× multiplier).
4. Snowflake: 165 orgs, 79.7% of accounts used had prior credential exposure, no MFA, some creds unrotated 4 years [P, Mandiant].
5. Breakout 29 min avg (fastest 27 s) [P, CrowdStrike 2026] vs median vendor disclosure 73 days [V]. Present as a gap, never a ratio.
6. 14% of UK businesses check direct suppliers; 7% look beyond [P, UK CSBS 2025].
7. 82% detections malware-free; attacker-to-attacker handoff median 22 s (NOT cross-company pivot; speed argument only).
8. Salesloft Drift 700+ orgs in 10 days.
Runners-up: IBM 2026 supply-chain compromise 258 days to identify/contain, +$227,250 breach cost; Cyentia 98% of orgs had a breached third party in 2 years; 60–90× more fourth parties than third.

## Correction
Do NOT say stolen credentials are the #1 way in: DBIR 2026 exploitation is #1 at 31%, credential abuse 13%; Mandiant exploits 32%, stolen creds 9%. Framing: "the breach comes through someone you trust." Shared credential = how the blast crosses the boundary once in, not necessarily how they got in. Say "shared access".

## Do not use
MyCena "MSP Credential Risk Report 2025" (73%/41%): invented sourcing. "Three weeks or never". "MSPs hide breaches". Any quantified MSP credential reuse claim (no dataset; say "no data exists"). Any IT-services concentration index.

## Armadin angle
OWASP Autonomous Penetration Testing Standard (APTS): APTS-SE-003 MUST "third-party infrastructure exclusion unless explicitly authorized"; APTS-SE-006 MUST "validate scope immediately before every network action"; APTS-SE-013 MUST boundaries "prevent cross-cloud-account access"; APTS-SE-021 SHOULD detect overlapping scope across engagements. Pentesters "can literally get arrested if they go outside of scope"; third-party paths → "recommendations to potentially add something to scope". Word it: "by design and by law they stop at the authorized boundary", NOT "they cannot" (APTS is self-assessed).
Mandia 2021 House Oversight testimony (SolarWinds): "A confidential information sharing solution should ensure a consistent flow of two-way information sharing"; "challenges today prevent entities from sharing cyber threat intelligence"; "Speed is critical"; victims learned from law enforcement or a business partner; asked for liability protections and statutory privilege. CISA 2015 §1503(c) permits private-to-private indicator sharing with antitrust exemption, in force through Dec 11 2026. "The founder testified this needed solving; federal law provides the protection; nobody built the tool."
Their vocabulary: validated attack path, kill chain, exploitable risk, decision-grade proof, machine-speed, blast radius, scoped impact, Safe by Design, controlled execution, "Precision, Not Noise", actionable remediation, compensating controls, "all paths in".
"Validated" is sacred: an unvalidated edge must NEVER be called validated; use reachability / candidate / inferred; every edge needs a confidence and a validated/unvalidated distinction on screen.
Naive words to them: "risk scores", findings counts, "AI-powered" as selling point, vuln-scanner-with-LLM-wrapper. Mandia: "Pen testing to me is always just scanning for what's already known"; vuln counts are "noise".
Pitch: "Armadin proves how far an attacker gets inside one company. We take the last validated hop at that company's edge, find the sister companies under the same owner that share the same IT contractor or credential, and send each one a tailored warning — plus one consolidated fix to the vendor." Follow-up: "Every validated attack path ends where the scope letter ends. The shared credential behind it doesn't."
Killer objection: "Why can't the PE firm scope every portfolio company into one engagement?" Answer: edge discovered at termination after scope letter signed; most portcos not on a common engagement; cross-company sharing needs per-company consent. Never claim the barrier is technical. Other questions: "show a real cross-company chain validated end to end" (we can't; say so); "who authorized you to touch the sibling?" → "No one. Nothing is touched."; "what does the sibling CISO do at 2am and how do they know it's not a false positive?"; "how do you stop this becoming a map of the firm's weakest points?"; "does this change the vendor fix, or is it a notification system with a graph on top?". Framing: missing last mile of their loop (find → prove → fix); "Your red team output is the input to our blue-side routing. We never attack."

## Convex angle
Criteria (Convex's own events): "It's Convex: backend & client code follows Convex best practices"; "It works"; "It's solid: well-tested & documented"; technical excellence, UI/UX polish, creativity. Winners praised for breadth (auth, indexes, vector search, relationships). Require pushed repo + demo video, no localhost; one event required showing the Convex dashboard in the video.
Differentiator: one webhook write fans out incident + tailored alert per company + scheduled LLM job in one serializable transaction; all dashboards see the "same snapshot" (use verbatim); scheduling from mutations atomic; traditional DBs nonreactive.
Patterns: template-first LLM-second; idempotent webhook (index on external id); race-free ack/close (no counter on incident doc); HMAC in httpAction; auth per-company isolation from ctx.auth not args; escalation timer via scheduler, never Date.now() in a query; join table for company↔asset edges indexed both ways. Optional: Workpool, Presence, Triggers, Aggregate, optimistic updates.
Anti-patterns: calling actions from client, setInterval polling, mirroring query results into local state, .filter instead of .withIndex, unbounded .collect(), no schema.ts, public api.* for internal work, one mutation per alert in a loop, business logic in React, hot document.
Limits: 16,000 docs written per mutation, 1 s mutation execution, 1,000 scheduled functions per mutation, actions not auto-retried (template fallback).
Weakest: "four dashboards update" is table stakes → show Convex dashboard function log live, concurrency case, "same snapshot", replay duplicate webhook.
