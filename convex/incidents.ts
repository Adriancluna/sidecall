// Incident intake and fan-out. One transaction writes the incident, every exposure,
// every payment hold, the pending alerts, and schedules the AI writers once.
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
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
import { activeEpisode, formatUsd, MAX_FANOUT } from "./shared";
import {
  expireWaitingSteps,
  newActBudget,
  planResponses,
  type ActBudget,
} from "./responses";

type RecordIncidentResult =
  | {
      ok: true;
      incidentId: Id<"incidents">;
      duplicate: boolean;
      correlated: boolean;
    }
  | { ok: false; error: "unknown_asset" | "unknown_reporter" };

export const incidentArgs = {
  externalId: v.string(),
  assetName: v.string(),
  reportedByDomain: v.optional(v.string()),
  summary: v.optional(v.string()),
  finding: v.optional(findingValidator), // already validated by convex/findings.ts parseFinding
  assessment: v.optional(v.union(v.literal("observation"), v.literal("confirmed"))),
  evidenceRefs: v.optional(v.array(v.string())),
};

export async function recordIncidentImpl(
  ctx: MutationCtx,
  args: {
    externalId: string;
    assetName: string;
    reportedByDomain?: string;
    summary?: string;
    finding?: Finding;
    assessment?: "observation" | "confirmed";
    evidenceRefs?: string[];
  },
  source?: {
    sourceId: Id<"detectorSources">;
    sourceName: string;
    requestedAssessment?: "observation" | "confirmed";
    effectiveAssessment: "observation" | "confirmed";
  },
): Promise<RecordIncidentResult> {
  // Idempotency: a replayed webhook returns the original incident and writes nothing.
  const receipt = await ctx.db
    .query("incidentReports")
    .withIndex("by_sourceId_and_externalId", (q) => q.eq("sourceId", source?.sourceId).eq("externalId", args.externalId))
    .unique();
  if (receipt)
    return {
      ok: true,
      incidentId: receipt.incidentId,
      duplicate: true,
      correlated: false,
    };
  const existing = await ctx.db
    .query("incidents")
    .withIndex("by_sourceId_and_externalId", (q) => q.eq("sourceId", source?.sourceId).eq("externalId", args.externalId))
    .unique();
  if (existing)
    return {
      ok: true,
      incidentId: existing._id,
      duplicate: true,
      correlated: false,
    };

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
  if (args.finding && !reporter)
    return { ok: false, error: "unknown_reporter" };

  const now = Date.now();
  const responseClass =
    args.assessment === "observation"
      ? "observation"
      : args.finding?.terminalKind === "credential"
        ? "credential"
        : "vendor";
  const correlationKey = `${asset._id}:${responseClass}`;
  const canonical = await ctx.db
    .query("incidents")
    .withIndex("by_correlationKey", (q) =>
      q.eq("correlationKey", correlationKey),
    )
    .order("desc")
    .first();
  let episode = canonical && activeEpisode(canonical, now) ? canonical : null;
  // Adopt pre-upgrade episodes without starting a new response cycle or requiring a reset.
  if (!canonical && responseClass !== "observation") {
    const older = await ctx.db
      .query("incidents")
      .withIndex("by_assetId", (q) => q.eq("assetId", asset._id))
      .order("desc")
      .take(100);
    episode =
      older.find(
        (i) =>
          !i.correlationKey &&
          activeEpisode(i, now) &&
          (i.finding?.terminalKind === "credential"
            ? "credential"
            : "vendor") === responseClass,
      ) ?? null;
  }
  // Changing the sender's ID, summary, timestamp or evidence labels cannot restart automation.
  // Contained or inactive episodes never swallow genuinely new reports.
  if (episode) {
    await ctx.db.insert("incidentReports", {
      ...source,
      externalId: args.externalId,
      incidentId: episode._id,
      receivedAt: now,
      evidenceRefs: (args.evidenceRefs ?? []).slice(0, 20),
      summary: args.summary,
      finding: args.finding,
    });
    await ctx.db.patch("incidents", episode._id, {
      correlationKey,
      responseClass,
      correlatedReports: Math.min(
        (episode.correlatedReports ?? 0) + 1,
        1_000_000,
      ),
      lastReportedAt: now,
      evidenceRefs: [
        ...new Set([
          ...(episode.evidenceRefs ?? []),
          ...(args.evidenceRefs ?? []),
        ]),
      ].slice(0, 20),
      reviewDueAt: episode.reviewDueAt ?? episode.createdAt + 15 * 60 * 1000,
    });
    if (episode.reviewDueAt === undefined) {
      await ctx.scheduler.runAfter(
        Math.max(0, episode.createdAt + 15 * 60 * 1000 - now),
        internal.incidents.reviewDeadline,
        { incidentId: episode._id },
      );
    }
    // The live report count/receipts update for every report. Coalesce channel delivery into
    // fixed review intervals using the outbox's existing dedupe so a flood cannot spam the firm.
    await enqueue(ctx, {
      event: "incident",
      scope: "firm",
      incidentId: episode._id,
      refId: `correlated:${episode._id}:${Math.floor((now - episode.createdAt) / (15 * 60 * 1000))}`,
      text: `Sidecall: additional ${responseClass === "observation" ? "unconfirmed " : ""}report for ${asset.name}. Correlated with the active episode; review the latest evidence in Response safety. Existing actions and deadlines were not restarted.`,
    });
    return {
      ok: true,
      incidentId: episode._id,
      duplicate: false,
      correlated: true,
    };
  }

  const incidentId = await ctx.db.insert("incidents", {
    sourceId: source?.sourceId,
    sourceName: source?.sourceName,
    externalId: args.externalId,
    assetId: asset._id,
    reportedByCompanyId: reporter?._id,
    summary: args.summary,
    createdAt: now,
    finding: args.finding,
    responseClass,
    correlationKey,
    correlatedReports: 0,
    lastReportedAt: now,
    evidenceRefs: (args.evidenceRefs ?? []).slice(0, 20),
    reviewDueAt: now + 15 * 60 * 1000,
  });
  const incident = (await ctx.db.get("incidents", incidentId))!;
  await ctx.db.insert("incidentReports", {
    ...source,
    externalId: args.externalId,
    incidentId,
    receivedAt: now,
    evidenceRefs: (args.evidenceRefs ?? []).slice(0, 20),
    summary: args.summary,
    finding: args.finding,
  });
  await ctx.scheduler.runAfter(
    15 * 60 * 1000,
    internal.incidents.reviewDeadline,
    { incidentId },
  );
  const observation = responseClass === "observation";

  // Holds first, so scoring can see which companies have flagged payments.
  // A compromised credential is an access-response scope, not proof that every vendor payment
  // is unsafe, even if a sender maps that credential finding onto the vendor's payee asset.
  const { byCompany: heldByCompany, held: heldPayments } =
    observation || responseClass === "credential"
      ? {
          byCompany: new Map<Id<"companies">, HeldSummary>(),
          held: [] as Doc<"payments">[],
        }
      : await holdPaymentsForIncident(ctx, incident, asset);

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
    if (!current || rank(link) > rank(current))
      strongest.set(link.companyId, link);
  }

  // Each company's pre-approved steps are planned in this same transaction (one shared blast cap).
  const budget = newActBudget();
  const exposedCompanies = await Promise.all(
    [...strongest.values()].map(async (link) => {
      await openExposure(ctx, {
        budget,
        incidentId,
        link,
        asset,
        held: heldByCompany.get(link.companyId) ?? {
          count: 0,
          cents: 0,
          flagged: 0,
        },
        finding: args.finding,
        ready: observation, // unconfirmed reports use a fixed, explicitly unconfirmed alert
        observation,
      });
      return await ctx.db.get("companies", link.companyId);
    }),
  );
  const peopleExposed = exposedCompanies.reduce(
    (sum, c) => sum + (c?.headcount ?? 0),
    0,
  );

  if (observation) {
    await enqueue(ctx, {
      event: "incident",
      scope: "firm",
      incidentId,
      refId: `incident:${incidentId}`,
      text: `Sidecall: unconfirmed report involving ${asset.name}. ${strongest.size} linked companies notified for review. No payment holds or access changes authorized. Review independent evidence in Response safety.`,
    });
    return { ok: true, incidentId, duplicate: false, correlated: false };
  }

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
  const heldCents = [...heldByCompany.values()].reduce(
    (sum, h) => sum + h.cents,
    0,
  );
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

  // Pre-approved steps run once per incident, in a scheduled action (where a live connector would go).
  const queuedStep = await ctx.db
    .query("responseSteps")
    .withIndex("by_incidentId_and_status", (q) =>
      q.eq("incidentId", incidentId).eq("status", "queued"),
    )
    .first();
  if (queuedStep)
    await ctx.scheduler.runAfter(0, internal.responses.execute, { incidentId });

  // AI writes once per incident and loops inside the action (scheduler cap is per transaction).
  await ctx.scheduler.runAfter(0, internal.ai.generateAlert, { incidentId });
  await ctx.scheduler.runAfter(0, internal.ai.generateVendorLetter, {
    incidentId,
  });
  if (heldPayments.length > 0) {
    await ctx.scheduler.runAfter(0, internal.ai.generateHoldNotice, {
      incidentId,
    });
  }

  return { ok: true, incidentId, duplicate: false, correlated: false };
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
    observation?: boolean;
    budget?: ActBudget; // shared across one incident's fan-out; an AP import gets its own
  },
) {
  const { incidentId, link, asset } = args;
  const scored = scoreExposure(link, asset, args.held);
  if (args.observation) {
    const exposureId = await ctx.db.insert("exposures", {
      incidentId,
      companyId: link.companyId,
      status: "open",
      observation: true,
      urgency: "advisory",
      score: 0,
      confidence: scored.confidence,
      reasons: [
        "Unconfirmed report. Your company's recorded vendor or access relationship warrants review; compromise is not established.",
      ],
      evidence: scored.evidence.filter(
        (e) => e.kind === "link" || e.kind === "source",
      ),
    });
    await insertReadyAlert(ctx, {
      incidentId,
      exposureId,
      companyId: link.companyId,
      kind: "company_alert",
      body: `Unconfirmed security report involving ${asset.vendorName} (${asset.name}). Verify your recorded relationship and share independently checked evidence with the firm. This report has not held payments or changed access.`,
    });
    return exposureId;
  }
  const sister = args.finding ? sisterPath(args.finding, link, asset) : null;
  const exposureId = await ctx.db.insert("exposures", {
    incidentId,
    companyId: link.companyId,
    status: "open",
    ...scored,
    evidence: [...scored.evidence, ...(sister?.evidence ?? [])],
    path: sister?.path,
  });
  await planResponses(ctx, {
    incidentId,
    exposureId,
    link,
    asset,
    budget: args.budget ?? newActBudget(),
  });
  const pathSentence = sister
    ? ` ${sister.evidence.find((e) => e.kind === "path")!.detail} ${sister.path.whatToCheck}`
    : "";
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
  const share = {
    shared_credential: 3,
    shared_admin_access: 2,
    same_vendor_only: 1,
  }[link.shareType];
  return share * 2 + (link.source === "self_reported" ? 1 : 0);
}

