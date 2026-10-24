// The PE firm's blast radius map, drawn as a tree: the parent firm in the middle, each portfolio company on a branch,
// branches red or amber for the exposed ones, and the breached vendor wired to the companies that share it.
// Click any node to zoom in on it. Phones (and ?map=grid) get the same facts as a list.
import { useQuery } from "convex/react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { BlastRadius } from "../panels/types";
import { Card } from "../panels/ui";
import {
  ariaLabel,
  caption,
  moneyFacts,
  pathWord,
  SHARE_WORDS,
  validatedWord,
  type MapNode,
  type MoneyFacts,
  type Tone,
} from "./copy";
import {
  FONT,
  layoutBlast,
  zoomBox,
  type MapAsset,
  type MapLayout,
  type MapLine,
  type MapTile,
} from "./layout";
import { MapList } from "./MapList";
import { useReveal } from "./useReveal";

type Props = {
  blast: BlastRadius;
  selected?: Id<"companies">;
  onSelect: (id: Id<"companies">) => void;
};

export function BlastRadiusMap(props: Props) {
  const held = useQuery(api.payments.getHeldPayments, {
    incidentId: props.blast.incident._id,
  });
  const assets = useQuery(api.blastRadius.listAssets, {});
  const factsFor = useMemo(() => moneyFacts(held), [held]);
  const assetNames = useMemo(
    () => new Map((assets ?? []).map((a) => [a._id, a.name])),
    [assets],
  );
  return <MapCard {...props} factsFor={factsFor} assetNames={assetNames} />;
}

const STROKE: Record<Tone | "line", string> = {
  danger: "stroke-danger",
  amber: "stroke-amber",
  ok: "stroke-ok",
  paper: "stroke-paper",
  ash: "stroke-ash",
  line: "stroke-line",
};
const FILL: Record<Tone, string> = {
  danger: "fill-danger",
  amber: "fill-amber",
  ok: "fill-ok",
  paper: "fill-paper",
  ash: "fill-ash",
};
const TEXT: Record<Tone, string> = {
  danger: "text-danger",
  amber: "text-amber",
  ok: "text-ok",
  paper: "text-paper",
  ash: "text-ash",
};

// What the map is zoomed in on: a company, or a vendor asset.
type Zoom = { company: Id<"companies"> } | { asset: Id<"assets"> };

