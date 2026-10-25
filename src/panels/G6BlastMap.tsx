// EXPERIMENT (branch proto/g6-map, open with ?map=g6): the blast radius as an expandable radial
// tree drawn by AntV G6. Click a bubble to open or fold its children; click a company to load its
// evidence on the right. Remove this file, the ?map=g6 switch in PortfolioView and @antv/g6 to undo.
import { Graph, NodeEvent, treeToGraphData, type IPointerEvent, type TreeData } from "@antv/g6";
import { useEffect, useRef } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { money } from "./format";
import type { BlastRadius } from "./types";

// Canvas needs concrete colours: the theme tokens, resolved.
const C = {
  paper: "#ededed",
  ash: "#a1a1a1",
  line: "#2e2e2e",
  panel: "#0a0a0a",
  urgent: "#ff6b6b",
  advisory: "#f5a524",
  quiet: "#454545",
};

const SHARE: Record<string, string> = {
  shared_credential: "Shared login",
  admin_access: "Admin access",
  same_vendor_only: "Customer of the same vendor",
};

type Node = BlastRadius["nodes"][number];

function companyBranch(blast: BlastRadius, n: Node): TreeData {
  const link = blast.edges.find((e) => e.companyId === n.companyId && e.compromised);
  const details = [
    link && (SHARE[link.shareType] ?? link.shareType.replace(/_/g, " ")),
    link?.source === "dns_inferred" ? "Candidate link (public DNS)" : null,
    n.heldCents > 0 ? `${money(n.heldCents)} held` : null,
    `${n.headcount.toLocaleString()} people`,
    n.status === "open" ? "Not acknowledged yet" : n.status ? "Acknowledged" : null,
  ].filter((d): d is string => !!d);
  return {
    id: n.companyId,
    data: { label: n.name, kind: "company", urgency: n.urgency, companyId: n.companyId },
    style: { collapsed: true },
    children: details.map((text, i) => ({ id: `${n.companyId}-${i}`, data: { label: text, kind: "detail" } })),
  };
}

function toTree(blast: BlastRadius): TreeData {
  const exposed = blast.nodes.filter((n) => n.exposed);
  const quiet = blast.nodes.filter((n) => !n.exposed && n.name !== blast.incident.reportedByName);
  return {
    id: "firm",
    data: { label: `Parent firm · ${blast.nodes.length} companies`, kind: "root" },
    children: [
      { id: "vendor", data: { label: `${blast.asset.vendorName} · breached`, kind: "vendor" } },
      ...(blast.incident.reportedByName
        ? [{ id: "reporter", data: { label: `${blast.incident.reportedByName} · reported it`, kind: "reporter" } }]
        : []),
      {
        id: "exposed",
        data: { label: `Exposed · ${exposed.length}`, kind: "group" },
        children: exposed.map((n) => companyBranch(blast, n)),
      },
      {
        id: "quiet",
        data: { label: `Not exposed · ${quiet.length}`, kind: "group" },
        style: { collapsed: true },
        children: quiet.map((n) => ({ id: n.companyId, data: { label: n.name, kind: "quiet" } })),
      },
    ],
  };
}

function nodeColour(d: { data?: Record<string, unknown> }) {
  const kind = d.data?.kind;
  if (kind === "company") return d.data?.urgency === "urgent" ? C.urgent : C.advisory;
  if (kind === "vendor") return C.urgent;
  if (kind === "quiet" || kind === "detail") return C.quiet;
  return C.paper;
}

export function G6BlastMap({
  blast,
  onSelect,
}: {
  blast: BlastRadius;
  onSelect: (id: Id<"companies">) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const pick = useRef(onSelect);
  const latest = useRef(blast);
  useEffect(() => {
    pick.current = onSelect;
    latest.current = blast;
  }, [onSelect, blast]);
  // Build once per incident: live updates (an acknowledgement) don't reset what's been opened.
  // ponytail: the tree shows the data from when it was built; rebuild on data change if that matters.
  const incidentId = blast.incident._id;

  useEffect(() => {
    if (!box.current) return;
    const refit = () => window.setTimeout(() => void graph.fitView(undefined, { duration: 300 }), 450);
    const graph = new Graph({
      container: box.current,
      autoFit: "view",
      background: C.panel,
      data: treeToGraphData(toTree(latest.current)),
      node: {
        style: {
          size: (d) => (d.data?.kind === "root" ? 44 : d.data?.kind === "detail" ? 8 : 22),
          fill: C.panel,
          stroke: nodeColour,
          lineWidth: 2,
          labelText: (d) => (typeof d.data?.label === "string" ? d.data.label : ""),
          labelFill: (d) => (d.data?.kind === "detail" || d.data?.kind === "quiet" ? C.ash : C.paper),
          labelFontFamily: "Geist, system-ui, sans-serif",
          labelFontSize: (d) => (d.data?.kind === "detail" ? 12 : 13),
          labelFontWeight: (d) => (d.data?.kind === "company" || d.data?.kind === "root" ? 600 : 400),
          labelBackground: true,
          labelBackgroundFill: C.panel,
          labelBackgroundOpacity: 0.85,
          cursor: "pointer",
        },
      },
      edge: {
        type: "cubic-radial",
        style: { stroke: C.line, lineWidth: 1.5 },
      },
      layout: { type: "dendrogram", radial: true, nodeSep: 40, rankSep: 140 },
      transforms: [{ type: "place-radial-labels", offset: 6 }],
      behaviors: [
        "drag-canvas",
        "zoom-canvas",
        // Opening or folding a bubble re-runs the layout; then bring the whole tree back into view.
        { type: "collapse-expand", trigger: "click", align: false, onExpand: refit, onCollapse: refit },
      ],
      animation: true,
    });
    graph.on<IPointerEvent>(NodeEvent.CLICK, (e) => {
      const id = (e.target as { id?: string }).id;
      const data = id ? graph.getNodeData(id)?.data : undefined;
      if (data?.kind === "company") pick.current(data.companyId as Id<"companies">);
    });
    let alive = true;
    graph.render().catch((e: unknown) => {
      if (alive) console.error(e);
    });
    return () => {
      alive = false;
      graph.destroy();
    };
  }, [incidentId]);

  return (
    <section className="overflow-hidden rounded-tile border border-line bg-panel">
      <header className="flex min-h-14 items-center justify-between border-b border-line py-3 pr-3 pl-4">
        <h2 className="text-sm font-medium tracking-[-0.02em]">Blast radius · {blast.asset.vendorName} (G6 experiment)</h2>
        <span className="text-sm text-ash">Click a bubble to open it · drag to pan · scroll to zoom</span>
      </header>
      <div ref={box} className="h-[620px] w-full" />
    </section>
  );
}
