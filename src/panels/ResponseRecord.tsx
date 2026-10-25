import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { BUTTON_SECONDARY } from "./styles";
import { dateTime } from "./format";

export function ResponseRecord({
  incidentId,
}: {
  incidentId: Id<"incidents">;
}) {
  const [open, setOpen] = useState(false);
  const record = useQuery(
    api.responseEvidence.getRecord,
    open ? { incidentId } : "skip",
  );
  return (
    <details
      className="mt-3 text-sm"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer font-medium">
        Evidence and execution record
      </summary>
      {open && !record ? (
        <p className="mt-3 text-ash">Loading record…</p>
      ) : (
        record && (
          <div className="mt-3 space-y-3">
            <p>
            {record.reports.length} report receipt{record.reports.length === 1 ? "" : "s"} · {record.steps.length}{" "}
              response steps · {record.payments.length} payments associated with
              this incident
            </p>
          <p className="text-ash">Checks below record access to Sidecall's owned sandbox. Simulated steps have no verified external effect; the download includes evidence limits and audit history.</p>
            {Object.values(record.limits.truncated).some(Boolean) && (
              <p className="text-amber">
                Partial record: one or more sections exceed{" "}
                {record.limits.maximumRowsPerSection} rows.
              </p>
            )}
            <ul className="space-y-3">
              {record.steps.map((s) => (
                <li key={s.id} className="border-l border-line pl-3">
                  <p>
                  {record.companies.find((c) => c.companyId === s.companyId)?.name ?? "Company"} · {s.action.replace(/_/g, " ")} · {s.status.replace(/_/g, " ")}
                  </p>
                  <p className="text-ash">
                    {s.policyRule} ·{" "}
                    {s.executedAt ? dateTime(s.executedAt) : "Not executed"}
                  </p>
                  <p>
                    {s.verification
                      ? `Owned resource check: ${s.verification.accessBefore ? "allowed" : "denied"} → ${s.verification.accessAfter ? "allowed" : "denied"} at ${dateTime(s.verification.checkedAt)}${s.undoneAt ? "; subsequently undone" : ""}.`
                      : s.executionMode === "simulated"
                        ? "Simulation only; no external execution verified."
                        : "No execution verification recorded."}
                  </p>
                </li>
              ))}
            </ul>
            <a
              className={BUTTON_SECONDARY}
              download={`sidecall-response-${incidentId}.json`}
              href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(record, null, 2))}`}
            >
              Download response record
            </a>
          </div>
        )
      )}
    </details>
  );
}
