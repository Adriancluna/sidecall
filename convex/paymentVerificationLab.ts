// Internal, DEMO_MODE-only fixture for testing a bank-record change during verification.
// It can only replace the seeded Brightline record with the same masked destination.
import { v } from "convex/values";
import { env, internalMutation } from "./_generated/server";

export const replaceDemoPayeeRecord = internalMutation({
  args: { paymentId: v.id("payments") },
  returns: v.id("bankDetailChanges"),
  handler: async (ctx, { paymentId }) => {
    if (env.DEMO_MODE !== "true") throw new Error("Demo mode is required.");
    const payment = await ctx.db.get("payments", paymentId);
    if (!payment || payment.seedRef !== "pay_C_brightline_480k" ||
      payment.status !== "held" || payment.amountCents !== 48_000_000 || payment.accountLast4 !== "7731")
      throw new Error("Only the seeded held Brightline stage payment is supported.");
    const vendor = await ctx.db.get("assets", payment.assetId);
    if (vendor?.vendorName !== "Brightline Payroll Inc.") throw new Error("Unexpected demo vendor.");
    const latest = await ctx.db.query("bankDetailChanges")
      .withIndex("by_assetId_and_changedAt", q => q.eq("assetId", payment.assetId)).order("desc").first();
    if (!latest || latest.accountLast4 !== payment.accountLast4)
      throw new Error("A matching seeded bank record is required.");
    return await ctx.db.insert("bankDetailChanges", {
      assetId: payment.assetId, changedAt: Math.max(Date.now(), latest.changedAt + 1),
      accountLast4: latest.accountLast4, requestChannel: latest.requestChannel,
    });
  },
});
