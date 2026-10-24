# Backup video shot list

Owner: Role 2. Record after the feature freeze, following `docs/demo-script.md`. Target 2:30–3:00.

## Setup

- Browser at 1440×900 or 1920×1080, zoom 110–125% so text reads on a projector. Hide bookmarks and extensions.
- Prod: **https://sidecall.vercel.app/?stage**. Press **Reset** right before recording (fresh "2 days before the incident" date).
- Two tabs: A (presenter flow) and B (Kwame Mensah, for the race). Collapse the Presenter panel ("Hide") before each take so it isn't in frame, or crop it out.
- Record with QuickTime / OBS. Voice-over can be recorded separately and laid over.

## Shots

| # | Length | On screen | Voice-over |
|---|---|---|---|
| 1 | 0:00–0:05 | Title card: `brand/social/title-slide.png` | "Sidecall." |
| 2 | 0:05–0:25 | Tab A as **Jamie Chen**. Click **Fire incident**. The $480,000 card appears **Held until verified**, red flag "••2208 → ••7731". Zoom in on the flag. | Beat 1 of the script (the money moment). |
| 3 | 0:25–0:40 | Jamie types a note, clicks **Release payment** → red "Refused: The person who requested a payment cannot also approve it." | Beat 2. |
| 3b | +0:15 (opt.) | Pre-recorded clip: Claude Code connected to Sidecall's MCP endpoint as "Summit AP assistant". Ask "what's held and why?" → `explain_hold`; "request the November payroll bill" → held + flagged. Cut to Jamie's card: audit row "Summit AP assistant (agent)"; Release refused for Jamie, allowed for Rosa. | "An AI assistant gets held like everyone else, and it can't release." Record on your own dev deployment with your own token (never on screen, never committed), then Reset. |
| 4 | 0:40–1:05 | Switch to **Rosa Alvarez**. Type the call note, **Release**. Card turns "Released by Rosa Alvarez · …". Ledger: Cash $5,000,000 → $4,520,000. | Beat 3. |
| 5 | 1:05–1:25 | Switch to **Jordan Ames**. Headline "3 companies exposed · 4,200 people behind them · $650,000 in payments held" (before Rosa releases; $170,000 + "$480,000 released after verification" after). **[after 11pm: Role 3's map lights up]** | Beat 4. Re-record with a held $612K if you prefer: switch to Jordan before Rosa releases. |
| 5b | +0:15 (opt.) | Jordan: **Onboard a company from its AP export** → **Use sample files** → red "pays Brightline at ••7731" warning → **Import** → headline becomes "4 companies exposed · 4,650 people behind them". | Beat 4b. |
| 6 | 1:25–1:50 | Click Cedar Ridge, then Bayview: evidence panel, "candidate" link, held payments for the selected company. | Beat 5. |
| 7 | 1:50–2:10 | Tailored alerts list, vendor letter, click **Copy**. | Beat 6. |
| 8 | 2:10–2:35 | Click **Replay webhook** → "duplicate, nothing new written". Split screen: tab A (Jamie) and tab B (Kwame) click **Acknowledge** together → one shows "Acknowledged by …", the other "Not acknowledged: already acknowledged". Optional cutaway: Convex dashboard. | Beat 7. |
| 9 | 2:35–2:55 | Controls log, **Export CSV**, Proof panel (Real / Simulated, real-domain DNS findings, scorecard: 18 cases, 0 missed, 0 false holds). | Beat 8. |
| 10 | 2:55–3:00 | Back to the held $480K card, or the logo. | "Sidecall fills the AP payment-controls seat across a private equity portfolio." |

## Checklist before export

- No "fraud", "block", "validated", or unmeasured accuracy figures in the voice-over (CLAUDE.md "Never say").
- Say once, plainly, that the portfolio and payments are simulated and the backend, logic and scorecard are real.
- Captions on (judges often watch muted).
