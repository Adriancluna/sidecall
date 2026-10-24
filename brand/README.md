# Sidecall brand: read this before building UI

For coding agents and teammates working on the frontend. The full logo rules are in [GUIDELINES.md](GUIDELINES.md); this page is the short version, plus how to use the brand in code.

## The one-line idea
The mark is four sibling tiles sharing one circular cut. The empty centre is the company that was hit, and it is never drawn. The product keeps the same promise: company views never name who was hit.

## Feel
Calm, precise, fast, trustworthy. Sidecall is a **warning system**: not a weapon, not a wall. It doesn't block attacks, so the UI should never suggest protection or defence.

## Use in code

**Tokens:** add one line to `src/index.css` (Tailwind v4), right after `@import "tailwindcss";`:
```css
@import "../brand/tokens.css";
```
Then use `bg-graphite-950`, `bg-graphite-900`, `text-paper`, `text-ash`, `border-line`, `bg-amber`, `text-urgent`, `text-clear`, `rounded-tile`, `font-sans`. Plain JSON values are in [tokens.json](tokens.json).

**Font:** Manrope (SIL Open Font License). Add to `index.html`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
```
Headings 600, body 400, labels 500.

**Favicon and app icons:** copy everything in [web/](web/) into `public/` and paste [web/head-snippet.html](web/head-snippet.html) into `<head>` (it replaces the `convex.svg` icon). Set `<title>Sidecall</title>`.

**Logo in the app header** (dark UI): import the SVG, don't retype the name.
```tsx
import logo from "../brand/logo/sidecall-horizontal-dark.svg";
<img src={logo} alt="Sidecall" className="h-7" />
```
Only the symbol, below 40 px tall: `logo/sidecall-symbol-small.svg` (graphite) or `logo/sidecall-symbol-small-amber.svg` (on dark).

## Which logo file

| Background | File |
|---|---|
| Dark (default for the dashboard) | `logo/sidecall-horizontal-dark.svg`, `logo/sidecall-stacked-dark.svg`, `logo/sidecall-symbol-reversed.svg` |
| Light | `logo/sidecall-horizontal-light.svg`, `logo/sidecall-stacked-light.svg`, `logo/sidecall-symbol.svg` |
| 16–39 px | `logo/sidecall-symbol-small.svg` / `-small-amber.svg` |
| Slides, Devpost, GitHub preview | `social/*.png` |

## Colour rules
- **Dark-first.** App background `graphite-950`, cards `graphite-900`, text `paper`, secondary text `ash`.
- **Amber is the brand colour and the "advisory" colour.** Use it for the logo, primary buttons and advisory alerts. Never put amber text on white or paper (2:1 contrast).
- **Status colours are product-only:** `urgent` (coral red), `advisory` (amber), `clear` (green), `info` (ash, for candidate/inferred links). Never recolour the logo with them.
- No navy or electric blue anywhere. No gradients, glows or neon.

## UI do's and don'ts
- **Do** echo the logo with tiles: companies as rounded tiles (`rounded-tile`) in a grid is on-brand.
- **Do** keep the hit company anonymous visually too: an empty or neutral slot, never a highlighted "patient zero" in company-facing views.
- **Don't** use shield, padlock, keyhole, chain-link, radar, siren/bell, warning-triangle, eye, brain or sparkle icons. Prefer plain icons (circle, dot, check, clock, arrow).
- **Don't** add anything in the logo's empty centre.
- **Don't** use alarm language in the UI ("ATTACK!", "BREACH DETECTED"). Say what's exposed and what to do: "Shared payroll login exposed. Rotate the credential."

## Folder map
- `logo/`: master SVGs (use these)
- `exports/`: black, white and one-colour versions, plus PNGs
- `web/`: favicon + app-icon set
- `social/`: title slide, Devpost thumbnail, GitHub social preview
- `board/`: presentation slides with mockups
- `concepts/`: archive of rejected concepts. Don't use these.
- `source/build_kit.py`: regenerates the artwork
