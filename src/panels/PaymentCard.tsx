// One held payment, in parts the hero and the lists share. Like a payment authorization: what it
// pays, where the money would go, and two signature lines (requested by / verified and released
// by), so the two-person rule is visible before anyone clicks. The controller gets the note and
// Release / Reject; anyone else gets a quiet "Try to release" (the backend refuses the requester
// and non-controllers, which is demo beat 2). The PE firm only reads (no viewer).
import { useQuery } from "convex/react";
import { useId, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { dateTime, humanize, money } from "./format";
import { actionLabel, paymentLook, ruleLabel } from "./labels";
import type { HeldPaymentRow } from "./types";
import { LookChip } from "./ui";
import { BUTTON_PRIMARY, BUTTON_PRIMARY_LG, BUTTON_SECONDARY, BUTTON_SECONDARY_LG, FIELD } from "./styles";
import { dueIn, usePaymentDecision, type Viewer } from "./usePaymentDecision";
import { PaymentRecovery } from "./PaymentRecovery";

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

// "••2208": Geist spaces its bullets evenly, so they keep normal tracking and a small gap.
function Last4({ digits }: { digits: string }) {
  return (
    <>
      <span aria-hidden className="mr-[0.08em] tracking-normal">
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
    // Side by side only while both labels fit on one line; narrower cards stack.
    <ol className={sideBySide ? "grid grid-cols-[repeat(auto-fit,minmax(17.5rem,1fr))] gap-x-6 gap-y-4" : "space-y-4"}>
      <SignatureLine label="Requested by" signed>
        {requester ?? "The AP clerk"}
        {decision?.isRequester && <span className="font-normal text-ash"> (you)</span>}
      </SignatureLine>
      {done ? (
        <SignatureLine
          label={done.status === "paid" ? (payment.releaseVerification ? "Call attested and payment released by" : "Released by (legacy note)") : "Rejected by"}
          signed
          tone={done.status === "paid" ? "ok" : "danger"}
        >
          {done.byName ?? "A controller"}
          {done.at !== null && <span className="font-normal text-ash"> · {dateTime(done.at)}</span>}
          {done.note && <span className="mt-1 block text-sm font-normal text-ash">“{done.note}”</span>}
          {payment.releaseVerification && <span className="mt-2 block text-sm font-normal text-ash">
            Controller recorded a call to {payment.releaseVerification.context.vendor?.phoneOnFile},
            confirming {money(payment.releaseVerification.context.amountCents)} to account ending {payment.releaseVerification.confirmedAccountLast4}.
            <span className="mt-1 block">Saved with this payment’s ledger entry. Demo uses masked account details.</span>
          </span>}
        </SignatureLine>
      ) : (
        <SignatureLine label="Call attested and payment released by">
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

// Refusals need attention; green success styling can imply the payment went through.
function Refusal({ text, title = "Action could not be completed", nextStep }: {
  text: string;
  title?: string;
  nextStep?: string;
}) {
  return (
    <p
      role="status"
      key={text}
      className="rounded-chip border border-amber/30 bg-amber/[0.08] px-3 py-2.5 text-sm leading-relaxed motion-safe:animate-arrive"
    >
      <span className="mb-1 block font-semibold text-amber">{title}</span>
      {text}
      {nextStep && <span className="mt-2 block">{nextStep}</span>}
    </p>
  );
}

// The controller records the exact destination and a callback attestation before release.
export function DecisionForm({
  paymentId,
  decision,
  large = false,
}: {
  paymentId: Id<"payments">;
  decision: Decision;
  large?: boolean;
}) {
  const formId = useId();
  const { note, setNote, busy, refusal, decide, confirmedAccountLast4, setConfirmedAccountLast4,
    calledPhoneOnFile, setCalledPhoneOnFile, contextChanged, accountMismatch, canRelease,
    restartVerification, destination, callbackPhone } = decision;
  return (
    <div className="space-y-3">
      <p className="text-sm text-ash">This payment goes to account ending <strong className="text-paper">{destination}</strong>.</p>
      <label className="block text-sm font-medium" htmlFor={`account-${paymentId}-${formId}`}>
        Account ending confirmed by the vendor
      </label>
      <input id={`account-${paymentId}-${formId}`} name="confirmedAccountLast4" type="text" inputMode="numeric"
        autoComplete="off" maxLength={4} value={confirmedAccountLast4}
        aria-describedby={`verification-help-${paymentId}-${formId}`}
        onChange={e => setConfirmedAccountLast4(e.target.value.replace(/[^0-9]/g, ""))}
        placeholder="Four digits" className="w-full rounded-chip border border-line bg-graphite px-3 py-2 text-base tabular-nums" />
      <p id={`verification-help-${paymentId}-${formId}`} className="text-sm text-ash">
        Enter what the vendor confirmed. Releasing keeps the destination shown above.
      </p>
      {accountMismatch && <p role="status" className="text-sm text-danger">
        The confirmed account differs from this payment. Keep it held or reject it; no money will move.
      </p>}
      <label className="flex items-start gap-3 text-sm leading-relaxed">
        <input type="checkbox" name="calledPhoneOnFile" checked={calledPhoneOnFile}
          onChange={e => setCalledPhoneOnFile(e.target.checked)} className="mt-1 size-4 shrink-0 accent-amber" />
        <span>I called {callbackPhone} from the stored vendor record and confirmed this payment’s amount and destination.</span>
      </label>
      {contextChanged && <div role="status" className="space-y-2 rounded-chip border border-amber/50 p-3 text-sm">
        <p>Payment or vendor details changed while you were verifying. Review the updated details and call again before releasing.</p>
        <button type="button" onClick={restartVerification} disabled={busy !== undefined} className={BUTTON_SECONDARY}>
          Start verification again
        </button>
      </div>}
      {/* In the hero the step title already asks the question, so the label is for screen readers. */}
      <label className={large ? "sr-only" : "block text-sm font-medium text-paper"} htmlFor={`note-${paymentId}-${formId}`}>
        Who did you speak to, and what did they confirm?
      </label>
      <textarea
        id={`note-${paymentId}-${formId}`}
        name="verificationNote"
        autoComplete="off"
        maxLength={2000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={large ? 3 : 2}
        placeholder="e.g. Called the number on file, spoke to …"
        className={`w-full resize-y leading-relaxed ${FIELD}`}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== undefined || !canRelease}
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
      {refusal && <Refusal text={refusal} title="Release blocked"
        nextStep={decision.isRequester ? "Ask a different controller to verify and approve this payment." : undefined} />}
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

      {payment.recoveryFromPaymentId && (
        <p className="text-sm text-ash">Corrected request to account ending <strong className="tabular-nums text-paper">{payment.accountLast4}</strong>; the original rejection remains in the record.</p>
      )}

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
      {payment.status === "rejected" && <PaymentRecovery paymentId={payment._id} />}

      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <WhyHeld row={row} escalation={escalation} />
        <PaymentAudit paymentId={payment._id} variant="folded" />
      </div>
    </article>
  );
}
