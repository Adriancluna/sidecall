// Pure geometry for the blast radius map: where the breached vendor, the companies, the lines and the labels go. No React.
import type { Id } from "../../convex/_generated/dataModel";
import type { NodeRelation } from "../../convex/blastRadius";
import type { BlastRadius } from "../panels/types";
import {
  exposureState,
  mainEdge,
  moneyBadges,
  reason,
  SHARE_WORDS,
  statusWord,
  tone,
  type MapEdge,
  type MapNode,
  type MoneyBadge,
  type MoneyFacts,
  type Tone,
} from "./copy";

const CX = 480;
const CY = 300;
const INNER = { rx: 240, ry: 165 }; // reporter, exposed, linked
const OUTER = { rx: 380, ry: 240 }; // separate access, unrelated
const CENTRE_MIN_R = 52;
const SIBLING_R = 26;
const DENSE_AT = 14; // above this many companies, unrelated ones collapse into one line of text
const PAD = 16;

const ORDER: Record<NodeRelation, number> = {
  reporter: 0,
  exposed: 1,
  linked_not_exposed: 2,
  same_vendor_separate_access: 3,
  unrelated: 4,
};
const ON_INNER = new Set<NodeRelation>([
  "reporter",
  "exposed",
  "linked_not_exposed",
]);

export type LabelLine =
  | {
      kind: "name" | "status" | "reason" | "state";
      text: string;
      y: number;
      tone: Tone;
    }
  | {
      kind: "badge";
      text: string;
      y: number;
      tone: MoneyBadge["tone"];
      width: number;
    };

export type MapTile = {
  node: MapNode;
  edge: MapEdge | undefined;
  facts: MoneyFacts;
  x: number;
  y: number;
  side: number;
  tone: Tone;
  initials: string;
  order: number;
  // Labels sit on the outward side of the tile so they never cover a line into the centre.
  anchor: "start" | "middle" | "end";
  labelX: number;
  lines: LabelLine[];
};

export type MapLine = {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  edge: MapEdge;
  tone: Tone | "line";
  order: number;
  label: { x: number; y: number; angle: number; text: string } | null;
};

export type MapSibling = {
  assetId: Id<"assets">;
  x: number;
  y: number;
  r: number;
  lines: string[];
  above: boolean; // label above the circle, keeping it off the vendor subtitle
};

export type MapLayout = {
  viewBox: string;
  centre: {
    x: number;
    y: number;
    r: number;
    lines: string[];
    subtitle: string;
  };
  siblings: MapSibling[];
  tiles: MapTile[];
  lines: MapLine[];
  hiddenUnrelated: { count: number; x: number; y: number } | null;
};

const round = (n: number) => Math.round(n * 10) / 10;

// Rough text width for Manrope; only used to keep labels inside the picture.
const textWidth = (text: string, size: number) => text.length * size * 0.58;

// "Bayview Veterinary Partners" → ["Bayview Veterinary", "Partners"]: split at the space nearest the middle.
export function splitName(name: string, max = 18): string[] {
  if (name.length <= max) return [name];
  const mid = name.length / 2;
  let best = -1;
  for (let i = 0; i < name.length; i++) {
    if (
      name[i] === " " &&
      (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))
    )
      best = i;
  }
  return best < 0 ? [name] : [name.slice(0, best), name.slice(best + 1)];
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

// Tile side grows with headcount, within limits (140 people → 37, 2,100 → 70).
const tileSide = (headcount: number) =>
  Math.max(36, Math.min(72, 26 + 0.95 * Math.sqrt(headcount)));

