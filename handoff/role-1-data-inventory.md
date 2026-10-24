# What data Sidecall runs on today (Role 1 → Omar's Claude, Marco, Ashwa)

Written Oct 24 by Adrian's Claude, for the team's move toward real-world data. **Omar's Claude: please check the rows marked (Role 4) against your scripts and add anything missing under "Omar's notes" at the bottom.** Adrian asked us to work on this together.

## The short version
- **All business data is fictional:**
  - **8 companies** (`.example` domains)
  - **20 people**
  - **6 vendors** (555 phone numbers)
  - **21 shared-access links**
  - **6 bank-detail changes**
  - **11 payments plus 1 unpaid bill**
  - **4 incident scenarios**
  - **5 playbook settings**

  It all lives in one file, `convex/seed.ts`, and Reset rebuilds it.
- **Only two things are real:**
  - **The DNS scan** on 10 real public domains (`data/dns_findings.json`, 83 findings). It isn't connected to the demo companies; the Proof tab shows it as evidence that the detector works.
  - **The AI-written text** (`data/ai_cache.json`, written by Claude about the fictional facts).
- **Correction to our own pitch line:** the DNS evidence shown on the demo companies' links comes from **simulated DNS records** (`scripts/dns/seed_records.json` → `data/dns_links.json`), not live lookups. "DNS-based vendor detection on real public domains" is true only of the separate scan. Say it that way.

## Inventory
| Data | What's in it | Where it comes from | Read by | Real? |
|---|---|---|---|---|
| Companies | 8: Alder Freight, Cedar Ridge, Summit Home Health, Bayview Vet, Granite Peak, Harborline, Meridian Dental, Pinecrest Staffing. Name, `.example` domain, sector, headcount (140–2,100), hold switch on/off | `seed.ts` `COMPANIES` | everything | Fictional |
| People | Each company has an AP clerk and a controller; 5 have an IT lead; plus Jordan Ames at the firm. Emails `first.last@domain`, demo password | `seed.ts` `USERS` | sign-in, permissions | Fictional |
| Vendors (assets) | Brightline Payroll (payroll), Ironclad IT Services and Ironclad shared admin account (IT contractor), Keystone SSO (login provider), Relay Mail (email), Ledgerly (AP portal). Each has a 555 phone on file | `seed.ts` `ASSETS` | exposure, holds, alerts | Fictional |
| Links (who shares what) | 21 rows: company × vendor × type (shared login / shared admin access / same vendor only) × source (reported by the company / guessed from DNS) | `seed.ts` `LINKS`; 5 DNS ones get "evidence" text from `data/dns_links.json` | exposure rules, map, playbook | Fictional. DNS text comes from **simulated** records |
| Bank-detail changes | 6: Brightline ••2208 (verified by phone, 150 days ago), ••0193 (email, 95 days), ••4419 (email, 9 days), ••7731 (email, 2 days); Ironclad ••5510 (phone, 210 days), ••9902 (email, 4 days). Dates are relative to Reset | `seed.ts` `BANK_CHANGES` | bank-change flag | Fictional |
| Payments | 11, e.g. Summit → Brightline **$480,000** to ••7731 due in 20h; Cedar $92K; Bayview $28K + $12K; Pinecrest $35K; Harborline → Ironclad $55K + $37K; one already paid | `seed.ts` `PAYMENTS` | holds, ledger, scorecard | Fictional |
| Unpaid bill | Summit → Brightline $38K "November payroll processing" | `seed.ts` `UNPAID_BILLS` | "new requests are held" beat | Fictional |
| Ledger | Opening balances plus entries posted on release | `seed.ts` + `ledger.ts` | Ledger tab | Fictional |
| Incident scenarios | 4: Brightline payroll breach, Ironclad shared login leaked, Ironclad IT contractor breached, red-team finding (finding `ARM-2026-0412`, technique T1078, 3 proven steps at Pinecrest) | `seed.ts` `SCENARIOS` | Fire button, rehearsal | Fictional (the finding format is our own) |
| Playbooks | Cedar: pause = pre-approved, tokens = one click. Granite: pause = one click. Harborline: notify | `seed.ts` `PLAYBOOKS` | pre-approved steps | Fictional |
| Notification channels | `#summit-finance`, `#northpass-portfolio-risk`, with placeholder Slack URLs; nothing is actually sent | `seed.ts` | Slack tab | Fictional (sending code is real) |
| Answer key | 18 planted cases with the right answer | `data/answer_key.json` | only `scripts/scorecard` | Fictional by design |
| Scorecard | Caught / missed / false holds per scenario | `data/scorecard.json` (Role 4) | Proof tab | Real measurement on fictional data |
| Sample AP export | "Lakeside Orthopedics" vendor master (5 vendors) and open bills (6) | `data/samples/*.csv` | Onboard tab, rehearsal | Fictional |
| DNS findings | 83 findings on 10 real domains (calhacks.io, berkeley.edu, uwaterloo.ca, convex.dev, vercel.com, stripe.com, shopify.com, airbnb.com, dropbox.com, zoom.us): Google Workspace, Microsoft 365, Okta, Atlassian… | `scripts/dns/scan.mjs` → `data/dns_findings.json` (Role 4) | Proof tab | **Real** |
| AI text | 23 alerts, hold notices and vendor letters | `prompts/generate.mjs` → `data/ai_cache.json` (Role 4) | alerts | Real model output about fictional facts |

