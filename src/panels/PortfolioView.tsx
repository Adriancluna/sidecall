// PE firm view: the only view allowed to name the reporting company.
import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { BlastRadiusMap } from "../map/BlastRadiusMap";
import { EvidencePanel } from "../map/EvidencePanel";
import { dateTime, money } from "./format";
import { HeldPaymentsPanel } from "./HeldPaymentsPanel";
import { Card, Chip, Empty } from "./ui";

export function PortfolioView({ actingUserId }: { actingUserId: Id<"users"> }) {
  const incidents = useQuery(api.blastRadius.listIncidents, { actingUserId });
  const incidentId = incidents?.[0]?._id; // newest first
  const blast = useQuery(
    api.blastRadius.getBlastRadius,
    incidentId ? { incidentId, actingUserId } : "skip",
  );
  const held = useQuery(
    api.payments.getHeldPayments,
    incidentId ? { incidentId, actingUserId } : "skip",
  );
  const letter = useQuery(
    api.alerts.getIncidentAlerts,
    incidentId ? { incidentId, actingUserId } : "skip",
  )?.find((a) => a.kind === "vendor_letter");
  const [selected, setSelected] = useState<Id<"companies">>();

  if (incidents === undefined) return <Empty>Loading…</Empty>;
  if (!incidentId) {
    return (
      <Card>
        <Empty>
          No open incidents across the portfolio. Fire the demo incident to
          start.
        </Empty>
      </Card>
    );
  }
  if (!blast) return <Empty>Loading…</Empty>;

  const { incident, totals } = blast;
  const selectedNode = blast.nodes.find((n) => n.companyId === selected);

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm text-ash">
          {blast.asset.name} ({blast.asset.kind}) ·{" "}
          {dateTime(incident.createdAt)}
          {incident.reportedByName &&
            ` · reported by ${incident.reportedByName} (visible to the PE firm only)`}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">
          {totals.companiesExposed} companies exposed ·{" "}
          {totals.peopleExposed.toLocaleString()} people behind them ·{" "}
          <span className="text-amber">
            {money(totals.heldCents)} in payments held
          </span>
        </h1>
        {incident.summary && (
          <p className="mt-2 max-w-3xl text-ash">{incident.summary}</p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <BlastRadiusMap
          blast={blast}
          selected={selected}
          onSelect={setSelected}
        />
        <EvidencePanel
          exposureId={selectedNode?.exposureId ?? undefined}
          companyName={selectedNode?.name}
          actingUserId={actingUserId}
        />
      </div>

      <HeldPaymentsPanel
        title={`Payments held · ${totals.paymentsHeld}`}
        rows={held}
        canDecide={false}
        intro="The firm sees every hold. Only a controller at the portfolio company can release or reject."
      />

      {letter && (
        <Card
          title="Letter to the shared vendor"
          aside={
            <Chip tone={letter.status === "ready" ? "ok" : "muted"}>
              {letter.status}
            </Chip>
          }
        >
          <p className="max-w-3xl text-sm leading-relaxed whitespace-pre-line">
            {letter.body}
          </p>
        </Card>
      )}
    </div>
  );
}
