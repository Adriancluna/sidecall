// One place for how statuses read on screen: a label for people, a tone for the chip.
import type { Doc } from "../../convex/_generated/dataModel";
import type { Tone } from "./ui";

export type Look = { tone: Tone; label: string };

export const PAYMENT_STATUS: Record<Doc<"payments">["status"], Look> = {
  pending: { tone: "muted", label: "Pending" },
  held: { tone: "amber", label: "Held until verified" },
  paid: { tone: "ok", label: "Paid" },
  released: { tone: "ok", label: "Released" },
  rejected: { tone: "danger", label: "Rejected" },
};

export const URGENCY: Record<Doc<"exposures">["urgency"], Look> = {
  urgent: { tone: "danger", label: "Urgent" },
  advisory: { tone: "amber", label: "Advisory" },
};

export const EXPOSURE_STATUS: Record<Doc<"exposures">["status"], string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  closed: "Closed",
};

export const OUTBOX_STATUS: Record<Doc<"notifications">["status"], Look> = {
  queued: { tone: "muted", label: "Queued" },
  sending: { tone: "muted", label: "Sending" },
  simulated: { tone: "amber", label: "Simulated" },
  sent: { tone: "ok", label: "Sent" },
  failed: { tone: "danger", label: "Failed" },
};
