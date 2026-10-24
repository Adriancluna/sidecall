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

const linkSource = v.union(
  v.literal("self_reported"),
  v.literal("dns_inferred"),
);

export const userRole = v.union(
  v.literal("ap_clerk"),
  v.literal("controller"),
  v.literal("it"),
  v.literal("pe_partner"), // PE firm staff: sees every company, never releases payments
);

const assetKind = v.union(
  v.literal("msp"),
  v.literal("idp"),
  v.literal("payroll"),
  v.literal("email"),
  v.literal("other"),
);

const exposureStatus = v.union(
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

const alertStatus = v.union(v.literal("pending"), v.literal("ready"));

export const requestChannel = v.union(
  v.literal("email"),
  v.literal("portal"),
  v.literal("verified_call"),
);

// "released" is kept for contract compatibility. releasePayment moves held -> paid
// in one transaction, so nothing sits in "released" today.
const paymentStatus = v.union(
  v.literal("pending"),
  v.literal("held"),
  v.literal("released"),
  v.literal("rejected"),
  v.literal("paid"),
);

const ledgerAccount = v.union(
  v.literal("cash"),
  v.literal("accounts_payable"),
  v.literal("expense"),
  v.literal("equity"), // opening balances only
);

const auditAction = v.union(
  v.literal("hold"),
  v.literal("flag"),
  v.literal("release"),
  v.literal("reject"),
  v.literal("refused"),
  v.literal("escalate"),
  v.literal("contain"),
  v.literal("import"),
  v.literal("agent_call"), // an AI assistant used a tool over MCP (convex/mcp.ts)
  // Response playbook (convex/responses.ts): a pre-approved step ran, someone approved or undid
  // one, a waiting step expired, or a company changed its playbook.
  v.literal("respond"),
  v.literal("approve"),
  v.literal("undo"),
  v.literal("expire"),
  v.literal("policy"),
);

// Response playbook (docs/specs/response-playbook.md). Steps a company lets Sidecall take for it,
// set in advance: "notify" = tell us, "prepare" = one click by our IT lead, "act" = run it on report.
// hold_payments isn't stored here: it mirrors companies.holdRuleEnabled.
export const responseAction = v.union(v.literal("pause_shared_login"), v.literal("revoke_vendor_tokens"));
export const playbookAction = v.union(v.literal("hold_payments"), responseAction);
export const responseMode = v.union(v.literal("notify"), v.literal("prepare"), v.literal("act"));
export const stepStatus = v.union(
  v.literal("awaiting_approval"), // "prepare": one click away
  v.literal("queued"), // "act", or approved: the executor runs it
  v.literal("done"),
  v.literal("undone"),
  v.literal("expired"), // still waiting when the incident was contained
  v.literal("failed"),
);

export const notifyEvent = v.union(
  v.literal("alert"),
  v.literal("hold"),
  v.literal("escalation"),
  v.literal("incident"),
  v.literal("contained"),
);
export const notifyKind = v.union(v.literal("slack"), v.literal("discord"), v.literal("webhook"));
const notifyStatus = v.union(
  v.literal("queued"),
  v.literal("sending"), // claimed by a dispatch run, so two runs never send the same row
  v.literal("sent"),
  v.literal("simulated"), // NOTIFY_LIVE off: written to the outbox, never sent (stage rule)
  v.literal("failed"),
);

const evidenceItem = v.object({ kind: v.string(), detail: v.string() });

// A validated finding from an autonomous red team (our own schema, modelled on what such tools
// report; not any vendor's format). Stored firm-only on the incident. convex/findings.ts parses it.
export const findingHopKind = v.union(
  v.literal("foothold"),
  v.literal("credential"),
  v.literal("system"),
  v.literal("vendor_tenant"),
);
export const findingTerminalKind = v.union(v.literal("credential"), v.literal("vendor_tenant"));
export const finding = v.object({
  source: v.union(v.literal("armadin"), v.literal("manual")),
  findingId: v.string(),
  engagementId: v.optional(v.string()),
  validatedAt: v.number(),
  technique: v.object({ id: v.string(), name: v.union(v.string(), v.null()) }),
  terminalKind: findingTerminalKind,
  path: v.array(v.object({ kind: findingHopKind, label: v.string() })), // the reporter's hops: firm-only
  evidence: v.array(v.object({ kind: v.string(), summary: v.string() })),
  confidence: v.union(v.number(), v.null()),
});

// What a sister company learns from a finding. Built from Sidecall's own asset and link rows,
// never from the finding's hop labels, and never called validated at the sister.
export const exposurePath = v.object({
  techniqueId: v.string(),
  techniqueName: v.union(v.string(), v.null()), // only names from our built-in ATT&CK table
  sharedHop: v.string(),
  linkType: shareType,
  here: v.literal("reachable_not_tested"),
  whatToCheck: v.optional(v.string()), // the concrete check for this company's IT lead
});

const ledgerLine = v.object({
  account: ledgerAccount,
  debitCents: v.number(),
  creditCents: v.number(),
});

export default defineSchema({
  ...authTables, // Convex Auth sessions/accounts; `users` below extends its users table

  // Owned test resources only. These tokens confer no access to an actual identity provider.
  sandboxResources: defineTable({
    companyId: v.id("companies"), assetId: v.id("assets"), tokenHash: v.string(),
    paused: v.boolean(), revoked: v.boolean(),
  }).index("by_tokenHash", ["tokenHash"]).index("by_companyId_and_assetId", ["companyId", "assetId"]),

  investigations: defineTable({
    companyId: v.id("companies"),
    submittedBy: v.id("users"),
    sourceText: v.string(),
    createdAt: v.number(),
    status: v.union(v.literal("queued"), v.literal("complete"), v.literal("failed")),
    completedAt: v.optional(v.number()),
    engine: v.optional(v.union(v.literal("structured_text"), v.literal("model"))),
    result: v.optional(v.object({
      disposition: v.union(v.literal("review_required"), v.literal("consistent")),
      vendorName: v.union(v.string(), v.null()),
      invoiceNumber: v.union(v.string(), v.null()),
      amountCents: v.union(v.number(), v.null()),
      accountLast4: v.union(v.string(), v.null()),
      evidence: v.array(v.object({ field: v.string(), quote: v.string() })),
      reasons: v.array(v.string()),
      assetId: v.optional(v.id("assets")),
      trustedPhone: v.union(v.string(), v.null()),
      verifiedAccountLast4: v.union(v.string(), v.null()),
      paymentIds: v.array(v.id("payments")),
    })),
    error: v.optional(v.string()),
  }).index("by_companyId", ["companyId"]),

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
  }).index("by_assetId", ["assetId"]),

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
    finding: v.optional(finding), // present when the report is a validated red-team finding
    responseClass: v.optional(v.union(v.literal("observation"), v.literal("vendor"), v.literal("credential"))),
    correlationKey: v.optional(v.string()), // server-derived episode key, never supplied by the sender
    correlatedReports: v.optional(v.number()),
    lastReportedAt: v.optional(v.number()),
    evidenceRefs: v.optional(v.array(v.string())), // bounded, firm-only, references not instructions
    reviewDueAt: v.optional(v.number()), // fixed at first acceptance; repeats never extend it
    reviewedAt: v.optional(v.number()),
    reviewEscalatedAt: v.optional(v.number()),
  })
    .index("by_externalId", ["externalId"])
    .index("by_correlationKey", ["correlationKey"])
    .index("by_lastReportedAt", ["lastReportedAt"])
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
    path: v.optional(exposurePath), // set when the incident carries a finding
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
  }).index("by_companyId", ["companyId"]),

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
    // The escalation cron reads only held payments not yet escalated (escalatedAt unset).
    .index("by_status_and_escalatedAt_and_dueDate", ["status", "escalatedAt", "dueDate"])
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
    .index("by_companyId_and_date", ["companyId", "date"]),

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
    claimedAt: v.optional(v.number()), // set when a dispatch run takes the row ("sending")
    sentAt: v.optional(v.number()),
  })
    .index("by_channelId_and_refId", ["channelId", "refId"])
    .index("by_incidentId", ["incidentId"])
    .index("by_status", ["status"])
    .index("by_companyId", ["companyId"]),

  // AI assistants that use Sidecall over MCP, each acting on behalf of one seeded person (by
  // email, so it survives reseeds). Only the token's sha256 is stored. Not cleared by resets.
  agents: defineTable({
    name: v.string(),
    tokenHash: v.string(),
    onBehalfOfEmail: v.string(),
    tools: v.array(v.string()),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_name", ["name"]),

  // One row per (company, step): the mode in force. Upgrading to "act" takes two different people:
  // the first call stores proposedMode, a second person confirms it.
  responsePolicies: defineTable({
    companyId: v.id("companies"),
    action: responseAction,
    mode: responseMode,
    version: v.number(), // +1 on every change; history is in auditLog ("policy")
    setBy: v.union(v.id("users"), v.literal("seed")),
    confirmedBy: v.optional(v.id("users")),
    setAt: v.number(),
    proposedMode: v.optional(responseMode),
    proposedBy: v.optional(v.id("users")),
    proposedAt: v.optional(v.number()),
  }).index("by_companyId_and_action", ["companyId", "action"]),

  // A step planned for one exposed company in one incident (only "prepare" and "act" are stored;
  // "notify" steps are worked out when read). External effects are simulated: no live connector.
  responseSteps: defineTable({
    incidentId: v.id("incidents"),
    companyId: v.id("companies"),
    exposureId: v.id("exposures"),
    action: responseAction,
    mode: v.union(v.literal("prepare"), v.literal("act")), // effective, after caps
    status: stepStatus,
    target: v.string(), // our own asset name: never the reporter or a finding label
    policyRule: v.string(), // "playbook:pause_shared_login:act:v2"
    capNote: v.optional(v.string()), // why the company's mode was lowered for this step
    plannedAt: v.number(),
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    executedAt: v.optional(v.number()),
    executionMode: v.optional(v.union(v.literal("simulated"), v.literal("sandbox"))),
    undoneBy: v.optional(v.id("users")),
    undoneAt: v.optional(v.number()),
  })
    .index("by_incidentId_and_companyId_and_action", ["incidentId", "companyId", "action"])
    .index("by_companyId_and_action_and_target", ["companyId", "action", "target"])
    .index("by_incidentId_and_status", ["incidentId", "status"]),

  auditLog: defineTable({
    at: v.number(),
    actor: v.union(v.literal("system"), v.id("users"), v.id("agents")),
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
