"""Build the Sidecall master artwork (Stopped Ripple direction)."""
import math, os, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen

OUT, FONT = sys.argv[1], sys.argv[2]
LOGO = f"{OUT}/logo"
SOC = f"{OUT}/social"
for d in (LOGO, SOC):
    os.makedirs(d, exist_ok=True)

AMBER = "#F5A524"     # Signal Amber
GRAPHITE = "#15171C"  # Graphite
PAPER = "#F4F2ED"     # Paper
ASH = "#8C919A"       # Ash


def f(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


def lum(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contrast(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


# ---------------- symbol ----------------
def symbol_paths(m=14, gap=18, R=62, rad=30, cx=128.0, size=256.0, ox=0.0, oy=0.0):
    """Four tiles sharing one circular cut. All coords for a 256 canvas, then offset."""
    e = cx - gap / 2
    k = math.sqrt(R * R - (cx - e) ** 2)
    q = cx - k
    out = []
    for sx, sy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
        X = lambda x: ox + (x if sx == 1 else size - x)
        Y = lambda y: oy + (y if sy == 1 else size - y)
        sw = lambda flag: flag if sx * sy == 1 else 1 - flag
        out.append(
            f"M{f(X(m+rad))} {f(Y(m))}H{f(X(e-rad))}"
            f"A{f(rad)} {f(rad)} 0 0 {sw(1)} {f(X(e))} {f(Y(m+rad))}"
            f"V{f(Y(q))}"
            f"A{f(R)} {f(R)} 0 0 {sw(0)} {f(X(q))} {f(Y(e))}"
            f"H{f(X(m+rad))}"
            f"A{f(rad)} {f(rad)} 0 0 {sw(1)} {f(X(m))} {f(Y(e-rad))}"
            f"V{f(Y(m+rad))}"
            f"A{f(rad)} {f(rad)} 0 0 {sw(1)} {f(X(m+rad))} {f(Y(m))}Z")
    return out


def scaled(paths, s, tx, ty):
    return f'<g transform="translate({f(tx)} {f(ty)}) scale({f(s)})">' + "".join(
        f'<path d="{d}"/>' for d in paths) + "</g>"


MASTER = dict(m=14, gap=18, R=62, rad=30)
REVERSED = dict(m=15, gap=21, R=64, rad=30)   # thinned ~3% for light-on-dark (irradiation)
SMALL = dict(m=6, gap=34, R=74, rad=34)       # 16-32 px cut: 2 px gaps and a deeper ring at 16 px


def doc(w, h, inner, title, bg=None):
    if not bg and w != 256:          # lockups: 4 units of breathing room so antialiasing never clips
        inner = f'<g transform="translate(4 0)">{inner}</g>'
        w = w + 8
    b = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {f(w)} {f(h)}" width="{f(w)}" height="{f(h)}">'
            f'<title>{title}</title>{b}{inner}</svg>\n')


def sym_svg(spec, color, title):
    body = "".join(f'<path d="{d}"/>' for d in symbol_paths(**spec))
    return doc(256, 256, f'<g fill="{color}">{body}</g>', title)


# ---------------- wordmark ----------------
font = instancer.instantiateVariableFont(TTFont(FONT), {"wght": 620})
gs = font.getGlyphSet()
cmap = font.getBestCmap()
CAP = font["OS/2"].sCapHeight
# Manrope's default spacing; small optical tweaks between letter pairs (font units)
PAIR = {("S", "i"): -8, ("c", "a"): -6, ("a", "l"): -4, ("l", "l"): 6, ("d", "e"): -4}


def glyph_d(ch, s, x):
    """Path for one glyph; the i's tittle becomes a small rounded tile (the symbol's DNA)."""
    rec = RecordingPen()
    gs[cmap[ord(ch)]].draw(rec)
    contours, cur = [], []
    for op, args in rec.value:
        cur.append((op, args))
        if op in ("closePath", "endPath"):
            contours.append(cur)
            cur = []
    pen = SVGPathPen(None)
    tp = TransformPen(pen, (s, 0, 0, -s, x, 0))
    extra = ""
    if ch == "i":
        # find the tittle: the contour whose lowest point is highest
        def ymin(c):
            ys = [p[1] for op, a in c for p in a]
            return min(ys)
        dot = max(contours, key=ymin)
        bp = BoundsPen(None)
        for op, a in dot:
            getattr(bp, op)(*a)
        x0, y0, x1, y1 = bp.bounds
        contours.remove(dot)
        w = (x1 - x0) * s
        h = (y1 - y0) * s
        side = max(w, h) * 0.96
        cxp, cyp = x + (x0 + x1) / 2 * s, -(y0 + y1) / 2 * s
        r = side * 0.3
        X0, Y0 = cxp - side / 2, cyp - side / 2
        extra = (f"M{f(X0+r)} {f(Y0)}H{f(X0+side-r)}A{f(r)} {f(r)} 0 0 1 {f(X0+side)} {f(Y0+r)}"
                 f"V{f(Y0+side-r)}A{f(r)} {f(r)} 0 0 1 {f(X0+side-r)} {f(Y0+side)}H{f(X0+r)}"
                 f"A{f(r)} {f(r)} 0 0 1 {f(X0)} {f(Y0+side-r)}V{f(Y0+r)}A{f(r)} {f(r)} 0 0 1 {f(X0+r)} {f(Y0)}Z")
    for c in contours:
        for op, a in c:
            getattr(tp, op)(*a)
    return pen.getCommands() + extra


def wordmark(cap_h, text="Sidecall"):
    s = cap_h / CAP
    x, ds, prev = 0.0, [], None
    for ch in text:
        if prev:
            x += PAIR.get((prev, ch), 0) * s
        ds.append(glyph_d(ch, s, x))
        x += gs[cmap[ord(ch)]].width * s
        prev = ch
    # trim right side bearing of the last glyph
    bp = BoundsPen(None)
    gs[cmap[ord(text[-1])]].draw(bp)
    width = x - (gs[cmap[ord(text[-1])]].width - bp.bounds[2]) * s
    bp0 = BoundsPen(None)
    gs[cmap[ord(text[0])]].draw(bp0)
    lsb = bp0.bounds[0] * s
    return ds, width, lsb


def word_g(ds, color, tx, ty):
    return f'<g fill="{color}" transform="translate({f(tx)} {f(ty)})">' + "".join(
        f'<path d="{d}"/>' for d in ds) + "</g>"


CAP_H = 96          # wordmark cap height in a 256-high horizontal lockup
GAP_H = 60          # symbol → wordmark gap (≈ one tile's half-width)
ds, ww, lsb = wordmark(CAP_H)


def horizontal(sym_spec, sym_color, word_color, title, bg=None, pad=0):
    W = 256 + GAP_H + ww - lsb
    inner = scaled(symbol_paths(**sym_spec), 1, pad, pad).replace("<g ", f'<g fill="{sym_color}" ', 1)
    inner += word_g(ds, word_color, pad + 256 + GAP_H - lsb, pad + 128 + CAP_H / 2)
    return doc(W + 2 * pad, 256 + 2 * pad, inner, title, bg)


def stacked(sym_spec, sym_color, word_color, title):
    cap = 76
    d2, w2, l2 = wordmark(cap)
    W = max(w2, 256)
    H = 256 + 64 + cap
    inner = scaled(symbol_paths(**sym_spec), 1, (W - 256) / 2, 0).replace("<g ", f'<g fill="{sym_color}" ', 1)
    inner += word_g(d2, word_color, (W - w2) / 2 - l2, H)
    return doc(W, H, inner, title)


def wordonly(color, title):
    return doc(ww - lsb, CAP_H + 4, word_g(ds, color, -lsb, CAP_H + 2), title)


files = {
    # symbols
    "sidecall-symbol.svg": sym_svg(MASTER, GRAPHITE, "Sidecall symbol"),
    "sidecall-symbol-amber.svg": sym_svg(MASTER, AMBER, "Sidecall symbol"),
    "sidecall-symbol-reversed.svg": sym_svg(REVERSED, AMBER, "Sidecall symbol (for dark backgrounds)"),
    "sidecall-symbol-small.svg": sym_svg(SMALL, GRAPHITE, "Sidecall symbol (16-32 px)"),
    # lockups
    "sidecall-horizontal-light.svg": horizontal(MASTER, GRAPHITE, GRAPHITE, "Sidecall logo"),
    "sidecall-horizontal-dark.svg": horizontal(REVERSED, AMBER, PAPER, "Sidecall logo"),
    "sidecall-stacked-light.svg": stacked(MASTER, GRAPHITE, GRAPHITE, "Sidecall logo"),
    "sidecall-stacked-dark.svg": stacked(REVERSED, AMBER, PAPER, "Sidecall logo"),
    "sidecall-wordmark-light.svg": wordonly(GRAPHITE, "Sidecall wordmark"),
    "sidecall-wordmark-dark.svg": wordonly(PAPER, "Sidecall wordmark"),
}
for n, s in files.items():
    open(f"{LOGO}/{n}", "w").write(s)

# Adaptive favicon: graphite on light tabs, amber on dark tabs
small = "".join(f'<path d="{d}"/>' for d in symbol_paths(**SMALL))
open(f"{LOGO}/sidecall-favicon-adaptive.svg", "w").write(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">'
    f'<style>path{{fill:{GRAPHITE}}}@media (prefers-color-scheme:dark){{path{{fill:{AMBER}}}}}</style>'
    f'{small}</svg>\n')

# ---------------- social: Devpost thumbnail (3:2) + title slide (16:9) ----------------
def lockup_on(w, h, scale, bg, title, tagline=None, tag_size=0):
    lw = (256 + GAP_H + ww - lsb) * scale
    lh = 256 * scale
    tx = (w - lw) / 2
    ty = (h - lh) / 2 - (tag_size * 1.4 if tagline else 0)
    inner = (f'<g transform="translate({f(tx)} {f(ty)}) scale({f(scale)})">'
             + scaled(symbol_paths(**REVERSED), 1, 0, 0).replace("<g ", f'<g fill="{AMBER}" ', 1)
             + word_g(ds, PAPER, 256 + GAP_H - lsb, 128 + CAP_H / 2) + "</g>")
    if tagline:
        # tagline as outlines too, in Ash, centred under the lockup
        t_ds, t_w, t_l = tag_paths(tagline, tag_size)
        inner += word_g(t_ds, ASH, (w - t_w) / 2 - t_l, ty + lh + tag_size * 2.6)
    return doc(w, h, inner, title, bg)


def tag_paths(text, cap_h):
    fnt = instancer.instantiateVariableFont(TTFont(FONT), {"wght": 500})
    g = fnt.getGlyphSet()
    cm = fnt.getBestCmap()
    s = cap_h / fnt["OS/2"].sCapHeight
    x, out = 0.0, []
    for ch in text:
        pen = SVGPathPen(g)
        g[cm[ord(ch)]].draw(TransformPen(pen, (s, 0, 0, -s, x, 0)))
        out.append(pen.getCommands())
        x += g[cm[ord(ch)]].width * s + cap_h * 0.02
    return out, x, 0


open(f"{SOC}/devpost-thumbnail.svg", "w").write(
    lockup_on(1500, 1000, 1.45, GRAPHITE, "Sidecall"))
open(f"{SOC}/title-slide.svg", "w").write(
    lockup_on(1920, 1080, 1.5, GRAPHITE, "Sidecall title slide",
              tagline="Warn the sister companies before the attacker moves sideways.", tag_size=30))
open(f"{SOC}/github-social-preview.svg", "w").write(
    lockup_on(1280, 640, 1.05, GRAPHITE, "Sidecall"))

print("contrast amber/graphite %.1f, paper/graphite %.1f, graphite/paper %.1f, amber/white %.1f, ash/graphite %.1f" % (
    contrast(AMBER, GRAPHITE), contrast(PAPER, GRAPHITE), contrast(GRAPHITE, PAPER),
    contrast(AMBER, "#FFFFFF"), contrast(ASH, GRAPHITE)))
print("wordmark width", round(ww - lsb, 1))
