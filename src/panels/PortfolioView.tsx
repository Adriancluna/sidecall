// PE firm view: the only view allowed to name the reporting company.
import { useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import {
  useBlastRadius,
  useCompanies,
  useHeldPayments,
  useListIncidents,
  useVendorLetter,
} from "../demo/mockBackend";
import { BlastRadiusMap } from "../map/BlastRadiusMap";
import { EvidencePanel } from "../map/EvidencePanel";
import { HeldPaymentsPanel } from "./HeldPaymentsPanel";
import { dateTime, money } from "./format";
import { Card, Chip, Empty } from "./ui";

export function PortfolioView() {
  const incidents = useListIncidents();
  const incident = incidents?.[incidents.length - 1];
  const blast = useBlastRadius(incident?._id);
  const held = useHeldPayments({ incidentId: incident?._id });
  const letter = useVendorLetter(incident?._id);
  const companies = useCompanies();
  const [selected, setSelected] = useState<Id<"companies">>();

  if (incidents === undefined) return <Empty>Loading…</Empty>;
  if (!incident || !blast) {
    return (
      <Card>
        <Empty>
          No open incidents across the portfolio. Fire the demo incident to
          start.
        </Empty>
      </Card>
    );
  }

  const { totals } = blast;
  const reporter = companies?.find(
    (c) => c._id === incident.reportedByCompanyId,
  )?.name;
  const selectedNode = blast.nodes.find((n) => n.companyId === selected);

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm text-ash">
          {blast.asset.name} ({blast.asset.kind}) ·{" "}
          {dateTime(incident.createdAt)}
          {reporter &&
            ` · reported by ${reporter} (visible to the PE firm only)`}
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
          exposureId={selectedNode?.exposureId}
          companyName={selectedNode?.name}
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