// Exported so the map can be rendered from fixtures without Convex.
export function MapCard({
  blast,
  selected,
  onSelect,
  factsFor,
  assetNames,
}: Props & {
  factsFor: (id: Id<"companies">) => MoneyFacts;
  assetNames: Map<Id<"assets">, string>;
}) {
  const layout = useMemo(
    () => layoutBlast(blast, assetNames, factsFor),
    [blast, assetNames, factsFor],
  );
  const [noted, setNoted] = useState<Id<"companies">>();
  const [focused, setFocused] = useState<string>();
  const [zoom, setZoom] = useState<Zoom>();
  const svgRef = useReveal(blast.incident._id, layout);
  const gridOnly =
    new URLSearchParams(window.location.search).get("map") === "grid";
  const contained = blast.incident.containedAt != null;

  const zoomTile =
    zoom && "company" in zoom
      ? layout.tiles.find((t) => t.node.companyId === zoom.company)
      : undefined;
  const zoomAsset =
    zoom && "asset" in zoom
      ? [layout.vendor, ...layout.siblings].find(
          (a) => a.assetId === zoom.asset,
        )
      : undefined;
  const zoomAt = zoomTile ?? zoomAsset;
  const viewBox = zoomAt
    ? zoomBox(zoomAt.x, zoomAt.y, layout.viewBox)
    : layout.viewBox;
  useZoom(svgRef, viewBox);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setZoom(undefined);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  const pick = (node: MapNode) => {
    setZoom({ company: node.companyId });
    if (node.exposed) {
      setNoted(undefined);
      onSelect(node.companyId);
    } else {
      setNoted(node.companyId);
    }
  };
  const notedNode = blast.nodes.find((n) => n.companyId === noted);
  const siblingName = (companyId: Id<"companies">) => {
    const edge = blast.edges.find(
      (e) => e.companyId === companyId && !e.compromised,
    );
    return edge && assetNames.get(edge.assetId);
  };
  const captionFor = (node: MapNode) =>
    caption(node, blast.asset.name, siblingName(node.companyId));
  const note = notedNode
    ? captionFor(notedNode)
    : "Select a company to zoom in. Exposed ones open their evidence on the right.";

  const count = (r: MapNode["relation"]) =>
    blast.nodes.filter((n) => n.relation === r).length;
  const aside = [
    `${count("exposed")} exposed`,
    count("linked_not_exposed") && `${count("linked_not_exposed")} linked`,
    count("same_vendor_separate_access") &&
      `${count("same_vendor_separate_access")} separate access`,
    count("unrelated") && `${count("unrelated")} not linked`,
  ]
    .filter(Boolean)
    .join(" · ");

  const list = (
    <MapList layout={layout} selected={selected} onPick={pick} noted={noted} />
  );
  const focusProps = (key: string) => ({
    focused: focused === key,
    onFocus: (e: FocusEvent<SVGGElement>) =>
      e.currentTarget.matches(":focus-visible") && setFocused(key),
    onBlur: () => setFocused(undefined),
  });

  return (
    <Card
      title={`Blast radius · ${blast.asset.name}`}
      aside={<span className="text-xs text-ash">{aside}</span>}
    >
      {gridOnly ? (
        list
      ) : (
        <>
          <div className="sm:hidden">{list}</div>
          <figure className="relative hidden sm:block">
            <figcaption className="sr-only">
              Portfolio tree for {blast.asset.name}: {count("exposed")}{" "}
              companies exposed out of {blast.nodes.length}.
              {blast.edges.some((e) => e.path === "validated_at_source") &&
                ` Red-team finding ${validatedWord(blast.incident.reportedByName)}; exposed companies are reachable, not tested.`}
            </figcaption>
            <svg ref={svgRef} className="h-auto w-full select-none">
              <g aria-hidden="true">
                {layout.lines.map((l) => (
                  <Line key={l.key} line={l} contained={contained} />
                ))}
              </g>
              <Node
                label="Zoom out to the whole portfolio"
                x={layout.parent.x}
                y={layout.parent.y}
                r={layout.parent.r}
                ring="stroke-paper"
                reveal="centre"
                onPick={() => setZoom(undefined)}
                {...focusProps("parent")}
              >
                <text
                  y={-9}
                  dominantBaseline="central"
                  textAnchor="middle"
                  className="fill-paper"
                  fontSize={15}
                  fontWeight={600}
                >
                  Parent firm
                </text>
                <text
                  y={11}
                  dominantBaseline="central"
                  textAnchor="middle"
                  className="fill-ash"
                  fontSize={12}
                >
                  {layout.parent.sub}
                </text>
              </Node>
              <AssetNode
                asset={layout.vendor}
                contained={contained}
                onPick={() => setZoom({ asset: layout.vendor.assetId })}
                {...focusProps(layout.vendor.assetId)}
              />
              {layout.siblings.map((s) => (
                <AssetNode
                  key={s.assetId}
                  asset={s}
                  contained={false}
                  onPick={() => setZoom({ asset: s.assetId })}
                  {...focusProps(s.assetId)}
                />
              ))}
              {layout.tiles.map((t) => (
                <CompanyNode
                  key={t.node.companyId}
                  tile={t}
                  selected={selected === t.node.companyId}
                  onPick={() => pick(t.node)}
                  {...focusProps(t.node.companyId)}
                />
              ))}
              {layout.hiddenUnrelated && (
                <text
                  x={layout.hiddenUnrelated.x}
                  y={layout.hiddenUnrelated.y}
                  textAnchor="middle"
                  className="fill-ash"
                  fontSize={13}
                >
                  + {layout.hiddenUnrelated.count.toLocaleString()} other
                  companies, not linked
                </text>
              )}
            </svg>
            {zoomTile && (
              <ZoomCard onBack={() => setZoom(undefined)}>
                <CompanyDetail
                  tile={zoomTile}
                  note={
                    zoomTile.node.exposed ? null : captionFor(zoomTile.node)
                  }
                />
              </ZoomCard>
            )}
            {zoomAsset && (
              <ZoomCard onBack={() => setZoom(undefined)}>
                <AssetDetail asset={zoomAsset} blast={blast} layout={layout} />
              </ZoomCard>
            )}
          </figure>
          <Legend />
        </>
      )}
      <p className="mt-3 text-sm text-ash" aria-live="polite">
        {note}
      </p>
    </Card>
  );
}

