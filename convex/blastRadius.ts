// Read-side queries for the UI. Every query scopes to the signed-in viewer. getBlastRadius is the PE firm view: the only place the
// reporting company is named.
import { v } from "convex/values";
import { env, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import { canSeeCompany, getViewer, viewerForUser } from "./access";
import { MAX_FANOUT, memo } from "./shared";

// Why a company appears on the map. Exported so the frontend can switch on it exhaustively.
export type NodeRelation =
  | "reporter"
  | "exposed"
  | "linked_not_exposed"
  | "same_vendor_separate_access"
  | "unrelated";

// Firm: every incident, newest first. Company: only incidents that touch it, with the
// reporter and the free-text summary removed (the summary can identify who was hit).
export const listIncidents = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    let incidents: Doc<"incidents">[];
    if (viewer.firm) {
      incidents = await ctx.db.query("incidents").order("desc").take(50);
    } else {
      const exposures = await ctx.db
        .query("exposures")
        .withIndex("by_companyId", (q) => q.eq("companyId", viewer.companyId))
        .order("desc")
        .take(50);
      incidents = (
        await Promise.all(exposures.map((e) => ctx.db.get("incidents", e.incidentId)))
      ).filter((i): i is Doc<"incidents"> => i !== null);
    }
    return await Promise.all(
      incidents.map(async (incident) => {
        const asset = await ctx.db.get("assets", incident.assetId);
        return {
          _id: incident._id,
          externalId: incident.externalId,
          assetId: incident.assetId,
          createdAt: incident.createdAt,
          containedAt: incident.containedAt ?? null,
          reportedByCompanyId: viewer.firm ? (incident.reportedByCompanyId ?? null) : null,
          summary: viewer.firm ? (incident.summary ?? null) : null,
          findingSource: viewer.firm ? (incident.finding?.source ?? null) : null,
          assetName: asset?.name ?? "",
          vendorName: asset?.vendorName ?? "",
        };
      }),
    );
  },
});

export const getBlastRadius = query({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer.firm) return null; // portfolio-wide map is for the PE firm only
    const incident = await ctx.db.get("incidents", args.incidentId);
    if (!incident) return null;
    const asset = await ctx.db.get("assets", incident.assetId);
    if (!asset) return null;

    const [companies, exposures, links, siblingAssets, payments] = await Promise.all([
      ctx.db.query("companies").take(MAX_FANOUT),
      ctx.db
        .query("exposures")
        .withIndex("by_incidentId_and_companyId", (q) => q.eq("incidentId", incident._id))
        .take(MAX_FANOUT),
      ctx.db
        .query("links")
        .withIndex("by_assetId", (q) => q.eq("assetId", asset._id))
        .take(MAX_FANOUT),
      ctx.db
        .query("assets")
        .withIndex("by_vendorName", (q) => q.eq("vendorName", asset.vendorName))
        .take(20),
      ctx.db
        .query("payments")
        .withIndex("by_heldByIncidentId", (q) => q.eq("heldByIncidentId", incident._id))
        .take(MAX_FANOUT),
    ]);

    // Same vendor, different asset (e.g. a separate login): shown, but deliberately not exposed.
    const siblingLinks = (
      await Promise.all(
        siblingAssets
          .filter((a) => a._id !== asset._id)
          .map((a) =>
            ctx.db
              .query("links")
              .withIndex("by_assetId", (q) => q.eq("assetId", a._id))
              .take(MAX_FANOUT),
          ),
      )
    ).flat();

    const exposureByCompany = new Map(exposures.map((e) => [e.companyId, e]));
    const linkedCompanies = new Set<Id<"companies">>(links.map((l) => l.companyId));
    const siblingCompanies = new Set<Id<"companies">>(siblingLinks.map((l) => l.companyId));
    const heldCentsByCompany = new Map<Id<"companies">, number>();
    for (const p of payments) {
      if (p.status !== "held") continue;
      heldCentsByCompany.set(p.companyId, (heldCentsByCompany.get(p.companyId) ?? 0) + p.amountCents);
    }

    const nodes = companies.map((c) => {
      const exposure = exposureByCompany.get(c._id);
      const relation: NodeRelation =
        c._id === incident.reportedByCompanyId
          ? "reporter"
          : exposure
            ? "exposed"
            : linkedCompanies.has(c._id)
              ? "linked_not_exposed"
              : siblingCompanies.has(c._id)
                ? "same_vendor_separate_access"
                : "unrelated";
      return {
        companyId: c._id,
        name: c.name,
        headcount: c.headcount,
        exposed: exposure !== undefined,
        relation,
        exposureId: exposure?._id ?? null,
        urgency: exposure?.urgency ?? null,
        score: exposure?.score ?? 0,
        confidence: exposure?.confidence ?? null,
        status: exposure?.status ?? null,
        heldCents: heldCentsByCompany.get(c._id) ?? 0,
      };
    });

    // Totals come from the incident's own rows, not from the node list, so they stay right
    // however many companies the portfolio has.
    const headcountById = new Map(companies.map((c) => [c._id, c.headcount]));
    const heldPayments = payments.filter((p) => p.status === "held");
    const reporter = incident.reportedByCompanyId
      ? await ctx.db.get("companies", incident.reportedByCompanyId)
      : null;

    return {
      incident: { ...incident, reportedByName: reporter?.name ?? null },
      asset,
      nodes,
      edges: [...links, ...siblingLinks].map((l) => ({
        companyId: l.companyId,
        assetId: l.assetId,
        shareType: l.shareType,
        source: l.source,
        compromised: l.assetId === asset._id,
        path: edgePath(incident, l, asset._id, exposureByCompany.has(l.companyId)),
      })),
      totals: {
        companiesExposed: exposures.length,
        peopleExposed: exposures.reduce((sum, e) => sum + (headcountById.get(e.companyId) ?? 0), 0),
        heldCents: heldPayments.reduce((sum, p) => sum + p.amountCents, 0),
        paymentsHeld: heldPayments.length,
      },
    };
  },
});