## Moving to real data: options, safest first
**Ground rule:** never show a real, named company as breached, exposed or holding payments. That's defamation risk and misleading. Real data should replace the *ingredients* (vendors, records, events, AP formats) while the portfolio stays a clearly labelled simulation, or comes from public records where nothing is implied about the company.

| Option | What becomes real | Effort | Risk | Notes |
|---|---|---|---|---|
| 1. **Real historical breaches as the scenarios** | The incident: "Salesloft Drift tokens stolen (Aug 2025)", "Snowflake customer credentials (2024)", "Kaseya VSA (2021)" fired at our fictional portfolio | Low (new `SCENARIOS` entries + vendor assets) | Low: public events, fictional victims | Ties straight to the pitch research. The judge sees the real event they know. |
| 2. **Real vendors in the vendor list** | Vendor names and kinds (Okta, Google Workspace, Microsoft 365, ADP, Gusto, Salesloft) | Low | Low–medium: say "simulated incident involving a real vendor's product" for anything not historically true | Pairs with option 1. Phone numbers stay fake; never show a real support number as "the number on file". |
| 3. **Live DNS for real public companies, read-only** | Links as candidates from real records, shown as "uses X (public DNS)" with no breach implied | Medium (the scan exists; needs a "real portfolio" mode) | Medium: showing a real company "exposed" is not OK. Only show vendor use, never exposure. | Good for "how do you know who uses what?" |
| 4. **Real AP-style data from public vendor-payment records** | Bills and payees: several US cities publish vendor payment ledgers (e.g. San Francisco and Chicago open data; **verify exact datasets**) | Medium (CSV mapping into the AP import we already have) | Low: public records; a city is a fine stand-in for a portfolio company | Echoes Miljödata (municipalities). Bank numbers stay masked or fake. |
| 5. **Real incident feeds as the input** | CISA Known Exploited Vulnerabilities feed or HHS breach portal entries (business-associate breaches) turned into incidents | Medium–high | Low | Strong "real input" story. Needs a mapping from advisory to vendor asset. |
| 6. Real people, real bank accounts, real Slack | n/a | n/a | High | Don't. |

**Recommendation:** options 1 + 2 before the deadline (about 1–2 h, backend only, and the demo story gets stronger), then 3 or 4 only if time remains. The numbers judges remember ($480K, 3 companies, 4,200 people) can stay as they are: keep the fictional portfolio and swap in the real event and vendors.

## Questions for Omar's Claude
1. `scripts/dns/vendors.mjs` already has real vendor signatures (Okta, Google Workspace, Microsoft 365, Salesforce…). Could `scan.mjs` take a list of real domains *as a portfolio* and output candidate links in the `dns_links.json` shape, without implying exposure?
2. If scenarios switch to real events (option 1), the AI cache keys change (`externalId` + facts). What's the cost to regenerate: one `prompts/generate.mjs` run against dev?
3. Is anything else in `data/` or `prompts/` fictional that this table misses?

## Omar's notes
_(Omar's Claude: add here.)_
