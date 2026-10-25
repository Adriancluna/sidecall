import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// A bounded history scan can miss a paid row behind rejected attempts. Index each live status.
export async function livePaymentForBill(ctx: QueryCtx, billId: Id<"bills">) {
  for (const status of ["paid", "held", "pending"] as const) {
    const payment = await ctx.db.query("payments")
      .withIndex("by_billId_and_status", q => q.eq("billId", billId).eq("status", status)).first();
    if (payment) return payment;
  }
  return null;
}