// Called by POST /incident (http.ts) and by the seed's demo helper.
export const recordIncident = internalMutation({
  args: incidentArgs,
  handler: async (ctx, args): Promise<RecordIncidentResult> => {
    return await recordIncidentImpl(ctx, args);
  },
});

export const reviewDeadline = internalMutation({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, { incidentId }) => {
    const incident = await ctx.db.get("incidents", incidentId);
    if (
      !incident ||
      incident.reviewedAt ||
      incident.containedAt ||
      incident.reviewEscalatedAt
    )
      return null;
    await ctx.db.patch("incidents", incidentId, {
      reviewEscalatedAt: Date.now(),
    });
    await ctx.db.insert("auditLog", {
      actor: "system",
      at: Date.now(),
      action: "escalate",
      incidentId,
      rule: "fixed_response_review_deadline",
      reason:
        "Scheduled review: check evidence and business impact. Repeated reports did not extend the deadline. Existing holds require a controller decision; nothing is automatically released.",
    });
    await enqueue(ctx, {
      event: "incident",
      scope: "firm",
      incidentId,
      refId: `review:${incidentId}`,
      text: "Sidecall scheduled review: check the evidence and business impact; repeated reports have not restarted automation. No money was automatically released.",
    });
    return null;
  },
});

// Firm review confirms an observation; an enrolled detector can also report a new confirmed episode.
export const reviewReport = mutation({
  args: {
    incidentId: v.id("incidents"),
    decision: v.union(v.literal("confirm"), v.literal("dismiss")),
    note: v.string(),
  },
  returns: v.object({ ok: v.boolean(), reason: v.string() }),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer.firm)
      return {
        ok: false,
        reason: "Only the firm reviews portfolio incident evidence.",
      };
    const incident = await ctx.db.get("incidents", args.incidentId);
    if (!incident) return { ok: false, reason: "Report not found." };
    if (
      incident.reviewedAt &&
      (incident.lastReportedAt ?? incident.createdAt) <= incident.reviewedAt
    )
      return { ok: false, reason: "This evidence was already reviewed." };
    if (args.note.trim().length < 30)
      return {
        ok: false,
        reason:
          "Describe the independent evidence checked and why this decision is justified (30 characters minimum).",
      };
    const asset = await ctx.db.get("assets", incident.assetId);
    if (!asset) return { ok: false, reason: "Asset not found." };
    if (
      args.decision === "confirm" &&
      incident.responseClass !== "observation" &&
      !incident.containedAt
    ) {
      return {
        ok: false,
        reason:
          "This episode is already active; review does not restart its actions.",
      };
    }
    await ctx.db.patch("incidents", incident._id, { reviewedAt: Date.now() });
    if (incident.responseClass === "observation") {
      await ctx.db.patch("incidents", incident._id, {
        containedAt: Date.now(),
        containedBy: viewer.user._id,
        containmentNote: `Unconfirmed report ${args.decision === "confirm" ? "promoted to confirmed response" : "dismissed"}: ${args.note.trim()}`,
      });
      const exposures = await ctx.db
        .query("exposures")
        .withIndex("by_incidentId_and_companyId", (q) =>
          q.eq("incidentId", incident._id),
        )
        .take(MAX_FANOUT);
      for (const exposure of exposures)
        await ctx.db.patch("exposures", exposure._id, { status: "closed" });
    }
    await ctx.db.insert("auditLog", {
      actor: viewer.user._id,
      at: Date.now(),
      action: "approve",
      incidentId: incident._id,
      rule: `incident_review_${args.decision}`,
      reason: args.note.trim(),
    });
    if (args.decision === "confirm") {
      const reporter = incident.reportedByCompanyId
        ? await ctx.db.get("companies", incident.reportedByCompanyId)
        : null;
      await recordIncidentImpl(ctx, {
        externalId: `review:${incident._id}:${Date.now()}`,
        assetName: asset.name,
        reportedByDomain: reporter?.domain,
        finding: incident.finding,
        assessment: "confirmed",
        summary: args.note.trim(),
        evidenceRefs: incident.evidenceRefs,
      });
    }
    return {
      ok: true,
      reason:
        args.decision === "confirm"
          ? "Evidence confirmed; scoped response evaluated."
          : "Report dismissed; no new actions.",
    };
  },
});

