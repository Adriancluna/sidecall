// Role 4: "What to do now" after a breach, for one exposed company. Not mounted anywhere yet;
// README.md says where it fits. Read-only: the steps that run something (the pre-approved pause,
// releasing a payment) keep their own buttons in the existing panels, so this card only points
// there through the optional callbacks.
import type { Id } from "../../../convex/_generated/dataModel";
import { Card, Chip, Skeleton, Tile, type Tone } from "../../panels/ui";
import { BUTTON_SECONDARY } from "../../panels/styles";
import { useBreachFixAdvice, type BreachFixAdvice, type BreachFixRecommendation } from "./useBreachFixAdvice";

type Priority = BreachFixRecommendation["priority"];
type Status = NonNullable<BreachFixRecommendation["status"]>;

const PRIORITY: Record<Priority, string> = { now: "Now", soon: "Next", later: "Later" };
const STATUS: Record<Status, { label: string; tone: Tone }> = {
  done: { label: "Done", tone: "ok" },
  ready: { label: "Ready, one click", tone: "amber" },
  todo: { label: "To do", tone: "muted" },
};
const OWNER: Record<BreachFixRecommendation["owner"], string> = {
  it: "IT lead",
  controller: "Controller",
  ap_clerk: "AP clerk",
  firm: "Northpass (the firm)",
};

export type BreachFixCardProps = {
  exposureId: Id<"exposures">;
  // Optional: open the existing "Your pre-approved steps" block for a ready pause or revoke.
  onOpenPlaybookStep?: (action: "pause_shared_login" | "revoke_vendor_tokens") => void;
  // Optional: open the held payments panel from the payment steps.
  onOpenHeldPayments?: () => void;
};

// Container: subscribes and renders. Use BreachFixView directly to render data you already have.
export function BreachFixCard({ exposureId, ...actions }: BreachFixCardProps) {
  const advice = useBreachFixAdvice(exposureId);
  if (advice === undefined)
    return (
      <Card title="What to do now">
        <Skeleton rows={4} />
      </Card>
    );
  if (advice === null) return null;
  return <BreachFixView advice={advice} {...actions} />;
}

export function BreachFixView({
  advice,
  onOpenPlaybookStep,
  onOpenHeldPayments,
}: { advice: BreachFixAdvice } & Omit<BreachFixCardProps, "exposureId">) {
  const groups = (["now", "soon", "later"] as const)
    .map((p) => ({ priority: p, items: advice.recommendations.filter((r) => r.priority === p) }))
    .filter((g) => g.items.length > 0);
  const done = advice.recommendations.filter((r) => r.status === "done").length;

  return (
    <Card
      title="What to do now"
      aside={
        <span className="flex flex-wrap items-center gap-2 text-xs text-ash">
          {done} of {advice.recommendations.length} done
          <Chip tone="muted">{advice.source === "cache" ? "Written with AI, from Sidecall's rules" : "Sidecall's standard plan"}</Chip>
        </span>
      }
    >
      <p className="max-w-3xl text-sm leading-relaxed text-paper">{advice.summary}</p>
      {groups.map((g) => (
        <section key={g.priority} className="mt-6">
          <h3 className="text-xs font-semibold tracking-wider text-ash uppercase">{PRIORITY[g.priority]}</h3>
          <ol className="mt-3 space-y-4">
            {g.items.map((r) => (
              <li key={r.id} className="rounded-xl border border-line bg-graphite p-4">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <p className={`font-medium ${r.status === "done" ? "text-ash" : "text-paper"}`}>{r.title}</p>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-ash">{OWNER[r.owner]}</span>
                    {r.status && <Chip tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Chip>}
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
                <RecommendationAction
                  rec={r}
                  onOpenPlaybookStep={onOpenPlaybookStep}
                  onOpenHeldPayments={onOpenHeldPayments}
                />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </Card>
  );
}

function RecommendationAction({
  rec,
  onOpenPlaybookStep,
  onOpenHeldPayments,
}: { rec: BreachFixRecommendation } & Omit<BreachFixCardProps, "exposureId">) {
  if (rec.status === "done") return null;
  const action = rec.playbookAction;
  if ((action === "pause_shared_login" || action === "revoke_vendor_tokens") && rec.status === "ready" && onOpenPlaybookStep)
    return (
      <button type="button" className={`${BUTTON_SECONDARY} mt-3`} onClick={() => onOpenPlaybookStep(action)}>
        Open pre-approved steps
      </button>
    );
  if (action === "hold_payments" && onOpenHeldPayments)
    return (
      <button type="button" className={`${BUTTON_SECONDARY} mt-3`} onClick={onOpenHeldPayments}>
        Open held payments
      </button>
    );
  return null;
}