// Glides the viewBox to its new value (about half a second); instant under reduced motion.
function useZoom(
  svgRef: React.RefObject<SVGSVGElement | null>,
  viewBox: string,
) {
  const current = useRef<number[]>(undefined);
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const to = viewBox.split(" ").map(Number);
    const from = current.current;
    const set = (box: number[]) => {
      current.current = box;
      svg.setAttribute("viewBox", box.map((n) => n.toFixed(1)).join(" "));
    };
    if (
      !from ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      set(to);
      return;
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / 450);
      const ease = 1 - (1 - t) ** 3;
      set(from.map((f, i) => f + (to[i] - f) * ease));
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [svgRef, viewBox]);
}

function Halo({
  x = 0,
  y,
  anchor = "middle",
  children,
  tone = "ash",
  bold,
}: {
  x?: number;
  y: number;
  anchor?: "start" | "middle";
  children: ReactNode;
  tone?: Tone;
  bold?: boolean;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      className={`${FILL[tone]} stroke-panel`}
      strokeWidth={5}
      paintOrder="stroke"
      fontSize={13}
      fontWeight={bold ? 600 : 400}
    >
      {children}
    </text>
  );
}

// A clickable circle: keyboard reachable, with a hover ring and an amber ring for focus or selection.
function Node({
  label,
  x,
  y,
  r,
  ring,
  ringWidth = 2,
  dash,
  opacity = 1,
  selected,
  focused,
  reveal,
  order,
  onPick,
  onFocus,
  onBlur,
  children,
}: {
  label: string;
  x: number;
  y: number;
  r: number;
  ring: string;
  ringWidth?: number;
  dash?: string;
  opacity?: number;
  selected?: boolean;
  focused: boolean;
  reveal: string;
  order?: number;
  onPick: () => void;
  onFocus: (e: FocusEvent<SVGGElement>) => void;
  onBlur: () => void;
  children: ReactNode;
}) {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onPick();
    }
  };
  return (
    <g
      transform={`translate(${x} ${y})`}
      // The amber ring is the focus style; the global :focus-visible outline would box the labels too.
      style={{ transition: "transform 400ms ease", outline: "none" }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={label}
      onClick={onPick}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      className="group cursor-pointer"
      opacity={opacity}
      data-reveal={reveal}
      data-order={order}
    >
      <title>{label}</title>
      <circle
        r={r + 6}
        fill="none"
        className="stroke-ash opacity-0 transition-opacity group-hover:opacity-60"
        strokeWidth={1.5}
      />
      {(selected || focused) && (
        <circle
          r={r + 6}
          fill="none"
          className="stroke-amber"
          strokeWidth={2}
          strokeDasharray={selected ? undefined : "4 3"}
        />
      )}
      <circle
        r={r}
        className={`fill-panel ${ring}`}
        strokeWidth={ringWidth}
        strokeDasharray={dash}
      />
      {children}
    </g>
  );
}

function CompanyNode({
  tile,
  selected,
  focused,
  onPick,
  onFocus,
  onBlur,
}: {
  tile: MapTile;
  selected: boolean;
  focused: boolean;
  onPick: () => void;
  onFocus: (e: FocusEvent<SVGGElement>) => void;
  onBlur: () => void;
}) {
  const { node, r, x, y } = tile;
  const relation = node.relation;
  return (
    <Node
      label={ariaLabel(node, tile.edge, tile.facts)}
      x={x}
      y={y}
      r={r}
      ring={relation === "unrelated" ? "stroke-line" : STROKE[tile.tone]}
      ringWidth={
        relation === "exposed" ? 3 : relation === "unrelated" ? 1 : 1.75
      }
      dash={relation === "reporter" ? "5 4" : undefined}
      opacity={relation === "unrelated" ? 0.45 : 1}
      selected={selected}
      focused={focused}
      reveal={
        relation === "exposed" || relation === "reporter" ? "tile" : "quiet"
      }
      order={tile.order}
      onPick={onPick}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <text
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-paper"
        fontSize={Math.max(11, r * 0.62)}
        fontWeight={600}
      >
        {tile.initials}
      </text>
      <g aria-hidden="true">
        {tile.lines.map((l, i) => {
          const ly = l.y - y;
          if (l.kind === "badge") {
            return (
              <g key={i} data-reveal={l.tone === "amber" ? "badge" : undefined}>
                <rect
                  x={-l.width / 2}
                  y={ly - 10}
                  width={l.width}
                  height={20}
                  rx={10}
                  className={`fill-graphite ${STROKE[l.tone]}`}
                  strokeWidth={1}
                />
                <text
                  y={ly}
                  dominantBaseline="central"
                  textAnchor="middle"
                  className={FILL[l.tone]}
                  fontSize={FONT.badge}
                  fontWeight={600}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {l.text}
                </text>
              </g>
            );
          }
          return (
            <text
              key={i}
              y={ly}
              dominantBaseline="central"
              textAnchor="middle"
              className={`${FILL[l.tone]} stroke-panel`}
              strokeWidth={4}
              paintOrder="stroke"
              fontSize={FONT[l.kind]}
              fontWeight={l.kind === "name" || l.kind === "status" ? 600 : 500}
            >
              {l.text}
            </text>
          );
        })}
      </g>
    </Node>
  );
}

