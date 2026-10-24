// Incident intake and fan-out. One transaction writes the incident, every exposure,
// every payment hold, the pending alerts, and schedules the AI writers once.
import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { holdPaymentsForIncident } from "./payments";
import { scoreExposure, sisterPath, type HeldSummary } from "./scoring";
import { finding as findingValidator } from "./schema";
import type { Finding } from "./findings";
import { getViewer } from "./access";
import { enqueue } from "./notifications";
import { insertReadyAlert } from "./alerts";
import { formatUsd, MAX_FANOUT } from "./shared";

type RecordIncidentResult =
  | { ok: true; incidentId: Id<"incidents">; duplicate: boolean }
  | { ok: false; error: "unknown_asset" | "unknown_reporter" };

const incidentArgs = {
  externalId: v.string(),
  assetName: v.string(),
  reportedByDomain: v.optional(v.string()),
  summary: v.optional(v.string()),
  finding: v.optional(findingValidator), // already validated by convex/findings.ts parseFinding
};

export async function recordIncidentImpl(
  ctx: MutationCtx,
  args: {
    externalId: string;
    assetName: string;
    reportedByDomain?: string;
    summary?: string;
    finding?: Finding;
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
  // A finding is measured from the company that was tested: without it there are no "sisters".
  if (args.finding && !reporter) return { ok: false, error: "unknown_reporter" };

  const incidentId = await ctx.db.insert("incidents", {
    externalId: args.externalId,
    assetId: asset._id,
    reportedByCompanyId: reporter?._id,
    summary: args.summary,
    createdAt: Date.now(),
    finding: args.finding,
  });
  const incident = (await ctx.db.get("incidents", incidentId))!;

  // Holds first, so scoring can see which companies have flagged payments.
  const { byCompany: heldByCompany, held: heldPayments } = await holdPaymentsForIncident(ctx, incident, asset);

  // One exposure per company linked to the compromised asset, keeping the most
  // dangerous link if a company has several. The reporter already knows.
  const links = await ctx.db
    .query("links")
    .withIndex("by_assetId", (q) => q.eq("assetId", asset._id))
    .take(MAX_FANOUT);
  const strongest = new Map<Id<"companies">, Doc<"links">>();
  // A proven leaked login reaches only companies that share that login, not every customer of
  // the vendor: same_vendor_only links on a credential don't count.
  const credentialOnly = args.finding?.terminalKind === "credential";
  for (const link of links) {
    if (link.companyId === reporter?._id) continue;
    if (credentialOnly && link.shareType === "same_vendor_only") continue;
    const current = strongest.get(link.companyId);
    if (!current || rank(link) > rank(current)) strongest.set(link.companyId, link);
  }

  const exposedCompanies = await Promise.all(
    [...strongest.values()].map(async (link) => {
      await openExposure(ctx, {
        incidentId,
        link,
        asset,
        held: heldByCompany.get(link.companyId) ?? { count: 0, cents: 0, flagged: 0 },
        finding: args.finding,
        ready: false, // the AI writer rewrites it once per incident
      });
      return await ctx.db.get("companies", link.companyId);
    }),
  );
  const peopleExposed = exposedCompanies.reduce((sum, c) => sum + (c?.headcount ?? 0), 0);

  await ctx.db.insert("alerts", {
    incidentId,
    kind: "vendor_letter",
    status: "pending",
    body: `Draft letter to ${asset.vendorName} about ${asset.name} is being written.`,
  });

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
      (reporter ? ` Reported by ${reporter.name}.` : "") +
      (args.finding && reporter
        ? ` Validated attack path at ${reporter.name} (red-team finding ${args.finding.findingId}); sister companies are reachable, not tested.`
        : ""),
  });

  // AI writes once per incident and loops inside the action (scheduler cap is per transaction).
  await ctx.scheduler.runAfter(0, internal.ai.generateAlert, { incidentId });
  await ctx.scheduler.runAfter(0, internal.ai.generateVendorLetter, { incidentId });
  if (heldPayments.length > 0) {
    await ctx.scheduler.runAfter(0, internal.ai.generateHoldNotice, { incidentId });
  }

  return { ok: true, incidentId, duplicate: false };
}

// Scores a company's exposure to an incident and writes the exposure plus its company alert.
// `ready: false` leaves the alert pending for the AI writer; `ready: true` (an AP import mid-
// incident) writes it ready and notifies at once. Shared so both paths use the same template.
export async function openExposure(
  ctx: MutationCtx,
  args: {
    incidentId: Id<"incidents">;
    link: Doc<"links">;
    asset: Doc<"assets">;
    held: HeldSummary;
    finding: Finding | undefined;
    ready: boolean;
  },
) {
  const { incidentId, link, asset } = args;
  const scored = scoreExposure(link, asset, args.held);
  const sister = args.finding ? sisterPath(args.finding, link, asset) : null;
  const exposureId = await ctx.db.insert("exposures", {
    incidentId,
    companyId: link.companyId,
    status: "open",
    ...scored,
    evidence: [...scored.evidence, ...(sister?.evidence ?? [])],
    path: sister?.path,
  });
  const pathSentence = sister ? ` ${sister.evidence.find((e) => e.kind === "path")!.detail} ${sister.path.whatToCheck}` : "";
  const alert = {
    incidentId,
    exposureId,
    companyId: link.companyId,
    kind: "company_alert" as const,
    body: `${scored.urgency === "urgent" ? "Urgent: act today." : "Advisory: review this week."} ${asset.vendorName} is under an active security incident. ${scored.reasons.join(" ")}${pathSentence} Rotate any credentials you share with ${asset.vendorName} and review recent access.`,
  };
  if (args.ready) await insertReadyAlert(ctx, alert);
  else await ctx.db.insert("alerts", { ...alert, status: "pending" });
  return exposureId;
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
): Promise<{ exposure: Doc<"exposures">; userId: Id<"users"> } | "not_found" | "not_your_company"> {
  const viewer = await getViewer(ctx);
  const exposure = await ctx.db.get("exposures", exposureId);
  if (!exposure) return "not_found";
  if (viewer.firm || viewer.companyId !== exposure.companyId) return "not_your_company";
  return { exposure, userId: viewer.user._id };
}

// Two browsers clicking at once: Convex serializes the transactions, the second
// one re-reads "acknowledged" and returns ok: false. Exactly one wins.
export const acknowledgeExposure = mutation({
  args: { exposureId: v.id("exposures") },
  returns: statusChangeValidator,
  handler: async (ctx, args): Promise<StatusChange> => {
    const own = await loadOwnExposure(ctx, args.exposureId);
    if (typeof own === "string") return { ok: false, reason: own };
    const { exposure } = own;
    if (exposure.status === "acknowledged") return { ok: false, reason: "already_acknowledged" };
    if (exposure.status === "closed") return { ok: false, reason: "closed" };
    await ctx.db.patch("exposures", exposure._id, {
      status: "acknowledged",
      acknowledgedBy: own.userId,
      acknowledgedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const closeExposure = mutation({
  args: { exposureId: v.id("exposures") },
  returns: statusChangeValidator,
  handler: async (ctx, args): Promise<StatusChange> => {
    const own = await loadOwnExposure(ctx, args.exposureId);
    if (typeof own === "string") return { ok: false, reason: own };
    const { exposure } = own;
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
    return { ok: true as const };
  },
});
