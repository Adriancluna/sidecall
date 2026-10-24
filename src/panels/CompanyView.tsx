// A portfolio company's own view. The backend never sends which company reported the incident.
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { friendlyError } from "../layout/errors";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { AcknowledgedBy } from "./AcknowledgedBy";
import { BillsPanel } from "./BillsPanel";
import { ControlsLogPanel } from "./ControlsLogPanel";
import { HeldPaymentsPanel } from "./HeldPaymentsPanel";
import { EXPOSURE_STATUS, URGENCY } from "./labels";
import { LedgerPanel } from "./LedgerPanel";
import { NotificationsPanel } from "./NotificationsPanel";
import { TimelinePanel } from "./TimelinePanel";
import { Card, Chip, Empty, LookChip } from "./ui";
import { humanize } from "./format";

type Props = {
  companyId: Id<"companies">;
  meId: Id<"users">;
  role: Doc<"users">["role"];
};

export function CompanyView({ companyId, meId, role }: Props) {
  const isController = role === "controller";
  const company = useQuery(api.blastRadius.listCompanies, {})?.find(
    (c) => c._id === companyId,
  );
  const exposures = useQuery(api.blastRadius.getMyExposures, {});
  const alerts = useQuery(api.alerts.getMyAlerts, {});
  // Undecided holds near their due date (Role 1's escalation), keyed by payment.
  const escalations = new Map(
    (alerts ?? []).flatMap((a) =>
      a.kind === "escalation" && a.paymentId
        ? [[a.paymentId, a.body] as const]
        : [],
    ),
  );
  const held = useQuery(api.payments.getHeldPayments, {});
  const latestIncident = useQuery(api.blastRadius.listIncidents, {})?.[0];
  // Clerks and controllers act on payments, so the decision leads (it's the money moment);
  // IT acts on alerts, so Acknowledge stays on top and "Decision needed" isn't theirs.
  const handlesPayments = role === "ap_clerk" || isController;
  const heldPanel = held && held.length > 0 && (
    <HeldPaymentsPanel
      title="Payments held until verified"
      rows={held}
      escalations={handlesPayments ? escalations : undefined}
      canDecide
      viewer={{ id: meId, isController }}
    />
  );

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-ash">{company?.sector}</p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          {company?.name}
        </h1>
        {company && !company.holdRuleEnabled && (
          <p className="mt-1 text-sm text-ash">
            Payment holds are off for this company.
          </p>
        )}
      </header>

      {handlesPayments && heldPanel}

      <Card title="Alerts">
        {exposures === undefined ? (
          <Empty>Loading…</Empty>
        ) : exposures.length === 0 ? (
          <Empty>No alerts. Nothing you share is affected.</Empty>
        ) : (
          <div className="space-y-3">
            {exposures.map((exposure) => (
              <AlertItem
                key={exposure._id}
                exposure={exposure}
                alert={alerts?.find(
                  (a) =>
                    a.kind === "company_alert" && a.exposureId === exposure._id,
                )}
              />
            ))}
          </div>
        )}
      </Card>

      {!handlesPayments && heldPanel}

      <BillsPanel />

      <NotificationsPanel scope="company" canManage={isController} />

      {latestIncident && <TimelinePanel incidentId={latestIncident._id} />}

      {latestIncident && (
        <ControlsLogPanel
          incidentId={latestIncident._id}
          fileLabel={`${company?.domain ?? "company"}-${latestIncident.externalId}`}
        />
      )}

      <LedgerPanel />
    </div>
  );
}

type AlertItemProps = {
  exposure: Doc<"exposures">;
  alert?: Doc<"alerts">;
};

function AlertItem({ exposure, alert }: AlertItemProps) {
  const acknowledge = useMutation(api.incidents.acknowledgeExposure);
  const close = useMutation(api.incidents.closeExposure);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  // Refusals (already acknowledged, closed) are expected when two people act at once.
  const change = async (action: "acknowledge" | "close") => {
    setBusy(true);
    try {
      const args = { exposureId: exposure._id };
      const res =
        action === "acknowledge" ? await acknowledge(args) : await close(args);
      setMessage(
        res.ok
          ? undefined
          : `Not ${action === "acknowledge" ? "acknowledged" : "closed"}: ${humanize(res.reason)}`,
      );
    } catch (err) {
      setMessage(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const button =
    "rounded-md border border-line px-3 py-1.5 text-sm hover:border-ash disabled:opacity-50";
  return (
    <article className="rounded-lg border border-line bg-graphite p-4">
      <div className="mb-2 flex items-center gap-2">
        <LookChip look={URGENCY[exposure.urgency]} />
        <Chip tone="muted">{EXPOSURE_STATUS[exposure.status]}</Chip>
        <AcknowledgedBy userId={exposure.acknowledgedBy} />
      </div>
      <p className="max-w-prose text-sm leading-relaxed">
        {alert?.status === "ready" ? alert.body : "Writing your alert…"}
      </p>
      {exposure.status !== "closed" && (
        <div className="mt-3 flex gap-2">
          {exposure.status === "open" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void change("acknowledge")}
              className={button}
            >
              Acknowledge
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void change("close")}
            className={button}
          >
            Close
          </button>
        </div>
      )}
      {message && (
        <p role="status" className="mt-2 text-sm text-ash">
          {message}
        </p>
      )}
    </article>
  );
}