// With a red-team finding: the reporter's edge is what was proven ("validated_at_source"); an
// exposed sister's edge is what Sidecall infers ("reachable_not_tested"). Firm view only.
type EdgePath = "validated_at_source" | "reachable_not_tested" | null;
function edgePath(incident: Doc<"incidents">, link: Doc<"links">, assetId: Id<"assets">, exposed: boolean): EdgePath {
  if (!incident.finding || link.assetId !== assetId) return null;
  if (link.companyId === incident.reportedByCompanyId) return "validated_at_source";
  return exposed ? "reachable_not_tested" : null;
}

export const getExposureEvidence = query({
  args: { exposureId: v.id("exposures") },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const exposure = await ctx.db.get("exposures", args.exposureId);
    if (!exposure || !canSeeCompany(viewer, exposure.companyId)) return null;
    return {
      exposureId: exposure._id,
      incidentId: exposure.incidentId,
      companyId: exposure.companyId,
      reasons: exposure.reasons,
      confidence: exposure.confidence,
      evidence: exposure.evidence,
      urgency: exposure.urgency,
      score: exposure.score,
      status: exposure.status,
      acknowledgedBy: exposure.acknowledgedBy ?? null,
      // Proven at another company, reachable (not tested) here. Never names the reporter.
      path: exposure.path ? { ...exposure.path, source: "validated_at_source" as const } : null,
    };
  },
});

// A company user's own exposures, newest first (their home screen).
export const getMyExposures = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (viewer.firm) return [];
    return await ctx.db
      .query("exposures")
      .withIndex("by_companyId", (q) => q.eq("companyId", viewer.companyId))
      .order("desc")
      .take(50);
  },
});

// Directory for the sign-in quick-pick, user switcher and pickers. On a DEMO_MODE deployment it is
// public (the quick-pick runs before anyone signs in). Elsewhere it needs a session, and a company
// user sees email addresses only for their own colleagues.
type DirectoryAccess = { full: true } | { full: false; companyId: Id<"companies"> } | null;

async function directoryAccess(ctx: QueryCtx): Promise<DirectoryAccess> {
  if (env.DEMO_MODE === "true") return { full: true };
  const userId = await getAuthUserId(ctx);
  const user = userId ? await ctx.db.get("users", userId) : null;
  if (!user) return null;
  const viewer = viewerForUser(user);
  return viewer.firm ? { full: true } : { full: false, companyId: viewer.companyId };
}

export const listCompanies = query({
  args: {},
  handler: async (ctx) => ((await directoryAccess(ctx)) ? await ctx.db.query("companies").take(100) : []),
});

export const listUsers = query({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (ctx, args) => {
    const access = await directoryAccess(ctx);
    if (!access) return [];
    const users = args.companyId
      ? await ctx.db
          .query("users")
          .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
          .take(50)
      : await ctx.db.query("users").take(200);
    if (access.full) return users;
    return users.map((u) => (u.companyId === access.companyId ? u : { ...u, email: undefined, phone: undefined }));
  },
});

export const listAssets = query({
  args: {},
  handler: async (ctx) => ((await directoryAccess(ctx)) ? await ctx.db.query("assets").take(100) : []),
});

type TimelineEvent = {
  at: number;
  kind:
    | "reported"
    | "hold"
    | "flag"
    | "escalate"
    | "contain"
    | "refused"
    | "release"
    | "reject"
    | "respond"
    | "approve"
    | "undo"
    | "expire"
    | "alert_ready"
    | "vendor_letter_ready"
    | "acknowledged";
  label: string;
  companyName: string | null;
};

