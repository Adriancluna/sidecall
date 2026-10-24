// Incident intake and fan-out. One transaction writes the incident, every exposure,
// every payment hold, the pending alerts, and schedules the AI writers once.
import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { holdPaymentsForIncident } from "./payments";
import { scoreExposure } from "./scoring";
import { getViewer } from "./access";
import { enqueue, scheduleDispatchIfQueued } from "./notifications";
import { formatUsd, MAX_FANOUT } from "./shared";

export type RecordIncidentResult =
  | { ok: true; incidentId: Id<"incidents">; duplicate: boolean }
  | { ok: false; error: "unknown_asset" };

export const incidentArgs = {
  externalId: v.string(),
  assetName: v.string(),
  reportedByDomain: v.optional(v.string()),
  summary: v.optional(v.string()),
};

export async function recordIncidentImpl(
  ctx: MutationCtx,
  args: {
    externalId: string;
    assetName: string;
    reportedByDomain?: string;
    summary?: string;
  },
): Promise<RecordIncidentResult> {
  // Idempotency: a replayed webhook returns the original incident and writes nothing.
  const existing = await ctx.db
    .query("incidents")
    .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId))
    .unique();
  if (existing) return { ok: true, incidentId: existing._id, duplicate: true };

  const asset = await ctx.db
    .query("assets")
    .withIndex("by_name", (q) => q.eq("name", args.assetName))
    .first();
  if (!asset) return { ok: false, error: "unknown_asset" };

  const reporter = args.reportedByDomain
    ? await ctx.db
        .query("companies")
        .withIndex("by_domain", (q) => q.eq("domain", args.reportedByDomain!))
        .unique()
    : null;

  const incidentId = await ctx.db.insert("incidents", {
    externalId: args.externalId,
    assetId: asset._id,
    reportedByCompanyId: reporter?._id,
    summary: args.summary,
    createdAt: Date.now(),
  });
  const incident = (await ctx.db.get("incidents", incidentId))!;

  // Holds first, so scoring can see which companies have flagged payments.
  const heldByCompany = await holdPaymentsForIncident(ctx, incident, asset);

  // One exposure per company linked to the compromised asset, keeping the most
  // dangerous link if a company has several. The reporter already knows.
  const links = await ctx.db
    .query("links")
    .withIndex("by_assetId", (q) => q.eq("assetId", asset._id))
    .take(MAX_FANOUT);
  const strongest = new Map<Id<"companies">, Doc<"links">>();
  for (const link of links) {
    if (link.companyId === reporter?._id) continue;
    const current = strongest.get(link.companyId);
    if (!current || rank(link) > rank(current)) strongest.set(link.companyId, link);
  }

  let peopleExposed = 0;
  for (const link of strongest.values()) {
    peopleExposed += (await ctx.db.get("companies", link.companyId))?.headcount ?? 0;
    const held = heldByCompany.get(link.companyId) ?? { count: 0, cents: 0, flagged: 0 };
    const scored = scoreExposure(link, asset, held);
    const exposureId = await ctx.db.insert("exposures", {
      incidentId,
      companyId: link.companyId,
      status: "open",
      ...scored,
    });
    await ctx.db.insert("alerts", {
      incidentId,
      exposureId,
      companyId: link.companyId,
      kind: "company_alert",
      status: "pending",
      body: `${scored.urgency === "urgent" ? "URGENT" : "Advisory"}: ${asset.vendorName} (${asset.name}) is under an active security incident. ${scored.reasons.join(" ")}`,
    });
  }

  await ctx.db.insert("alerts", {
    incidentId,
    kind: "vendor_letter",
    status: "pending",
    body: `Draft letter to ${asset.vendorName} about ${asset.name} is being written.`,
  });

  const heldPayments = await ctx.db
    .query("payments")
    .withIndex("by_heldByIncidentId", (q) => q.eq("heldByIncidentId", incidentId))
    .take(MAX_FANOUT);
  for (const payment of heldPayments) {
    await ctx.db.insert("alerts", {
      incidentId,
      companyId: payment.companyId,
      paymentId: payment._id,
      kind: "hold_notice",
      status: "pending",
      body: `Payment to ${asset.vendorName} held until verified. Call ${asset.vendorName} at the number on file (${asset.phoneOnFile}), never a number from a recent email.`,
    });
  }

  // Firm channels get the headline. Firm-only, so naming the reporter is allowed here.
  const heldCents = [...heldByCompany.values()].reduce((sum, h) => sum + h.cents, 0);
  await enqueue(ctx, {
    event: "incident",
    scope: "firm",
    incidentId,
    refId: `incident:${incidentId}`,
    text:
      `Sidecall incident: ${asset.vendorName} (${asset.name}). ` +
      `${strongest.size} compan${strongest.size === 1 ? "y" : "ies"} exposed · ${peopleExposed.toLocaleString("en-US")} people · ` +
      `${formatUsd(heldCents)} in payments held until verified.` +
      (reporter ? ` Reported by ${reporter.name}.` : ""),
  });
  await scheduleDispatchIfQueued(ctx);

  // AI writes once per incident and loops inside the action (scheduler cap is per transaction).
  await ctx.scheduler.runAfter(0, internal.ai.generateAlert, { incidentId });
  await ctx.scheduler.runAfter(0, internal.ai.generateVendorLetter, { incidentId });
  if (heldPayments.length > 0) {
    await ctx.scheduler.runAfter(0, internal.ai.generateHoldNotice, { incidentId });
  }

  return { ok: true, incidentId, duplicate: false };
}

