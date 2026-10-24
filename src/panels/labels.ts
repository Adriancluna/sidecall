// One place for how statuses and backend codes read on screen: words for people, a tone for chips.
// Raw codes stay in the CSV export (for the auditor); the screen never shows one.
import type { Doc } from "../../convex/_generated/dataModel";
import { humanize } from "./format";
import type { Tone } from "./ui";

export type Look = { tone: Tone; label: string };

export const PAYMENT_STATUS: Record<Doc<"payments">["status"], Look> = {
  pending: { tone: "muted", label: "Pending" },
  held: { tone: "amber", label: "Held until verified" },
  paid: { tone: "ok", label: "Paid" },
  released: { tone: "ok", label: "Released" },
  rejected: { tone: "danger", label: "Rejected" },
};

// A payment that was held and then released reads "Released"; one paid without a hold, "Paid".
export const paymentLook = (
  p: Pick<Doc<"payments">, "status" | "heldByIncidentId">,
): Look =>
  p.status === "paid" && p.heldByIncidentId !== undefined
    ? PAYMENT_STATUS.released
    : PAYMENT_STATUS[p.status];

export const URGENCY: Record<Doc<"exposures">["urgency"], Look> = {
  urgent: { tone: "danger", label: "Urgent" },
  advisory: { tone: "amber", label: "Advisory" },
};

export const OUTBOX_STATUS: Record<Doc<"notifications">["status"], Look> = {
  queued: { tone: "muted", label: "Queued" },
  sending: { tone: "muted", label: "Sending" },
  simulated: { tone: "amber", label: "Simulated" },
  sent: { tone: "ok", label: "Sent" },
  failed: { tone: "danger", label: "Failed" },
};

const sentence = (code: string) => {
  const words = humanize(code);
  return words.charAt(0).toUpperCase() + words.slice(1);
};

// The rule behind an audit row (convex/payments.ts, incidents.ts, responses.ts), in plain words.
const RULE_LABEL: Record<string, string> = {
  segregation_of_duties: "Requester can't approve",
  controller_at_company: "Only this company's controller decides",
  only_held_payments: "Only a held payment can be decided",
  verification_required: "Phone check note required",
  undecided_hold_near_due_date: "Due soon, still undecided",
  bank_change_within_30_days: "Bank details changed in the last 30 days",
  hold_payments_to_compromised_vendor: "Vendor under an active incident",
  hold_payments_requested_during_incident: "Requested during an active incident",
  hold_payments_imported_during_incident: "Imported during an active incident",
  controller_release_after_verification: "Released after a phone check",
  controller_reject: "Rejected by the controller",
  pe_firm_marks_contained: "Contained by the PE firm",
  response_playbook: "Response playbook",
  notification_settings: "Notification settings",
  ap_import: "AP import",
};

export function ruleLabel(rule: string): string {
  if (RULE_LABEL[rule]) return RULE_LABEL[rule];
  // "playbook:pause_shared_login:act:v1" and "mcp_tool:request_payment"
  const [prefix, name] = rule.split(":");
  if (prefix === "playbook" && name) return `Playbook: ${humanize(name)}`;
  if (prefix === "mcp_tool" && name) return `Agent tool: ${humanize(name)}`;
  return sentence(rule);
}

// What happened in an audit or timeline row, as a past-tense word.
const ACTION_LABEL: Record<string, string> = {
  hold: "Held",
  hold_payments: "Payments held",
  flag: "Flagged",
  refused: "Refused",
  release: "Released",
  reject: "Rejected",
  escalate: "Escalated",
  contain: "Contained",
  import: "Imported",
  approve: "Approved",
  expire: "Expired",
  undo: "Undone",
  policy: "Playbook changed",
  respond: "Responded",
  agent_call: "Agent call",
  pause_shared_login: "Shared login paused",
  revoke_vendor_tokens: "Vendor tokens revoked",
  reported: "Reported",
  acknowledged: "Acknowledged",
  alert_ready: "Alert written",
  vendor_letter_ready: "Vendor letter written",
};

export const actionLabel = (action: string) => ACTION_LABEL[action] ?? sentence(action);
