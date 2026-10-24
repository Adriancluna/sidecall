// The data contract. Owned by Role 1 (Adrian). Ask before changing anything here.
// CONTRACT.md describes the same shapes in prose; this file wins if they disagree.
import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export const shareType = v.union(
  v.literal("shared_credential"),
  v.literal("shared_admin_access"),
  v.literal("same_vendor_only"),
);

export const linkSource = v.union(
  v.literal("self_reported"),
  v.literal("dns_inferred"),
);

export const userRole = v.union(
  v.literal("ap_clerk"),
  v.literal("controller"),
  v.literal("it"),
  v.literal("pe_partner"), // PE firm staff: sees every company, never releases payments
);

export const assetKind = v.union(
  v.literal("msp"),
  v.literal("idp"),
  v.literal("payroll"),
  v.literal("email"),
  v.literal("other"),
);

export const exposureStatus = v.union(
  v.literal("open"),
  v.literal("acknowledged"),
  v.literal("closed"),
);

export const urgency = v.union(v.literal("urgent"), v.literal("advisory"));

export const alertKind = v.union(
  v.literal("company_alert"),
  v.literal("vendor_letter"),
  v.literal("hold_notice"),
  v.literal("escalation"), // a held payment is near its due date and nobody has decided it
);

export const alertStatus = v.union(v.literal("pending"), v.literal("ready"));

export const requestChannel = v.union(
  v.literal("email"),
  v.literal("portal"),
  v.literal("verified_call"),
);

// "released" is kept for contract compatibility. releasePayment moves held -> paid
// in one transaction, so nothing sits in "released" today.
export const paymentStatus = v.union(
  v.literal("pending"),
  v.literal("held"),
  v.literal("released"),
  v.literal("rejected"),
  v.literal("paid"),
);

export const ledgerAccount = v.union(
  v.literal("cash"),
  v.literal("accounts_payable"),
  v.literal("expense"),
  v.literal("equity"), // opening balances only
);

export const auditAction = v.union(
  v.literal("hold"),
  v.literal("flag"),
  v.literal("release"),
  v.literal("reject"),
  v.literal("refused"),
  v.literal("escalate"),
  v.literal("contain"),
);

export const notifyEvent = v.union(
  v.literal("alert"),
  v.literal("hold"),
  v.literal("escalation"),
  v.literal("incident"),
  v.literal("contained"),
);
export const notifyKind = v.union(v.literal("slack"), v.literal("discord"), v.literal("webhook"));
export const notifyStatus = v.union(
  v.literal("queued"),
  v.literal("sending"), // claimed by a dispatch run, so two runs never send the same row
  v.literal("sent"),
  v.literal("simulated"), // NOTIFY_LIVE off: written to the outbox, never sent (stage rule)
  v.literal("failed"),
);

export const evidenceItem = v.object({ kind: v.string(), detail: v.string() });

export const ledgerLine = v.object({
  account: ledgerAccount,
  debitCents: v.number(),
  creditCents: v.number(),
});