function rank(link: Doc<"links">): number {
  const share = { shared_credential: 3, shared_admin_access: 2, same_vendor_only: 1 }[link.shareType];
  return share * 2 + (link.source === "self_reported" ? 1 : 0);
}

// Called by POST /incident (http.ts) and by the seed's demo helper.
export const recordIncident = internalMutation({
  args: incidentArgs,
  handler: async (ctx, args): Promise<RecordIncidentResult> => {
    return await recordIncidentImpl(ctx, args);
  },
});

const statusChangeValidator = v.union(
  v.object({ ok: v.literal(true) }),
  v.object({
    ok: v.literal(false),
    reason: v.union(
      v.literal("not_found"),
      v.literal("not_your_company"),
      v.literal("already_acknowledged"),
      v.literal("closed"),
    ),
  }),
);

type StatusChange =
  | { ok: true }
  | { ok: false; reason: "not_found" | "not_your_company" | "already_acknowledged" | "closed" };

// Only someone at the exposed company acts on its exposure. The PE firm watches.
async function loadOwnExposure(
  ctx: MutationCtx,
  exposureId: Id<"exposures">,
): Promise<Doc<"exposures"> | "not_found" | "not_your_company"> {
  const viewer = await getViewer(ctx);
  const exposure = await ctx.db.get("exposures", exposureId);
  if (!exposure) return "not_found";
  if (viewer.firm || viewer.companyId !== exposure.companyId) return "not_your_company";
  return exposure;
}

// Two browsers clicking at once: Convex serializes the transactions, the second
// one re-reads "acknowledged" and returns ok: false. Exactly one wins.
export const acknowledgeExposure = mutation({
  args: { exposureId: v.id("exposures") },
  returns: statusChangeValidator,
  handler: async (ctx, args): Promise<StatusChange> => {
    const exposure = await loadOwnExposure(ctx, args.exposureId);
    if (typeof exposure === "string") return { ok: false, reason: exposure };
    if (exposure.status === "acknowledged") return { ok: false, reason: "already_acknowledged" };
    if (exposure.status === "closed") return { ok: false, reason: "closed" };
    const viewer = await getViewer(ctx);
    await ctx.db.patch("exposures", exposure._id, {
      status: "acknowledged",
      acknowledgedBy: viewer.user._id,
      acknowledgedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const closeExposure = mutation({
  args: { exposureId: v.id("exposures") },
  returns: statusChangeValidator,
  handler: async (ctx, args): Promise<StatusChange> => {
    const exposure = await loadOwnExposure(ctx, args.exposureId);
    if (typeof exposure === "string") return { ok: false, reason: exposure };
    if (exposure.status === "closed") return { ok: false, reason: "closed" };
    await ctx.db.patch("exposures", exposure._id, { status: "closed" });
    return { ok: true };
  },
});

// PE firm marks an incident contained once the vendor has remediated (e.g. rotated every
// shared credential, confirmed by phone). From then on new payments to that vendor are not
// held. Payments already held stay held until a controller at each company decides.
export const containIncident = mutation({
  args: { incidentId: v.id("incidents"), note: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({ ok: v.literal(false), reason: v.string() }),
  ),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer.firm) return { ok: false as const, reason: "Only the PE firm marks an incident contained." };
    const incident = await ctx.db.get("incidents", args.incidentId);
    if (!incident) return { ok: false as const, reason: "Incident not found." };
    if (incident.containedAt !== undefined) return { ok: false as const, reason: "Already contained." };
    const note = args.note.trim();
    if (note.length < 15) {
      return { ok: false as const, reason: "Say what the vendor fixed and how it was confirmed." };
    }
    const now = Date.now();
    await ctx.db.patch("incidents", incident._id, {
      containedAt: now,
      containedBy: viewer.user._id,
      containmentNote: note,
    });
    await ctx.db.insert("auditLog", {
      at: now,
      actor: viewer.user._id,
      action: "contain",
      incidentId: incident._id,
      rule: "pe_firm_marks_contained",
      reason: note,
    });
    const asset = await ctx.db.get("assets", incident.assetId);
    await enqueue(ctx, {
      event: "contained",
      scope: "firm",
      incidentId: incident._id,
      refId: `contained:${incident._id}`,
      text: `Sidecall: the ${asset?.vendorName ?? "vendor"} incident is marked contained by ${viewer.user.name}. ${note} New payments to this vendor are no longer held; payments already held still need a controller's decision.`,
    });
    await scheduleDispatchIfQueued(ctx);
    return { ok: true as const };
  },
});
