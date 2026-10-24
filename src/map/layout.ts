// Pure geometry for the blast radius map, drawn as a tree: the parent firm in the middle, every portfolio company on a
// branch around it, and the breached vendor hanging off the exposed side with a line to each company that shares it.
import type { Id } from "../../convex/_generated/dataModel";
import type { NodeRelation } from "../../convex/blastRadius";
import type { BlastRadius } from "../panels/types";
import {
  exposureState,
  mainEdge,
  moneyBadges,
  pathWord,
  reason,
  statusWord,
  tone,
  VALIDATED_HERE,
  type MapEdge,
  type MapNode,
  type MoneyBadge,
  type MoneyFacts,
  type Tone,
} from "./copy";

const CX = 480;
const CY = 320;
const RING = { rx: 290, ry: 230 }; // where the companies sit around the parent
const PARENT_R = 52;
const SIBLING_R = 28;
const DENSE_AT = 24; // above this many companies, unrelated ones collapse into one line of text
const PAD = 16;

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
  r: number;
  tone: Tone;
  initials: string;
  order: number;
  labelX: number;
  labelDx: number; // text offset from the circle's centre: 0 for labels above or below it
  labelAnchor: "middle" | "end";
  lines: LabelLine[]; // above the circle on the top half of the tree, below it elsewhere
};

export type MapLine = {
  key: string;
  kind: "branch" | "vendor" | "sibling";
  companyId: Id<"companies">;
  assetId?: Id<"assets">;
  d: string; // SVG path
  tone: Tone | "line";
  width: number;
  dash?: string;
  order: number;
};

// A vendor asset drawn as its own node: the breached one, or a sibling asset of the same vendor that wasn't hit.
export type MapAsset = {
  assetId: Id<"assets">;
  x: number;
  y: number;
  r: number;
  lines: string[];
  sub: string[];
  breached: boolean;
};

