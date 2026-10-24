// One held payment. Company controllers can release/reject; the PE firm only reads (canDecide=false).
// Refusals are expected outcomes (segregation of duties), shown inline, not as errors.
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { dateTime, money } from "./format";
import type { HeldPaymentRow } from "./types";
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
  canDecide: boolean;
};

export function PaymentCard({ row, canDecide }: Props) {
  const { payment } = row;
  const release = useMutation(api.payments.releasePayment);
  const reject = useMutation(api.payments.rejectPayment);
  const audit = useQuery(api.payments.getPaymentAudit, {
    paymentId: payment._id,
  });
  // Audit rows carry ids; resolve who acted and which incident for the reader.
  const users = useQuery(api.blastRadius.listUsers, {});
  const incidents = useQuery(api.blastRadius.listIncidents, {});
  const actorName = (actor: Doc<"auditLog">["actor"]) =>
    actor === "system"
      ? "System"
      : (users?.find((u) => u._id === actor)?.name ?? "Unknown user");
  const incidentName = (id: Doc<"auditLog">["incidentId"]) => {
    const incident = incidents?.find((i) => i._id === id);
    return incident ? `${incident.assetName} incident` : undefined;
  };
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string>();

  const decide = async (action: "release" | "reject") => {
    setBusy(true);
    setRefusal(undefined);
    try {
      const args = { paymentId: payment._id };
      const trimmed = note.trim();
      const res =
        action === "release"
          ? await release({ ...args, verificationNote: trimmed })
          : await reject(trimmed ? { ...args, note: trimmed } : args);
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
        <div className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          <p className="font-mono text-base">
            {/* "Old" = last account confirmed by phone; fall back to the change before this one. */}
            ••
            {row.bankChange.lastVerifiedAccountLast4 ??
              row.bankChange.previousAccountLast4 ??
              "????"}{" "}
            → ••{row.bankChange.accountLast4}
          </p>
          <p className="mt-1">
            Vendor bank details changed {row.bankChange.daysBeforeIncident} days
            before the breach, requested by{" "}
            {row.bankChange.requestChannel.replace("_", " ")}.
            {row.bankChange.lastVerifiedAccountLast4 &&
              ` ••${row.bankChange.lastVerifiedAccountLast4} is the last account confirmed by phone.`}{" "}
            This payment goes to ••{payment.accountLast4}.
          </p>
        </div>
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
                  <span className="font-medium">{actorName(a.actor)}</span>:{" "}
                  {a.reason}{" "}
                  <span className="text-xs text-ash">
                    (
                    {[a.rule, incidentName(a.incidentId)]
                      .filter(Boolean)
                      .join(" · ")}
                    )
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}
