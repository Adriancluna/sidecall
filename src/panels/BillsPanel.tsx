// Bills to pay (company view): the AP clerk requests a payment; the backend decides whether it's
// held (vendor under an active incident) and flagged (paying recently changed bank details).
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { friendlyError } from "../layout/errors";
import { money, shortDate } from "./format";
import { paymentLook } from "./labels";
import { BUTTON_SECONDARY } from "./styles";
import { Card, Empty, LookChip, Skeleton } from "./ui";

const TEXT_TONE = { amber: "text-amber", danger: "text-danger", ok: "text-ok" };

export function BillsPanel() {
  const bills = useQuery(api.payments.getMyBills, {});
  // Bill rows only carry the payment's status; the held-payments query (same subscription as the
  // company view's) says which ones went through a hold, so those read "Released", not "Paid".
  const heldPath = new Map(
    (useQuery(api.payments.getHeldPayments, {}) ?? []).map((r) => [
      r.payment._id,
      r.payment,
    ]),
  );
  return (
    <Card title="Bills to pay">
      {bills === undefined ? (
        <Skeleton />
      ) : bills.length === 0 ? (
        <Empty>No bills.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {bills.map((b) => (
            <BillRow
              key={b.bill._id}
              billId={b.bill._id}
              description={b.bill.description}
              vendorName={b.vendorName}
              amountCents={b.bill.amountCents}
              dueDate={b.bill.dueDate}
              payment={
                b.payment
                  ? (heldPath.get(b.payment._id) ?? b.payment)
                  : undefined
              }
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

type RowProps = {
  billId: Id<"bills">;
  description: string;
  vendorName: string;
  amountCents: number;
  dueDate: number;
  payment?: Pick<Doc<"payments">, "status" | "heldByIncidentId" | "purchaseMandateId">;
};

function BillRow({
  billId,
  description,
  vendorName,
  amountCents,
  dueDate,
  payment,
}: RowProps) {
  const requestPayment = useMutation(api.payments.requestPayment);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    tone: "amber" | "danger" | "ok";
    text: string;
  }>();

  const request = async () => {
    setBusy(true);
    setResult(undefined);
    try {
      const res = await requestPayment({ billId });
      if (!res.ok) {
        setResult({ tone: "danger", text: res.reason });
      } else if (res.held) {
        setResult({
          tone: "amber",
          text: `Held until verified: ${vendorName} is under an active incident${
            res.flagged
              ? ", and this payment goes to an account changed by email"
              : ""
          }.`,
        });
      } else {
        setResult({ tone: "ok", text: res.automatic ? "Automatically paid under your controller’s approval (demo ledger)." : "Payment requested." });
      }
    } catch (err) {
      setResult({ tone: "danger", text: friendlyError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{description}</p>
          <p className="text-sm text-ash">
            {vendorName}, due {shortDate(dueDate)}
          </p>
          {payment?.purchaseMandateId && <p className="mt-1 text-xs text-ok">Automatically settled · demo ledger</p>}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-semibold tabular-nums">
            {money(amountCents)}
          </span>
          {payment ? (
            <LookChip look={paymentLook(payment)} />
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void request()}
              className={BUTTON_SECONDARY}
            >
              {busy ? "Requesting…" : "Request payment"}
            </button>
          )}
        </div>
      </div>
      {result && (
        <p role="status" className={`mt-2 text-sm ${TEXT_TONE[result.tone]}`}>
          {result.text}
        </p>
      )}
    </li>
  );
}
