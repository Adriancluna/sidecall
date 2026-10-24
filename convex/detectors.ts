// Operator-provisioned detector credentials. Authority is rechecked in the intake transaction.
import { ConvexError, v } from "convex/values";
import { internalAction, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { incidentArgs, incidentIntakeLimits, recordIncidentImpl } from "./incidents";
import { sha256Hex } from "./agents";
import { DAY_MS, toHex } from "./shared";
import { getViewer } from "./access";
import { SCENARIOS } from "./seed";

const mode = v.union(v.literal("observe"), v.literal("confirm"));
const registration = {
  name: v.string(),
  assetNames: v.array(v.string()),
  reporterDomains: v.array(v.string()),
  mode: v.optional(mode),
  expiresAt: v.optional(v.number()),
};
function secret() {
  return `sc_detector_${toHex(crypto.getRandomValues(new Uint8Array(32)))}`;
}

// Action randomness is cryptographic; only its SHA-256 reaches storage.
export const mint = internalAction({
  args: registration,
  returns: v.object({ sourceId: v.id("detectorSources"), token: v.string() }),
  handler: async (ctx, args) => {
    const token = secret();
    const sourceId: Id<"detectorSources"> = await ctx.runMutation(
      internal.detectors.register,
      {
        ...args,
        tokenHash: await sha256Hex(token),
      },
    );
    return { sourceId, token };
  },
});

export const register = internalMutation({
  args: { ...registration, tokenHash: v.string() },
  returns: v.id("detectorSources"),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    const expiresAt = args.expiresAt ?? Date.now() + DAY_MS;
    if (
      !name ||
      name.length > 80 ||
      Array.from(name).some((char) => char.charCodeAt(0) < 32) ||
      !/^[a-f0-9]{64}$/.test(args.tokenHash)
    )
      throw new ConvexError(
        "Use a short detector name and a valid credential hash.",
      );
    if (
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now() ||
      expiresAt > Date.now() + 30 * DAY_MS
    )
      throw new ConvexError("Detector authority must expire within 30 days.");
    const assetNames = [...new Set(args.assetNames)];
    const reporterDomains = [...new Set(args.reporterDomains)];
    if (
      !assetNames.length ||
      assetNames.length > 20 ||
      reporterDomains.length > 20
    )
      throw new ConvexError(
        "Choose 1–20 assets and at most 20 reporter domains.",
      );
    for (const name of assetNames) {
      if (
        !name ||
        name.length > 200 ||
        !(await ctx.db
          .query("assets")
          .withIndex("by_name", (q) => q.eq("name", name))
          .first())
      )
        throw new ConvexError("Every allowed asset must already exist.");
    }
    for (const domain of reporterDomains) {
      if (
        !domain ||
        domain.length > 253 ||
        !(await ctx.db
          .query("companies")
          .withIndex("by_domain", (q) => q.eq("domain", domain))
          .unique())
      )
        throw new ConvexError("Every allowed reporter must already exist.");
    }
    if (
      await ctx.db
        .query("detectorSources")
        .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
        .unique()
    )
      throw new ConvexError("Credential hash is already registered.");
    const sourceId = await ctx.db.insert("detectorSources", {
      name,
      tokenHash: args.tokenHash,
      assetNames,
      reporterDomains,
      mode: args.mode ?? "observe",
      createdAt: Date.now(),
      expiresAt,
    });
    await ctx.db.insert("auditLog", {
      at: Date.now(),
      actor: "system",
      action: "policy",
      rule: "detector_registered",
      reason: `Operator registered ${name} with ${args.mode ?? "observe"} authority over ${assetNames.length} named assets.`,
    });
    return sourceId;
  },
});

