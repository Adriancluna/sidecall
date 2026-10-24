import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Card, Empty } from "../panels/ui";

// Placeholder from Role 2 so the layout works today. Role 3 owns this file and replaces its insides;
// keep the props. Confidence copy never says "validated": inferred links are "candidate" / "reachability".
export function EvidencePanel({
  exposureId,
  companyName,
  actingUserId,
}: {
  exposureId?: Id<"exposures">;
  companyName?: string;
  actingUserId: Id<"users">;
}) {
  const evidence = useQuery(
    api.blastRadius.getExposureEvidence,
    exposureId ? { exposureId, actingUserId } : "skip",
  );
  if (!exposureId || !evidence) {
    return (
      <Card title="Evidence">
        <Empty>Select an exposed company to see why.</Empty>
      </Card>
    );
  }
  return (
    <Card title={`Evidence · ${companyName ?? ""}`}>
      <div className="mb-4">
        <div className="mb-1 flex justify-between text-xs text-ash">
          <span>Confidence</span>
          <span>{Math.round(evidence.confidence * 100)}%</span>
        </div>
        <div
          className="h-1.5 rounded-full bg-graphite"
          role="meter"
          aria-label="Confidence"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(evidence.confidence * 100)}
        >
          <div
            className="h-full rounded-full bg-amber"
            style={{ width: `${evidence.confidence * 100}%` }}
          />
        </div>
      </div>
      <h3 className="mb-1 text-xs font-semibold text-ash">Reasons</h3>
      <ul className="mb-4 list-disc space-y-1 pl-5 text-sm">
        {evidence.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <h3 className="mb-1 text-xs font-semibold text-ash">Evidence</h3>
      <dl className="space-y-1.5 text-sm">
        {evidence.evidence.map((e) => (
          <div key={`${e.kind}-${e.detail}`} className="flex gap-3">
            <dt className="w-24 shrink-0 font-mono text-xs text-ash">
              {e.kind}
            </dt>
            <dd>{e.detail}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
