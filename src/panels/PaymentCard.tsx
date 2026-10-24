// One held payment. Company controllers can release/reject; the PE firm only reads (canDecide=false).
// Refusals are expected outcomes (segregation of duties), shown inline, not as errors.
import { useState } from "react";
import type { Doc } from "../../convex/_generated/dataModel";
import type { HeldPaymentRow } from "../demo/contract";
import {
  usePaymentAudit,
  useRejectPayment,
  useReleasePayment,
} from "../demo/mockBackend";
import { dateTime, money } from "./format";
import { Chip } from "./ui";

const STATUS_TONE = {
  held: "amber",
  paid: "ok",
  rejected: "danger",
  pending: "muted",
  released: "ok",
} as const;

type Props = {
  row: HeldPaymentRow;
  actingUser?: Doc<"users">;
  canDecide: boolean;
};

export function PaymentCard({ row, actingUser, canDecide }: Props) {
  const { payment } = row;
  const release = useReleasePayment();
  const reject = useRejectPayment();
  const audit = usePaymentAudit(payment._id);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string>();

  const decide = async (action: "release" | "reject") => {
    if (!actingUser) return;
    setBusy(true);
    setRefusal(undefined);
    try {
      const res =
        action === "release"
          ? await release({
              paymentId: payment._id,
              actingUserId: actingUser._id,
              verificationNote: note.trim(),
            })
          : await reject({
              paymentId: payment._id,
              actingUserId: actingUser._id,
            });
      if (!res.ok) setRefusal(res.reason);
    } catch (err) {
      setRefusal(
        err instanceof Error ? err.message : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const isHeld = payment.status === "held";
  return (
    <article className="rounded-lg border border-line bg-graphite p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-2xl font-semibold tabular-nums">
            {money(payment.amountCents)}
          </p>
          <p className="text-sm text-ash">
            {row.companyName} → {row.vendorName} · account ••
            {payment.accountLast4}
          </p>
        </div>
        <Chip tone={STATUS_TONE[payment.status]}>
          {payment.status === "held" ? "Held until verified" : payment.status}
        </Chip>
      </header>

      {row.bankChange && (
        <p className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          Vendor bank details changed {row.bankChange.daysBeforeIncident} days
          before the breach, requested by{" "}
          {row.bankChange.requestChannel.replace("_", " ")}: new account ••
          {row.bankChange.accountLast4}. This payment goes to ••
          {payment.accountLast4}.
        </p>
      )}

      {row.holdReasons.length > 0 && (
        <ul className="mt-3 list-disc space-y-0.5 pl-5 text-sm text-ash">
          {row.holdReasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      {row.notice && (
        <p className="mt-3 text-sm leading-relaxed">{row.notice}</p>
      )}

      <p className="mt-3 text-sm">
        Verify by calling{" "}
        <span className="font-mono text-amber">{row.phoneOnFile}</span>, the
        number on file. Never use a number from a recent email.
      </p>

      {canDecide && isHeld && (
        <div className="mt-4 space-y-2">
          <label
            className="block text-xs text-ash"
            htmlFor={`note-${payment._id}`}
          >
            Verification note (who you called, what they confirmed)
          </label>
          <textarea
            id={`note-${payment._id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-line bg-panel px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || note.trim() === ""}
              onClick={() => void decide("release")}
              className="rounded-md bg-amber px-3 py-1.5 text-sm font-semibold text-graphite disabled:opacity-50"
            >
              Release payment
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void decide("reject")}
              className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-ash disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {refusal && (
        <p
          role="alert"
          className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          Refused: {refusal}
        </p>
      )}

      {audit && audit.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-ash">
            Audit log ({audit.length})
          </summary>
          <ol className="mt-2 space-y-1">
            {audit.map((a) => (
              <li key={a._id} className="flex gap-3">
                <span className="w-28 shrink-0 text-xs text-ash">
                  {dateTime(a.at)}
                </span>
                <span className="w-16 shrink-0 font-mono text-xs">
                  {a.action}
                </span>
                <span>
                  {a.reason}{" "}
                  <span className="text-xs text-ash">({a.rule})</span>
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}
