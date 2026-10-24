// The IT lead's first screen during an incident: what's wrong in one sentence, the steps to fix
// it in order, and one button to tell the firm you're on it. Never names who was hit.
import type { Doc } from "../../convex/_generated/dataModel";
import { AcknowledgedBy } from "./AcknowledgedBy";
import { dateTime, money } from "./format";
import { URGENCY } from "./labels";
import { exposureHeadline, isCandidate, nextSteps, SHARE_LABEL, shareTypeOf } from "./exposureCopy";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "./styles";
import { Chip, LookChip } from "./ui";
import { useExposureAction } from "./useExposureAction";
import { PlanSteps } from "./ResponsePlaybook";

type Incident = { assetName: string; vendorName: string; createdAt: number; containedAt: number | null };

export function ExposureHero({
  exposure,
  incident,
  phone,
  heldForIncident,
  onOpenTab,
}: {
  exposure: Doc<"exposures">;
  incident: Incident | undefined;
  phone?: string;
  heldForIncident: { count: number; cents: number };
  onOpenTab: (tab: string) => void;
}) {
  const { run, busy, message } = useExposureAction(exposure._id);
  const vendor = incident?.vendorName ?? "Your vendor";
  const asset = incident?.assetName ?? "the shared account";
  const share = shareTypeOf(exposure);
  const candidate = isCandidate(exposure);
  const steps = nextSteps({ share, vendor, asset, phone, whatToCheck: exposure.path?.whatToCheck });
  const urgent = exposure.urgency === "urgent";

  return (
    <section
      aria-labelledby="hero-title"
      className={`rounded-2xl border border-l-4 border-line bg-panel p-6 md:p-8 ${urgent ? "border-l-danger" : "border-l-amber"}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm text-ash">
        <LookChip look={URGENCY[exposure.urgency]} />
        <span>
          {urgent ? "Act today" : "Review this week"} · active incident at {vendor}
          {incident && ` · ${dateTime(incident.createdAt)}`}
        </span>
        {incident?.containedAt !== null && incident?.containedAt !== undefined && (
          <Chip tone="ok">Vendor has contained it</Chip>
        )}
      </div>

      <h1 id="hero-title" className="mt-3 max-w-4xl text-3xl font-semibold tracking-tight text-balance md:text-4xl">
        {exposureHeadline(share, vendor, candidate)}
      </h1>

      <p className="mt-3 max-w-3xl text-ash">
        {exposure.reasons.join(" ")}{" "}
        {candidate
          ? "This link is a guess from public DNS records, so first confirm whether you use them."
          : "Your team reported this link when you joined the portfolio."}
      </p>

      {exposure.path && (
        <p className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-lg border border-line bg-graphite px-3 py-2 text-sm">
          <Chip tone="amber">Proven at another portfolio company</Chip>
          <span>
            The attack path is <strong>reachable here, not tested here</strong>
            {exposure.path.techniqueName && ` · technique: ${exposure.path.techniqueName}`}
          </span>
        </p>
      )}

      <PlanSteps incidentId={exposure.incidentId} />

      <h2 className="mt-8 text-xs font-semibold tracking-wider text-ash uppercase">Do this now</h2>
      <ol className="mt-3 space-y-3">
        {steps.map((step, i) => (
          <li key={step} className="flex gap-4">
            <span
              aria-hidden
              className="flex size-7 shrink-0 items-center justify-center rounded-full border border-line text-sm font-semibold tabular-nums"
            >
              {i + 1}
            </span>
            <p className="max-w-3xl pt-0.5 leading-relaxed">{step}</p>
          </li>
        ))}
        <li className="flex gap-4">
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-full border border-line text-sm font-semibold tabular-nums"
          >
            {steps.length + 1}
          </span>
          <div className="pt-0.5">
            {exposure.status === "open" ? (
              <>
                <p className="leading-relaxed">Acknowledge, so the PE firm knows your team is on it.</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run("acknowledge")}
                  className={`mt-3 ${BUTTON_PRIMARY} px-4 py-2`}
                >
                  Acknowledge
                </button>
              </>
            ) : (
              <>
                <p className="leading-relaxed">
                  <AcknowledgedBy userId={exposure.acknowledgedBy} />
                  {exposure.acknowledgedAt !== undefined && (
                    <span className="text-sm text-ash"> · {dateTime(exposure.acknowledgedAt)}</span>
                  )}
                </p>
                <p className="mt-1 text-sm text-ash">When every step above is done, mark it resolved.</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run("close")}
                  className={`mt-3 ${BUTTON_SECONDARY} px-4 py-2`}
                >
                  Mark resolved
                </button>
              </>
            )}
            {message && (
              <p role="status" className="mt-2 text-sm text-ash">
                {message}
              </p>
            )}
          </div>
        </li>
      </ol>

      <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-4 text-sm text-ash">
        <span>
          Link: <span className="text-paper">{SHARE_LABEL[share]}</span>
        </span>
        <span>
          How sure: <span className="text-paper">{candidate ? "Candidate (public DNS)" : "Reported by your team"}</span>
        </span>
        {heldForIncident.count > 0 && (
          <button type="button" onClick={() => onOpenTab("payments")} className="text-left hover:text-paper">
            Finance: <span className="text-amber">{heldForIncident.count} payment{heldForIncident.count === 1 ? "" : "s"} ({money(heldForIncident.cents)}) held</span> until a controller verifies →
          </button>
        )}
      </div>
    </section>
  );
}
