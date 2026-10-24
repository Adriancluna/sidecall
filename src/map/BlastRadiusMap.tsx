// The PE firm's blast radius map: the breached vendor in the middle, every portfolio company around it, lines for how
// each is linked and colour plus words for how exposed it is. Phones (and ?map=grid) get the same facts as a list.
import { useQuery } from "convex/react";
import { useMemo, useState, type FocusEvent, type KeyboardEvent } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { BlastRadius } from "../panels/types";
import { Card } from "../panels/ui";
import {
  ariaLabel,
  caption,
  moneyFacts,
  type MapNode,
  type MoneyFacts,
  type Tone,
} from "./copy";
import {
  FONT,
  layoutBlast,
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
  const [focused, setFocused] = useState<Id<"companies">>();
  const svgRef = useReveal(blast.incident._id, layout);
  const gridOnly =
    new URLSearchParams(window.location.search).get("map") === "grid";

  const pick = (node: MapNode) => {
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
  const note = notedNode
    ? caption(notedNode, blast.asset.name, siblingName(notedNode.companyId))
    : "Select an exposed company to see why it was flagged.";

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
          <figure className="hidden sm:block">
            <figcaption className="sr-only">
              Blast radius of {blast.asset.name}: {count("exposed")} companies
              exposed out of {blast.nodes.length}.
            </figcaption>
            <svg
              ref={svgRef}
              viewBox={layout.viewBox}
              className="h-auto w-full select-none"
            >
              <g aria-hidden="true">
                {layout.lines.map((l) => (
                  <Line
                    key={l.key}
                    line={l}
                    contained={blast.incident.containedAt != null}
                  />
                ))}
              </g>
              <Centre
                layout={layout}
                contained={blast.incident.containedAt != null}
              />
              {layout.siblings.map((s) => (
                <g key={s.assetId} aria-hidden="true" data-reveal="quiet">
                  <circle
                    cx={s.x}
                    cy={s.y}
                    r={s.r}
                    className="fill-panel stroke-ash"
                    strokeWidth={1.5}
                  />
                  {s.lines.map((text, i) => (
                    <text
                      key={text}
                      x={s.x}
                      y={
                        s.above
                          ? s.y - s.r - 10 - (s.lines.length - 1 - i) * 16
                          : s.y + s.r + 17 + i * 16
                      }
                      textAnchor="middle"
                      className="fill-ash stroke-panel"
                      strokeWidth={5}
                      paintOrder="stroke"
                      fontSize={13}
                    >
                      {text}
                    </text>
                  ))}
                </g>
              ))}
              {layout.tiles.map((t) => (
                <Tile
                  key={t.node.companyId}
                  tile={t}
                  selected={selected === t.node.companyId}
                  focused={focused === t.node.companyId}
                  onPick={() => pick(t.node)}
                  onFocus={(e) =>
                    e.currentTarget.matches(":focus-visible") &&
                    setFocused(t.node.companyId)
                  }
                  onBlur={() => setFocused(undefined)}
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

function Centre({
  layout,
  contained,
}: {
  layout: MapLayout;
  contained: boolean;
}) {
  const { x, y, r, lines, subtitle } = layout.centre;
  const top = y - ((lines.length - 1) * 20) / 2;
  return (
    <g aria-hidden="true" data-reveal="centre">
      <circle
        cx={x}
        cy={y}
        r={r}
        className="fill-graphite stroke-paper"
        strokeWidth={2}
      />
      {lines.map((text, i) => (
        <text
          key={text}
          x={x}
          y={top + i * 20}
          dominantBaseline="central"
          textAnchor="middle"
          className="fill-paper"
          fontSize={16}
          fontWeight={600}
        >
          {text}
        </text>
      ))}
      <text
        x={x}
        y={y + r + 18}
        textAnchor="middle"
        className="fill-ash stroke-panel"
        strokeWidth={5}
        paintOrder="stroke"
        fontSize={13}
      >
        {subtitle}
      </text>
      {contained && (
        <text
          x={x}
          y={y + r + 36}
          textAnchor="middle"
          className="fill-ok stroke-panel"
          strokeWidth={5}
          paintOrder="stroke"
          fontSize={13}
          fontWeight={600}
        >
          ✓ Contained
        </text>
      )}
    </g>
  );
}

function Line({ line, contained }: { line: MapLine; contained: boolean }) {
  const { edge } = line;
  const strong = edge.shareType !== "same_vendor_only";
  const dotted = edge.source === "dns_inferred";
  let opacity = edge.compromised ? (line.tone === "paper" ? 0.6 : 1) : 0.4;
  if (contained && edge.compromised) opacity *= 0.5;
  return (
    <g
      data-reveal={edge.compromised ? "line" : "quiet"}
      data-order={line.order}
    >
      <line
        x1={line.x1}
        y1={line.y1}
        x2={line.x2}
        y2={line.y2}
        className={edge.compromised ? STROKE[line.tone] : "stroke-ash"}
        strokeWidth={edge.compromised ? (strong ? 3.5 : 1.75) : 1}
        strokeOpacity={opacity}
        strokeDasharray={dotted ? "1.5 6" : undefined}
        strokeLinecap={dotted ? "round" : undefined}
        pathLength={dotted ? undefined : 1}
        data-draw={dotted ? undefined : ""}
      />
      {line.label && (
        <text
          x={line.label.x}
          y={line.label.y}
          dy={-6}
          transform={`rotate(${line.label.angle} ${line.label.x} ${line.label.y})`}
          textAnchor="middle"
          className="fill-ash stroke-panel"
          strokeWidth={4}
          paintOrder="stroke"
          fontSize={12}
        >
          {line.label.text}
        </text>
      )}
    </g>
  );
}

function Tile({
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
  const { node, side, x, y } = tile;
  const relation = node.relation;
  const half = side / 2;
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onPick();
    }
  };
  const tileStroke =
    relation === "unrelated" ? "stroke-line" : STROKE[tile.tone];
  const strokeWidth =
    relation === "exposed" ? 2.5 : relation === "unrelated" ? 1 : 1.5;
  return (
    <g
      transform={`translate(${x} ${y})`}
      // The amber ring below is the focus style; the global :focus-visible outline would box the labels too.
      style={{ transition: "transform 400ms ease", outline: "none" }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={labelText(tile)}
      onClick={onPick}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      className="group cursor-pointer"
      opacity={relation === "unrelated" ? 0.45 : 1}
      data-reveal={
        relation === "exposed" || relation === "reporter" ? "tile" : "quiet"
      }
      data-order={tile.order}
    >
      <title>{labelText(tile)}</title>
      <rect
        x={-half - 6}
        y={-half - 6}
        width={side + 12}
        height={side + 12}
        rx={side * 0.22 + 4}
        fill="none"
        className="stroke-ash opacity-0 transition-opacity group-hover:opacity-60"
        strokeWidth={1.5}
      />
      {(selected || focused) && (
        <rect
          x={-half - 6}
          y={-half - 6}
          width={side + 12}
          height={side + 12}
          rx={side * 0.22 + 4}
          fill="none"
          className="stroke-amber"
          strokeWidth={2}
          strokeDasharray={selected ? undefined : "4 3"}
        />
      )}
      <rect
        x={-half}
        y={-half}
        width={side}
        height={side}
        rx={side * 0.22}
        className={`fill-panel ${tileStroke}`}
        strokeWidth={strokeWidth}
        strokeDasharray={relation === "reporter" ? "5 4" : undefined}
      />
      <text
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-paper"
        fontSize={Math.max(11, side * 0.3)}
        fontWeight={600}
      >
        {tile.initials}
      </text>
      <g aria-hidden="true">
        {tile.lines.map((l, i) => {
          const ly = l.y - y;
          const lx = tile.labelX - x;
          if (l.kind === "badge") {
            const left =
              tile.anchor === "start"
                ? lx
                : tile.anchor === "end"
                  ? lx - l.width
                  : lx - l.width / 2;
            return (
              <g key={i} data-reveal={l.tone === "amber" ? "badge" : undefined}>
                <rect
                  x={left}
                  y={ly - 10}
                  width={l.width}
                  height={20}
                  rx={10}
                  className={`fill-graphite ${STROKE[l.tone]}`}
                  strokeWidth={1}
                />
                <text
                  x={left + l.width / 2}
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
              x={lx}
              y={ly}
              dominantBaseline="central"
              textAnchor={tile.anchor}
              className={FILL[l.tone]}
              fontSize={FONT[l.kind]}
              fontWeight={l.kind === "name" || l.kind === "status" ? 600 : 500}
            >
              {l.text}
            </text>
          );
        })}
      </g>
    </g>
  );
}

const labelText = (t: MapTile) => ariaLabel(t.node, t.edge, t.facts);

function Legend() {
  const swatch = "inline-flex items-center gap-1.5";
  const lineSwatch = "hidden items-center gap-1.5 sm:inline-flex"; // the phone list has no lines
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ash">
      <li className={lineSwatch}>
        <svg width="24" height="8" aria-hidden="true">
          <line
            x1="1"
            y1="4"
            x2="23"
            y2="4"
            className="stroke-paper"
            strokeWidth={3.5}
          />
        </svg>
        Shared login or admin access
      </li>
      <li className={lineSwatch}>
        <svg width="24" height="8" aria-hidden="true">
          <line
            x1="1"
            y1="4"
            x2="23"
            y2="4"
            className="stroke-paper"
            strokeWidth={1.75}
          />
        </svg>
        Customer of the same vendor
      </li>
      <li className={lineSwatch}>
        <svg width="24" height="8" aria-hidden="true">
          <line
            x1="2"
            y1="4"
            x2="23"
            y2="4"
            className="stroke-paper"
            strokeWidth={1.75}
            strokeDasharray="1.5 6"
            strokeLinecap="round"
          />
        </svg>
        Candidate (public DNS, not confirmed)
      </li>
      <li className={swatch}>
        <TileSwatch className="stroke-danger" width={2.5} />
        Urgent
      </li>
      <li className={swatch}>
        <TileSwatch className="stroke-amber" width={2.5} />
        Advisory
      </li>
      <li className={swatch}>
        <TileSwatch className="stroke-ok" width={1.5} />
        Separate access, not exposed
      </li>
      <li className={swatch}>
        <TileSwatch className="stroke-paper" width={1.5} dashed />
        Reported (firm view only)
      </li>
    </ul>
  );
}

function TileSwatch({
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
      <rect
        x="2"
        y="2"
        width="10"
        height="10"
        rx="2.5"
        className={`fill-panel ${className}`}
        strokeWidth={width}
        strokeDasharray={dashed ? "2.5 2" : undefined}
      />
    </svg>
  );
}