// Audit actions that are timeline events. "contain" is added separately with a viewer-safe
// label; "import" and "agent_call" are bookkeeping, not incident events.
const TIMELINE_AUDIT_ACTIONS = [
  "hold",
  "flag",
  "escalate",
  "refused",
  "release",
  "reject",
  "respond",
  "approve",
  "undo",
  "expire",
] as const;
const isTimelineAction = (a: string): a is (typeof TIMELINE_AUDIT_ACTIONS)[number] =>
  (TIMELINE_AUDIT_ACTIONS as readonly string[]).includes(a);

// What happened, when, for one incident: the proof behind "held in the same transaction
// as the report". The firm sees every company; a company sees only its own events, and the
// "reported" event never says who reported.
export const getIncidentTimeline = query({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const incident = await ctx.db.get("incidents", args.incidentId);
    if (!incident) return null;
    const asset = await ctx.db.get("assets", incident.assetId);

    const [audit, exposures, alertGroups] = await Promise.all([
      viewer.firm
        ? ctx.db
            .query("auditLog")
            .withIndex("by_incidentId", (q) => q.eq("incidentId", incident._id))
            .take(MAX_FANOUT)
        : ctx.db
            .query("auditLog")
            .withIndex("by_companyId_and_incidentId", (q) =>
              q.eq("companyId", viewer.companyId).eq("incidentId", incident._id),
            )
            .take(MAX_FANOUT),
      ctx.db
        .query("exposures")
        .withIndex("by_incidentId_and_companyId", (q) => q.eq("incidentId", incident._id))
        .take(MAX_FANOUT),
      Promise.all(
        (["company_alert", "hold_notice", "vendor_letter"] as const).map((kind) =>
          ctx.db
            .query("alerts")
            .withIndex("by_incidentId_and_kind", (q) =>
              q.eq("incidentId", incident._id).eq("kind", kind),
            )
            .take(MAX_FANOUT),
        ),
      ),
    ]);

    // A company sees an incident only if it has an exposure or its own audit rows (a hold) on it.
    if (!viewer.firm && audit.length === 0 && !exposures.some((e) => e.companyId === viewer.companyId)) return null;

    const companyNameById = memo(async (id: Id<"companies">) => (await ctx.db.get("companies", id))?.name ?? "");
    const companyName = async (id: Id<"companies"> | undefined) => (id ? await companyNameById(id) : null);
    const visible = (companyId: Id<"companies"> | undefined) =>
      companyId === undefined ? viewer.firm : canSeeCompany(viewer, companyId);

    const events: TimelineEvent[] = [
      {
        at: incident.createdAt,
        kind: "reported",
        label: `Incident received: ${asset?.vendorName ?? "vendor"} (${asset?.name ?? ""})`,
        companyName: null,
      },
    ];
    for (const row of audit) {
      if (!isTimelineAction(row.action)) continue;
      events.push({ at: row.at, kind: row.action, label: row.reason, companyName: await companyName(row.companyId) });
    }
    for (const alert of alertGroups.flat()) {
      if (alert.status !== "ready" || alert.readyAt === undefined || !visible(alert.companyId)) continue;
      events.push({
        at: alert.readyAt,
        kind: alert.kind === "vendor_letter" ? "vendor_letter_ready" : "alert_ready",
        label: alert.kind === "vendor_letter" ? "Vendor letter drafted" : alert.kind === "hold_notice" ? "Hold notice written" : "Alert written",
        companyName: await companyName(alert.companyId),
      });
    }
    for (const exposure of exposures) {
      if (exposure.acknowledgedAt === undefined || !visible(exposure.companyId)) continue;
      events.push({
        at: exposure.acknowledgedAt,
        kind: "acknowledged",
        label: "Exposure acknowledged",
        companyName: await companyName(exposure.companyId),
      });
    }
    if (incident.containedAt !== undefined) {
      events.push({
        at: incident.containedAt,
        kind: "contain",
        label: viewer.firm
          ? `Marked contained: ${incident.containmentNote ?? ""}`
          : "Vendor remediation confirmed: new payments to this vendor are no longer held",
        companyName: null,
      });
    }
    events.sort((a, b) => a.at - b.at);

    const after = (kind: TimelineEvent["kind"]) => {
      const first = events.find((e) => e.kind === kind);
      return first ? first.at - incident.createdAt : null;
    };
    return {
      events,
      stats: {
        // Holds and flags are written in the report's own transaction, so their offset is 0.
        holdsInReportTransaction: events.some((e) => e.kind === "hold") && after("hold") === 0,
        msToFirstAlert: after("alert_ready"),
        msToVendorLetter: after("vendor_letter_ready"),
        msToFirstAcknowledgement: after("acknowledged"),
        msToFirstRelease: after("release"),
        msToContained: after("contain"),
      },
    };
  },
});
