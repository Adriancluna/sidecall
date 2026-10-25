"use node";
import { v } from "convex/values";
import { env, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { deliver } from "../integrations/company-receiver/client.mjs";
import type { ReceiverReceipt } from "./receiverModel";

export const dispatch = internalAction({
  args: { jobId: v.id("responseDeliveries") },
  handler: async (ctx, { jobId }) => {
    const claim = await ctx.runMutation(internal.responseReceiver.claim, { jobId });
    if (!claim) return;
    try {
      const result = await deliver({ origin: claim.origin, secret: env.RESPONSE_RECEIVER_SECRET,
        command: JSON.parse(claim.commandJson), statusOnly: claim.statusOnly, timeoutMs: 20_000 });
      await ctx.runMutation(internal.responseReceiver.record, { jobId,
        // The mutation's runtime validator enforces the exact Okta receipt shape.
        ...(result.delivery === "authenticated_receipt" ? { receipt: result.receipt as ReceiverReceipt } : {}) });
    } catch {
      // Invalid/malformed evidence or action failure never becomes a fake success.
      await ctx.runMutation(internal.responseReceiver.record, { jobId });
    }
  },
});
