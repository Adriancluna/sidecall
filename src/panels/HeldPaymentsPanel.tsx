import type { Id } from "../../convex/_generated/dataModel";
import type { HeldPaymentRow } from "./types";
import { PaymentCard, type Viewer } from "./PaymentCard";
import { Card, Empty } from "./ui";

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
    <Card title={title}>
      {intro && <p className="mb-3 text-sm text-ash">{intro}</p>}
      {rows === undefined ? (
        <Empty>Loading…</Empty>
      ) : rows.length === 0 ? (
        <Empty>No payments held.</Empty>
      ) : (
        <div
          className={`grid gap-3 ${rows.length > 1 ? "lg:grid-cols-2" : ""}`}
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
    </Card>
  );
}
