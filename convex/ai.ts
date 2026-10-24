// STUB owned by Role 4. Replace the insides with real model calls (pre-generated for the demo).
// Contract: each action runs once per incident, loops over its items, and writes through
// internal.alerts.saveAlert. Never name the reporting company. Hold notices say
// "held until verified", never "fraud", and point to the number on file.
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

const dollars = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;

export const generateAlert = internalAction({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.alerts.getWritingContext, args);
    if (!context) return null;
    for (const item of context.companyAlerts) {
      const opener =
        item.urgency === "urgent"
          ? `Urgent: act today.`
          : `Advisory: review this week.`;
      await ctx.runMutation(internal.alerts.saveAlert, {
        incidentId: args.incidentId,
        exposureId: item.exposureId,
        companyId: item.companyId,
        kind: "company_alert",
        body: `${opener} ${context.asset.vendorName} (${context.asset.name}) is under an active security incident. ${item.reasons.join(" ")} Rotate any credentials you share with ${context.asset.vendorName} and review recent access.`,
      });
    }
    return null;
  },
});

export const generateVendorLetter = internalAction({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.alerts.getWritingContext, args);
    if (!context) return null;
    await ctx.runMutation(internal.alerts.saveAlert, {
      incidentId: args.incidentId,
      kind: "vendor_letter",
      body: `To ${context.asset.vendorName}: several companies in our portfolio rely on ${context.asset.name}. Please confirm the scope of the incident, rotate every shared and admin credential across all of our accounts at once, and confirm your bank details by phone. Any bank-detail change requested by email in the last 30 days is on hold until verified.`,
    });
    return null;
  },
});

export const generateHoldNotice = internalAction({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.alerts.getWritingContext, args);
    if (!context) return null;
    for (const p of context.heldPayments) {
      const flag = p.bankChangeFlag
        ? ` The account ending ${p.accountLast4} was added recently.`
        : "";
      await ctx.runMutation(internal.alerts.saveAlert, {
        incidentId: args.incidentId,
        companyId: p.companyId,
        paymentId: p.paymentId,
        kind: "hold_notice",
        body: `Your ${dollars(p.amountCents)} payment to ${context.asset.vendorName} is held until verified.${flag} Call ${context.asset.vendorName} at the number on file, ${context.asset.phoneOnFile}, not a number from a recent email. A controller other than the requester can then release or reject it.`,
      });
    }
    return null;
  },
});
