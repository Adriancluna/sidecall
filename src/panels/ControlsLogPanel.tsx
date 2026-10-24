// Controls log: every hold, flag, release, reject and refusal for an incident, newest first.
// The backend scopes rows (firm = whole portfolio, company = own rows). Export is client-side CSV.
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { dateTime } from "./format";
import { Card, Empty } from "./ui";

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

  return (
    <Card
      title={`Controls log${rows ? ` · ${rows.length}` : ""}`}
      aside={
        rows &&
        rows.length > 0 && (
          <a
            download={`sidecall-controls-log-${fileLabel}.csv`}
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(toCsv(rows))}`}
            className="rounded-md border border-line px-3 py-1 text-sm hover:border-ash"
          >
            Export CSV
          </a>
        )
      }
    >
      {rows === undefined ? (
        <Empty>Loading…</Empty>
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
                  <td className="py-1.5 pr-3">{r.companyName}</td>
                  <td className="py-1.5 pr-3">{r.actorName}</td>
                  <td className="py-1.5 pr-3 font-mono text-xs">{r.action}</td>
                  <td className="py-1.5 pr-3 font-mono text-xs text-ash">
                    {r.rule}
                  </td>
                  <td className="py-1.5">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
