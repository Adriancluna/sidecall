// A portfolio company's own view. Never shows which company reported the incident.
import { useState } from "react";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import type { CompanyAlertRow } from "../demo/contract";
import {
  useAcknowledgeExposure,
  useCompanies,
  useCompanyAlerts,
  useHeldPayments,
} from "../demo/mockBackend";
import { LedgerPanel } from "./LedgerPanel";
import { HeldPaymentsPanel } from "./HeldPaymentsPanel";
import { Card, Chip, Empty } from "./ui";

type Props = { companyId: Id<"companies">; actingUser: Doc<"users"> };

export function CompanyView({ companyId, actingUser }: Props) {
  const company = useCompanies()?.find((c) => c._id === companyId);
  const alerts = useCompanyAlerts(companyId);
  const held = useHeldPayments({ companyId });

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
        {alerts === undefined ? (
          <Empty>Loading…</Empty>
        ) : alerts.length === 0 ? (
          <Empty>No alerts. Nothing you share is affected.</Empty>
        ) : (
          <div className="space-y-3">
            {alerts.map((row) => (
              <AlertItem key={row.exposure._id} row={row} />
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

      <LedgerPanel companyId={companyId} />
    </div>
  );
}

function AlertItem({ row }: { row: CompanyAlertRow }) {
  const acknowledge = useAcknowledgeExposure();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const { exposure, alert } = row;

  const onAcknowledge = async () => {
    setBusy(true);
    try {
      const res = await acknowledge({ exposureId: exposure._id });
      setMessage(
        res.ok
          ? undefined
          : `Not acknowledged: ${res.reason.replace("_", " ")}`,
      );
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

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
      {exposure.status === "open" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onAcknowledge()}
          className="mt-3 rounded-md border border-line px-3 py-1.5 text-sm hover:border-ash disabled:opacity-50"
        >
          Acknowledge
        </button>
      )}
      {message && (
        <p role="status" className="mt-2 text-sm text-ash">
          {message}
        </p>
      )}
    </article>
  );
}
