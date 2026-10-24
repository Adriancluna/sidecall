# UX reference: Vercel dashboard (Geist, dark)

Prototype reference only, on branch `proto/ux-vercel`, never merged to `main`. Measured on Oct 24, 2026 from the live, signed-in dashboard (`vercel.com/<team>`, a project's Overview, Deployments and Settings) at 1280x800 and 375x812, through computed styles. Nothing was copied apart from values: no logo, icons, copy or code.

## 1. Feel in one paragraph

Pure black canvas, near-black cards, greyscale everything; colour appears only for state (blue for "production / selected / link / focus", teal-green dot for Ready, red for error, amber for warning). Every surface is 14px Geist with 500 weight for anything clickable or titled. Depth comes from 1px hairline rings (`box-shadow: 0 0 0 1px`), not borders or shadows. Radius 6px everywhere, full pills for filters and badges. Density is high: 32–36px controls, 12–16px padding, 8–16px gaps. Primary action is an inverted button (light grey on black), never a coloured one.

## 2. Tokens (dark theme, resolved)

### Surfaces and greys
| Token | Value | Use |
|---|---|---|
| `background-200` | `#000000` | page canvas, sidebar, card footers |
| `background-100` | `#0a0a0a` | cards, inputs, secondary buttons |
| `gray-100` | `#1a1a1a` | active segmented tab, disabled button bg |
| `gray-200` | `#1f1f1f` | active sidebar item bg, default border colour |
| `gray-300` | `#292929` | |
| `gray-400` | `#2e2e2e` | card header divider, footer top border, secondary button ring |
| `gray-500` | `#454545` | |
| `gray-600` | `#878787` | |
| `gray-700` | `#8f8f8f` | disabled text |
| `gray-800` | `#7d7d7d` | metric label, filter chip text |
| `gray-900` | `#a1a1a1` | secondary text: labels, inactive nav, meta, timestamps |
| `gray-1000` | `#ededed` | primary text; primary button bg |
| `gray-alpha-100` | `rgba(255,255,255,.06)` | checklist row bg, hover fill |
| `gray-alpha-400` | `rgba(255,255,255,.14)` | card / input / table ring |

### State colours (oklch, dark)
| Role | 100 (bg tint) | 300 (selected bg) | 700 (solid) | 900 (text on dark) |
|---|---|---|---|---|
| blue | `oklch(22.17% .069 259.89)` | `oklch(30.86% .1022 255.21)` | `oklch(57.61% .2321 258.23)` | `oklch(71.7% .1648 250.794)` |
| red | `oklch(22.1% .0657 15.11)` | `oklch(31.47% .1105 20.96)` | `oklch(62.56% .2234 23.03)` | `oklch(69.96% .2136 22.03)` |
| amber | `oklch(22.46% .0538 76.04)` | `oklch(32.34% .0837 63.83)` | `oklch(81.87% .1969 76.46)` | `oklch(77.21% .1991 64.28)` |
| green | `oklch(23.09% .0716 149.68)` | `oklch(29.84% .096 149.25)` | `oklch(64.58% .199 147.27)` | `oklch(73.1% .2158 148.29)` |

Ready dot: `#50e3c2` (legacy `geist-cyan`), 10x10, full radius.

### Type
- Sans: **Geist** (SIL OFL, free; Google Fonts `family=Geist:wght@400;500;600`). Mono: **Geist Mono** for hashes, branches, ids (13px).
- Scale:
  | Role | Size / line | Weight | Tracking |
  |---|---|---|---|
  | Page title (h1) | 24 / 32 | 600 | -0.96px |
  | Section / settings card title | 20 / 26 | 600 | -0.4px |
  | Card header title, nav, section label | 14 / 20 | 500 | -0.28px |
  | Body, row text | 14 / 20 | 400 | 0 |
  | Field label (`dt`) | 14 / 14 | 400, `gray-900` | 0 |
  | Field value | 14 / 16 | 500 | 0 |
  | Badge / pill | 12 / 24 | 500 | 0 |
  | Count badge | 11 / 20 | 500 | +0.2px |
  | Mono | 13 / 20 | 400 | 0 |
- No uppercase labels anywhere. Section labels are 14/500 in `gray-900`.

### Spacing, radius, elevation, motion
- Space scale: 4, 8, 12, 16, 24, 32, 40, 64.
- Control heights: 32 (small), 36 (default), 40 (large).
- Radius: 6px (cards, buttons, inputs, nav items), 4px (inner segmented tab, inline code), full (pills, chips, status dots, avatars).
- Card: `background #0a0a0a; border-radius 6px; box-shadow: 0 0 0 1px rgba(255,255,255,.145), 0 1px 2px rgba(0,0,0,.16), 0 0 0 1px #000`.
- Menus / modals: same ring plus `0 4px 8px -4px #0000000a, 0 16px 24px -8px #0000000f`.
- Focus ring: `0 0 0 2px #0a0a0a, 0 0 0 4px oklch(71.7% .1648 250.794)` (blue-900 halo with a gap).
- Transitions: `color, background-color .15s cubic-bezier(.4,0,.2,1)`.

## 3. Layout

- **Desktop (≥1024):** fixed left sidebar 255px wide, black, items 239x36 inset 8px. Top bar 56px: breadcrumb (team / project with a chevron switcher) on the left, page name centred (14/500), one utility action on the right. Content column starts 24px right of the sidebar, max ~976px at 1280.
- **Sidebar:** grouped lists separated by a 1px `gray-400` rule; item = 16px icon + 14px label, inactive `gray-900`, hover `gray-alpha-100`, active bg `gray-200` + text `gray-1000`. Items with children show a right chevron. A "Find" field with a `F` keycap sits at the top. Settings swaps the list for a sub-nav with a back arrow and "Settings" header.
- **Mobile (375):** sidebar becomes a floating bottom pill (`Find` + menu), top bar 56px with team switcher centred. Cards go full width with 16px gutters; toolbar wraps to search + icon buttons.

## 4. Components

**Buttons** (all 14/500, radius 6, height 32 or 36, padding 0 10–12px)
- Primary: bg `#ededed`, text `#0a0a0a`, no ring. Split variant joins a chevron segment with a 1px `gray-400` divider.
- Secondary: bg `#0a0a0a`, text `#ededed`, ring `0 0 0 1px #2e2e2e`. Hover bg `gray-100`.
- Disabled: bg `#1a1a1a`, text `#8f8f8f`, same ring.
- Icon button: 36x36 square, secondary style.

**Card with header** (Production Deployment)
- Header row 56px, padding `12 12 12 16`, bottom border 1px `#2e2e2e`, title 14/500 left, actions right with 8px gap.
- Body: definition list (`dt` 14 `gray-900`, `dd` 14/500 `gray-1000`), groups 24px apart.
- Footer strip: full-width button row, 48px, top ring `gray-alpha-400`, holds a disclosure ("Deployment Settings") plus a blue pill.

**Settings card**
- Body padding 20, title 20/600, description 14 `gray-900`, then the control.
- Footer: bg `#000`, top border 1px `#2e2e2e`, padding `12 12 12 20`, helper text 14 `gray-900` left, action button right (disabled until dirty).

**List table** (Deployments)
- One container: ring 1px `gray-alpha-400`, radius 6, CSS grid columns set on the container and `subgrid` per row; column gap 16.
- Row 48px, padding `0 12`, bg `#0a0a0a`, divider 1px `gray-alpha-400` between rows, no zebra.
- Cells: title 14/400 truncated; status = 10px dot + 14/500 label + 14 `gray-900` duration; environment = solid blue pill (12/500 white, padding `2 10 2 6`, icon 4px gap); hash and branch in Geist Mono 13; date `gray-900`; avatar 24; kebab menu 36.
- Under the table: helper line 14 `gray-900` with an inline link, secondary button right.

**Filter bar**
- "Add Filter" pill (32 high, full radius, ring) then one pill per filter: key 14/400 `gray-800` + value 14/500.

**Segmented tabs** (Recents / Usage / Alerts)
- Track: bg `#0a0a0a`, ring `gray-alpha-400`, radius 6, padding 4, height 32.
- Tab: equal width, 14/500, inactive `gray-900`; active bg `#1a1a1a`, text `#ededed`, radius 4.

**Checklist rows**: 36 high, radius 6, padding `8 10 8 12`, gap 12, bg `gray-alpha-100`, text `gray-900`; done row: bg blue-300, text blue-900, struck through with a check.

**Metric block**: label 14 `gray-800`, value 14/500 below, sparkline right. Card title can carry a meta ("6h") in `gray-900`.

**Badges**: plan badge 11/500 +0.2 tracking in a 20px pill; count badge "1/5" same; blue info pill 12/500 text blue-900 on blue-100.

**Empty state**: centred 36px icon tile (ring, radius 6), two lines of 14 `gray-900` text, one secondary button.

**Skeletons**: rounded 6px bars in `gray-100` on the card, same geometry as the final row.

## 5. Mapping to Sidecall (proto branch)

Our components already read semantic tokens, so step one is a token swap, step two is component shape.

1. **Token swap** (new `src/styles/vercel-theme.css`, imported after `brand/tokens.css` in `src/index.css`):
   - `graphite-950` → `#000`, `graphite-900` → `#0a0a0a`, `graphite-800` → `#1a1a1a`, `line` → `rgba(255,255,255,.14)`, `paper` → `#ededed`, `ash` → `#a1a1a1`.
   - `amber` (primary) → `#ededed` with dark text; `advisory` → amber-900; `urgent` → red-900; `clear` → green-900; `info` → `#a1a1a1`.
   - `--font-sans` → Geist, `--font-mono` → Geist Mono; `--radius-tile` and `--radius-chip` → 6px.
2. **Shell:** `AppShell` header becomes the 56px top bar (breadcrumb: firm or company / person switcher; page name centred). Tabs (`src/layout/Tabs.tsx`) become the left sidebar on desktop and the bottom pill on mobile.
3. **Firm view:** headline figures become three metric blocks in one card; "Response by company" becomes the list table; Map & evidence keeps the map in a card with header.
4. **Payments & controls log / Held payments:** list table pattern (status dot + label, amount right-aligned, account `••7731` in Geist Mono, red pill for "Bank details changed"). Payment hero becomes a "card with header" with a definition list and the Release / Reject split into primary + secondary buttons.
5. **Bills, Response playbook, Onboard:** settings-card pattern (title, description, control, footer with helper text and the action).
6. **Incident & evidence:** checklist rows for "what to check"; empty states as above.