export type MapLayout = {
  viewBox: string;
  parent: { x: number; y: number; r: number; sub: string };
  vendor: MapAsset;
  siblings: MapAsset[];
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

// Circle radius grows with headcount, within limits (140 people → 18, 2,100 → 34).
const nodeRadius = (headcount: number) =>
  Math.max(18, Math.min(34, 11 + 0.5 * Math.sqrt(headcount)));

const byName = (a: MapNode, b: MapNode) => a.name.localeCompare(b.name);
const of = (nodes: MapNode[], r: NodeRelation) =>
  nodes.filter((n) => n.relation === r).sort(byName);

// Clockwise order round the ring: the exposed block (riskiest first) faces the vendor on the right, companies that
// only use a sibling asset sit opposite it, and everyone else fills in between.
function ringOrder(nodes: MapNode[]) {
  const exposed = of(nodes, "exposed").sort(
    (a, b) => b.score - a.score || byName(a, b),
  );
  const unrelated = of(nodes, "unrelated");
  const half = Math.ceil(unrelated.length / 2);
  return {
    exposedCount: exposed.length,
    order: [
      ...exposed,
      ...unrelated.slice(0, half),
      ...of(nodes, "same_vendor_separate_access"),
      ...unrelated.slice(half),
      ...of(nodes, "linked_not_exposed"),
      ...of(nodes, "reporter"),
    ],
  };
}

// Point on the ring (or a scaled ring) at an angle.
const onRing = (angle: number, grow = 0) => ({
  x: CX + (RING.rx + grow) * Math.cos(angle),
  y: CY + (RING.ry + grow * 0.7) * Math.sin(angle),
});

type Circle = { x: number; y: number; r: number };

// Where a line leaving circle c towards (x, y) crosses just outside its edge.
function rim(c: Circle, x: number, y: number) {
  const d = Math.hypot(x - c.x, y - c.y) || 1;
  return `${round(c.x + ((x - c.x) / d) * (c.r + 4))} ${round(c.y + ((y - c.y) / d) * (c.r + 4))}`;
}

// A straight line between two circles, stopping short of both edges.
const between = (a: Circle, b: Circle) => ({
  d: `M ${rim(a, b.x, b.y)} L ${rim(b, a.x, a.y)}`,
});

// From the vendor, a branch that drops (or rises) to the company's height and comes in level, like a tree limb.
// It keeps the vendor's lines clear of the labels under the companies nearest it.
function limb(vendor: Circle, b: Circle) {
  if (Math.abs(b.y - vendor.y) < 24) return between(vendor, b);
  const cx = vendor.x;
  const cy = b.y;
  return {
    d: `M ${rim(vendor, cx, cy)} Q ${round(cx)} ${round(cy)} ${rim(b, cx, cy)}`,
  };
}

function assetLines(name: string, size: number) {
  const lines = splitName(name, 16);
  const r = Math.min(
    72,
    Math.max(40, Math.max(...lines.map((l) => textWidth(l, size))) / 2 + 12),
  );
  return { lines, r };
}

type Spot = { x: number; y: number; angle: number; side: boolean };

// Where each company sits. Up to 8 (or once there are too many labelled companies to fan out), every company is
// evenly spaced round the ring, the exposed block centred on the vendor. Past 8, the ring grows and splits: the
// labelled companies (exposed, reporter, separate access) fan out on the right at up to an 8-company spacing, and
// the unrelated ones stack in a column down the left with their label beside them, so no two labels collide.
function placeOnRing(
  order: MapNode[],
  exposedCount: number,
): Spot[] & { grow: number } {
  const unrelated = order.filter((n) => n.relation === "unrelated");
  const labelled = order.length - unrelated.length;
  const split = order.length > 8 && labelled <= 16;
  const grow = split ? RING.rx * (Math.sqrt(order.length / 8) - 1) : 0;
  const spots = new Map<MapNode, Spot>();

  if (!split) {
    const step = (2 * Math.PI) / Math.max(order.length, 1);
    const first = (-(Math.max(exposedCount, 1) - 1) / 2) * step; // centres the exposed block on angle 0
    order.forEach((n, i) =>
      spots.set(n, {
        ...onRing(first + i * step, grow),
        angle: first + i * step,
        side: false,
      }),
    );
  } else {
    // Exposed block centred on angle 0; separate access continues clockwise (below), the reporter and any
    // linked-but-not-exposed company counter-clockwise (above), the reporter nearest the block.
    const exposed = order.slice(0, exposedCount);
    const below = order.filter(
      (n) => n.relation === "same_vendor_separate_access",
    );
    const above = [
      ...order.filter((n) => n.relation === "reporter"),
      ...order.filter((n) => n.relation === "linked_not_exposed"),
    ];
    const half = (Math.max(exposed.length, 1) - 1) / 2;
    const reach = half + Math.max(below.length, above.length, 0);
    const step = Math.min(
      Math.PI / 4,
      reach > 0 ? ((100 / 180) * Math.PI) / reach : Math.PI / 4,
    );
    const put = (n: MapNode, angle: number) =>
      spots.set(n, { ...onRing(angle, grow), angle, side: false });
    exposed.forEach((n, j) => put(n, (j - half) * step));
    below.forEach((n, m) => put(n, (half + 1 + m) * step));
    above.forEach((n, m) => put(n, -(half + 1 + m) * step));

    // The column is at least 62px a row (a three-line label), stretching the ring's left side if it must.
    const spanY = Math.max(
      (RING.ry + grow * 0.7) * 0.85,
      (unrelated.length - 1) * 31,
    );
    const ry = Math.max(RING.ry + grow * 0.7, spanY / 0.9);
    const rx = RING.rx + grow;
    unrelated.forEach((n, i) => {
      const dy =
        unrelated.length === 1
          ? 0
          : -spanY + (i * 2 * spanY) / (unrelated.length - 1);
      const x = CX - rx * Math.sqrt(1 - (dy / ry) ** 2);
      spots.set(n, {
        x,
        y: CY + dy,
        angle: Math.atan2(dy / ry, (x - CX) / rx),
        side: true,
      });
    });
  }
  return Object.assign(
    order.map((n) => spots.get(n)!),
    { grow },
  );
}

export function layoutBlast(
  blast: BlastRadius,
  assetNames: Map<Id<"assets">, string>,
  factsFor: (id: Id<"companies">) => MoneyFacts,
): MapLayout {
  const dense = blast.nodes.length > DENSE_AT;
  const shownNodes = dense
    ? blast.nodes.filter((n) => n.relation !== "unrelated")
    : blast.nodes;
  const compact = shownNodes.length > DENSE_AT;
  const { order, exposedCount } = ringOrder(shownNodes);
  const spots = placeOnRing(order, exposedCount);
  const bounds = new Bounds();

  const tiles = order.map((node, i): MapTile => {
    const { x, y, angle, side } = spots[i];
    const r = compact ? 14 : nodeRadius(node.headcount);
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
    // Red-team finding: proven at the reporter (firm view only), only reachable at exposed companies.
    // A line from the vendor to the reporter would cross the exposed block, so it is a word instead.
    const reach =
      node.relation === "reporter" && edge?.path === "validated_at_source"
        ? VALIDATED_HERE
        : compact
          ? null
          : pathWord(edge);
    if (reach) texts.push({ kind: "reason", text: reach, tone: "ash", y: 0 });
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
    // Branches come in from the parent, so labels go outward: above on the top half, below everywhere else.
    // In the split layout unrelated companies sit in a column on the left with their label beside the circle.
    const labelAnchor: MapTile["labelAnchor"] = side ? "end" : "middle";
    const labelDx = side ? -(r + 8) : 0;
    const top = side
      ? y - blockH / 2
      : Math.sin(angle) < -0.25
        ? y - r - 8 - blockH
        : y + r + 8;
    let cursor = top;
    const lines = texts.map((l, k) => {
      const line = { ...l, y: round(cursor + heights[k] / 2) };
      cursor += heights[k];
      return line;
    });
    const left = side ? x + labelDx - blockW : x - blockW / 2;
    bounds.add(left, top, left + blockW, top + blockH);
    bounds.add(x - r, y - r, x + r, y + r);

    return {
      node,
      edge,
      facts,
      x: round(x),
      y: round(y),
      r,
      tone: t,
      initials: initialsOf(node.name),
      order: i,
      labelX: round(x),
      labelDx,
      labelAnchor,
      lines,
    };
  });

  const parent = {
    x: CX,
    y: CY,
    r: PARENT_R,
    sub: `${blast.nodes.length.toLocaleString()} companies`,
  };
  bounds.add(CX - PARENT_R, CY - PARENT_R, CX + PARENT_R, CY + PARENT_R);

  // The breached vendor hangs off the right, facing the exposed block.
  const v = assetLines(blast.asset.name, 15);
  const vendorAt = onRing(0, 230 + spots.grow);
  const vendor: MapAsset = {
    assetId: blast.asset._id,
    x: round(vendorAt.x),
    y: round(vendorAt.y),
    r: v.r,
    lines: v.lines,
    sub: [blast.asset.vendorName, `${blast.asset.kind} · breached`],
    breached: true,
  };
  // Its vendor name and kind sit to its right, where no line runs.
  const subW = Math.max(...vendor.sub.map((t) => textWidth(t, 13)), 90);
  bounds.add(
    vendor.x - vendor.r,
    vendor.y - vendor.r,
    vendor.x + vendor.r + 12 + subW,
    vendor.y + vendor.r,
  );

  const lines: MapLine[] = [];
  for (const t of tiles) {
    const g = between(parent, t);
    const exposed = t.node.relation === "exposed";
    lines.push({
      key: `branch-${t.node.companyId}`,
      kind: "branch",
      companyId: t.node.companyId,
      ...g,
      tone: exposed ? t.tone : "line",
      width: exposed ? 3 : 1.5,
      dash: t.node.relation === "reporter" ? "5 4" : undefined,
      order: t.order,
    });
  }

  // Lines from the vendor to every company that shares it (the reporter's own link stays off the
  // picture; a red-team finding proven there is a word under the reporter instead, see above).
  const tileById = new Map(tiles.map((t) => [t.node.companyId, t]));
  for (const edge of blast.edges) {
    const t = tileById.get(edge.companyId);
    if (!t || !edge.compromised) continue;
    if (t.node.relation === "reporter") continue;
    // Weight says how they share it, dots mark a candidate link; the node's reason line says it in words.
    lines.push({
      key: `vendor-${edge.companyId}`,
      kind: "vendor",
      companyId: edge.companyId,
      assetId: edge.assetId,
      ...limb(vendor, t),
      tone: t.node.exposed ? t.tone : "ash",
      width: edge.shareType === "same_vendor_only" ? 1.75 : 3.5,
      dash: edge.source === "dns_inferred" ? "1.5 6" : undefined,
      order: t.order,
    });
  }

  // Other assets of the same vendor (e.g. "Ironclad IT Services" when its shared admin account was hit), placed
  // outside the companies that use only them, with a faint line to each.
  const siblings: MapAsset[] = [];
  const siblingIds = [
    ...new Set(blast.edges.filter((e) => !e.compromised).map((e) => e.assetId)),
  ];
  for (const assetId of siblingIds) {
    const users = blast.edges
      .filter((e) => e.assetId === assetId)
      .map((e) => tileById.get(e.companyId))
      .filter((t): t is MapTile => t !== undefined && !t.edge?.compromised);
    if (users.length === 0) continue;
    const mean = Math.atan2(
      users.reduce((s, t) => s + (t.y - CY) / RING.ry, 0),
      users.reduce((s, t) => s + (t.x - CX) / RING.rx, 0),
    );
    const at = onRing(mean, 190 + spots.grow);
    const sibling: MapAsset = {
      assetId,
      x: round(at.x),
      y: round(at.y),
      r: SIBLING_R,
      lines: [],
      sub: [
        ...splitName(assetNames.get(assetId) ?? "Same vendor", 20),
        "not affected",
      ],
      breached: false,
    };
    siblings.push(sibling);
    bounds.add(
      sibling.x - 90,
      sibling.y - sibling.r,
      sibling.x + 90,
      sibling.y + sibling.r + 60,
    );
    for (const t of users) {
      lines.push({
        key: `sibling-${assetId}-${t.node.companyId}`,
        kind: "sibling",
        companyId: t.node.companyId,
        assetId,
        ...between(sibling, t),
        tone: "ash",
        width: 1,
        order: t.order,
      });
    }
  }

  let hiddenUnrelated: MapLayout["hiddenUnrelated"] = null;
  if (dense && blast.nodes.length > shownNodes.length) {
    const y = bounds.maxY + 28;
    hiddenUnrelated = {
      count: blast.nodes.length - shownNodes.length,
      x: CX,
      y,
    };
    bounds.add(CX - 160, y - 14, CX + 160, y + 8);
  }

  return {
    viewBox: bounds.viewBox(),
    parent,
    vendor,
    siblings,
    tiles,
    lines,
    hiddenUnrelated,
  };
}

// The viewBox for zooming in on one node: a window around it, wide enough for its label and card.
export function zoomBox(x: number, y: number, full: string) {
  const [, , w, h] = full.split(" ").map(Number);
  const zw = Math.min(w, 600);
  const zh = (zw * h) / w;
  return `${round(x - zw * 0.6)} ${round(y - zh / 2)} ${round(zw)} ${round(zh)}`;
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
