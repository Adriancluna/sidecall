// One held payment, in parts the hero and the lists share. Company users get the decision form
// (the backend refuses the requester and non-controllers, which is demo beat 2); the PE firm only
// reads (no viewer). Refusals are expected outcomes (segregation of duties), shown calm, inline.
import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { dateTime, humanize, money } from "./format";
import { paymentLook } from "./labels";
import type { HeldPaymentRow } from "./types";
import { LookChip } from "./ui";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "./styles";
import { dueIn, usePaymentDecision, type Viewer } from "./usePaymentDecision";

type Decision = ReturnType<typeof usePaymentDecision>;

// The evidence that makes this hold matter: the account confirmed by phone vs. the one that
// arrived by email. Large in the hero, one line in lists.
export function AccountChange({ row, size = "large" }: { row: HeldPaymentRow; size?: "large" | "compact" }) {
  const change = row.bankChange;
  if (!change) return null;
  const old = change.lastVerifiedAccountLast4 ?? change.previousAccountLast4 ?? "????";
  const oldLabel = change.lastVerifiedAccountLast4 ? "Last confirmed by phone" : "Previous account";
  const how = humanize(change.requestChannel);
  const goesHere = row.payment.accountLast4 === change.accountLast4;

  if (size === "compact") {
    return (
      <p className="mt-3 rounded-chip border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-paper">
        <span className="text-ash tabular-nums"><Last4 digits={old} /></span>
        <span aria-hidden className="mx-1.5 text-ash">→</span>
        <span className="sr-only"> changed to </span>
        <span className="font-semibold tabular-nums"><Last4 digits={change.accountLast4} /></span>
        <span className="text-danger">
          {" "}
          · changed by {how} {change.daysBeforeIncident} days before the incident
        </span>
        {!goesHere && <span className="text-ash"> · this payment goes to ••{row.payment.accountLast4}</span>}
      </p>
    );
  }

  return (
    <figure className="grid items-stretch gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.25fr)]">
      <figcaption className="sr-only">
        Bank account changed from ••{old} to ••{change.accountLast4} by {how}, {change.daysBeforeIncident} days before
        the incident.
      </figcaption>
      <div aria-hidden className="rounded-tile border border-line bg-panel p-4 md:p-5">
        <p className="text-sm text-ash">{oldLabel}</p>
        <p className="mt-2 text-4xl font-medium tracking-tight tabular-nums text-ash">
          <Last4 digits={old} />
        </p>
      </div>
      <div aria-hidden className="flex items-center justify-center text-2xl text-ash">
        <span className="sm:hidden">↓</span>
        <span className="hidden sm:inline">→</span>
      </div>
      <div aria-hidden className="rounded-tile border border-danger/55 bg-danger/[0.07] p-4 md:p-5">
        <p className="text-sm font-medium text-danger">
          Changed by {how} · {change.daysBeforeIncident} days before the incident
        </p>
        <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums text-paper">
          <Last4 digits={change.accountLast4} />
        </p>
        <p className="mt-2 text-sm text-paper">
          {goesHere ? "This payment goes here." : `This payment goes to ••${row.payment.accountLast4}.`}
        </p>
      </div>
    </figure>
  );
}

// "••2208": Manrope's bullets sit far apart, so they're pulled together.
function Last4({ digits }: { digits: string }) {
  return (
    <>
      <span aria-hidden className="mr-[0.14em] tracking-[-0.34em]">••</span>
      <span className="sr-only">ending </span>
      {digits}
    </>
  );
}

