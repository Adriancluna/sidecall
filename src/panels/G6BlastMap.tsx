// The firm's blast radius as an expandable radial tree drawn by AntV G6 (Marco's call, Oct 24).
// Click a bubble to open or fold it; click a company to load its evidence on the right. Live updates
// keep whatever is open. Omar's SVG map is still one URL flag away: ?map=classic (PortfolioView).
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

// Bubbles the viewer has opened; the exposed group starts open, every company starts folded.
type Open = ReadonlySet<string>;

function companyBranch(blast: BlastRadius, n: Node, open: Open): TreeData {
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
    style: { collapsed: !open.has(n.companyId) },
    children: details.map((text, i) => ({ id: `${n.companyId}-${i}`, data: { label: text, kind: "detail" } })),
  };
}

function toTree(blast: BlastRadius, open: Open): TreeData {
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
        style: { collapsed: !open.has("exposed") },
        children: exposed.map((n) => companyBranch(blast, n, open)),
      },
      {
        id: "quiet",
        data: { label: `Not exposed · ${quiet.length}`, kind: "group" },
        style: { collapsed: !open.has("quiet") },
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
  const open = useRef(new Set<string>(["exposed"]));
  const graphRef = useRef<Graph | null>(null);
  const incidentId = blast.incident._id;
  useEffect(() => {
    pick.current = onSelect;
  }, [onSelect]);
  // Live data (an acknowledgement, a release) redraws the tree with the same bubbles open.
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || latest.current === blast) return;
    latest.current = blast;
    graph.setData(treeToGraphData(toTree(blast, open.current)));
    graph.render().catch(() => undefined);
  }, [blast]);

  useEffect(() => {
    if (!box.current) return;
    open.current = new Set(["exposed"]);
    latest.current = blast;
    const refit = () => window.setTimeout(() => void graph.fitView(undefined, { duration: 300 }), 450);
    const graph = new Graph({
      container: box.current,
      autoFit: "view",
      background: C.panel,
      data: treeToGraphData(toTree(blast, open.current)),
      node: {
        style: {
          size: (d) => (d.data?.kind === "root" ? 44 : d.data?.kind === "detail" ? 8 : 22),
          fill: C.panel,
          stroke: nodeColour,
          lineWidth: 2,
          labelText: (d) => (typeof d.data?.label === "string" ? d.data.label : ""),
          labelFill: (d) => (d.data?.kind === "detail" || d.data?.kind === "quiet" ? C.ash : C.paper),
          labelFontFamily: "Geist, system-ui, sans-serif",
          labelFontSize: (d) => (d.data?.kind === "detail" ? 13 : 14),
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
        {
          type: "collapse-expand",
          trigger: "click",
          align: false,
          onExpand: (id: string) => {
            open.current.add(id);
            refit();
          },
          onCollapse: (id: string) => {
            open.current.delete(id);
            refit();
          },
        },
      ],
      animation: true,
    });
    graph.on<IPointerEvent>(NodeEvent.CLICK, (e) => {
      const id = (e.target as { id?: string }).id;
      const data = id ? graph.getNodeData(id)?.data : undefined;
      if (data?.kind === "company") pick.current(data.companyId as Id<"companies">);
    });
    graphRef.current = graph;
    let alive = true;
    graph.render().catch((e: unknown) => {
      if (alive) console.error(e);
    });
    // The canvas keeps its first size; follow the card when the window or sidebar changes width.
    const resize = new ResizeObserver(() => {
      if (!alive || graph.destroyed) return;
      graph.resize();
      graph.fitView().catch(() => undefined);
    });
    resize.observe(box.current);
    return () => {
      alive = false;
      resize.disconnect();
      graphRef.current = null;
      graph.destroy();
    };
    // Rebuilt only when the incident changes; data updates go through setData above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentId]);

  return (
    <section className="overflow-hidden rounded-tile border border-line bg-panel">
      <header className="flex min-h-14 items-center justify-between border-b border-line py-3 pr-3 pl-4">
        <h2 className="text-sm font-medium tracking-[-0.02em]">Blast radius · {blast.asset.vendorName}</h2>
        <span className="flex items-center gap-4 text-sm text-ash">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full border-2 border-[#ff6b6b]" /> Urgent
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full border-2 border-[#f5a524]" /> Advisory
          </span>
          <span>Click a bubble to open it · drag to pan · scroll to zoom</span>
        </span>
      </header>
      <div ref={box} className="h-[620px] w-full" />
    </section>
  );
}
