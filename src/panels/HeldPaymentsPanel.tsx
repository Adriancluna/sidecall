import type { Id } from "../../convex/_generated/dataModel";
import type { HeldPaymentRow } from "./types";
import { PaymentCard } from "./PaymentCard";
import type { Viewer } from "./usePaymentDecision";
import { Empty, Skeleton } from "./ui";

type Props = {
  title: string;
  rows: HeldPaymentRow[] | undefined;
  intro?: string;
  // "Decision needed" text per payment (escalation alerts), company view only.
  escalations?: Map<Id<"payments">, string>;
  viewer?: Viewer;
};

export function HeldPaymentsPanel({
  title,
  rows,
  intro,
  escalations,
  viewer,
}: Props) {
  return (
    // The tab already names the list, so the title is for screen readers; cards sit on the page,
    // not in a card around them (no boxes inside boxes).
    <section aria-label={title}>
      {intro && <p className="mb-5 max-w-3xl text-ash">{intro}</p>}
      <div>
        {rows === undefined ? (
          <Skeleton />
        ) : rows.length === 0 ? (
          <Empty>No payments held.</Empty>
        ) : (
          <div
            className={`grid gap-4 ${rows.length > 1 ? "lg:grid-cols-2" : "max-w-3xl"}`}
          >
            {rows.map((row) => (
              <PaymentCard
                key={row.payment._id}
                row={row}
                escalation={escalations?.get(row.payment._id)}
                viewer={viewer}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