export function layoutBlast(
  blast: BlastRadius,
  assetNames: Map<Id<"assets">, string>,
  factsFor: (id: Id<"companies">) => MoneyFacts,
): MapLayout {
  const sorted = [...blast.nodes].sort(
    (a, b) =>
      ORDER[a.relation] - ORDER[b.relation] ||
      (a.relation === "exposed" ? b.score - a.score : 0) ||
      a.name.localeCompare(b.name),
  );
  const dense = sorted.length > DENSE_AT;
  const shown = dense
    ? sorted.filter((n) => n.relation !== "unrelated")
    : sorted;
  const compact = shown.length > DENSE_AT;
  const bounds = new Bounds();

  // Each ring spreads its own companies evenly; the outer ring sits half a step round so its tiles fall in the gaps.
  const inner = shown.filter((n) => ON_INNER.has(n.relation));
  const outer = shown.filter((n) => !ON_INNER.has(n.relation));
  const tiles = shown.map((node, i): MapTile => {
    const onInner = ON_INNER.has(node.relation);
    const group = onInner ? inner : outer;
    const k = group.indexOf(node) + (onInner || inner.length === 0 ? 0 : 0.5);
    const angle = -Math.PI / 2 + (k * 2 * Math.PI) / group.length;
    const ring = onInner ? INNER : OUTER;
    const x = round(CX + ring.rx * Math.cos(angle));
    const y = round(CY + ring.ry * Math.sin(angle));
    const side = compact ? 28 : tileSide(node.headcount);
    const edge = mainEdge(blast.edges, node.companyId);
    const facts = factsFor(node.companyId);
    const t = tone(node);

    const texts: LabelLine[] = []; // y is filled in once the block is placed
    for (const text of splitName(node.name))
      texts.push({ kind: "name", text, tone: "paper", y: 0 });
    texts.push({
      kind: "status",
      text: statusWord(node),
      tone: t === "paper" ? "ash" : t,
      y: 0,
    });
    const why = compact ? null : reason(node, edge, facts);
    if (why) texts.push({ kind: "reason", text: why, tone: "ash", y: 0 });
    for (const b of moneyBadges(node, facts)) {
      texts.push({
        kind: "badge",
        text: b.text,
        tone: b.tone,
        width: textWidth(b.text, FONT.badge) + 20,
        y: 0,
      });
    }
    const state = exposureState(node);
    if (state) texts.push({ kind: "state", text: state, tone: "ok", y: 0 });

    const heights = texts.map((l) => LINE_HEIGHT[l.kind]);
    const blockH = heights.reduce((a, b) => a + b, 0);
    const blockW = Math.max(
      ...texts.map((l) =>
        l.kind === "badge" ? l.width : textWidth(l.text, FONT[l.kind]),
      ),
    );
    const sin = Math.sin(angle);
    const gap = side / 2 + 10;
    let anchor: MapTile["anchor"] = "middle";
    let labelX = x;
    let top: number;
    if (sin < -0.35) {
      top = y - gap - blockH;
    } else if (sin > 0.35) {
      top = y + gap;
    } else {
      anchor = Math.cos(angle) >= 0 ? "start" : "end";
      labelX = anchor === "start" ? x + gap : x - gap;
      top = y - blockH / 2;
    }
    let cursor = top;
    const lines = texts.map((l, k) => {
      const line = { ...l, y: round(cursor + heights[k] / 2) };
      cursor += heights[k];
      return line;
    });
    const left =
      anchor === "start"
        ? labelX
        : anchor === "end"
          ? labelX - blockW
          : labelX - blockW / 2;
    bounds.add(left, top, left + blockW, top + blockH);
    bounds.add(x - side / 2, y - side / 2, x + side / 2, y + side / 2);

    return {
      node,
      edge,
      facts,
      x,
      y,
      side,
      tone: t,
      initials: initialsOf(node.name),
      order: i,
      anchor,
      labelX: round(labelX),
      lines,
    };
  });

  // The breached asset sits in the middle, in a circle just big enough for its name.
  const centreLines = splitName(blast.asset.name, 16);
  const centreR = Math.min(
    80,
    Math.max(
      CENTRE_MIN_R,
      Math.max(...centreLines.map((l) => textWidth(l, 16))) / 2 + 14,
    ),
  );

  const tileById = new Map(tiles.map((t) => [t.node.companyId, t]));
  const lines: MapLine[] = [];

  // Other assets of the same vendor (e.g. "Ironclad IT Services" when its shared admin account was hit).
  const siblings: MapSibling[] = [];
  const siblingIds = [
    ...new Set(blast.edges.filter((e) => !e.compromised).map((e) => e.assetId)),
  ];
  // Each sits in a gap between inner tiles, on the side of the companies that only use it.
  const step = (2 * Math.PI) / Math.max(inner.length, 1);
  const gaps = inner.map((_, k) => -Math.PI / 2 + (k + 0.5) * step);
  for (const assetId of siblingIds) {
    const linked = blast.edges
      .filter((e) => e.assetId === assetId)
      .map((e) => tileById.get(e.companyId))
      .filter((t): t is MapTile => t !== undefined);
    if (linked.length === 0) continue;
    const only = linked.filter((t) => !t.edge?.compromised);
    const towards = only.length > 0 ? only : linked;
    const mean = Math.atan2(
      towards.reduce((s, t) => s + (t.y - CY) / INNER.ry, 0),
      towards.reduce((s, t) => s + (t.x - CX) / INNER.rx, 0),
    );
    const turn = (a: number) =>
      Math.abs(Math.atan2(Math.sin(a - mean), Math.cos(a - mean)));
    const gap = gaps.length
      ? gaps.reduce((best, a) => (turn(a) < turn(best) ? a : best))
      : mean;
    gaps.splice(gaps.indexOf(gap), 1);
    const reach = Math.max(0.7, (centreR + SIBLING_R + 24) / INNER.ry);
    const sx = CX + INNER.rx * reach * Math.cos(gap);
    const sy = CY + INNER.ry * reach * Math.sin(gap);
    const label = [
      ...splitName(assetNames.get(assetId) ?? "Same vendor", 20),
      "not affected",
    ];
    const above = sy < CY;
    siblings.push({
      assetId,
      x: round(sx),
      y: round(sy),
      r: SIBLING_R,
      lines: label,
      above,
    });
    const labelH = 8 + label.length * 16;
    bounds.add(
      sx - 90,
      sy - SIBLING_R - (above ? labelH : 0),
      sx + 90,
      sy + SIBLING_R + (above ? 0 : labelH),
    );
  }
  const siblingById = new Map(siblings.map((s) => [s.assetId, s]));

  for (const edge of blast.edges) {
    const tile = tileById.get(edge.companyId);
    if (!tile) continue;
    // A company tied to the breached asset already has its line; a second, faint one would only add noise.
    if (!edge.compromised && tile.edge?.compromised) continue;
    const from = edge.compromised
      ? { x: CX, y: CY, r: centreR }
      : siblingById.get(edge.assetId);
    if (!from) continue;
    const ux = (tile.x - from.x) / Math.hypot(tile.x - from.x, tile.y - from.y);
    const uy = (tile.y - from.y) / Math.hypot(tile.x - from.x, tile.y - from.y);
    // Stop at the tile's square edge, not its centre.
    const toEdge = tile.side / 2 / Math.max(Math.abs(ux), Math.abs(uy));
    const x1 = from.x + ux * (from.r + 4);
    const y1 = from.y + uy * (from.r + 4);
    const x2 = tile.x - ux * (toEdge + 4);
    const y2 = tile.y - uy * (toEdge + 4);
    let label: MapLine["label"] = null;
    const length = Math.hypot(x2 - x1, y2 - y1);
    const text =
      edge.source === "dns_inferred"
        ? "candidate · DNS"
        : SHARE_WORDS[edge.shareType].toLowerCase();
    // Only label a line long enough to hold its words; the tile's reason line says it anyway.
    if (edge.compromised && !compact && textWidth(text, 12) + 24 < length) {
      let angle = (Math.atan2(uy, ux) * 180) / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;
      label = {
        x: round(x1 + (x2 - x1) * 0.5),
        y: round(y1 + (y2 - y1) * 0.5),
        angle: round(angle),
        text,
      };
    }
    lines.push({
      key: `${edge.companyId}-${edge.assetId}`,
      x1: round(x1),
      y1: round(y1),
      x2: round(x2),
      y2: round(y2),
      edge,
      tone: edge.compromised ? tile.tone : "line",
      order: tile.order,
      label,
    });
  }

  const subtitle = `${blast.asset.vendorName} · ${blast.asset.kind}`;
  bounds.add(CX - 140, CY - centreR, CX + 140, CY + centreR + 44);

  let hiddenUnrelated: MapLayout["hiddenUnrelated"] = null;
  if (dense && sorted.length > shown.length) {
    const y = bounds.maxY + 28;
    hiddenUnrelated = { count: sorted.length - shown.length, x: CX, y };
    bounds.add(CX - 160, y - 14, CX + 160, y + 8);
  }

  return {
    viewBox: bounds.viewBox(),
    centre: { x: CX, y: CY, r: centreR, lines: centreLines, subtitle },
    siblings,
    tiles,
    lines,
    hiddenUnrelated,
  };
}

export const FONT: Record<LabelLine["kind"], number> = {
  name: 16,
  status: 14,
  reason: 13,
  state: 13,
  badge: 14,
};
const LINE_HEIGHT: Record<LabelLine["kind"], number> = {
  name: 19,
  status: 18,
  reason: 17,
  state: 18,
  badge: 28,
};

class Bounds {
  minX = Infinity;
  minY = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;
  add(x0: number, y0: number, x1: number, y1: number) {
    this.minX = Math.min(this.minX, x0);
    this.minY = Math.min(this.minY, y0);
    this.maxX = Math.max(this.maxX, x1);
    this.maxY = Math.max(this.maxY, y1);
  }
  viewBox() {
    const x = Math.floor(this.minX - PAD);
    const y = Math.floor(this.minY - PAD);
    return `${x} ${y} ${Math.ceil(this.maxX + PAD - x)} ${Math.ceil(this.maxY + PAD - y)}`;
  }
}
