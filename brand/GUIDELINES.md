# Sidecall: Logo Guidelines

## 1. The logo
- **Idea:** Four sibling tiles share one circular edge. The centre, the company that was hit, is never drawn. One shared exposure reaches every sister company at once, and the source stays anonymous.
- **Versions:** horizontal (primary) · stacked · symbol only · wordmark only.
- **Wordmark:** Manrope SemiBold, converted to outlines. The dot on the "i" is replaced by a small rounded tile that echoes the symbol. Always use the files; never retype the name in a font.

## 2. Which file to use

| Where | File |
|---|---|
| Title slide (projector) | `social/title-slide.png` (1920×1080) |
| Devpost thumbnail | `social/devpost-thumbnail.png` (1500×1000, 3:2) |
| GitHub social preview | `social/github-social-preview.png` (1280×640) |
| README header | `logo/sidecall-horizontal-dark.svg` + `-light.svg` (snippet below) |
| Dashboard favicon + app icons | everything in `web/` (paste `web/head-snippet.html` into `<head>`) |
| Dark backgrounds | `logo/*-dark.svg` (amber symbol, Paper wordmark) |
| Light backgrounds | `logo/*-light.svg` (all Graphite) |
| One-colour | `exports/lockups/*-black.svg`, `*-white.svg` |

The dark versions use a slightly thinned symbol (`sidecall-symbol-reversed.svg`). Light shapes on dark look heavier, and this corrects for that.

**README header** (switches with GitHub's light/dark theme):
```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="brand/logo/sidecall-horizontal-dark.svg">
  <img alt="Sidecall" src="brand/logo/sidecall-horizontal-light.svg" width="320">
</picture>
```

## 3. Clear space
Keep empty space of **one tile's half-width** (about 20 % of the symbol's height) on every side of the logo. The space scales with the logo.

## 4. Minimum size
| Version | Screen |
|---|---|
| Horizontal lockup | 120 px wide |
| Stacked lockup | 64 px wide |
| Symbol (master) | 40 px and up |
| Symbol (small cut, `sidecall-symbol-small.svg`) | 16–39 px (favicons, tabs, avatars) |

The small cut has wider gaps and a bigger centre, so it stays four clear tiles at 16 px. Don't use it above 40 px.

## 5. Colour
| Name | HEX | RGB | CMYK (approx.) | Pantone (closest, verify) |
|---|---|---|---|---|
| Signal Amber | `#F5A524` | 245 165 36 | 0 33 85 4 | 137 C |
| Graphite | `#15171C` | 21 23 28 | 70 60 50 90 (rich black) | Black 6 C |
| Paper | `#F4F2ED` | 244 242 237 | 0 1 3 4 | — |
| Ash (secondary text) | `#8C919A` | 140 145 154 | 9 6 0 40 | Cool Gray 7 C |

**Approved pairs:** amber symbol + Paper wordmark on Graphite (primary) · all-Graphite on Paper or white · all-white on Graphite · all-black on white.

**Contrast:** amber on Graphite 8.8:1 · Paper on Graphite 16:1 · Ash on Graphite 5.7:1 (OK for body text).
**Don't** put amber on white or Paper. At 2:1 it disappears; use Graphite there.

Amber is a calm "heads-up", not an alarm. Keep red out of the brand; save it for status colours inside the product, if anywhere.

## 6. Typography
- Product UI and slides: **Manrope** (600 for headings, 400–500 for text). Free under the SIL Open Font License from Google Fonts.
- Fallback: `system-ui, -apple-system, "Segoe UI", sans-serif`.

## 7. Don'ts
- Don't stretch, squash or rotate the logo.
- Don't add a dot, icon or "alert" mark in the empty centre. The empty centre is the idea.
- Don't add shields, locks, glows, gradients, shadows or outlines.
- Don't recolour it outside the palette (no navy or electric blue, no red).
- Don't rearrange the lockup or change the spacing between symbol and name.
- Don't use the master symbol below 40 px; switch to the small cut.

## 8. Notes
- **Trademark:** not checked. Run a search (USPTO TESS, plus a reverse image search) before public launch.
- **Masters:** `brand/logo/`. Generator: `brand/source/build_kit.py` (run with `python3 build_kit.py brand path/to/Manrope.ttf`; needs fontTools).
