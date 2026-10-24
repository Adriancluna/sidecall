import type { CurrentUser } from "../auth/currentUser";
import type { HeldPaymentRow } from "./types";
import { PaymentCard } from "./PaymentCard";
import { Card, Empty } from "./ui";

type Props = {
  title: string;
  rows: HeldPaymentRow[] | undefined;
  actingUser?: CurrentUser;
  canDecide: boolean;
  intro?: string;
};

export function HeldPaymentsPanel({
  title,
  rows,
  actingUser,
  canDecide,
  intro,
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
              actingUser={actingUser}
              canDecide={canDecide}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
