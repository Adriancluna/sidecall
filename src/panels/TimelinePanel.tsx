// Incident timeline from real timestamps (api.blastRadius.getIncidentTimeline): the Convex-track
// proof on screen. Scoped by the backend: firm = whole portfolio, company = its own events.
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { actionLabel } from "./labels";
import { Card, Skeleton, Tile } from "./ui";

function duration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return s % 60 ? `${m} min ${s % 60} s` : `${m} min`;
}

type Stats = NonNullable<
  FunctionReturnType<typeof api.blastRadius.getIncidentTimeline>
>["stats"];

// "Payments held in the same transaction as the report · alerts written in 97 ms · …"
function headline(stats: Stats): string[] {
  return [
    stats.holdsInReportTransaction &&
      "Payments held in the same transaction as the report",
    stats.msToFirstAlert !== null &&
      `alerts written in ${duration(stats.msToFirstAlert)}`,
    stats.msToVendorLetter !== null &&
      `vendor letter in ${duration(stats.msToVendorLetter)}`,
    stats.msToFirstAcknowledgement !== null &&
      `first acknowledgement after ${duration(stats.msToFirstAcknowledgement)}`,
    stats.msToFirstRelease !== null &&
      `first release after ${duration(stats.msToFirstRelease)}`,
  ].filter((part): part is string => typeof part === "string");
}

export function TimelinePanel({ incidentId }: { incidentId: Id<"incidents"> }) {
  const timeline = useQuery(api.blastRadius.getIncidentTimeline, {
    incidentId,
  });
  if (timeline === undefined) {
    return (
      <Card title="Timeline">
        <Skeleton />
      </Card>
    );
  }
  if (timeline === null) return null;

  const start = timeline.events[0]?.at ?? 0;
  const parts = headline(timeline.stats);
  return (
    <Card title="Timeline">
      {parts.length > 0 && (
        <ul className="mb-5 space-y-2">
          {parts.map((part) => (
            <li key={part} className="flex items-center gap-3">
              <Tile className="size-2 text-ok" />
              {part.charAt(0).toUpperCase() + part.slice(1)}
            </li>
          ))}
        </ul>
      )}
      <details>
        <summary className="text-sm text-ash">
          {timeline.events.length} events, real timestamps
        </summary>
        <ol className="mt-2 space-y-1 text-sm">
          {timeline.events.map((e, i) => (
            <li
              key={`${e.at}-${e.kind}-${i}`}
              className="flex flex-wrap gap-x-3"
            >
              <span className="w-20 shrink-0 text-right text-ash tabular-nums">
                +{duration(e.at - start)}
              </span>
              <span className="w-44 shrink-0 font-medium">{actionLabel(e.kind)}</span>
              <span className="min-w-0 flex-1">
                {e.companyName && (
                  <span className="font-medium">{e.companyName}: </span>
                )}
                {e.label}
              </span>
            </li>
          ))}
        </ol>
      </details>
    </Card>
  );
}