export const rotate = internalAction({
  args: { sourceId: v.id("detectorSources") },
  returns: v.object({ token: v.string() }),
  handler: async (ctx, { sourceId }) => {
    const token = secret();
    await ctx.runMutation(internal.detectors.replaceKey, {
      sourceId,
      tokenHash: await sha256Hex(token),
    });
    return { token };
  },
});
export const replaceKey = internalMutation({
  args: { sourceId: v.id("detectorSources"), tokenHash: v.string() },
  returns: v.null(),
  handler: async (ctx, { sourceId, tokenHash }) => {
    const source = await ctx.db.get("detectorSources", sourceId);
    if (
      !source ||
      source.revokedAt !== undefined ||
      source.expiresAt <= Date.now()
    )
      throw new ConvexError("Only active detector credentials can rotate.");
    if (!/^[a-f0-9]{64}$/.test(tokenHash))
      throw new ConvexError("Invalid credential hash.");
    const existing = await ctx.db
      .query("detectorSources")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (existing)
      throw new ConvexError("Rotation requires a fresh credential.");
    await ctx.db.patch("detectorSources", sourceId, { tokenHash });
    await ctx.db.insert("auditLog", {
      at: Date.now(),
      actor: "system",
      action: "policy",
      rule: "detector_rotated",
      reason: `Operator rotated ${source.name}; scope, expiry, quota and replay identity are unchanged.`,
    });
    return null;
  },
});
export const revoke = internalMutation({
  args: { sourceId: v.id("detectorSources") },
  returns: v.null(),
  handler: async (ctx, { sourceId }) => {
    const source = await ctx.db.get("detectorSources", sourceId);
    if (!source || source.revokedAt !== undefined) return null;
    await ctx.db.patch("detectorSources", sourceId, { revokedAt: Date.now() });
    await ctx.db.insert("auditLog", {
      at: Date.now(),
      actor: "system",
      action: "policy",
      rule: "detector_revoked",
      reason: `Operator revoked ${source.name}; new reports, waiting approvals and queued steps lose authority. Existing holds and completed actions are unchanged.`,
    });
    return null;
  },
});

export const list = query({
  args: {},
  returns: v.array(v.object({
    sourceId: v.id("detectorSources"), name: v.string(), assetNames: v.array(v.string()),
    reporterDomains: v.array(v.string()), mode, createdAt: v.number(), expiresAt: v.number(),
    revokedAt: v.union(v.number(), v.null()),
  })),
  handler: async (ctx) => {
    if (!(await getViewer(ctx)).firm) return [];
    const sources = await ctx.db
      .query("detectorSources")
      .order("desc")
      .take(100);
    return sources.map(
      ({
        _id,
        name,
        assetNames,
        reporterDomains,
        mode,
        createdAt,
        expiresAt,
        revokedAt,
      }) => ({
        sourceId: _id,
        name,
        assetNames,
        reporterDomains,
        mode,
        createdAt,
        expiresAt,
        revokedAt: revokedAt ?? null,
      }),
    );
  },
});

export const ingest = internalMutation({
  args: { tokenHash: v.string(), report: v.object(incidentArgs) },
  handler: async (ctx, { tokenHash, report }) => {
    const source = await ctx.db
      .query("detectorSources")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    const denied = {
      ok: false as const,
      status: 401,
      error: "Invalid or inactive detector credential.",
    };
    if (
      !source ||
      source.revokedAt !== undefined ||
      source.expiresAt <= Date.now()
    )
      return denied;
    const budget = await incidentIntakeLimits.limit(ctx, "intake", { key: source._id });
    if (!budget.ok)
      return {
        ok: false as const,
        status: 429,
        error: "Detector request limit reached.",
        retryAfter: Math.ceil(budget.retryAfter / 1000),
      };
    if (report.externalId.startsWith("review:") ||
        Object.values(SCENARIOS).some(scenario => scenario.externalId === report.externalId))
      return { ok: false as const, status: 400, error: "This external ID is reserved for internal review or demo scenarios." };
    if (
      !source.assetNames.includes(report.assetName) ||
      (report.reportedByDomain === undefined
        ? source.reporterDomains.length > 0
        : !source.reporterDomains.includes(report.reportedByDomain))
    )
      return {
        ok: false as const,
        status: 403,
        error: "Report is outside this detector's registered scope.",
      };
    const assessment =
      source.mode === "confirm" &&
      report.assessment === "confirmed" &&
      (report.evidenceRefs?.length ?? 0) > 0
        ? "confirmed"
        : "observation";
    const result = await recordIncidentImpl(
      ctx,
      { ...report, assessment },
      {
        sourceId: source._id,
        sourceName: source.name,
        requestedAssessment: report.assessment,
        effectiveAssessment: assessment,
      },
    );
    if (!result.ok)
      return { ok: false as const, status: 404, error: result.error };
    // Replay reports the original decision, even if the new body claims a different assessment.
    const original = result.duplicate
      ? await ctx.db
          .query("incidentReports")
          .withIndex("by_sourceId_and_externalId", (q) =>
            q.eq("sourceId", source._id).eq("externalId", report.externalId),
          )
          .unique()
      : null;
    return {
      ...result,
      assessment: original?.effectiveAssessment ?? assessment,
    };
  },
});
