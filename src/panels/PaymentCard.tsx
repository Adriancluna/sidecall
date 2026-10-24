// One held payment, in parts the hero and the lists share. Like a payment authorization: what it
// pays, where the money would go, and two signature lines (requested by / verified and released
// by), so the two-person rule is visible before anyone clicks. The controller gets the note and
// Release / Reject; anyone else gets a quiet "Try to release" (the backend refuses the requester
// and non-controllers, which is demo beat 2). The PE firm only reads (no viewer).
import { useQuery } from "convex/react";
import { useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { dateTime, humanize, money } from "./format";
import { actionLabel, paymentLook, ruleLabel } from "./labels";
import type { HeldPaymentRow } from "./types";
import { LookChip } from "./ui";
import { BUTTON_PRIMARY, BUTTON_PRIMARY_LG, BUTTON_SECONDARY, BUTTON_SECONDARY_LG } from "./styles";
import { dueIn, usePaymentDecision, type Viewer } from "./usePaymentDecision";

type Decision = ReturnType<typeof usePaymentDecision>;

// The evidence that makes this hold matter: the account last confirmed by phone, then the one
// that arrived by email. Set large in the hero, smaller in lists; never boxed.
export function AccountChange({ row, size = "large" }: { row: HeldPaymentRow; size?: "large" | "compact" }) {
  const change = row.bankChange;
  if (!change) return null;
  const old = change.lastVerifiedAccountLast4 ?? change.previousAccountLast4 ?? "????";
  const oldLabel = change.lastVerifiedAccountLast4 ? "Last confirmed by phone" : "Previous account";
  const how = humanize(change.requestChannel);
  const goesHere = row.payment.accountLast4 === change.accountLast4;
  const large = size === "large";
  const digits = large
    ? "text-[2.5rem] leading-none font-semibold tracking-tight tabular-nums md:text-5xl"
    : "text-xl leading-none font-semibold tabular-nums";
  const label = large ? "text-base md:text-lg" : "text-sm";

  return (
    <figure>
      <figcaption className="sr-only">
        Bank account changed from ••{old} to ••{change.accountLast4} by {how}, {change.daysBeforeIncident} days before
        the incident. This payment goes to ••{row.payment.accountLast4}.
      </figcaption>
      <div
        aria-hidden
        className={`grid grid-cols-[auto_minmax(0,1fr)] items-baseline ${large ? "gap-x-6 gap-y-5" : "gap-x-3 gap-y-2"}`}
      >
        <span className={`${digits} text-ash`}>
          <Last4 digits={old} />
        </span>
        <span className={`${label} text-ash`}>{oldLabel}</span>
        <span className={`${digits} text-danger`}>
          <Last4 digits={change.accountLast4} />
        </span>
        <span className={label}>
          <span className="font-semibold text-danger">
            Changed by {how} · {change.daysBeforeIncident} days before the incident
          </span>
          {large && goesHere && (
            <span className="mt-1 block text-sm text-paper">
              {row.decision?.status === "paid" ? "This payment went here." : row.decision ? "This payment was stopped." : "This payment goes here."}
            </span>
          )}
        </span>
      </div>
      {!goesHere && (
        <p aria-hidden className={`${large ? "mt-4" : "mt-2"} text-sm`}>
          This payment goes to <Last4 digits={row.payment.accountLast4} />.
        </p>
      )}
    </figure>
  );
}

// "••2208": Manrope's bullets sit far apart, so they're pulled together.
function Last4({ digits }: { digits: string }) {
  return (
    <>
      <span aria-hidden className="mr-[0.14em] tracking-[-0.34em]">
        ••
      </span>
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
      className={`whitespace-nowrap text-link tabular-nums underline-offset-4 hover:underline ${
        large ? "text-2xl font-semibold tracking-tight md:text-[1.75rem]" : "font-semibold"
      }`}
    >
      {phone}
    </a>
  );
}

// Two signature lines, like a payment authorization form: signed is a solid rule with a name,
// waiting is a dashed rule with who it waits for. Fills in when the controller releases or rejects.
export function Signatures({
  row,
  decision,
  sideBySide = false,
}: {
  row: HeldPaymentRow;
  decision?: Decision;
  sideBySide?: boolean;
}) {
  const users = useQuery(api.blastRadius.listUsers, {});
  const { payment } = row;
  const requester = users?.find((u) => u._id === payment.requestedBy)?.name;
  const controller = users?.find(
    (u) => u.companyId === payment.companyId && u.role === "controller" && u._id !== payment.requestedBy,
  );
  const done = row.decision;
  return (
    <ol className={sideBySide ? "grid gap-x-6 gap-y-4 sm:grid-cols-2" : "space-y-4"}>
      <SignatureLine label="Requested by" signed>
        {requester ?? "The AP clerk"}
        {decision?.isRequester && <span className="font-normal text-ash"> (you)</span>}
      </SignatureLine>
      {done ? (
        <SignatureLine
          label={done.status === "paid" ? "Verified by phone, then released by" : "Rejected by"}
          signed
          tone={done.status === "paid" ? "ok" : "danger"}
        >
          {done.byName ?? "A controller"}
          {done.at !== null && <span className="font-normal text-ash"> · {dateTime(done.at)}</span>}
          {done.note && <span className="mt-1 block text-sm font-normal text-ash">“{done.note}”</span>}
        </SignatureLine>
      ) : (
        <SignatureLine label="Verified by phone, then released by">
          {decision?.isDecider ? "You, after the call" : controller ? `${controller.name}, controller` : "A controller"}
          <span className="font-normal text-ash"> · Not yet signed</span>
        </SignatureLine>
      )}
    </ol>
  );
}

function SignatureLine({
  label,
  signed = false,
  tone,
  children,
}: {
  label: string;
  signed?: boolean;
  tone?: "ok" | "danger";
  children: ReactNode;
}) {
  const rule = !signed
    ? "border-dashed border-ash/60"
    : tone === "ok"
      ? "border-ok"
      : tone === "danger"
        ? "border-danger"
        : "border-paper/70";
  return (
    <li className="min-w-0">
      <p className="text-sm text-ash">{label}</p>
      <p className={`mt-1 border-b-2 pb-2 font-semibold ${rule}`}>{children}</p>
    </li>
  );
}

// A refusal is the control doing its job (segregation of duties), so it reads calm, not as an error.
function Refusal({ text }: { text: string }) {
  return (
    <p
      role="status"
      key={text}
      className="rounded-chip bg-ok/[0.08] px-3 py-2.5 text-sm leading-relaxed motion-safe:animate-arrive"
    >
      <span className="font-semibold text-ok">Working as designed.</span> {text} Nothing was released, and the refusal
      is on the record.
    </p>
  );
}

// For the controller: the note, then Release / Reject. Release waits for a note: the call is the control.
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
  return (
    <div className="space-y-3">
      {/* In the hero the step title already asks the question, so the label is for screen readers. */}
      <label className={large ? "sr-only" : "block text-sm font-medium text-paper"} htmlFor={`note-${paymentId}`}>
        Who did you speak to, and what did they confirm?
      </label>
      <textarea
        id={`note-${paymentId}`}
        name="verificationNote"
        autoComplete="off"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={large ? 3 : 2}
        placeholder="e.g. Called the number on file, spoke to …"
        className="w-full resize-y rounded-chip border border-line bg-graphite px-3 py-2 text-sm leading-relaxed placeholder:text-ash/70 hover:border-ash/60 focus:border-ash"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== undefined || note.trim() === ""}
          onClick={() => void decide("release")}
          className={large ? BUTTON_PRIMARY_LG : BUTTON_PRIMARY}
        >
          {busy === "release" ? "Releasing…" : "Release payment"}
        </button>
        <button
          type="button"
          disabled={busy !== undefined}
          onClick={() => void decide("reject")}
          className={large ? BUTTON_SECONDARY_LG : BUTTON_SECONDARY}
        >
          {busy === "reject" ? "Rejecting…" : "Reject"}
        </button>
      </div>
      {refusal && <Refusal text={refusal} />}
    </div>
  );
}

