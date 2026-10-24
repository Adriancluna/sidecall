// PE firm view: the only view allowed to name the reporting company.
import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { BlastRadiusMap } from "../map/BlastRadiusMap";
import { EvidencePanel } from "../map/EvidencePanel";
import { dateTime, money } from "./format";
import { ExposureAcknowledgedBy } from "./AcknowledgedBy";
import { ApImportPanel } from "./ApImportPanel";
import { ContainPanel } from "./ContainPanel";
import { ControlsLogPanel } from "./ControlsLogPanel";
import { HeldPaymentsPanel } from "./HeldPaymentsPanel";
import { EXPOSURE_STATUS, PAYMENT_STATUS, URGENCY } from "./labels";
import { NotificationsPanel } from "./NotificationsPanel";
import { ProofPanel } from "./ProofPanel";
import { TimelinePanel } from "./TimelinePanel";
import { VendorLetterActions } from "./VendorLetterActions";
import { Card, Chip, Empty } from "./ui";

export function PortfolioView() {
  const incidents = useQuery(api.blastRadius.listIncidents, {});
  // Follow the newest incident (list is newest first) unless the firm picked another one.
  const [chosen, setChosen] = useState<Id<"incidents">>();
  const incidentId =
    incidents?.find((i) => i._id === chosen)?._id ?? incidents?.[0]?._id;
  const blast = useQuery(
    api.blastRadius.getBlastRadius,
    incidentId ? { incidentId } : "skip",
  );
  const held = useQuery(
    api.payments.getHeldPayments,
    incidentId ? { incidentId } : "skip",
  );
  const alerts = useQuery(
    api.alerts.getIncidentAlerts,
    incidentId ? { incidentId } : "skip",
  );
  const letter = alerts?.find((a) => a.kind === "vendor_letter");
  const [selected, setSelected] = useState<Id<"companies">>();

  if (incidents === undefined) return <Empty>Loading…</Empty>;
  if (!incidentId) {
    return (
      <div className="space-y-6">
        <Card>
          <Empty>
            No open incidents across the portfolio. Fire the demo incident to
            start.
          </Empty>
        </Card>
        <ApImportPanel />
      </div>
    );
  }
  if (!blast) return <Empty>Loading…</Empty>;

  const { incident, totals } = blast;
  const current = incidents.find((i) => i._id === incident._id);
  const selectedNode = blast.nodes.find((n) => n.companyId === selected);
  const selectedHeld = held?.filter((r) => r.payment.companyId === selected);
  // The headline counts money still held; show what controllers have released since.
  const releasedCents = (held ?? [])
    .filter((r) => r.decision?.status === "paid")
    .reduce((sum, r) => sum + r.payment.amountCents, 0);
  const nodeFor = (companyId?: Id<"companies">) =>
    blast.nodes.find((n) => n.companyId === companyId);
  // Tailored company alerts, most urgent first (the AI writes; scoring decides urgency).
  const companyAlerts = (alerts ?? [])
    .filter((a) => a.kind === "company_alert")
    .map((alert) => ({ alert, node: nodeFor(alert.companyId) }))
    .sort((a, b) => (b.node?.score ?? 0) - (a.node?.score ?? 0));

  return (
    <div className="space-y-6">
      <section>
        {incidents.length > 1 && (
          <label className="mb-2 flex flex-wrap items-center gap-2 text-sm text-ash">
            Incident
            <select
              value={incident._id}
              onChange={(e) => {
                setChosen(e.target.value as Id<"incidents">);
                setSelected(undefined);
              }}
              className="max-w-full min-w-0 rounded-md border border-line bg-panel px-2 py-1.5 text-paper"
            >
              {incidents.map((i) => (
                <option key={i._id} value={i._id}>
                  {i.assetName} · {dateTime(i.createdAt)}
                  {i.containedAt !== null && " · contained"}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="text-sm text-ash">
          {current?.containedAt != null && (
            <span className="mr-2 inline-block align-middle">
              <Chip tone="ok">Contained</Chip>
            </span>
          )}
          {blast.asset.name} ({blast.asset.kind}) ·{" "}
          {dateTime(incident.createdAt)}
          {incident.reportedByName &&
            ` · reported by ${incident.reportedByName} (visible to the PE firm only)`}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance md:text-4xl">
          {totals.companiesExposed} companies exposed ·{" "}
          {totals.peopleExposed.toLocaleString()} people behind them ·{" "}
          <span className="text-amber">
            {money(totals.heldCents)} in payments held
          </span>
        </h1>
        {releasedCents > 0 && (
          <p className="mt-1 text-sm text-ok">
            {money(releasedCents)} released after verification
          </p>
        )}
        {incident.summary && (
          <p className="mt-2 max-w-3xl text-ash">{incident.summary}</p>
        )}
      </section>

      <TimelinePanel incidentId={incident._id} />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <BlastRadiusMap
          blast={blast}
          selected={selected}
          onSelect={setSelected}
        />
        <div className="space-y-6">
          <EvidencePanel
            exposureId={selectedNode?.exposureId ?? undefined}
            companyName={selectedNode?.name}
          />
          {selectedNode && (
            <Card title={`Payments held · ${selectedNode.name}`}>
              {!selectedHeld?.length ? (
                <Empty>No payments held at this company.</Empty>
              ) : (
                <ul className="space-y-2 text-sm">
                  {selectedHeld.map((r) => (
                    <li
                      key={r.payment._id}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span className="font-semibold tabular-nums">
                        {money(r.payment.amountCents)}
                      </span>
                      <span className="flex gap-1">
                        {r.bankChange && <Chip tone="danger">bank change</Chip>}
                        <Chip tone={PAYMENT_STATUS[r.payment.status].tone}>
                          {PAYMENT_STATUS[r.payment.status].label}
                        </Chip>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>

      {companyAlerts.length > 0 && (
        <Card title={`Tailored alerts · ${companyAlerts.length}`}>
          <ul className="space-y-3">
            {companyAlerts.map(({ alert, node }) => (
              <li
                key={alert._id}
                className="rounded-lg border border-line bg-graphite p-4"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-medium">{node?.name}</span>
                  {node?.urgency && (
                    <Chip tone={URGENCY[node.urgency].tone}>
                      {URGENCY[node.urgency].label}
                    </Chip>
                  )}
                  {node?.status && (
                    <Chip tone="muted">{EXPOSURE_STATUS[node.status]}</Chip>
                  )}
                  {alert.exposureId && (
                    <ExposureAcknowledgedBy exposureId={alert.exposureId} />
                  )}
                </div>
                <p className="max-w-prose text-sm leading-relaxed">
                  {alert.status === "ready" ? alert.body : "Writing alert…"}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <HeldPaymentsPanel
        title={`Payments held · ${totals.paymentsHeld}`}
        rows={held}
        canDecide={false}
        intro="The firm sees every hold. Only a controller at the portfolio company can release or reject."
      />

      <ControlsLogPanel
        incidentId={incident._id}
        fileLabel={incident.externalId}
      />

      {letter && (
        <Card
          title="Letter to the shared vendor"
          aside={
            letter.status === "ready" ? (
              <VendorLetterActions
                vendorName={blast.asset.vendorName}
                body={letter.body}
              />
            ) : (
              <Chip tone="muted">writing…</Chip>
            )
          }
        >
          <p className="max-w-3xl text-sm leading-relaxed whitespace-pre-wrap">
            {letter.body}
          </p>
        </Card>
      )}

      <ApImportPanel />

      <NotificationsPanel scope="firm" canManage incidentId={incident._id} />

      <ContainPanel
        key={incident._id}
        incidentId={incident._id}
        containedAt={current?.containedAt ?? null}
      />

      <ProofPanel />
    </div>
  );
}
