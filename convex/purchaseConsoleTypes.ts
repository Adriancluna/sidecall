import { v } from "convex/values";
import { paymentRequestResult, purchaseReceipt } from "./purchaseTypes";

export const runStatus = v.union(v.literal("queued"), v.literal("running"), v.literal("paid"), v.literal("held"),
  v.literal("pending"), v.literal("refused"), v.literal("declined"), v.literal("failed"), v.literal("cancelled"));
export const runSnapshot = v.object({ billId: v.id("bills"), assetId: v.id("assets"), vendorName: v.string(),
  description: v.string(), amountCents: v.number(), dueDate: v.number(), bankRecordId: v.id("bankDetailChanges"),
  bankChangedAt: v.number(), accountLast4: v.string() });
export const runEvent = v.object({ at: v.number(), kind: v.string(), title: v.string(), detail: v.string() });
export const defenseProof = v.object({ at: v.number(), passed: v.boolean(),
  checks: v.array(v.object({ name: v.string(), passed: v.boolean(), detail: v.string() })),
  paymentPostingCountBefore: v.number(), paymentPostingCountAfter: v.number(),
  paymentDebitCentsBefore: v.number(), paymentDebitCentsAfter: v.number() });
export const runFields = {
  companyId: v.id("companies"), requestedBy: v.id("users"), billId: v.id("bills"), mandateId: v.id("purchaseMandates"),
  clientRequestId: v.string(), requestId: v.string(), sourceText: v.string(), sourceSha256: v.string(), snapshot: runSnapshot,
  status: runStatus, createdAt: v.number(), expiresAt: v.number(), finishedAt: v.optional(v.number()),
  model: v.string(), modelCalls: v.number(), inputTokens: v.number(), outputTokens: v.number(),
  readBill: v.boolean(), events: v.array(runEvent), outcome: v.optional(paymentRequestResult),
  reason: v.optional(v.string()), proof: v.optional(defenseProof),
};
export const runDocument = v.object({ _id: v.id("purchaseRuns"), _creationTime: v.number(), ...runFields });
export const consoleState = v.union(v.null(), v.object({ canRun: v.boolean(), configured: v.boolean(),
  configurationReason: v.string(), model: v.string(), requesterName: v.string(),
  runs: v.array(v.object({ run: runDocument, requesterName: v.string(), receipt: v.union(purchaseReceipt, v.null()) })) }));
