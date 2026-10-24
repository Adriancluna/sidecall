// Release / reject one held payment, and how long until it's due. Shared by the payment hero and
// the payment cards. The backend enforces who may decide; this only words the screen.
import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { refusalOf } from "../layout/errors";
import { humanize, money } from "./format";
import type { HeldPaymentRow } from "./types";

// Who is looking, so the instructions address the right person (the backend enforces the rules).
export type Viewer = { id: Id<"users">; isController: boolean };

const HOUR = 3_600_000;

// "due in about 20 hours", from a due date captured once (it doesn't need to tick).
export function dueIn(dueDate: number | undefined, now: number): string | undefined {
  if (dueDate === undefined) return undefined;
  const ms = dueDate - now;
  if (ms < HOUR) return "due within the hour";
  const hours = Math.round(ms / HOUR);
  return hours < 48 ? `due in about ${hours} ${hours === 1 ? "hour" : "hours"}` : `due in ${Math.round(hours / 24)} days`;
}

// Release / reject with the confirm dialog for the person deciding. Everyone else goes straight
// to the backend, whose refusal is the point of the demo beat.
export function usePaymentDecision(row: HeldPaymentRow, viewer?: Viewer) {
  const { payment } = row;
  const release = useMutation(api.payments.releasePayment);
  const reject = useMutation(api.payments.rejectPayment);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"release" | "reject">();
  const [refusal, setRefusal] = useState<string>();
  // Mirrors the backend rule (controller, not the requester) only to word the screen and skip a
  // pointless dialog; releasePayment/rejectPayment still enforce it.
  const isRequester = viewer?.id === payment.requestedBy;
  const isDecider = viewer?.isController === true && !isRequester;

  const decide = async (action: "release" | "reject") => {
    const changed = row.bankChange
      ? `, an account changed by ${humanize(row.bankChange.requestChannel)} ${row.bankChange.daysBeforeIncident} days before the incident`
      : "";
    const question =
      action === "release"
        ? `Release ${money(payment.amountCents)} to ${row.vendorName} account ••${payment.accountLast4}${changed}?`
        : `Reject the ${money(payment.amountCents)} payment to ${row.vendorName}? This is final.`;
    if (isDecider && !window.confirm(question)) return;
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
  return { note, setNote, busy, refusal, decide, isRequester, isDecider };
}