function AssetNode({
  asset,
  contained,
  focused,
  onPick,
  onFocus,
  onBlur,
}: {
  asset: MapAsset;
  contained: boolean;
  focused: boolean;
  onPick: () => void;
  onFocus: (e: FocusEvent<SVGGElement>) => void;
  onBlur: () => void;
}) {
  const { lines, sub, r, breached } = asset;
  const top = -((lines.length - 1) * 19) / 2;
  return (
    <Node
      label={`${[...lines, ...sub].join(" ")}. Select to zoom in.`}
      x={asset.x}
      y={asset.y}
      r={r}
      ring={breached ? "stroke-danger" : "stroke-ash"}
      ringWidth={breached ? 2.5 : 1.5}
      focused={focused}
      reveal={breached ? "centre" : "quiet"}
      onPick={onPick}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      {lines.map((text, i) => (
        <text
          key={text}
          y={top + i * 19}
          dominantBaseline="central"
          textAnchor="middle"
          className="fill-paper"
          fontSize={15}
          fontWeight={600}
        >
          {text}
        </text>
      ))}
      {breached
        ? // Beside the breached vendor, where no line runs.
          [...sub, ...(contained ? ["✓ Contained"] : [])].map(
            (text, i, all) => (
              <Halo
                key={text}
                x={r + 12}
                y={(i - (all.length - 1) / 2) * 16 + 4}
                anchor="start"
                tone={text === "✓ Contained" ? "ok" : "ash"}
                bold={text === "✓ Contained"}
              >
                {text}
              </Halo>
            ),
          )
        : sub.map((text, i) => (
            <Halo key={text} y={r + 18 + i * 16}>
              {text}
            </Halo>
          ))}
    </Node>
  );
}

function Line({ line, contained }: { line: MapLine; contained: boolean }) {
  const dotted = line.dash === "1.5 6";
  let opacity = line.kind === "sibling" ? 0.4 : 1;
  if (contained && line.kind === "vendor") opacity *= 0.5;
  return (
    <g
      data-reveal={line.kind === "sibling" ? "quiet" : "line"}
      data-order={line.order}
    >
      <path
        d={line.d}
        fill="none"
        className={STROKE[line.tone]}
        strokeWidth={line.width}
        strokeOpacity={opacity}
        strokeDasharray={line.dash}
        strokeLinecap={dotted ? "round" : undefined}
        pathLength={line.dash ? undefined : 1}
        data-draw={line.dash ? undefined : ""}
      />
    </g>
  );
}

function ZoomCard({
  onBack,
  children,
}: {
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="absolute top-2 left-2 w-72 max-w-[45%] rounded-lg border border-line bg-graphite/95 p-4 text-sm shadow-lg">
      {children}
      <button
        type="button"
        onClick={onBack}
        className="mt-3 rounded-md border border-line px-2.5 py-1 text-xs text-paper hover:border-ash"
      >
        ← Back to portfolio <span className="text-ash">(Esc)</span>
      </button>
    </div>
  );
}

