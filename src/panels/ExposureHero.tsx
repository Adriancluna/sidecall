// The IT lead's first screen during an incident, as a case file. Left: what's wrong in one
// sentence, why this company, and what already ran automatically. Right: the steps to do now and
// one button to tell the firm you're on it. Never names who was hit.
import type { Doc } from "../../convex/_generated/dataModel";
import { AcknowledgedBy } from "./AcknowledgedBy";
import { dateTime, money } from "./format";
import { URGENCY } from "./labels";
import { exposureHeadline, isCandidate, nextSteps, SHARE_LABEL, shareTypeOf } from "./exposureCopy";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "./styles";
import { Chip, Eyebrow, Fact, LookChip } from "./ui";
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
  const contained = incident?.containedAt !== null && incident?.containedAt !== undefined;

  return (
    <section
      aria-labelledby="hero-title"
      className="grid items-start gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,460px)]"
    >
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">
        <Eyebrow>
          <LookChip look={URGENCY[exposure.urgency]} />
          <span className="font-semibold text-paper">{urgent ? "Act today" : "Review this week"}</span>
          <span>
            Active incident at {vendor}
            {incident && ` · ${dateTime(incident.createdAt)}`}
          </span>
          {contained && <Chip tone="ok">Vendor has contained it</Chip>}
        </Eyebrow>

        <h1 id="hero-title" className="mt-6 max-w-3xl text-headline font-semibold text-balance">
          {exposureHeadline(share, vendor, candidate)}
        </h1>

        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ash">
          {exposure.reasons.join(" ")}{" "}
          {candidate
            ? "This link is a guess from public DNS records, so first confirm whether you use them."
            : "Your team reported this link when you joined the portfolio."}
        </p>

        {exposure.path && (
          <div className="mt-6 flex max-w-2xl flex-wrap items-center gap-x-3 gap-y-2">
            <Chip tone="amber">Proven at another portfolio company</Chip>
            <p className="leading-relaxed">
              The same path is <strong className="font-semibold">reachable here, not tested here</strong>
              {exposure.path.techniqueName && <span className="text-ash"> · {exposure.path.techniqueName}</span>}. Nobody
              touched your systems.
            </p>
          </div>
        )}
      </div>

      <aside
        aria-label="Do this now"
        className="self-start rounded-tile border border-line bg-panel p-5 md:p-6 lg:col-start-2 lg:row-span-2 lg:row-start-1"
      >
        <h2 className="text-lg font-semibold">Do this now</h2>
        <ol className="mt-5 space-y-5">
          {steps.map((step, i) => (
            <li key={step} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3">
              <StepNumber n={i + 1} />
              <p className="pt-0.5 leading-relaxed">{step}</p>
            </li>
          ))}
          <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 border-t border-line pt-5">
            <StepNumber n={steps.length + 1} done={exposure.status !== "open"} />
            <div className="min-w-0 pt-0.5">
              {exposure.status === "open" ? (
                <>
                  <p className="leading-relaxed">Acknowledge, so the PE firm knows your team is on it.</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run("acknowledge")}
                    className={`mt-3 w-full ${BUTTON_PRIMARY} px-5 py-2.5 text-base sm:w-auto`}
                  >
                    {busy ? "Acknowledging…" : "Acknowledge"}
                  </button>
                </>
              ) : (
                <>
                  <p className="leading-relaxed">
                    <AcknowledgedBy userId={exposure.acknowledgedBy} />
                    {exposure.acknowledgedAt !== undefined && (
                      <span className="block text-sm text-ash">{dateTime(exposure.acknowledgedAt)}</span>
                    )}
                  </p>
                  <p className="mt-2 text-sm text-ash">When every step above is done, mark it resolved.</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run("close")}
                    className={`mt-3 ${BUTTON_SECONDARY}`}
                  >
                    Mark resolved
                  </button>
                </>
              )}
              {message && (
                <p role="status" className="mt-3 text-sm text-paper motion-safe:animate-arrive">
                  {message}
                </p>
              )}
            </div>
          </li>
        </ol>
      </aside>

      <div className="min-w-0 lg:col-start-1 lg:row-start-2">
        <dl className="grid max-w-2xl grid-cols-2 gap-x-8 gap-y-4 border-t border-line pt-5 sm:grid-cols-3">
          <Fact label="How you're linked">{SHARE_LABEL[share]}</Fact>
          <Fact label="How sure">{candidate ? "Candidate (public DNS)" : "Reported by your team"}</Fact>
          {heldForIncident.count > 0 && (
            <Fact label="Finance">
              <button
                type="button"
                onClick={() => onOpenTab("payments")}
                className="text-left text-amber underline-offset-4 hover:underline"
              >
                {heldForIncident.count} payment{heldForIncident.count === 1 ? "" : "s"} ({money(heldForIncident.cents)})
                held until a controller verifies →
              </button>
            </Fact>
          )}
        </dl>

        {/* What already ran from this company's response playbook (renders nothing without one). */}
        <PlanSteps incidentId={exposure.incidentId} />
      </div>
    </section>
  );
}

function StepNumber({ n, done = false }: { n: number; done?: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex size-7 items-center justify-center rounded-chip border text-sm font-semibold tabular-nums ${
        done ? "border-ok/50 bg-ok/10 text-ok" : "border-line text-ash"
      }`}
    >
      {done ? "✓" : n}
    </span>
  );
}
