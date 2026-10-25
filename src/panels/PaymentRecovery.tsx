import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useId, useState, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { friendlyError } from "../layout/errors";
import { dateTime } from "./format";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD } from "./styles";

type Recovery = NonNullable<FunctionReturnType<typeof api.paymentRecovery.getForPayment>>;
type Snapshot = Pick<Recovery, "context" | "phoneOnFile" | "amountCents"> & {
  destination: NonNullable<Recovery["destination"]>;
};
type Verification = {
  snapshot: Snapshot;
  confirmedAccountLast4: string;
  calledPhoneOnFile: boolean;
  verificationNote: string;
};

const dollars = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

function snapshotOf(data: Recovery): Snapshot | null {
  return data.destination ? {
    context: data.context,
    destination: data.destination,
    phoneOnFile: data.phoneOnFile,
    amountCents: data.amountCents,
  } : null;
}

// Convex reacts to saved facts; the local clock only disables an expired proposal's button.
// The mutation independently checks expiry and all facts before creating a held replacement.
function useExpired(expiresAt: number | null) {
  const [expiredAt, setExpiredAt] = useState<number | null>(() =>
    expiresAt !== null && expiresAt <= Date.now() ? expiresAt : null);
  useEffect(() => {
    if (expiresAt === null) return;
    const timer = window.setTimeout(() => setExpiredAt(expiresAt), Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [expiresAt]);
  return expiresAt !== null && expiredAt === expiresAt;
}

export function PaymentRecovery({ paymentId }: { paymentId: Id<"payments"> }) {
  const data = useQuery(api.paymentRecovery.getForPayment, { paymentId });
  if (data === undefined) return <p role="status" className="text-sm text-ash">Loading recovery options…</p>;
  if (data === null) return null;
  return <RecoveryDetails key={paymentId} paymentId={paymentId} data={data} />;
}

function RecoveryDetails({ paymentId, data }: { paymentId: Id<"payments">; data: Recovery }) {
  const headingId = useId();
  const prepare = useMutation(api.paymentRecovery.prepare);
  const requestReplacement = useMutation(api.paymentRecovery.requestReplacement);
  const revoke = useMutation(api.paymentRecovery.revoke);
  const [busy, setBusy] = useState<"prepare" | "request" | "revoke" | null>(null);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const [showForm, setShowForm] = useState(() => data.canPropose && data.latestProposal?.status !== "prepared");
  const proposal = data.latestProposal;
  const expired = useExpired(proposal?.status === "prepared" ? proposal.expiresAt : null);

  async function submitVerification(verification: Verification) {
    if (busy) return;
    setBusy("prepare");
    setFeedback(null);
    try {
      const result = await prepare({
        paymentId,
        context: verification.snapshot.context,
        bankRecordId: verification.snapshot.destination.id,
        bankRecordChangedAt: verification.snapshot.destination.changedAt,
        confirmedAccountLast4: verification.confirmedAccountLast4,
        calledPhoneOnFile: verification.calledPhoneOnFile,
        verificationNote: verification.verificationNote,
      });
      if (result.ok) {
        setShowForm(false);
        setFeedback({ error: false, text: "Correction prepared. A separate AP clerk must request it before it expires; no money has moved." });
      } else setFeedback({ error: true, text: result.reason });
    } catch (error) {
      setFeedback({ error: true, text: friendlyError(error) });
    } finally {
      setBusy(null);
    }
  }

  async function actOnProposal(action: "request" | "revoke") {
    if (busy || !proposal) return;
    setBusy(action);
    setFeedback(null);
    try {
      const result = action === "request"
        ? await requestReplacement({ proposalId: proposal.id })
        : await revoke({ proposalId: proposal.id });
      setFeedback(result.ok
        ? { error: false, text: action === "request"
          ? "Corrected payment requested and placed on hold. Open it in Held payments for a controller to verify and release."
          : "Unused correction withdrawn. The original payment remains rejected." }
        : { error: true, text: result.reason });
    } catch (error) {
      setFeedback({ error: true, text: friendlyError(error) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby={headingId} aria-busy={busy !== null} className="min-w-0 space-y-4 border-t border-line pt-4">
      <div>
        <h3 id={headingId} className="font-semibold">Recover this bill</h3>
        <p className="mt-1 text-sm leading-relaxed text-ash">
          A controller verifies a corrected destination, then AP requests a new held payment.
          A controller must still release it. The original stays rejected.
        </p>
      </div>

      {proposal && (
        <div className="space-y-1 text-sm">
          <p className="font-semibold">
            {proposal.status === "requested" ? "Corrected request created"
              : proposal.status === "revoked" ? "Correction withdrawn"
              : proposal.status === "superseded" ? "Correction superseded"
              : expired ? "Correction expired" : "Correction prepared for AP"}
          </p>
          <p>Saved correction: <strong className="tabular-nums">{dollars(proposal.amountCents)}</strong> to account ending <strong className="tabular-nums">{proposal.accountLast4}</strong>.</p>
          <p className="text-ash">Prepared by {proposal.proposedByName}.</p>
          {proposal.status === "prepared" && (
            <p className="text-ash">{expired ? "Expired" : "Expires"} {dateTime(proposal.expiresAt)}.</p>
          )}
          {proposal.status === "requested" && (
            <p className="text-ash">The replacement was created on hold and requires its own controller release.</p>
          )}
        </div>
      )}

      {data.blockedReason && <p role="status" className="text-sm leading-relaxed text-ash">{data.blockedReason}</p>}
      {expired && <p className="text-sm text-ash">Ask the controller to verify a new correction before AP requests it.</p>}

      {(data.canRequest || data.canRevoke) && (
        <div className="flex flex-wrap gap-2">
          {data.canRequest && (
            <button type="button" className={`${BUTTON_PRIMARY} whitespace-normal`} disabled={busy !== null || expired}
              onClick={() => void actOnProposal("request")}>
              {busy === "request" ? "Requesting…" : "Request corrected payment"}
            </button>
          )}
          {data.canRevoke && (
            <button type="button" className={`${BUTTON_SECONDARY} whitespace-normal`} disabled={busy !== null}
              onClick={() => void actOnProposal("revoke")}>
              {busy === "revoke" ? "Withdrawing…" : "Withdraw correction"}
            </button>
          )}
        </div>
      )}

      {showForm ? (
        <VerificationForm data={data} busy={busy !== null} submitting={busy === "prepare"} onSubmit={submitVerification} />
      ) : data.canPropose && data.destination ? (
        <button type="button" className={`${BUTTON_SECONDARY} whitespace-normal`} disabled={busy !== null}
          onClick={() => { setShowForm(true); setFeedback(null); }}>
          {proposal ? "Verify a new correction" : "Verify corrected destination"}
        </button>
      ) : null}

      {!data.canPropose && !data.canRequest && !data.blockedReason && !proposal && (
        <p className="text-sm text-ash">A controller who did not request this payment must prepare the correction first.</p>
      )}
      {feedback && <p role={feedback.error ? "alert" : "status"} className={`text-sm leading-relaxed ${feedback.error ? "text-danger" : "text-paper"}`}>{feedback.text}</p>}
    </section>
  );
}

function VerificationForm({ data, busy, submitting, onSubmit }: {
  data: Recovery;
  busy: boolean;
  submitting: boolean;
  onSubmit: (verification: Verification) => Promise<void>;
}) {
  const fieldId = useId();
  // The reviewed facts remain fixed until an explicit restart; reactive changes never move
  // the account or phone number behind a checked attestation.
  const [snapshot, setSnapshot] = useState(() => snapshotOf(data));
  const [account, setAccount] = useState("");
  const [called, setCalled] = useState(false);
  const [note, setNote] = useState("");
  const stale = JSON.stringify(snapshot) !== JSON.stringify(snapshotOf(data));
  const trimmedNote = note.trim();
  const validAccount = /^\d{4}$/.test(account) && account === snapshot?.destination.accountLast4;
  const validNote = trimmedNote.length >= 15 && trimmedNote.length <= 2000 && /[a-z]{2,}\s+[a-z]{2,}/i.test(trimmedNote);
  const ready = data.canPropose && !stale && validAccount && validNote && called && !busy;

  function restart() {
    setSnapshot(snapshotOf(data));
    setAccount("");
    setCalled(false);
    setNote("");
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || !snapshot) return;
    void onSubmit({ snapshot, confirmedAccountLast4: account, calledPhoneOnFile: called, verificationNote: trimmedNote });
  }

  if (!snapshot) return <p className="text-sm text-ash">A destination previously confirmed by phone is required before preparing a correction.</p>;
  return (
    <form onSubmit={submit} className="min-w-0 space-y-4">
      <div className="space-y-1 text-sm">
        <p>Corrected request: <strong className="tabular-nums">{dollars(snapshot.amountCents)}</strong> to account ending <strong className="tabular-nums">{snapshot.destination.accountLast4}</strong>.</p>
        <p className="text-ash">Destination previously confirmed by phone on {dateTime(snapshot.destination.changedAt)}. This correction applies only to this bill.</p>
      </div>
      {stale && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-danger">Payment, invoice, contact or bank details changed. Restart and verify the updated details before preparing a correction.</p>
          <button type="button" className={`${BUTTON_SECONDARY} whitespace-normal`} disabled={busy || !data.canPropose || !data.destination} onClick={restart}>Restart verification</button>
        </div>
      )}
      <fieldset disabled={busy || stale || !data.canPropose} className="min-w-0 space-y-4">
        <div>
          <label htmlFor={`${fieldId}-account`} className="block text-sm font-medium">Confirmed account’s last four digits</label>
          <input id={`${fieldId}-account`} className={`${FIELD} mt-2 w-full`} value={account}
            onChange={event => setAccount(event.target.value)} inputMode="numeric" autoComplete="off" maxLength={4}
            pattern="[0-9]{4}" required aria-describedby={`${fieldId}-account-help`} />
          <p id={`${fieldId}-account-help`} className="mt-1 text-xs text-ash">Enter the corrected destination shown above; a different account cannot be substituted.</p>
        </div>
        <label className="flex items-start gap-2 text-sm leading-relaxed">
          <input type="checkbox" className="mt-1 shrink-0 accent-amber" checked={called} onChange={event => setCalled(event.target.checked)} required />
          <span>I called <strong className="break-words">{snapshot.phoneOnFile}</strong>, the number on file, and confirmed {dollars(snapshot.amountCents)} to account ending {snapshot.destination.accountLast4}.</span>
        </label>
        <div>
          <label htmlFor={`${fieldId}-note`} className="block text-sm font-medium">Who confirmed the corrected destination?</label>
          <textarea id={`${fieldId}-note`} className={`${FIELD} mt-2 min-h-24 w-full resize-y`} rows={3}
            value={note} onChange={event => setNote(event.target.value)} minLength={15} maxLength={2000} required
            aria-describedby={`${fieldId}-note-help`} placeholder="Record who you spoke with and what they confirmed." />
          <p id={`${fieldId}-note-help`} className="mt-1 text-xs text-ash">15–2,000 characters. This records your call attestation; the demo uses masked account details.</p>
        </div>
      </fieldset>
      <button type="submit" className={`${BUTTON_PRIMARY} whitespace-normal`} disabled={!ready}>
        {submitting ? "Preparing…" : "Prepare corrected request"}
      </button>
    </form>
  );
}
