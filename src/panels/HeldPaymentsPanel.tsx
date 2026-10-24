import type { Id } from "../../convex/_generated/dataModel";
import type { HeldPaymentRow } from "./types";
import { PaymentCard } from "./PaymentCard";
import type { Viewer } from "./usePaymentDecision";
import { Empty } from "./ui";

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
    // A heading over the cards rather than a card around them: no boxes inside boxes.
    <section aria-label={title}>
      <h2 className="text-lg font-semibold">{title}</h2>
      {intro && <p className="mt-1 max-w-3xl text-sm text-ash">{intro}</p>}
      <div className="mt-5">
        {rows === undefined ? (
          <Empty>Loading…</Empty>
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
