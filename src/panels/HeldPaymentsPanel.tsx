import type { Id } from "../../convex/_generated/dataModel";
import type { HeldPaymentRow } from "./types";
import { PaymentCard } from "./PaymentCard";
import { Card, Empty } from "./ui";

type Props = {
  title: string;
  rows: HeldPaymentRow[] | undefined;
  canDecide: boolean;
  intro?: string;
  // "Decision needed" text per payment (escalation alerts), company view only.
  escalations?: Map<Id<"payments">, string>;
};

export function HeldPaymentsPanel({
  title,
  rows,
  canDecide,
  intro,
  escalations,
}: Props) {
  return (
    <Card title={title}>
      {intro && <p className="mb-3 text-sm text-ash">{intro}</p>}
      {rows === undefined ? (
        <Empty>Loading…</Empty>
      ) : rows.length === 0 ? (
        <Empty>No payments held.</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((row) => (
            <PaymentCard
              key={row.payment._id}
              row={row}
              canDecide={canDecide}
              escalation={escalations?.get(row.payment._id)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
