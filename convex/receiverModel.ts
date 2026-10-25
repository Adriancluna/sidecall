import { v, type Infer } from "convex/values";

export const receiverReceipt = v.object({
  version: v.literal(1), companyId: v.string(), commandId: v.string(), target: v.string(),
  action: v.union(v.literal("pause_shared_login"), v.literal("restore_shared_login")),
  incidentId: v.string(), commandHash: v.string(), provider: v.literal("okta"),
  status: v.union(v.literal("pending"), v.literal("unknown"), v.literal("confirmed"), v.literal("refused")),
  reason: v.string(), observedState: v.union(v.literal("ACTIVE"), v.literal("SUSPENDED"), v.null()),
  observedAt: v.union(v.number(), v.null()), restoreEligible: v.boolean(),
  sessionRevocation: v.union(v.literal("not_confirmed"), v.literal("not_requested"), v.literal("provider_acknowledged")),
});
export type ReceiverReceipt = Infer<typeof receiverReceipt>;
export const deliveryState = v.union(v.literal("ready"), v.literal("awaiting_operator"), v.literal("pending"),
  v.literal("unknown"), v.literal("confirmed"), v.literal("refused"));
