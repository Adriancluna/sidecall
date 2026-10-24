import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { AcknowledgedBy } from "../panels/AcknowledgedBy";
import { readableEvidence } from "../panels/exposureCopy";
import { Card, Chip, Empty } from "../panels/ui";

// Why one company was flagged, for the PE firm: what its IT lead should check first, what a
// red-team finding means for it, how sure the link is (in words, never a percentage), the
// reasons, and the evidence with plain labels. Inferred links are only ever a "candidate";
// a sister company is "reachable, not tested", never validated itself.

// How sure the link is, in words. Self-reported links are 0.9, DNS candidates 0.5.
function confidenceWords(confidence: number, candidate: boolean) {
  if (candidate) return "Medium · candidate link from public DNS";
  return confidence >= 0.75 ? "High · self-reported link" : "Medium · self-reported link";
}

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
  const confidence = confidenceWords(evidence.confidence, candidate);
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

      <div className="mb-4">
        <div className="mb-1 flex justify-between gap-3 text-xs text-ash">
          <span>How sure the link is</span>
          <span>{confidence}</span>
        </div>
        <div
          className="h-1.5 rounded-full bg-graphite"
          role="meter"
          aria-label="How sure the link is"
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={evidence.confidence}
          aria-valuetext={confidence}
        >
          <div
            className={`h-full rounded-full ${candidate ? "bg-ash" : "bg-paper"}`}
            style={{ width: `${evidence.confidence * 100}%` }}
          />
        </div>
      </div>

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
