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
