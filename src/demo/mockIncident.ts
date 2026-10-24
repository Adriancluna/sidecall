// What Adrian's recordIncident would write for the demo incident, pre-computed.
// The mock backend swaps this in on "Fire incident"; nothing here decides exposure or holds at runtime.
import type { Doc, Id, TableNames } from "../../convex/_generated/dataModel";
import { INCIDENT_AT, pendingPayments } from "./mockData";

const id = <T extends TableNames>(raw: string) => raw as Id<T>;

export const DEMO_EXTERNAL_ID = "armadin-finding-0042";

export const incident: Doc<"incidents"> = {
  _id: id("inc_1"),
  _creationTime: INCIDENT_AT,
  externalId: DEMO_EXTERNAL_ID,
  assetId: id("as_payroll"),
  reportedByCompanyId: id("co_a"),
  summary:
    "Ledgerline Payroll admin console accessed with a stolen session token.",
  createdAt: INCIDENT_AT,
};

const exposure = (
  key: string,
  companyId: string,
  urgency: Doc<"exposures">["urgency"],
  score: number,
  confidence: number,
  reasons: string[],
  evidence: Doc<"exposures">["evidence"],
): Doc<"exposures"> => ({
  _id: id(key),
  _creationTime: INCIDENT_AT,
  incidentId: incident._id,
  companyId: id(companyId),
  status: "open",
  urgency,
  score,
  confidence,
  reasons,
  evidence,
});

export const exposures: Doc<"exposures">[] = [
  exposure(
    "ex_b",
    "co_b",
    "urgent",
    88,
    0.9,
    [
      "Shares admin access to the compromised payroll vendor",
      "Pending payment to the vendor held",
    ],
    [
      { kind: "link", detail: "shared_admin_access · self_reported" },
      { kind: "payment", detail: "$132,000 held until verified" },
    ],
  ),
  exposure(
    "ex_c",
    "co_c",
    "urgent",
    94,
    0.92,
    [
      "Shares a credential with the compromised payroll vendor",
      "Vendor bank details changed by email 2 days before the incident",
    ],
    [
      { kind: "link", detail: "shared_credential · self_reported" },
      {
        kind: "bank_change",
        detail: "Account ending 9921, requested by email",
      },
      { kind: "payment", detail: "$480,000 held until verified" },
    ],
  ),
  exposure(
    "ex_d",
    "co_d",
    "advisory",
    41,
    0.55,
    ["Uses the same payroll vendor (no shared credential reported)"],
    [
      {
        kind: "dns",
        detail:
          "Candidate: SPF record includes the vendor's mail domain (dns_inferred, reachability only)",
      },
    ],
  ),
];

const HOLD_REASONS = ["Vendor is the subject of an open incident"];
const FLAG_REASON =
  "Vendor bank details changed within 30 days of the incident";

export const heldPayments: Doc<"payments">[] = pendingPayments.map((p) =>
  p.companyId === id("co_d")
    ? p
    : {
        ...p,
        status: "held" as const,
        heldByIncidentId: incident._id,
        bankChangeFlag: true,
        flaggedBankChangeId: id<"bankDetailChanges">("bc_1"),
        holdReasons: [...HOLD_REASONS, FLAG_REASON],
      },
);

export const holdAudit: Doc<"auditLog">[] = heldPayments
  .filter((p) => p.status === "held")
  .flatMap((p): Doc<"auditLog">[] => [
    {
      _id: id(`al_hold_${p._id}`),
      _creationTime: INCIDENT_AT,
      at: INCIDENT_AT,
      actor: "system",
      action: "hold",
      companyId: p.companyId,
      paymentId: p._id,
      incidentId: incident._id,
      rule: "hold_on_vendor_incident",
      reason: HOLD_REASONS[0],
    },
    {
      _id: id(`al_flag_${p._id}`),
      _creationTime: INCIDENT_AT,
      at: INCIDENT_AT,
      actor: "system",
      action: "flag",
      companyId: p.companyId,
      paymentId: p._id,
      incidentId: incident._id,
      rule: "bank_change_30d",
      reason: FLAG_REASON,
    },
  ]);

// Pre-generated AI text (Role 4 owns the real prompts). Never names the reporting company.
const alert = (
  key: string,
  kind: Doc<"alerts">["kind"],
  body: string,
  extra: Partial<
    Pick<Doc<"alerts">, "companyId" | "exposureId" | "paymentId">
  > = {},
): Doc<"alerts"> => ({
  _id: id(key),
  _creationTime: INCIDENT_AT,
  incidentId: incident._id,
  kind,
  status: "ready",
  body,
  ...extra,
});

export const alerts: Doc<"alerts">[] = [
  alert(
    "alt_b",
    "company_alert",
    "Urgent: Ledgerline Payroll, a vendor you share admin access with, has an open security incident. Rotate the shared admin account today and review Ledgerline sessions from the last 7 days. Your pending payment to Ledgerline is held until a controller verifies it.",
    { companyId: id("co_b"), exposureId: id("ex_b") },
  ),
  alert(
    "alt_c",
    "company_alert",
    "Urgent: Ledgerline Payroll has an open security incident, and you share a credential with it. Rotate that credential now. Ledgerline's bank details were changed by email two days before the incident; your $480,000 payment to that account is held until verified.",
    { companyId: id("co_c"), exposureId: id("ex_c") },
  ),
  alert(
    "alt_d",
    "company_alert",
    "Advisory: Ledgerline Payroll, a vendor you appear to use, has an open security incident. We have no record of a shared credential. Confirm with your IT team whether any Ledgerline access exists.",
    { companyId: id("co_d"), exposureId: id("ex_d") },
  ),
  alert(
    "alt_hold_c",
    "hold_notice",
    "Payment of $480,000 to Ledgerline Inc. is held until verified. Call Ledgerline at the number on file, +1 (415) 555-0148, to confirm the account ending 9921. Do not use a phone number from a recent email.",
    { companyId: id("co_c"), paymentId: id("pay_c") },
  ),
  alert(
    "alt_hold_b",
    "hold_notice",
    "Payment of $132,000 to Ledgerline Inc. is held until verified. Call Ledgerline at the number on file, +1 (415) 555-0148, before releasing. Do not use a phone number from a recent email.",
    { companyId: id("co_b"), paymentId: id("pay_b") },
  ),
  alert(
    "alt_vendor",
    "vendor_letter",
    "To the Ledgerline Inc. security team:\n\nSeveral companies in our portfolio use Ledgerline Payroll and have been notified of an open incident affecting your admin console. Please confirm (1) the scope of affected tenants, (2) whether any bank-detail change requests since October 1 were made through compromised sessions, and (3) when session tokens were revoked.\n\nOne coordinated answer to this letter reaches every affected company.",
  ),
];