// For everyone who can't sign the second line: one quiet button. The backend refuses it and
// logs the refusal, which is the point (demo beat 2).
export function TryRelease({ decision }: { decision: Decision }) {
  const { busy, refusal, decide } = decision;
  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={busy !== undefined}
        onClick={() => void decide("release")}
        className={BUTTON_SECONDARY}
      >
        {busy === "release" ? "Releasing…" : "Try to release"}
      </button>
      {refusal && <Refusal text={refusal} />}
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
      {[...audit].reverse().map((a) => (
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
                <span className="font-semibold">{actionLabel(a.action)}</span>
                <span className="text-ash"> by {a.actorName}</span>
              </span>
              <span title={incidentName(a.incidentId)} className="text-xs text-ash">
                {ruleLabel(a.rule)}
              </span>
            </span>
            <span className="mt-0.5 block text-ash">{a.reason}</span>
          </span>
        </li>
      ))}
    </ol>
  );
  if (variant === "record") {
    return (
      <section aria-labelledby={`record-${paymentId}`}>
        <h2 id={`record-${paymentId}`} className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 font-semibold">
          On the record
          <span className="text-xs font-normal text-ash">Audit log, newest first</span>
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
  const decision = usePaymentDecision(row, viewer);
  const [now] = useState(() => Date.now());
  const isHeld = payment.status === "held";
  const due = dueIn(payment.dueDate, now);
  return (
    <article className="flex flex-col gap-5 rounded-tile border border-line bg-panel p-5 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-3xl font-semibold tracking-tight tabular-nums">{money(payment.amountCents)}</p>
          <p className="mt-1 text-sm text-ash">
            {viewer ? "to " : `${row.companyName} pays `}
            <span className="text-paper">{row.vendorName}</span>
          </p>
        </div>
        <LookChip look={paymentLook(payment)} />
      </header>

      {escalation && isHeld && (
        <p role="status" className="-mt-2 text-sm font-semibold text-amber">
          Decision needed{due && `, ${due}`}
        </p>
      )}

      {row.bankChange ? (
        <AccountChange row={row} size="compact" />
      ) : (
        <p className="text-sm text-ash">
          Pays account <span className="text-paper tabular-nums">••{payment.accountLast4}</span>
        </p>
      )}

      <Signatures row={row} decision={viewer ? decision : undefined} sideBySide />

      {isHeld && decision.isDecider && (
        <div className="space-y-3 border-t border-line pt-4">
          <p className="text-sm leading-relaxed">
            Call {row.vendorName} at <PhoneOnFile phone={row.phoneOnFile} />, the number on file, never one from a
            recent email.
          </p>
          <DecisionForm paymentId={payment._id} decision={decision} />
        </div>
      )}
      {isHeld && viewer && !decision.isDecider && <TryRelease decision={decision} />}

      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <WhyHeld row={row} escalation={escalation} />
        <PaymentAudit paymentId={payment._id} variant="folded" />
      </div>
    </article>
  );
}
