// Alert storage. Mutations write pending template text; the AI actions in ai.ts
// rewrite it and call saveAlert. Nothing here ever names the reporting company.
import { v, type Infer } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { alertKind } from "./schema";
import type { Id } from "./_generated/dataModel";
import { getViewer } from "./access";
import { enqueueAlert } from "./notifications";
import { ATTACK_TECHNIQUES } from "./findings";
import { MAX_FANOUT, memo } from "./shared";

const alertInput = v.object({
  incidentId: v.id("incidents"),
  exposureId: v.optional(v.id("exposures")),
  companyId: v.optional(v.id("companies")),
  paymentId: v.optional(v.id("payments")),
  kind: alertKind,
  body: v.string(),
});
type AlertInput = Infer<typeof alertInput>;

// Upsert: replaces the pending alert for the same exposure / payment / vendor letter,
// or inserts a new one.
async function upsertAlert(ctx: MutationCtx, args: AlertInput) {
  let existing = null;
  if (args.exposureId) {
    existing = await ctx.db
      .query("alerts")
      .withIndex("by_exposureId", (q) => q.eq("exposureId", args.exposureId))
      .first();
  } else if (args.paymentId) {
    existing = await ctx.db
      .query("alerts")
      .withIndex("by_paymentId_and_kind", (q) =>
        q.eq("paymentId", args.paymentId).eq("kind", args.kind),
      )
      .first();
  } else if (args.kind === "vendor_letter") {
    existing = await ctx.db
      .query("alerts")
      .withIndex("by_incidentId_and_kind", (q) =>
        q.eq("incidentId", args.incidentId).eq("kind", "vendor_letter"),
      )
      .first();
  }
  if (!existing) return await insertReadyAlert(ctx, args);
  await ctx.db.patch("alerts", existing._id, { body: args.body, status: "ready", readyAt: Date.now() });
  // Ready text goes out to the company's channels (deduped per alert, so rewrites don't resend).
  await enqueueAlert(ctx, { _id: existing._id, kind: args.kind, body: args.body, incidentId: args.incidentId, companyId: args.companyId });
  return existing._id;
}

// The one way to write an alert that is ready now: inserts it and queues its notification, so
// no caller can forget the second half.
export async function insertReadyAlert(ctx: MutationCtx, alert: AlertInput) {
  const alertId = await ctx.db.insert("alerts", { ...alert, status: "ready", readyAt: Date.now() });
  await enqueueAlert(ctx, { _id: alertId, ...alert });
  return alertId;
}

// One alert. Role 4's actions call this (or saveAlerts below).
export const saveAlert = internalMutation({
  args: alertInput.fields,
  handler: async (ctx, args) => await upsertAlert(ctx, args),
});

// Many alerts in one transaction: use this from a loop over hundreds of companies, so every
// alert lands at once instead of one round trip each (~7 s → well under 1 s at 300 companies).
export const saveAlerts = internalMutation({
  args: { alerts: v.array(alertInput) },
  handler: async (ctx, args) => {
    for (const alert of args.alerts) await upsertAlert(ctx, alert);
    return { saved: args.alerts.length };
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

    const companyById = memo((id: Id<"companies">) => ctx.db.get("companies", id));
    const exposures = await ctx.db
      .query("exposures")
      .withIndex("by_incidentId_and_companyId", (q) => q.eq("incidentId", args.incidentId))
      .take(MAX_FANOUT);
    const companyAlerts = await Promise.all(
      exposures.map(async (e) => {
        const company = await companyById(e.companyId);
        return {
          exposureId: e._id,
          companyId: e.companyId,
          companyName: company?.name ?? "",
          urgency: e.urgency,
          reasons: e.reasons,
          confidence: e.confidence,
          // Sister-safe path sentence (scoring.ts sisterPath); null without a finding.
          pathSummary: e.evidence.find((x) => x.kind === "path")?.detail ?? null,
        };
      }),
    );

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_heldByIncidentId", (q) => q.eq("heldByIncidentId", args.incidentId))
      .take(MAX_FANOUT);
    const heldPayments = await Promise.all(
      payments.map(async (p) => {
        const company = await companyById(p.companyId);
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
      externalId: incident.externalId, // e.g. "demo-brightline-001": key for pre-generated text
      summary: incident.summary ?? null,
      // Only ids and names from our ATT&CK table: safe for sister alerts and the vendor letter.
      technique: incident.finding
        ? { id: incident.finding.technique.id, name: ATTACK_TECHNIQUES[incident.finding.technique.id] ?? null }
        : null,
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
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
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
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer.firm) return [];
    const kinds = ["company_alert", "vendor_letter", "hold_notice"] as const;
    const groups = await Promise.all(
      kinds.map((kind) =>
        ctx.db
          .query("alerts")
          .withIndex("by_incidentId_and_kind", (q) =>
            q.eq("incidentId", args.incidentId).eq("kind", kind),
          )
          .take(MAX_FANOUT),
      ),
    );
    return groups.flat();
  },
});
