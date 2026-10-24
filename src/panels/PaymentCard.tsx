// One held payment. Company users see the Release form (the backend refuses the requester and
// non-controllers, which is demo beat 3); the PE firm only reads (canDecide=false).
// Refusals are expected outcomes (segregation of duties), shown inline, not as errors.
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { refusalOf } from "../layout/errors";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { dateTime, humanize, money } from "./format";
import { PAYMENT_STATUS } from "./labels";
import type { HeldPaymentRow } from "./types";
import { Chip } from "./ui";

// Who is looking, so the instructions address the right person (the backend enforces the rules).
export type Viewer = { id: Id<"users">; isController: boolean };

type Props = {
  row: HeldPaymentRow;
  canDecide: boolean;
  escalation?: string;
  viewer?: Viewer;
};

const HOUR = 3_600_000;

export function PaymentCard({ row, canDecide, escalation, viewer }: Props) {
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
  // Captured once: "due in about N hours" doesn't need to tick.
  const [now] = useState(() => Date.now());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"release" | "reject">();
  const [refusal, setRefusal] = useState<string>();

  const decide = async (action: "release" | "reject") => {
    // Both decisions are final and go on the record: confirm, naming where the money would go.
    const changed = row.bankChange
      ? `, an account changed by ${humanize(row.bankChange.requestChannel)} ${row.bankChange.daysBeforeIncident} days before the incident`
      : "";
    const question =
      action === "release"
        ? `Release ${money(payment.amountCents)} to ${row.vendorName} account ••${payment.accountLast4}${changed}?`
        : `Reject the ${money(payment.amountCents)} payment to ${row.vendorName}? This is final.`;
    // Only a controller who didn't request it can decide; everyone else goes straight to the
    // backend's refusal (demo beat 3), without a dialog in the way.
    const canActuallyDecide =
      viewer?.isController === true && viewer.id !== payment.requestedBy;
    if (canActuallyDecide && !window.confirm(question)) return;
    setBusy(action);
    setRefusal(undefined);
    const args = { paymentId: payment._id };
    const trimmed = note.trim();
    setRefusal(
      await refusalOf(() =>
        action === "release"
          ? release({ ...args, verificationNote: trimmed })
          : reject(trimmed ? { ...args, note: trimmed } : args),
      ),
    );
    setBusy(undefined);
  };

  const isHeld = payment.status === "held";
  const phone = (
    <span className="font-mono whitespace-nowrap text-amber">
      {row.phoneOnFile}
    </span>
  );
  const callLine = !canDecide ? (
    <>
      Waiting on {row.companyName}'s controller to verify by calling {phone},
      the number on file.
    </>
  ) : viewer?.id === payment.requestedBy ? (
    <>
      You requested this payment, so a controller must release it after calling{" "}
      {phone}, the number on file.
    </>
  ) : viewer?.isController ? (
    <>
      Call {row.vendorName} at {phone}, the number on file, never one from a
      recent email. Then release or reject.
    </>
  ) : (
    <>
      A controller verifies by calling {phone}, the number on file, then
      releases or rejects.
    </>
  );
  const msLeft =
    payment.dueDate === undefined ? undefined : payment.dueDate - now;
  const dueIn =
    msLeft === undefined
      ? ""
      : msLeft < HOUR
        ? " · due within the hour"
        : ` · due in about ${Math.round(msLeft / HOUR)} ${Math.round(msLeft / HOUR) === 1 ? "hour" : "hours"}`;
  return (
    <article className="rounded-lg border border-line bg-graphite p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          {/* Big for the person deciding; smaller in the firm's grid so the headline leads. */}
          <p
            className={`font-semibold tracking-tight tabular-nums ${viewer ? "text-4xl md:text-5xl" : "text-2xl"}`}
          >
            {money(payment.amountCents)}
          </p>
          <p className="text-sm text-ash">
            {row.companyName} → {row.vendorName}
            {/* With a bank change, the block below already shows the account. */}
            {!row.bankChange && ` · account ••${payment.accountLast4}`}
          </p>
        </div>
        <Chip tone={PAYMENT_STATUS[payment.status].tone}>
          {PAYMENT_STATUS[payment.status].label}
        </Chip>
      </header>

      {escalation && isHeld && (
        <p role="status" className="mt-3 text-sm font-semibold text-amber">
          Decision needed
          {dueIn}
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
            <span className="text-ash">
              ••
              {row.bankChange.lastVerifiedAccountLast4 ??
                row.bankChange.previousAccountLast4 ??
                "????"}
            </span>{" "}
            → ••{row.bankChange.accountLast4}
          </p>
          <p className="mt-1">
            Vendor bank details changed {row.bankChange.daysBeforeIncident} days
            before the incident, requested by{" "}
            {humanize(row.bankChange.requestChannel)}.
            {row.bankChange.lastVerifiedAccountLast4 &&
              ` ••${row.bankChange.lastVerifiedAccountLast4} is the last account confirmed by phone.`}{" "}
            This payment goes to ••{payment.accountLast4}.
          </p>
        </div>
      )}

      {isHeld && <p className="mt-3 text-sm">{callLine}</p>}

      {(row.holdReasons.length > 0 || row.notice || escalation) && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-ash">
            {isHeld ? "Why it's held" : "Why it was held"}
          </summary>
          {row.holdReasons.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-ash">
              {row.holdReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          {row.notice && (
            <p className="mt-2 max-w-prose leading-relaxed">{row.notice}</p>
          )}
          {escalation && isHeld && (
            <p className="mt-2 max-w-prose leading-relaxed">{escalation}</p>
          )}
        </details>
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
              disabled={busy !== undefined || note.trim() === ""}
              onClick={() => void decide("release")}
              className="rounded-md bg-amber px-3 py-1.5 text-sm font-semibold text-graphite disabled:opacity-50"
            >
              {busy === "release" ? "Releasing…" : "Release payment"}
            </button>
            <button
              type="button"
              disabled={busy !== undefined}
              onClick={() => void decide("reject")}
              className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-ash disabled:opacity-50"
            >
              {busy === "reject" ? "Rejecting…" : "Reject"}
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
                  <span className="font-medium">{a.actorName}</span>: {a.reason}{" "}
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
