// A portfolio company's own view. The backend never sends which company reported the incident.
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { HeldPaymentsPanel } from "./HeldPaymentsPanel";
import { LedgerPanel } from "./LedgerPanel";
import { Card, Chip, Empty } from "./ui";

type Props = { companyId: Id<"companies">; actingUser: Doc<"users"> };

export function CompanyView({ companyId, actingUser }: Props) {
  const actingUserId = actingUser._id;
  const company = useQuery(api.blastRadius.listCompanies, {})?.find(
    (c) => c._id === companyId,
  );
  const exposures = useQuery(api.blastRadius.getMyExposures, { actingUserId });
  const alerts = useQuery(api.alerts.getMyAlerts, { actingUserId });
  const held = useQuery(api.payments.getHeldPayments, { actingUserId });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-ash">{company?.sector}</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {company?.name}
        </h1>
        {company && !company.holdRuleEnabled && (
          <p className="mt-1 text-sm text-ash">
            Payment holds are off for this company.
          </p>
        )}
      </header>

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
                actingUserId={actingUserId}
              />
            ))}
          </div>
        )}
      </Card>

      {held && held.length > 0 && (
        <HeldPaymentsPanel
          title="Payments held until verified"
          rows={held}
          actingUser={actingUser}
          canDecide
        />
      )}

      <LedgerPanel actingUserId={actingUserId} />
    </div>
  );
}

type AlertItemProps = {
  exposure: Doc<"exposures">;
  alert?: Doc<"alerts">;
  actingUserId: Id<"users">;
};

function AlertItem({ exposure, alert, actingUserId }: AlertItemProps) {
  const acknowledge = useMutation(api.incidents.acknowledgeExposure);
  const close = useMutation(api.incidents.closeExposure);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  // Refusals (already acknowledged, closed) are expected when two people act at once.
  const change = async (action: "acknowledge" | "close") => {
    setBusy(true);
    try {
      const args = { exposureId: exposure._id, actingUserId };
      const res =
        action === "acknowledge" ? await acknowledge(args) : await close(args);
      setMessage(
        res.ok
          ? undefined
          : `Not ${action === "acknowledge" ? "acknowledged" : "closed"}: ${res.reason.replace(/_/g, " ")}`,
      );
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const button =
    "rounded-md border border-line px-3 py-1.5 text-sm hover:border-ash disabled:opacity-50";
  return (
    <article className="rounded-lg border border-line bg-graphite p-4">
      <div className="mb-2 flex items-center gap-2">
        <Chip tone={exposure.urgency === "urgent" ? "danger" : "amber"}>
          {exposure.urgency}
        </Chip>
        <Chip tone="muted">{exposure.status}</Chip>
      </div>
      <p className="text-sm leading-relaxed">
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