export const getResponseSafety = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer.firm) return [];
    const reports = await ctx.db
      .query("incidents")
      .withIndex("by_lastReportedAt")
      .order("desc")
      .take(50);
    return await Promise.all(
      reports.map(async (report) => ({
        incidentId: report._id,
        assetName:
          (await ctx.db.get("assets", report.assetId))?.name ?? "Unknown asset",
        responseClass: report.responseClass ?? "vendor",
        correlatedReports: report.correlatedReports ?? 0,
        createdAt: report.createdAt,
        reviewDueAt: report.reviewDueAt ?? null,
        reviewEscalatedAt: report.reviewEscalatedAt ?? null,
        reviewedAt: report.reviewedAt ?? null,
        containedAt: report.containedAt ?? null,
        evidenceRefs: report.evidenceRefs ?? [],
        summary: report.summary ?? null,
        lastReportedAt: report.lastReportedAt ?? report.createdAt,
      })),
    );
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
    if (!viewer.firm)
      return {
        ok: false as const,
        reason: "Only the PE firm marks an incident contained.",
      };
    const incident = await ctx.db.get("incidents", args.incidentId);
    if (!incident) return { ok: false as const, reason: "Incident not found." };
    if (incident.containedAt !== undefined)
      return { ok: false as const, reason: "Already contained." };
    const note = args.note.trim();
    if (note.length < 15) {
      return {
        ok: false as const,
        reason: "Say what the vendor fixed and how it was confirmed.",
      };
    }
    const now = Date.now();
    await ctx.db.patch("incidents", incident._id, {
      containedAt: now,
      containedBy: viewer.user._id,
      containmentNote: note,
    });
    await expireWaitingSteps(ctx, incident._id, viewer.user._id);
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
