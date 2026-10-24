// Role 4: "Stop-losses to set up", the controls a company sets up before a shared vendor has an
// incident. Not mounted anywhere yet; README.md says where it fits. Read-only: adopting a step
// goes through the existing Response playbook switches (two-person rule included), so this card
// only points there through the optional callback.
import type { Id } from "../../../convex/_generated/dataModel";
import { Card, Chip, Skeleton, Tile } from "../../panels/ui";
import { BUTTON_SECONDARY } from "../../panels/styles";
import { money } from "../../panels/format";
import {
  useStopLossAdvice,
  type StopLossBrief,
  type StopLossRecommendation,
  type StopLossAdvice,
} from "./useStopLossAdvice";

type Priority = StopLossRecommendation["priority"];
type PlaybookAction = NonNullable<StopLossRecommendation["playbookAction"]>;
type PlaybookMode = NonNullable<StopLossRecommendation["recommendedMode"]>;

const PRIORITY: Record<Priority, string> = { now: "Now", soon: "Next", later: "Later" };
const OWNER: Record<StopLossRecommendation["owner"], string> = {
  it: "IT lead",
  controller: "Controller",
  ap_clerk: "AP clerk",
  firm: "Northpass (the firm)",
};
// The Response playbook's own words for each mode (src/panels/ResponsePlaybook.tsx).
const MODE_LABEL: Record<PlaybookMode, string> = {
  notify: "Notify only",
  prepare: "One click",
  act: "Pre-approved",
};
type Readiness = StopLossAdvice["readiness"][number];
const ACTION_LABEL = { pause_shared_login: "Pause shared login", revoke_vendor_tokens: "Revoke vendor tokens" };
const READINESS_LABEL = { assessed: "Recorded evidence assessed", needs_evidence: "Relationship evidence needed", partial: "Partial assessment" };

export function ReadinessPreview({ readiness }: { readiness: Readiness }) {
  return (
    <section className="mt-5 rounded-xl border border-line bg-graphite p-4" aria-label="Control eligibility preview">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-paper">What your controls currently allow</h3>
        <Chip tone={readiness.status === "assessed" ? "muted" : "amber"}>{READINESS_LABEL[readiness.status]}</Chip>
      </div>
      <p className="mt-2 text-sm text-ash">Payment hold rule: {readiness.paymentHoldsEnabled ? "enabled" : "disabled"}. This preview does not change access, hold money or adopt a control.</p>
      {readiness.status !== "assessed" && (
        <p className="mt-2 text-sm text-amber">{readiness.status === "partial"
          ? "Some records exceeded the assessment limit. Listed amounts and controls may be incomplete."
          : "Record the company's vendor and access relationships before assessing coverage."}</p>
      )}
      <div className="mt-3 divide-y divide-line">
        {readiness.assets.map(asset => (
          <details key={asset.assetName} className="py-3">
            <summary className="cursor-pointer text-sm font-medium text-paper">
              {asset.assetName} <span className="ml-2 font-normal text-ash">{asset.source === "dns_inferred" ? "Candidate · DNS" : "Company-reported relationship"}</span>
            </summary>
            <p className="mt-2 text-xs text-ash">Recorded unpaid payments: {money(asset.unpaidCents)}.</p>
            <ul className="mt-3 space-y-3">
              {asset.actions.map(action => (
                <li key={action.action} className="text-sm">
                  <p className="text-paper">{ACTION_LABEL[action.action]}</p>
                  <p className="mt-1 text-ash">Configured: {MODE_LABEL[action.configuredMode]} · Eligible: {action.eligibleMode ? MODE_LABEL[action.eligibleMode] : "No access step"}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ash">{action.reason}</p>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ash">{readiness.limits}</p>
    </section>
  );
}

export type StopLossCardProps = {
  // Firm view only: show this company's brief instead of the portfolio rollup. Ignored for a
  // company user, who only ever gets its own.
  companyId?: Id<"companies">;
  // Optional, company view: open the Response playbook at this step so the IT lead or controller
  // can set the recommended mode there. Without it the card is read-only.
  onOpenPlaybookStep?: (action: PlaybookAction, recommendedMode: PlaybookMode) => void;
};

// Container: subscribes and picks the brief. Use StopLossView to render a brief you already have.
export function StopLossCard({ companyId, onOpenPlaybookStep }: StopLossCardProps) {
  const advice = useStopLossAdvice();
  if (advice === undefined)
    return (
      <Card title="Stop-losses to set up">
        <Skeleton rows={4} />
      </Card>
    );
  const brief = advice.portfolio
    ? companyId
      ? advice.companies.find((c) => c.companyId === companyId)
      : advice.portfolio
    : advice.companies[0];
  if (!brief) return null;
  // The firm recommends but never changes a company's playbook, so it gets no button.
  return <StopLossView brief={brief}
    readiness={advice.readiness.find(r => r.companyId === brief.companyId)}
    onOpenPlaybookStep={advice.portfolio ? undefined : onOpenPlaybookStep} />;
}

export function StopLossView({
  brief,
  onOpenPlaybookStep,
  readiness,
}: { brief: StopLossBrief; readiness?: Readiness } & Pick<StopLossCardProps, "onOpenPlaybookStep">) {
  const groups = (["now", "soon", "later"] as const)
    .map((p) => ({ priority: p, items: brief.recommendations.filter((r) => r.priority === p) }))
    .filter((g) => g.items.length > 0);
  const title =
    brief.scope === "portfolio" ? "Stop-losses across the portfolio" : "Stop-losses to set up";

  return (
    <Card
      title={title}
      aside={
        <span className="flex flex-wrap items-center gap-2 text-xs text-ash">
          {brief.recommendations.length} to set up
          <Chip tone="muted">
            {brief.source === "cache" ? "Written with AI, from Sidecall's rules" : "Sidecall's standard advice"}
          </Chip>
        </span>
      }
    >
      <p className="max-w-3xl text-sm leading-relaxed text-paper">{brief.summary}</p>
      {readiness && <ReadinessPreview readiness={readiness} />}
      {groups.map((g) => (
        <section key={g.priority} className="mt-6">
          <h3 className="text-xs font-semibold tracking-wider text-ash uppercase">{PRIORITY[g.priority]}</h3>
          <ol className="mt-3 space-y-4">
            {g.items.map((r) => (
              <li key={r.id} className="rounded-xl border border-line bg-graphite p-4">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <p className="font-medium text-paper">{r.title}</p>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-ash">{OWNER[r.owner]}</span>
                    {r.recommendedMode && <Chip tone="amber">{MODE_LABEL[r.recommendedMode]}</Chip>}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ash">{r.why}</p>
                <ul className="mt-3 space-y-1.5">
                  {r.steps.map((step) => (
                    <li key={step} className="flex gap-2 text-sm leading-snug text-paper">
                      <Tile hollow className="mt-1.5 size-1.5 text-ash" />
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
                {r.playbookAction && r.recommendedMode && onOpenPlaybookStep && (
                  <button
                    type="button"
                    className={`${BUTTON_SECONDARY} mt-3`}
                    onClick={() => onOpenPlaybookStep(r.playbookAction!, r.recommendedMode!)}
                  >
                    Open in Response playbook
                  </button>
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </Card>
  );
}
