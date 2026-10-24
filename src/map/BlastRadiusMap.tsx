// Placeholder from Role 2 so the layout works today. Role 3 owns this file and replaces its insides;
// keep the props: the getBlastRadius result, the selected company, and a select callback.
import type { Id } from "../../convex/_generated/dataModel";
import type { BlastRadius } from "../demo/contract";
import { money } from "../panels/format";
import { Card, Chip } from "../panels/ui";

const SHARE_LABEL = {
  shared_credential: "shared credential",
  shared_admin_access: "shared admin access",
  same_vendor_only: "same vendor only",
} as const;

type Props = {
  blast: BlastRadius;
  selected?: Id<"companies">;
  onSelect: (id: Id<"companies">) => void;
};

export function BlastRadiusMap({ blast, selected, onSelect }: Props) {
  const nodes = [...blast.nodes].sort((a, b) => b.score - a.score);
  return (
    <Card title="Blast radius">
      <ul className="grid gap-2 sm:grid-cols-2">
        {nodes.map((n) => {
          const edge = blast.edges.find((e) => e.companyId === n.companyId);
          const isReporter = n.companyId === blast.incident.reportedByCompanyId;
          return (
            <li key={n.companyId}>
              <button
                type="button"
                disabled={!n.exposed}
                aria-pressed={selected === n.companyId}
                onClick={() => onSelect(n.companyId)}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  selected === n.companyId
                    ? "border-amber"
                    : "border-line hover:border-ash"
                } ${n.exposed ? "bg-graphite" : "bg-transparent opacity-50"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{n.name}</span>
                  {n.urgency === "urgent" && <Chip tone="danger">urgent</Chip>}
                  {n.urgency === "advisory" && (
                    <Chip tone="amber">advisory</Chip>
                  )}
                  {!n.exposed && (
                    <Chip tone="muted">
                      {isReporter ? "reported" : "not exposed"}
                    </Chip>
                  )}
                </div>
                <p className="mt-1 text-xs text-ash">
                  {n.headcount.toLocaleString()} people
                  {edge && ` · ${SHARE_LABEL[edge.shareType]}`}
                  {edge?.source === "dns_inferred" && " (candidate)"}
                  {n.exposed && ` · score ${n.score}`}
                  {n.status && n.status !== "open" && ` · ${n.status}`}
                </p>
                {n.heldCents > 0 && (
                  <p className="mt-1 text-sm text-amber">
                    {money(n.heldCents)} held
                  </p>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
