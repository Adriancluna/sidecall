# Spec: Armadin findings, carried one step ahead (+ pitch-integrity and Convex-readiness fixes)

Status: **Approved by Adrian (Oct 24). Omar's parts are live in `handoff/role-3-map.md` via Role 1's handoff; Marco's parts (B4–B6) are not assigned yet.** Owner of this doc: Role 1 (Adrian). Sources: three read-only agent passes on `main` @ 4b68818 (claims audit vs pitch research, Armadin design, Convex judge readiness) + `docs/specs/blast-radius-map-plan.md` + the pitch research (Armadin / Convex / chain sections).
Audience: the Claude instance of each teammate. Ownership per CLAUDE.md: Role 1 Adrian (backend), Role 2 Marco (`src/` except map, `docs/`), Roles 3+4 Omar (`src/map/`, `convex/ai.ts`, `prompts/`, `scripts/dns|scorecard`).

---

## Part A: the feature

### A0. Idea in one paragraph
Armadin (Mandia's autonomous red team) proves how far an attacker gets inside **one** company and, by design and by law (OWASP APTS-SE-003 MUST "third-party infrastructure exclusion unless explicitly authorized"; SE-013 MUST "prevent cross-cloud-account access"), stops at that company's authorized boundary. Sidecall takes the **last validated hop at that edge** (e.g. "Ironclad's shared admin credential, found in a Pinecrest jump-host script") as **input**, answers "who else shares this door?" from Sidecall's own link table, and **outputs** to each sister company a sanitized path labelled **"reachable here · not tested"**, at the urgency its own link already deserves. The PE firm sees the full finding. Nothing touches any sibling's systems. Pitch: *"Every validated attack path ends where the scope letter ends. The shared credential behind it doesn't."*

> **Important: this is our own finding schema, not Armadin's.** Armadin's real output format / API is not available to us (an open question since the project brief). The shape below is modelled on what an autonomous red team typically reports (technique, validated hops, evidence). Call it "an Armadin-style finding (our schema)" in code, UI and docs. Never say "Armadin's format", "Armadin integration" or "we integrate with Armadin". Pitch wording: "Sidecall accepts a validated finding from an autonomous red team like Armadin." If they ever expose one, mapping it into this schema is a small adapter.

### A1. Input: `POST /incident` (backward compatible)
Today's body still works. Optional `finding`:
```ts
{
  externalId?: string,        // required unless finding; default `${source}:${findingId}`
  assetName?: string,         // required unless finding; default finding.terminalAsset.assetName
  reportedByDomain?: string,  // default finding.scope.organizationDomain
  summary?: string,
  finding?: {
    source: "armadin" | "manual",                       // required
    findingId: string,                                  // required, /^[A-Za-z0-9._:-]{1,128}$/
    validatedAt: number | string,                       // required, ms or ISO, ≤ now + 5 min
    scope: { organizationDomain: string, engagementId?: string },   // required; must be a known company
    technique: { id: string, name?: string },           // required; id /^T\d{4}(\.\d{3})?$/
    path: { kind: "foothold"|"credential"|"system"|"vendor_tenant", label: string /*≤120*/, validated: true }[], // 1..12
    terminalAsset: { assetName: string, kind: "credential" | "vendor_tenant" },  // required
    evidence?: { kind: string /*≤40*/, summary: string /*≤500*/ }[],            // ≤10
    confidence?: number                                 // 0..1
  }
}
```
httpAction validation (narrow `unknown` field by field like `optionalString`; 400 with a specific message; body > 32 KB → 400):
1. Any hop with `validated !== true` → 400 "findings carry only validated hops; Sidecall infers the rest".
2. Last hop `kind` must equal `terminalAsset.kind`.
3. If given, `assetName` must equal `terminalAsset.assetName` and `reportedByDomain` must equal `scope.organizationDomain` → else 400 "scope and reporter disagree".
4. Signature as today. **Demo path (DEMO_MODE + `SCENARIOS` match): ignore `body.finding`, use `SCENARIOS[key].finding`** (today `isDemoScenario` only checks externalId + assetName, so an unsigned body could otherwise smuggle path text).
5. `recordIncident` gains failure `unknown_reporter` (404): a finding needs a known reporter to measure "sisters" from.

### A2. Mapping and storage (Role 1)
`terminalAsset.assetName` → `assets.by_name`; `scope.organizationDomain` → `companies.by_domain` → `reportedByCompanyId`; dedupe via existing `by_externalId`.
```ts
incidents.finding?: { source, findingId, engagementId?, validatedAt: number,
  technique: { id, name: string | null },   // name from a built-in ATT&CK table, else sender's (firm-only)
  terminalKind: "credential" | "vendor_tenant",
  path: { kind, label }[],                  // firm-only
  evidence: { kind, summary }[], confidence: number | null }
exposures.path?: { techniqueId, techniqueName: string | null,
  sharedHop: string,                        // built from Sidecall's own asset row, NEVER from finding labels
  linkType: shareType, here: "reachable_not_tested" }
```

### A3. Propagation rules ("one step ahead")
- New pure `scoring.ts:sisterPath(finding, link, asset) → { path, evidence[] }`; `openExposure` spreads it next to `scoreExposure`. **`scoreExposure` is unchanged**: score, urgency, confidence and reasons are exactly today's.
- One label enum everywhere: `validated_at_source` (reporter's hops, firm views only) vs `reachable_not_tested` (everything Sidecall derives for a sister; copy: "reachable (not tested)" / "candidate"). **No code path writes "validated" for a sister** (test greps for it).
- Only fan-out change: if `terminalKind === "credential"`, skip `same_vendor_only` links on that asset (a leaked login isn't the vendor's platform). No-op on today's seed; enforces the CONTRACT rule.
- **A validated finding does NOT raise link confidence.** Confidence answers "does this company really have this link?"; a test inside Pinecrest says nothing about Bayview's MX record. Show "validated at source" as its own signal beside link confidence. (Precision, Not Noise.)

### A4. Sanitization (what each audience sees), Brightline-style example
| Audience | Sees |
|---|---|
| PE firm | Full finding: "Validated attack path at Pinecrest Staffing (Armadin ARM-…, 0.92, validated …): hop → hop → … Technique T1078 Valid Accounts. Evidence: …" |
| Sister, shared credential (Cedar Ridge) | "T1078 Valid Accounts. A validated attack path at another portfolio company ends at <shared asset>. Your company shares a login credential with <vendor>, so this path is reachable at your company (not tested at your company)." |
| Sister, same vendor + flagged payment (Summit) | "… You use your own login, so it reaches you only if an attacker can cross between <vendor> tenants (not tested). Separately: 1 held payment goes to bank details <vendor> changed within 30 days." |
| Sister, DNS candidate (Bayview) | "… Candidate link only: public DNS suggests you use <vendor>. Reachable, not tested, link not confirmed." |
| Vendor letter | "An authorized test validated use of T1078 Valid Accounts against <shared asset> held by a Northpass portfolio company. Please rotate every admin credential issued to Northpass portfolio tenants, confirm tenant isolation, and send 30 days of admin-console access logs." |
Sisters never see: reporter, any hop `label`, evidence summaries, `findingId`, `engagementId`, an unrecognized technique name.

### A5. Read-side additions (CONTRACT)
```ts
[blastRadius] getBlastRadius   -> incident.finding | null (firm-only query);
                                  edges[].path: "validated_at_source" | "reachable_not_tested" | null
[blastRadius] listIncidents    -> rows.findingSource: "armadin" | "manual" | null (null for company users)
[blastRadius] getExposureEvidence -> path: null | { techniqueId, techniqueName, sharedHop, linkType,
                                     source: "validated_at_source", here: "reachable_not_tested" }
exposures.evidence += { kind: "path", detail }, { kind: "technique", detail: "T1078 Valid Accounts" }
internal.alerts.getWritingContext -> technique | null; companyAlerts[].pathSummary: string | null
notifications: firm `incident` text appends "Validated path at <reporter> (Armadin <findingId>)."
```

### A6. Demo scenario `armadinFinding` (Role 1)
Ironclad shared admin account (credential case; no Brightline double-holds). Same exposures as `ironcladCredential`: Cedar Ridge urgent 90, Granite Peak urgent 90, Harborline urgent 80, Pinecrest reporter, Summit + Alder `same_vendor_separate_access`; no holds. Existing three scenarios and `answer_key.json` unchanged.
```json
{ "externalId": "demo-armadin-004", "assetName": "Ironclad shared admin account",
  "reportedByDomain": "pinecreststaffing.example",
  "summary": "Armadin validated a path from a Pinecrest workstation to Ironclad's shared admin account.",
  "finding": { "source": "armadin", "findingId": "ARM-2026-0412", "validatedAt": "2026-10-24T08:12:00Z",
    "scope": { "organizationDomain": "pinecreststaffing.example", "engagementId": "ENG-PINECREST-Q4" },
    "technique": { "id": "T1078", "name": "Valid Accounts" },
    "path": [ { "kind": "foothold", "label": "Exposed RDP on PC-OPS-12", "validated": true },
              { "kind": "system", "label": "pinecrest-jump01", "validated": true },
              { "kind": "credential", "label": "Ironclad shared admin (ironclad-svc) in jump-host script", "validated": true } ],
    "terminalAsset": { "assetName": "Ironclad shared admin account", "kind": "credential" },
    "evidence": [ { "kind": "session", "summary": "Interactive logon as ironclad-svc on pinecrest-jump01 08:09 UTC" } ],
    "confidence": 0.92 } }
```

### A7. Tests (Role 1, convex-test)
1. Old body still 200. 2. 400s: hop `validated:false`, bad technique id, scope ≠ reporter, terminal kind ≠ last hop; 404 unknown reporter. 3. Unsigned demo body with forged `finding` stores the SCENARIOS copy. 4. Replay `findingId` → `duplicate:true`, nothing written. 5. armadin exposures equal `ironcladCredential` (score, urgency, confidence). 6. Credential terminal on an asset with a `same_vendor_only` link → not exposed. 7. Company views (evidence, alerts, incidents, outbox) never contain the reporter, any hop label, or "validated" without "not tested". 8. Edge `path` values right; `getBlastRadius` null for company users.

### A8. APTS alignment (for pitch + Devpost)
| Clause | How Sidecall respects it |
|---|---|
| SE-003 third-party exclusion | No traffic to the vendor or siblings. "No one. Nothing is touched." Output is a warning to people. |
| SE-006 scope before action | Stays Armadin's job; we accept only `validated: true` hops tied to `scope.organizationDomain` = reporter. |
| SE-013 no cross-account access | Inference runs on Sidecall's own link table; sister output is `reachable_not_tested`, never presented as tested. |
| SE-021 overlapping scope (SHOULD) | Our cross-company match on the same asset is that detection; the PE view is the "add to scope" recommendation. |
Wording: "by design and by law they stop at the authorized boundary", never "they cannot". Never "we integrate with Armadin": we accept findings in **our own** schema, modelled on autonomous red-team output; no integration exists and Armadin's real format isn't available to us.

---

## Part B: pitch-integrity fixes (from the claims audit; cheap, do first)
| # | Problem on screen | Fix | Owner |
|---|---|---|---|
| B1 | Map tile prints `· score N` (a "risk score", naive to Armadin) | Delete it; the map plan already replaces it with the deciding reason | Omar (`src/map/BlastRadiusMap.tsx`) |
| B2 | Evidence panel shows bare "Confidence 90%" (reads like measured accuracy) | Words + bar: "High · self-reported link" / "Low · candidate link from public DNS" (map plan §8) | Omar (`src/map/EvidencePanel.tsx`) |
| B3 | Proof table prints refs containing `_fraud` (`bc_brightline_7731_fraud` …) | Rename refs to `*_email_change` in `seed.ts`, `answer_key.json`, `ops.ts:53`; then regenerate `scorecard.json`. Stopgap: display-side replace in `ProofPanel.tsx:143` | Adrian (refs) → Omar (scorecard) / Marco (stopgap) |
| B4 | Nothing on screen marks the hand-off point | Firm header line: "Source: finding at Pinecrest Staffing (in scope). Sister companies were not tested; links come from onboarding and DNS." | Marco (`PortfolioView.tsx`), data from Part A |
| B5 | Spoken demo never gives the "why" | One line at beat 4 (Kronos sentence below) | Marco (`docs/demo-script.md`) |
| B6 | Devpost overclaims | `devpost.md:13` "every sister company is exposed" → "sister companies that share it are exposed"; add "at the pleading stage" to the Bain/PowerSchool line | Marco |
Kronos tie-in sentence (claims audit): *"When Kronos went down in 2021, a hospital cafeteria worker lost 54 hours of pay and was told nothing could be done. Here, Summit's payroll money is held for one phone call instead of going to an account someone changed by email, and nobody has to wait for a vendor's disclosure."* Prepared answer to "holding payroll delays pay": held for one call to the number on file, escalated to the controller inside the 20 h due window; the alternative is $480K to the attacker and payroll not funded at all.

## Part C: Convex-readiness fixes (from the Convex audit; all Role 1 unless noted)
No visible anti-patterns found (no client actions, no polling, no state mirroring, no DB `.filter`, no unbounded `.collect`, schema complete, internal-only internals, batched alert writes).
| # | Fix | Effort |
|---|---|---|
| C1 | Directory queries require sign-in; `listUsers` drops emails for non-PE; `getIncidentTimeline` checks the company is exposed to that incident | 20 min |
| C2 | `links.index("by_companyId")` (join table indexed both ways) | 5 min |
| C3 | `returns` validators on every public query (16/56 today) | 45 min |
| C4 | `previewApImport`: pass `now` as an arg instead of `Date.now()` inside the query (imports.ts:209) | 5 min |
| C5 | Sweeper for notifications stuck in `sending` (dispatch crash) | 20 min |
| C6 | `resetDemo` deletes in batches with a scheduled continuation (today one mutation, up to 4,000 rows × 20 tables) | 30 min |
| C7 | Replace boilerplate `convex/README.md` with an architecture page: transaction diagram, guarantees, limits | 20 min |
| C8 (optional) | `@convex-dev/rate-limiter` on `/incident` and per MCP token; `@convex-dev/workpool` for AI + notify (retries, onComplete) | 45 min / 1–1.5 h |
Demo proof moments for the video: same snapshot (split screen + Logs showing one `recordIncident` then 3 `ai:*` + `notify:dispatch`); atomicity (timeline "hold at +0 ms", matching `at` in Data); idempotency (Replay → incidents count stays 1); race (two tabs, single `acknowledgedBy`); server-enforced controls (refusal row appears live) and, off prod, the 300-company run's mutation duration.

---

## Work split and order
| Owner | Order | Effort |
|---|---|---|
| **Adrian (Role 1)** | Part C (C1–C7) → B3 refs → Part A backend (A1–A7) + CONTRACT | ~1.5 h + ~4–5 h |
| **Omar (Roles 3+4)** | B1, B2 inside the map build (already planned) → Part A UI: edge labels "validated at source" / "reachable here · not tested", EvidencePanel path block, prompt uses `pathSummary` and never "validated" for sisters → regenerate `scorecard.json` after B3 | ~2–3 h on top of the map |
| **Marco (Role 2)** | B4–B6 + demo script/Devpost/pitch lines (APTS, Mandia, "No one. Nothing is touched.") → PE header for Part A | ~1–1.5 h |

## Objections (prepared answers)
- **"Why not scope every portco into one engagement?"** The edge is found when the engagement ends, after the scope letter is signed; most portcos aren't on a shared engagement; testing a sibling needs its own consent. The barrier is legal and organizational, not technical. Sidecall turns the finding into "add this to scope" per sibling.
- **"Show a real cross-company chain validated end to end."** "We can't. The portfolio is simulated, and we never touch a sibling." Real: DNS detection on real domains, deterministic exposure logic, the scorecard.
- **"Who authorized you to touch the sibling?"** "No one. Nothing is touched." We write warnings and hold payments the sibling opted into; a person there releases.
- **"Sibling CISO at 2am: false positive?"** Three separate facts, never blended: vendor-side hop validated by an authorized test; their own link confidence and source; the technique. One check: look for logons by the shared account since `validatedAt`, then rotate. DNS-only stays advisory.
- **"A map of the firm's weakest points?"** Only `pe_partner` sees the graph and hop labels; companies see their own row. Hop text never goes to AI writers or notifications. Residual risk: the PE account needs MFA (not built).
- **"Notification system with a graph on top?"** One consolidated vendor letter instead of N escalations, held money until verified by phone, containment recorded. We don't verify the vendor's remediation; the firm records it.
