// One held payment. Company controllers can release/reject; the PE firm only reads (canDecide=false).
// Refusals are expected outcomes (segregation of duties), shown inline, not as errors.
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { friendlyError } from "../layout/errors";
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

const STATUS_LABEL = {
  held: "Held until verified",
  paid: "Released",
  rejected: "Rejected",
  pending: "Pending",
  released: "Released",
} as const;

type Props = {
  row: HeldPaymentRow;
  canDecide: boolean;
  escalation?: string;
};

export function PaymentCard({ row, canDecide, escalation }: Props) {
  const { payment } = row;
  const release = useMutation(api.payments.releasePayment);
  const reject = useMutation(api.payments.rejectPayment);
  const audit = useQuery(api.payments.getPaymentAudit, {
    paymentId: payment._id,
  });
  // Audit rows carry the actor's name (people and agents); resolve the incident for the reader.
  const incidents = useQuery(api.blastRadius.listIncidents, {});
  const incidentName = (id: Doc<"auditLog">["incidentId"]) => {
    const incident = incidents?.find((i) => i._id === id);
    return incident ? `${incident.assetName} incident` : undefined;
  };
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string>();

  const decide = async (action: "release" | "reject") => {
    // Rejecting is final and writes to the audit log: confirm first. Release already needs a note.
    if (
      action === "reject" &&
      !window.confirm(
        `Reject the ${money(payment.amountCents)} payment to ${row.vendorName}? This is final.`,
      )
    ) {
      return;
    }
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
      setRefusal(friendlyError(err));
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
          {STATUS_LABEL[payment.status]}
        </Chip>
      </header>

      {escalation && payment.status === "held" && (
        <p
          role="status"
          className="mt-3 rounded-md border border-amber/50 bg-amber/10 px-3 py-2 text-sm text-amber"
        >
          {escalation}
        </p>
      )}

      {row.decision && (
        <p
          className={`mt-3 rounded-md border px-3 py-2 text-sm ${
            row.decision.status === "paid"
              ? "border-ok/40 bg-ok/10 text-ok"
              : "border-line bg-panel text-paper"
          }`}
        >
          {row.decision.status === "paid" ? "Released" : "Rejected"} by{" "}
          {row.decision.byName ?? "a controller"}
          {row.decision.note && ` · “${row.decision.note}”`}
          {row.decision.at !== null && ` · ${dateTime(row.decision.at)}`}
        </p>
      )}

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
        <p className="mt-3 text-xs font-semibold text-ash">
          {isHeld ? "Why it's held" : "Why it was held"}
        </p>
      )}
      {row.holdReasons.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ash">
          {row.holdReasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      {row.notice && (
        <p className="mt-3 text-sm leading-relaxed">{row.notice}</p>
      )}

      {isHeld && (
        <p className="mt-3 text-sm">
          Verify by calling{" "}
          <span className="font-mono text-amber">{row.phoneOnFile}</span>, the
          number on file. Never use a number from a recent email.
        </p>
      )}

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
            name="verificationNote"
            autoComplete="off"
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
              <li key={a._id} className="flex flex-wrap gap-x-3 gap-y-0.5">
                <span className="w-28 shrink-0 text-xs text-ash">
                  {dateTime(a.at)}
                </span>
                <span className="w-16 shrink-0 font-mono text-xs">
                  {a.action}
                </span>
                <span>
                  <span className="font-medium">{a.actorName}</span>:{" "}
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
