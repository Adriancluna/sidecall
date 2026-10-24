import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { AcknowledgedBy } from "../panels/AcknowledgedBy";
import { readableEvidence } from "../panels/exposureCopy";
import { Card, Chip, Empty } from "../panels/ui";

// Why one company was flagged, for the PE firm: what its IT lead should check first, what a
// red-team finding means for it, where the link comes from (never a probability), the
// reasons, and the evidence with plain labels. Inferred links are only ever a "candidate";
// a sister company is "reachable, not tested", never validated itself.

// The firm reads about a company, not as it: "for this company", not "for you".
const FIRM_LABEL: Record<string, string> = {
  "What this means for you": "What this means for this company",
  "How we know": "Where the link comes from",
};

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
  const candidate = evidence.evidence.some(
    (e) => e.kind === "source" && e.detail.includes("DNS"),
  );
  const { path } = evidence;
  // Shown in their own blocks above, so not repeated in the evidence list.
  const shownAbove = new Set(path ? ["what_to_check", "path", "technique"] : []);
  const rows = readableEvidence(
    evidence.evidence.filter((e) => !shownAbove.has(e.kind)),
  );
  const technique = path
    ? path.techniqueName
      ? `${path.techniqueName} (${path.techniqueId})`
      : path.techniqueId
    : null;

  return (
    <Card
      title={`Evidence · ${companyName ?? ""}`}
      aside={
        <Chip tone={evidence.urgency === "urgent" ? "danger" : "amber"}>
          {evidence.urgency === "urgent" ? "Urgent" : "Advisory"}
        </Chip>
      }
    >
      <p className="mb-4 text-sm">
        {evidence.acknowledgedBy ? (
          <AcknowledgedBy userId={evidence.acknowledgedBy} />
        ) : (
          <span className="text-ash">Not acknowledged yet</span>
        )}
      </p>

      {path?.whatToCheck && (
        <section className="mb-4 rounded-lg border border-amber/40 p-3">
          <h3 className="mb-1 text-xs font-semibold tracking-wider text-amber uppercase">
            What to check
          </h3>
          <p className="text-sm leading-relaxed">
            {path.whatToCheck.replace(/^What to check:\s*/, "")}
          </p>
        </section>
      )}


      {path && (
        <section className="mb-4 space-y-1 text-sm">
          <h3 className="text-xs font-semibold tracking-wider text-ash uppercase">
            Red-team finding
          </h3>
          <p>
            Proven at another portfolio company ·{" "}
            <span className="font-medium">reachable here, not tested</span>
          </p>
          <p className="text-ash">Shared hop: {path.sharedHop}</p>
          <p className="text-ash">Attack technique: {technique}</p>
        </section>
      )}

      <p className="mb-4 text-sm text-ash">
        {candidate
          ? "Candidate link · inferred from public DNS, not confirmed"
          : "Self-reported link · supplied during onboarding"}
      </p>

      <h3 className="mb-1 text-xs font-semibold tracking-wider text-ash uppercase">
        Reasons
      </h3>

      <ul className="mb-4 list-disc space-y-1 pl-5 text-sm">
        {evidence.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>

      <dl className="space-y-2 text-sm">
        {rows.map((e) => (
          <div key={`${e.label}-${e.text}`}>
            <dt className="text-xs font-semibold tracking-wider text-ash uppercase">
              {FIRM_LABEL[e.label] ?? e.label}
            </dt>
            <dd className="mt-0.5 leading-relaxed">{e.text}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
