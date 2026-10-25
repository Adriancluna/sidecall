import { v } from "convex/values";

export const purchaseCheck = v.object({ code: v.string(), passed: v.boolean(), reason: v.string() });
export const purchaseBillFacts = v.object({ assetId: v.id("assets"), amountCents: v.number(), description: v.string(), dueDate: v.number() });
export const purchasePayeeFacts = v.object({ bankDetailId: v.id("bankDetailChanges"), accountLast4: v.string(), changedAt: v.number(), requestChannel: v.string() });
export const purchaseEvidence = v.object({
  version: v.literal(1), currency: v.literal("USD"), evaluatedAt: v.number(),
  executorScope: v.union(v.literal("company_ap"), v.literal("specific_agent")),
  executorAgentId: v.union(v.id("agents"), v.null()),
  checks: v.array(purchaseCheck),
  expected: v.object({ mandateId: v.id("purchaseMandates"), quoteId: v.union(v.id("purchaseQuotes"), v.null()),
    bill: v.union(purchaseBillFacts, v.null()), payee: purchasePayeeFacts,
    approvedBy: v.id("users"), expiresAt: v.number() }),
  current: v.object({ bill: purchaseBillFacts, payee: v.union(purchasePayeeFacts, v.null()),
    agentId: v.union(v.id("agents"), v.null()), incidentId: v.union(v.id("incidents"), v.null()) }),
  budget: v.object({ beforeCents: v.number(), afterCents: v.number(), limitCents: v.number() }),
});

export const paymentRequestResult = v.union(
  v.object({ ok: v.literal(true), paymentId: v.id("payments"), held: v.boolean(), flagged: v.boolean(),
    automatic: v.optional(v.boolean()), receiptId: v.optional(v.id("purchaseReceipts")) }),
  v.object({ ok: v.literal(false), reason: v.string(), receiptId: v.optional(v.id("purchaseReceipts")) }),
);

// Explicit return shapes keep persisted approval/receipt evidence inspectable without returning
// agent credentials or relying on unvalidated database documents at the public boundary.
export const purchaseMandateFields = {
  _id: v.id("purchaseMandates"), _creationTime: v.number(),
  companyId: v.id("companies"), assetId: v.id("assets"),
  bankDetailId: v.id("bankDetailChanges"), accountLast4: v.string(), bankChangedAt: v.number(),
  perPurchaseCents: v.number(), budgetCents: v.number(), spentCents: v.number(),
  approvedBy: v.id("users"), executorAgentId: v.optional(v.id("agents")),
  createdAt: v.number(), expiresAt: v.number(), revokedAt: v.optional(v.number()),
};
export const purchaseQuote = v.object({
  _id: v.id("purchaseQuotes"), _creationTime: v.number(),
  mandateId: v.id("purchaseMandates"), billId: v.id("bills"), assetId: v.id("assets"),
  amountCents: v.number(), description: v.string(), dueDate: v.number(),
  priorRejectionId: v.optional(v.id("payments")),
});
export const purchaseReceipt = v.object({
  _id: v.id("purchaseReceipts"), _creationTime: v.number(),
  companyId: v.id("companies"), mandateId: v.id("purchaseMandates"), billId: v.id("bills"),
  paymentId: v.optional(v.id("payments")), actorId: v.id("users"), agentId: v.optional(v.id("agents")),
  requestId: v.optional(v.string()), ledgerEntryId: v.optional(v.id("ledgerEntries")),
  evidence: v.optional(purchaseEvidence), at: v.number(), amountCents: v.number(),
  outcome: v.union(v.literal("paid_demo"), v.literal("refused")), rule: v.string(), reason: v.string(),
});
export const purchasePreview = v.union(v.null(), v.object({
  decision: v.union(v.literal("manual"), v.literal("refused"), v.literal("approved")),
  reason: v.string(), evidence: v.union(purchaseEvidence, v.null()),
  mandateId: v.union(v.id("purchaseMandates"), v.null()), existingPaymentId: v.union(v.id("payments"), v.null()),
}));
export const purchaseOverview = v.union(v.null(), v.object({
  eligibleAgents: v.array(v.object({ id: v.id("agents"), name: v.string(), onBehalfOfName: v.string() })),
  canApprove: v.boolean(), demoOnly: v.literal(true), enabled: v.boolean(),
  mandates: v.array(v.object({ ...purchaseMandateFields,
    executorScope: v.union(v.literal("company_ap"), v.literal("specific_agent")),
    executorAgentName: v.union(v.string(), v.null()), vendorName: v.string(), approvedByName: v.string(), billCount: v.number(),
  })),
  receipts: v.array(purchaseReceipt),
}));
export const purchaseRecord = v.union(v.null(), v.object({
  format: v.literal("sidecall.purchase-record.v1"), settlement: v.literal("demo_ledger"), companyId: v.id("companies"),
  receipts: v.array(purchaseReceipt),
  approvals: v.array(v.object({ ...purchaseMandateFields, quotes: v.array(purchaseQuote), quotesTruncated: v.boolean() })),
  receiptsTruncated: v.boolean(), scope: v.string(),
}));
