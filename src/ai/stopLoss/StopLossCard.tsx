// Role 4: "Stop-losses to set up", the controls a company sets up before a shared vendor has an
// incident. Not mounted anywhere yet; README.md says where it fits. Read-only: adopting a step
// goes through the existing Response playbook switches (two-person rule included), so this card
// only points there through the optional callback.
import type { Id } from "../../../convex/_generated/dataModel";
import { Card, Chip, Skeleton, Tile } from "../../panels/ui";
import { BUTTON_SECONDARY } from "../../panels/styles";
import {
  useStopLossAdvice,
  type StopLossBrief,
  type StopLossRecommendation,
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
  return <StopLossView brief={brief} onOpenPlaybookStep={advice.portfolio ? undefined : onOpenPlaybookStep} />;
}

export function StopLossView({
  brief,
  onOpenPlaybookStep,
}: { brief: StopLossBrief } & Pick<StopLossCardProps, "onOpenPlaybookStep">) {
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
