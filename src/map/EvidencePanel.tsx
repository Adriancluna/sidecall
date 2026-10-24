import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { AcknowledgedBy } from "../panels/AcknowledgedBy";
import { Card, Chip, Empty } from "../panels/ui";

// Why one company was flagged: urgency, confidence and where the link came from, the reasons, the evidence.
// Confidence copy never says "validated": inferred links are "candidate" / "reachability".
export function EvidencePanel({
  exposureId,
  companyName,
}: {
  exposureId?: Id<"exposures">;
  companyName?: string;
}) {
  const evidence = useQuery(
    api.blastRadius.getExposureEvidence,
    exposureId ? { exposureId } : "skip",
  );
  if (!exposureId || !evidence) {
    return (
      <Card title="Evidence">
        <Empty>Select an exposed company to see why.</Empty>
      </Card>
    );
  }
  const inferred = evidence.evidence.some(
    (e) => e.kind === "source" && e.detail.includes("DNS"),
  );
  return (
    <Card
      title={`Evidence · ${companyName ?? ""}`}
      aside={
        <Chip tone={evidence.urgency === "urgent" ? "danger" : "amber"}>
          {evidence.urgency === "urgent" ? "Urgent" : "Advisory"}
        </Chip>
      }
    >
      {evidence.acknowledgedBy && (
        <p className="mb-3">
          <AcknowledgedBy userId={evidence.acknowledgedBy} />
        </p>
      )}
      <p className="mb-4 text-sm text-ash">
        {inferred ? "Candidate link · inferred from public DNS, not confirmed" : "Self-reported link · supplied during onboarding"}
      </p>
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