// Why it's held: the hold reasons, the AI-written notice and the escalation, folded away.
export function WhyHeld({ row, escalation }: { row: HeldPaymentRow; escalation?: string }) {
  const isHeld = row.payment.status === "held";
  if (row.holdReasons.length === 0 && !row.notice && !escalation) return null;
  return (
    <details className="text-sm">
      <summary className="text-ash">{isHeld ? "Why it's held" : "Why it was held"}</summary>
      <div className="mt-3 space-y-3 border-l border-line pl-4">
        {row.holdReasons.length > 0 && (
          <ul className="list-disc space-y-1 pl-4 text-ash">
            {row.holdReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        {row.notice && <p className="max-w-prose leading-relaxed">{row.notice}</p>}
        {escalation && isHeld && <p className="max-w-prose leading-relaxed">{escalation}</p>}
      </div>
    </details>
  );
}

// The phone number on file, the only number anyone should call.
export function PhoneOnFile({ phone, large = false }: { phone: string; large?: boolean }) {
  return (
    <a
      href={`tel:${phone.replace(/[^\d+]/g, "")}`}
      className={`font-mono whitespace-nowrap text-amber underline-offset-4 hover:underline ${large ? "text-2xl font-semibold tracking-tight md:text-[1.7rem]" : ""}`}
    >
      {phone}
    </a>
  );
}

// Note, then Release / Reject. Release waits for a note: the call is the control.
export function DecisionForm({
  paymentId,
  decision,
  large = false,
}: {
  paymentId: Id<"payments">;
  decision: Decision;
  large?: boolean;
}) {
  const { note, setNote, busy, refusal, decide } = decision;
  const size = large ? "px-5 py-2.5 text-base" : "";
  return (
    <div className="space-y-3">
      {/* In the hero the step title already asks the question, so the label is for screen readers. */}
      <label className={large ? "sr-only" : "block text-sm font-medium text-paper"} htmlFor={`note-${paymentId}`}>
        What did the vendor confirm on the call?
        <span className="mt-0.5 block text-xs font-normal text-ash">Who you spoke to, and what they confirmed.</span>
      </label>
      <textarea
        id={`note-${paymentId}`}
        name="verificationNote"
        autoComplete="off"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={large ? 3 : 2}
        placeholder="e.g. Called the number on file, spoke to …"
        className="w-full resize-y rounded-chip border border-line bg-graphite px-3 py-2 text-sm leading-relaxed placeholder:text-ash/60 focus:border-ash"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== undefined || note.trim() === ""}
          onClick={() => void decide("release")}
          className={`${BUTTON_PRIMARY} ${size}`}
        >
          {busy === "release" ? "Releasing…" : "Release payment"}
        </button>
        <button
          type="button"
          disabled={busy !== undefined}
          onClick={() => void decide("reject")}
          className={`${BUTTON_SECONDARY} ${size}`}
        >
          {busy === "reject" ? "Rejecting…" : "Reject"}
        </button>
      </div>
      {refusal && (
        // A refusal is the control doing its job (segregation of duties), so it reads calm, not as an error.
        <p
          role="status"
          key={refusal}
          className="rounded-chip border border-ok/40 bg-ok/[0.07] px-3 py-2.5 text-sm leading-relaxed motion-safe:animate-arrive"
        >
          <span className="font-semibold text-ok">Working as designed.</span> {refusal} Nothing was released, and the
          refusal is on the record.
        </p>
      )}
    </div>
  );
}

// Everything that happened to this payment, from the audit log. Rows that arrive while you look
// (a refusal, a release) are marked, so the reactive record is visible on stage.
export function PaymentAudit({ paymentId, variant }: { paymentId: Id<"payments">; variant: "record" | "folded" }) {
  const audit = useQuery(api.payments.getPaymentAudit, { paymentId });
  const incidents = useQuery(api.blastRadius.listIncidents, {});
  const [mountedAt] = useState(() => Date.now());
  if (!audit || audit.length === 0) return null;
  const incidentName = (id: Doc<"auditLog">["incidentId"]) => {
    const incident = incidents?.find((i) => i._id === id);
    return incident ? `${incident.assetName} incident` : undefined;
  };
  const rows = (
    <ol className={`divide-y divide-line ${variant === "record" ? "border-y border-line" : "mt-3"}`}>
      {/* Newest first, so a refusal or release lands at the top, in view. */}
      {[...audit].reverse().map((a) => {
        const context = [a.rule, incidentName(a.incidentId)].filter(Boolean).join(" · ");
        return (
          <li
            key={a._id}
            className={`grid grid-cols-[5.25rem_minmax(0,1fr)] gap-x-3 px-2 py-2 text-sm ${
              a.at > mountedAt ? "motion-safe:animate-mark" : ""
            }`}
          >
            <span title={dateTime(a.at)} className="pt-px text-xs whitespace-nowrap text-ash tabular-nums">
              {dateTime(a.at).replace(/^\w+ \d+, /, "")}
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-baseline justify-between gap-x-4">
                <span>
                  <span className="font-semibold capitalize">{humanize(a.action)}</span>
                  <span className="text-ash"> · {a.actorName}</span>
                </span>
                <span title={context} className="max-w-full truncate font-mono text-[11px] text-ash/80">
                  {a.rule}
                </span>
              </span>
              <span className="mt-0.5 block text-ash">{a.reason}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
  if (variant === "record") {
    return (
      <section aria-labelledby={`record-${paymentId}`}>
        <h2 id={`record-${paymentId}`} className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 font-semibold">
          On the record
          <span className="text-xs font-normal text-ash">Audit log · newest first · {audit.length}</span>
        </h2>
        {rows}
      </section>
    );
  }
  return (
    <details className="text-sm">
      <summary className="text-ash">Audit log ({audit.length})</summary>
      {rows}
    </details>
  );
}

type Props = {
  row: HeldPaymentRow;
  escalation?: string;
  viewer?: Viewer;
};

// The compact card for lists (company "Held payments" tab, the firm's payments tab).
export function PaymentCard({ row, escalation, viewer }: Props) {
  const { payment } = row;
  const canDecide = viewer !== undefined;
  const decision = usePaymentDecision(row, viewer);
  const [now] = useState(() => Date.now());
  const isHeld = payment.status === "held";
  const phone = <PhoneOnFile phone={row.phoneOnFile} />;
  const callLine = !canDecide ? (
    <>
      Waiting on {row.companyName}'s controller to verify by calling {phone}, the number on file.
    </>
  ) : decision.isRequester ? (
    <>You requested this payment, so a controller must release it after calling {phone}, the number on file.</>
  ) : decision.isDecider ? (
    <>
      Call {row.vendorName} at {phone}, the number on file, never one from a recent email. Then release or reject.
    </>
  ) : (
    <>A controller verifies by calling {phone}, the number on file, then releases or rejects.</>
  );
  const due = dueIn(payment.dueDate, now);
  return (
    <article className="flex flex-col gap-3 rounded-tile border border-line bg-panel p-4 md:p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-3xl font-semibold tracking-tight tabular-nums">{money(payment.amountCents)}</p>
          <p className="mt-1 text-sm text-ash">
            {row.companyName} → {row.vendorName}
            {!row.bankChange && ` · account ••${payment.accountLast4}`}
          </p>
        </div>
        <LookChip look={paymentLook(payment)} />
      </header>

      {escalation && isHeld && (
        <p role="status" className="text-sm font-semibold text-amber">
          Decision needed{due && ` · ${due}`}
        </p>
      )}

      {row.decision && (
        <p
          className={`rounded-chip border px-3 py-2 text-sm ${
            row.decision.status === "paid" ? "border-ok/40 bg-ok/10 text-ok" : "border-line bg-panel text-paper"
          }`}
        >
          {row.decision.status === "paid" ? "Released" : "Rejected"} by {row.decision.byName ?? "a controller"}
          {row.decision.note && ` · “${row.decision.note}”`}
          {row.decision.at !== null && ` · ${dateTime(row.decision.at)}`}
        </p>
      )}

      <AccountChange row={row} size="compact" />

      {isHeld && <p className="text-sm leading-relaxed">{callLine}</p>}

      <WhyHeld row={row} escalation={escalation} />

      {canDecide && isHeld && (
        <div className="border-t border-line pt-4">
          <DecisionForm paymentId={payment._id} decision={decision} />
        </div>
      )}
      <PaymentAudit paymentId={payment._id} variant="folded" />
    </article>
  );
}