export default defineSchema({
  ...authTables, // Convex Auth sessions/accounts; `users` below extends its users table

  companies: defineTable({
    name: v.string(),
    domain: v.string(),
    sector: v.string(),
    headcount: v.number(),
    holdRuleEnabled: v.boolean(), // each company opts in to payment holds itself
  }).index("by_domain", ["domain"]),

  // Our people, extended with Convex Auth's user fields. Sign-in links to an existing
  // row by email (convex/auth.ts); nobody outside the seeded portfolio can sign up.
  users: defineTable({
    companyId: v.optional(v.id("companies")), // absent for pe_partner
    name: v.string(),
    role: userRole,
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    image: v.optional(v.string()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
  })
    .index("by_companyId", ["companyId"])
    .index("email", ["email"]), // name required by Convex Auth

  assets: defineTable({
    name: v.string(),
    vendorName: v.string(),
    kind: assetKind,
    phoneOnFile: v.string(), // the number to call when verifying a held payment
  })
    .index("by_name", ["name"])
    .index("by_vendorName", ["vendorName"]),

  links: defineTable({
    companyId: v.id("companies"),
    assetId: v.id("assets"),
    shareType,
    source: linkSource,
    detail: v.optional(v.string()), // dns_inferred: the record that suggested it, e.g. "MX → mx.relaymail.example"
  })
    .index("by_assetId", ["assetId"])
    .index("by_companyId", ["companyId"]),

  incidents: defineTable({
    externalId: v.string(), // dedupe key for POST /incident
    assetId: v.id("assets"),
    reportedByCompanyId: v.optional(v.id("companies")), // only the PE firm view may show this
    summary: v.optional(v.string()),
    createdAt: v.number(),
    // Set by the PE firm once the vendor has remediated. New payments stop being held;
    // payments already held still need a controller's decision.
    containedAt: v.optional(v.number()),
    containedBy: v.optional(v.id("users")),
    containmentNote: v.optional(v.string()),
  })
    .index("by_externalId", ["externalId"])
    .index("by_assetId", ["assetId"]),

  exposures: defineTable({
    incidentId: v.id("incidents"),
    companyId: v.id("companies"),
    status: exposureStatus,
    acknowledgedBy: v.optional(v.id("users")), // the one browser that won the race
    acknowledgedAt: v.optional(v.number()),
    urgency,
    score: v.number(), // 0..100
    confidence: v.number(), // 0..1; self_reported links weigh more than dns_inferred
    reasons: v.array(v.string()),
    evidence: v.array(evidenceItem),
  })
    .index("by_companyId", ["companyId"])
    .index("by_incidentId_and_companyId", ["incidentId", "companyId"]),

  alerts: defineTable({
    incidentId: v.id("incidents"),
    exposureId: v.optional(v.id("exposures")),
    companyId: v.optional(v.id("companies")),
    paymentId: v.optional(v.id("payments")),
    kind: alertKind,
    status: alertStatus,
    body: v.string(),
    readyAt: v.optional(v.number()), // when the final text was written (timeline)
  })
    .index("by_incidentId_and_kind", ["incidentId", "kind"])
    .index("by_exposureId", ["exposureId"])
    .index("by_companyId", ["companyId"])
    .index("by_paymentId_and_kind", ["paymentId", "kind"]),

  // ---- Money layer ----

  bankDetailChanges: defineTable({
    assetId: v.id("assets"),
    changedAt: v.number(),
    accountLast4: v.string(),
    requestChannel,
    seedRef: v.optional(v.string()), // stable key for data/answer_key.json
  }).index("by_assetId_and_changedAt", ["assetId", "changedAt"]),

  bills: defineTable({
    companyId: v.id("companies"),
    assetId: v.id("assets"),
    amountCents: v.number(),
    dueDate: v.number(),
    description: v.string(),
  })
    .index("by_companyId", ["companyId"])
    .index("by_assetId", ["assetId"]),

  payments: defineTable({
    billId: v.id("bills"),
    companyId: v.id("companies"),
    assetId: v.id("assets"),
    amountCents: v.number(),
    accountLast4: v.string(),
    status: paymentStatus,
    requestedBy: v.id("users"),
    approvedBy: v.optional(v.id("users")),
    heldByIncidentId: v.optional(v.id("incidents")),
    bankChangeFlag: v.optional(v.boolean()),
    flaggedBankChangeId: v.optional(v.id("bankDetailChanges")),
    holdReasons: v.optional(v.array(v.string())),
    verificationNote: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
    dueDate: v.optional(v.number()), // copied from the bill; drives escalation
    escalatedAt: v.optional(v.number()),
    seedRef: v.optional(v.string()), // stable key for data/answer_key.json
  })
    .index("by_assetId_and_status", ["assetId", "status"])
    .index("by_companyId_and_status", ["companyId", "status"])
    .index("by_heldByIncidentId", ["heldByIncidentId"])
    .index("by_status_and_dueDate", ["status", "dueDate"])
    .index("by_billId", ["billId"]),

  // Double-entry. Bill booked: Dr expense / Cr accounts_payable.
  // Payment released: Dr accounts_payable / Cr cash. Held payments never touch cash.
  ledgerEntries: defineTable({
    companyId: v.id("companies"),
    date: v.number(),
    memo: v.string(),
    paymentId: v.optional(v.id("payments")),
    billId: v.optional(v.id("bills")),
    lines: v.array(ledgerLine),
  })
    .index("by_companyId_and_date", ["companyId", "date"])
    .index("by_paymentId", ["paymentId"]),

  // ---- Notifications (docs/specs/notifications.md) ----

  notificationChannels: defineTable({
    scope: v.union(v.literal("company"), v.literal("firm")),
    companyId: v.optional(v.id("companies")), // set for scope "company"
    kind: notifyKind,
    label: v.string(),
    url: v.string(), // secret: never returned to clients (listChannels masks it)
    events: v.array(notifyEvent),
    enabled: v.boolean(),
    createdBy: v.id("users"),
  })
    .index("by_companyId", ["companyId"])
    .index("by_scope", ["scope"]),

  // Outbox: one row per (channel, refId); refId is "<event>:<alert or incident id>" or "test:<time>".
  notifications: defineTable({
    channelId: v.id("notificationChannels"),
    companyId: v.optional(v.id("companies")),
    incidentId: v.optional(v.id("incidents")),
    event: v.union(notifyEvent, v.literal("test")),
    refId: v.string(),
    status: notifyStatus,
    text: v.string(),
    error: v.optional(v.string()),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
  })
    .index("by_channelId_and_refId", ["channelId", "refId"])
    .index("by_incidentId", ["incidentId"])
    .index("by_status", ["status"])
    .index("by_companyId", ["companyId"]),

  auditLog: defineTable({
    at: v.number(),
    actor: v.union(v.literal("system"), v.id("users")),
    action: auditAction,
    companyId: v.optional(v.id("companies")),
    paymentId: v.optional(v.id("payments")),
    incidentId: v.optional(v.id("incidents")),
    rule: v.string(),
    reason: v.string(),
  })
    .index("by_paymentId", ["paymentId"])
    .index("by_incidentId", ["incidentId"])
    .index("by_companyId_and_incidentId", ["companyId", "incidentId"]),
});
