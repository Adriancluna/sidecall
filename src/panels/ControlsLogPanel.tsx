// Controls log: every hold, flag, release, reject and refusal for an incident, newest first.
// The backend scopes rows (firm = whole portfolio, company = own rows). Export is client-side CSV,
// with the raw rule codes an auditor can filter on; the screen shows them in words.
import { useQuery } from "convex/react";
import { useMemo } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { dateTime } from "./format";
import { actionLabel, ruleLabel } from "./labels";
import { BUTTON_SECONDARY } from "./styles";
import { Card, Empty, Skeleton } from "./ui";

type AuditRow = FunctionReturnType<
  typeof api.payments.getIncidentAudit
>[number];

const COLUMNS = ["Time", "Company", "Who", "Action", "Rule", "Reason"];

// Quote every field; neutralise leading = + - @ so a spreadsheet never runs a cell as a formula.
function csvField(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function toCsv(rows: AuditRow[]): string {
  const lines = rows.map((r) =>
    [
      new Date(r.at).toISOString(),
      r.companyName ?? "",
      r.actorName,
      r.action,
      r.rule,
      r.reason,
    ]
      .map(csvField)
      .join(","),
  );
  return [COLUMNS.map(csvField).join(","), ...lines].join("\r\n");
}

type Props = { incidentId: Id<"incidents">; fileLabel: string };

export function ControlsLogPanel({ incidentId, fileLabel }: Props) {
  const rows = useQuery(api.payments.getIncidentAudit, { incidentId });
  // Rebuilt only when the rows change, not on every render.
  const csvHref = useMemo(
    () =>
      rows && `data:text/csv;charset=utf-8,${encodeURIComponent(toCsv(rows))}`,
    [rows],
  );

  return (
    <Card
      title="Controls log"
      aside={
        rows &&
        rows.length > 0 && (
          <a
            download={`sidecall-controls-log-${fileLabel}.csv`}
            href={csvHref}
            className={BUTTON_SECONDARY}
          >
            Export CSV
          </a>
        )
      }
    >
      {rows === undefined ? (
        <Skeleton />
      ) : rows.length === 0 ? (
        <Empty>No controls recorded for this incident yet.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-ash">
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c} className="py-1 pr-3 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} className="border-t border-line align-top">
                  <td className="py-1.5 pr-3 whitespace-nowrap text-ash">
                    {dateTime(r.at)}
                  </td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{r.companyName}</td>
                  <td className="py-1.5 pr-3">{r.actorName}</td>
                  <td className="py-1.5 pr-3 font-medium">{actionLabel(r.action)}</td>
                  <td className="py-1.5 pr-3 text-ash">{ruleLabel(r.rule)}</td>
                  <td className="min-w-56 py-1.5">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
