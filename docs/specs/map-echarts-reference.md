# Blast radius map: ECharts reference (for Role 3+4)

Owner from here: **Omar (Role 3+4)**. Marco and Claude built a standalone prototype; Omar decides whether and how it goes into `src/map/`.

Prototype: [`docs/specs/map-prototype/blast-radius-echarts.html`](map-prototype/blast-radius-echarts.html). It's one self-contained HTML file. Open it in a browser, or run `python3 -m http.server` in that folder. It loads ECharts 5.5.0 and Manrope from CDNs.

Style reference: the network graph in [TianyiDataScience/DataViz](https://github.com/TianyiDataScience/DataViz/blob/main/prompts/openclaw-v4-copyable-11/04-network-graph.md) (hand-placed layout, glow, auto-playing highlight layers with a synced explanation).

## What it does

- **Layout is hand-placed, not simulated.** Each scenario has normalized positions (`SCENES.<id>.pos`). Positions are mapped into a safe area that leaves room for the title above and for labels on both sides, so the picture is identical on every load. Two invisible corner anchor nodes keep the ECharts graph's coordinates 1:1 with pixels. Without them, ECharts stretches the node box to fill the series and the circles turn into ovals in a narrow frame.
- **Story steps auto-play** every 3.6 s. Brightline: compromised vendor → genuinely exposed → same vendor, lower risk → the money is held → discipline over noise. Ironclad login: leaked login → genuinely exposed → same vendor, not exposed → discipline over noise. Everything outside the current step stays visible but dimmed. A side list stays in sync with the current step. Clicking a step jumps to it. ← → step, space pauses, and reduced motion turns auto-play off.
- **Encoding:**
  - Node colour = verdict: urgent coral, advisory amber, not exposed (own login) green, not linked grey, reporter paper.
  - Node size = headcount.
  - Line weight = link type: thick for a shared login or admin access, thin for same vendor only. Dashed = DNS candidate.
  - Each company carries a status tag under its name. Summit carries "$480,000 held".
  - Other vendors are small unlabelled squares (hover shows them).
- **Motion comes from ECharts' own effects:** an `effectScatter` ripple on the compromised vendor, and a `lines` series with particles flowing out along the highlighted links. The option is set once per step, not per frame. Re-setting it every frame restarts the effects.

## Gotchas we hit

- Particle paths: the `lines` series' own `curveness` didn't match the graph edges. The prototype samples the same quadratic curve the graph draws (`curve()`) and passes it as `polyline: true`.
- `effect.trailLength > 0` draws onto a motion-blur layer that never clears, which left a ghost arc behind. Keep `trailLength: 0`.
- Effect series get a fresh `id` each render, so ECharts rebuilds them instead of reusing stale paths.
- Labels point away from the centre (`position: right` on the right half, `left` on the left half). Nodes near an edge still need a manual nudge in `pos`.

## Before it goes into the app

- **`echarts` would be a new npm package.** Team rule: tell the team first (package.json conflicts). The alternative is to port the look to the current SVG map. The layout, step list and encoding don't depend on ECharts. Only the ripple and the particles do.
- **Data is hand-copied** from `convex/seed.ts` and what the backend shows, including who is exposed, the reasons, the headline numbers and the $480,000 hold. The real map must read `getBlastRadius`, not these constants.
- **The $612K headline vs one badge.** Only Summit's $480,000 is drawn, so a judge adding it up will not get $612K. Either badge every held payment or let the headline carry the total.
- **Ironclad "not exposed" step:** Alder and Summit glow green but have no line to the leaked login. That's correct, but it may read as a gap. A faint line to Ironclad IT Services would explain it.
- **Never name the reporter outside the PE firm view** (Pinecrest is "Reported it · firm view only" here because this is the firm view).