function CompanyDetail({ tile, note }: { tile: MapTile; note: string | null }) {
  const { node, edge } = tile;
  const status = tile.lines.find((l) => l.kind === "status");
  const why = tile.lines.find((l) => l.kind === "reason");
  const badges = tile.lines.filter((l) => l.kind === "badge");
  const state = tile.lines.find((l) => l.kind === "state");
  return (
    <>
      <p className="font-semibold text-paper">{node.name}</p>
      {status && (
        <p className={`font-semibold ${TEXT[status.tone]}`}>{status.text}</p>
      )}
      {why && <p className="text-ash">{why.text}</p>}
      <dl className="mt-2 space-y-1 text-xs">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-ash">People</dt>
          <dd className="tabular-nums">{node.headcount.toLocaleString()}</dd>
        </div>
        {edge && (
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-ash">Link</dt>
            <dd>
              {SHARE_WORDS[edge.shareType]}
              {edge.compromised ? "" : " (other asset)"} ·{" "}
              {edge.source === "dns_inferred"
                ? "candidate from public DNS"
                : "self-reported"}
            </dd>
          </div>
        )}
        {pathWord(edge) && (
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-ash">Red team</dt>
            <dd>{pathWord(edge)}</dd>
          </div>
        )}
      </dl>
      {badges.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-1.5">
          {badges.map((b) => (
            <span
              key={b.text}
              className={`rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${
                b.tone === "ok"
                  ? "border-ok text-ok"
                  : "border-amber text-amber"
              }`}
            >
              {b.text}
            </span>
          ))}
        </p>
      )}
      {state && <p className="mt-2 text-xs text-ok">{state.text}</p>}
      {note && <p className="mt-2 text-xs text-ash">{note}</p>}
    </>
  );
}

function AssetDetail({
  asset,
  blast,
  layout,
}: {
  asset: MapAsset;
  blast: BlastRadius;
  layout: MapLayout;
}) {
  const names = new Map(
    layout.tiles.map((t) => [t.node.companyId, t.node.name]),
  );
  const users = layout.lines
    .filter((l) => l.kind !== "branch" && l.assetId === asset.assetId)
    .map((l) => names.get(l.companyId));
  return (
    <>
      <p className="font-semibold text-paper">
        {asset.lines.join(" ") || asset.sub.slice(0, -1).join(" ")}
      </p>
      {asset.breached ? (
        <>
          <p className="font-semibold text-danger">Breached vendor asset</p>
          <p className="text-ash">
            {blast.asset.vendorName} · {blast.asset.kind}
          </p>
          <p className="mt-2 text-xs text-ash">
            Shared by {users.length} portfolio{" "}
            {users.length === 1 ? "company" : "companies"}: {users.join(", ")}.
          </p>
          <p className="mt-2 text-xs">
            Verify by calling the number on file:{" "}
            <span className="tabular-nums">{blast.asset.phoneOnFile}</span>
          </p>
        </>
      ) : (
        <>
          <p className="font-semibold text-ok">Same vendor · not affected</p>
          <p className="mt-2 text-xs text-ash">
            Used with separate access by {users.join(", ")}. Not alerted.
          </p>
        </>
      )}
    </>
  );
}

function Legend() {
  const swatch = "inline-flex items-center gap-1.5";
  const lineSwatch = "hidden items-center gap-1.5 sm:inline-flex"; // the phone list has no lines
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ash">
      <li className={lineSwatch}>
        <LineSwatch className="stroke-danger" width={3} />
        Branch to an urgent company
      </li>
      <li className={lineSwatch}>
        <LineSwatch className="stroke-amber" width={3} />
        Branch to an advisory company
      </li>
      <li className={lineSwatch}>
        <LineSwatch className="stroke-paper" width={3.5} />
        Shared login or admin access
      </li>
      <li className={lineSwatch}>
        <LineSwatch className="stroke-paper" width={1.75} />
        Customer of the same vendor
      </li>
      <li className={lineSwatch}>
        <LineSwatch className="stroke-paper" width={1.75} dotted />
        Candidate (public DNS, not confirmed)
      </li>
      <li className={swatch}>
        <DotSwatch className="stroke-ok" width={1.5} />
        Separate access, not exposed
      </li>
      <li className={swatch}>
        <DotSwatch className="stroke-paper" width={1.5} dashed />
        Reported (firm view only)
      </li>
    </ul>
  );
}

function LineSwatch({
  className,
  width,
  dotted,
}: {
  className: string;
  width: number;
  dotted?: boolean;
}) {
  return (
    <svg width="24" height="8" aria-hidden="true">
      <line
        x1="2"
        y1="4"
        x2="23"
        y2="4"
        className={className}
        strokeWidth={width}
        strokeDasharray={dotted ? "1.5 6" : undefined}
        strokeLinecap={dotted ? "round" : undefined}
      />
    </svg>
  );
}

function DotSwatch({
  className,
  width,
  dashed,
}: {
  className: string;
  width: number;
  dashed?: boolean;
}) {
  return (
    <svg width="14" height="14" aria-hidden="true">
      <circle
        cx="7"
        cy="7"
        r="5"
        className={`fill-panel ${className}`}
        strokeWidth={width}
        strokeDasharray={dashed ? "2.5 2" : undefined}
      />
    </svg>
  );
}
