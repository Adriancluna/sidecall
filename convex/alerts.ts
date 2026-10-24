// Alert storage. Mutations write pending template text; the AI actions in ai.ts
// rewrite it and call saveAlert. Nothing here ever names the reporting company.
import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { alertKind } from "./schema";
import { getViewer } from "./access";

// Upsert: replaces the pending alert for the same exposure / payment / vendor letter,
// or inserts a new one. Role 4's actions call this.
export const saveAlert = internalMutation({
  args: {
    incidentId: v.id("incidents"),
    exposureId: v.optional(v.id("exposures")),
    companyId: v.optional(v.id("companies")),
    paymentId: v.optional(v.id("payments")),
    kind: alertKind,
    body: v.string(),
  },
  handler: async (ctx, args) => {
    let existing = null;
    if (args.exposureId) {
      existing = await ctx.db
        .query("alerts")
        .withIndex("by_exposureId", (q) => q.eq("exposureId", args.exposureId))
        .first();
    } else if (args.paymentId) {
      existing = await ctx.db
        .query("alerts")
        .withIndex("by_paymentId", (q) => q.eq("paymentId", args.paymentId))
        .first();
    } else if (args.kind === "vendor_letter") {
      existing = await ctx.db
        .query("alerts")
        .withIndex("by_incidentId_and_kind", (q) =>
          q.eq("incidentId", args.incidentId).eq("kind", "vendor_letter"),
        )
        .first();
    }
    if (existing) {
      await ctx.db.patch("alerts", existing._id, { body: args.body, status: "ready" });
      return existing._id;
    }
    return await ctx.db.insert("alerts", { ...args, status: "ready" });
  },
});

// Everything the AI writers need for one incident, without the reporter's identity.
export const getWritingContext = internalQuery({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, args) => {
    const incident = await ctx.db.get("incidents", args.incidentId);
    if (!incident) return null;
    const asset = await ctx.db.get("assets", incident.assetId);
    if (!asset) return null;

    const exposures = await ctx.db
      .query("exposures")
      .withIndex("by_incidentId_and_companyId", (q) => q.eq("incidentId", args.incidentId))
      .take(200);
    const companyAlerts = await Promise.all(
      exposures.map(async (e) => {
        const company = await ctx.db.get("companies", e.companyId);
        return {
          exposureId: e._id,
          companyId: e.companyId,
          companyName: company?.name ?? "",
          urgency: e.urgency,
          reasons: e.reasons,
          confidence: e.confidence,
        };
      }),
    );

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_heldByIncidentId", (q) => q.eq("heldByIncidentId", args.incidentId))
      .take(200);
    const heldPayments = await Promise.all(
      payments.map(async (p) => {
        const company = await ctx.db.get("companies", p.companyId);
        return {
          paymentId: p._id,
          companyId: p.companyId,
          companyName: company?.name ?? "",
          amountCents: p.amountCents,
          accountLast4: p.accountLast4,
          bankChangeFlag: p.bankChangeFlag ?? false,
          holdReasons: p.holdReasons ?? [],
        };
      }),
    );

    return {
      incidentId: incident._id,
      summary: incident.summary ?? null,
      asset: {
        name: asset.name,
        vendorName: asset.vendorName,
        kind: asset.kind,
        phoneOnFile: asset.phoneOnFile,
      },
      companyAlerts,
      heldPayments,
    };
  },
});

// A company's own alerts.
export const getMyAlerts = query({
  args: { actingUserId: v.id("users") },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx, args.actingUserId);
    if (viewer.firm) return [];
    return await ctx.db
      .query("alerts")
      .withIndex("by_companyId", (q) => q.eq("companyId", viewer.companyId))
      .order("desc")
      .take(100);
  },
});

// PE firm view: every alert for an incident, including the vendor letter.
export const getIncidentAlerts = query({
  args: { incidentId: v.id("incidents"), actingUserId: v.id("users") },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx, args.actingUserId);
    if (!viewer.firm) return [];
    const kinds = ["company_alert", "vendor_letter", "hold_notice"] as const;
    const groups = await Promise.all(
      kinds.map((kind) =>
        ctx.db
          .query("alerts")
          .withIndex("by_incidentId_and_kind", (q) =>
            q.eq("incidentId", args.incidentId).eq("kind", kind),
          )
          .take(200),
      ),
    );
    return groups.flat();
  },
});
