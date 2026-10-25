// Durable outbound command ledger. Provider credentials exist only at the receiver.
import { ConvexError, v } from "convex/values";
import { env, internalMutation, internalQuery, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { getViewer } from "./access";
import { activeEpisode } from "./shared";
import { responseFor } from "./scoring";
import { receiverReceipt } from "./receiverModel";
import { RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

const limits = new RateLimiter(components.rateLimiter, {
  receiverCheck: { kind: "token bucket", rate: 1, period: 10_000, capacity: 1 },
});

export function receiverConfig() {
  const company = env.RESPONSE_RECEIVER_COMPANY_ID ?? "";
  const asset = env.RESPONSE_RECEIVER_ASSET_ID ?? "";
  const target = env.RESPONSE_RECEIVER_TARGET ?? "";
  const origin = env.RESPONSE_RECEIVER_URL ?? "";
  let validUrl = false;
  try { const u = new URL(origin); validUrl = u.protocol === "https:" && !u.username && !u.password && u.pathname === "/" && !u.search && !u.hash; } catch { /* not configured */ }
  return { company, asset, target, origin,
    binding: JSON.stringify([company, asset, target, origin]),
    configured: !!company && !!asset && /^[A-Za-z0-9_.:-]{1,96}$/.test(target) && validUrl && (env.RESPONSE_RECEIVER_SECRET?.length ?? 0) >= 32,
    enabled: env.DEMO_MODE === "true" && env.RESPONSE_RECEIVER_LIVE === "true",
  };
}

async function schedule(ctx: MutationCtx, jobId: Id<"responseDeliveries">, delay = 0) {
  await ctx.scheduler.runAfter(delay, internal.receiverTransport.dispatch, { jobId });
}
export async function enqueueExternal(ctx: MutationCtx, step: Doc<"responseSteps">, incident: Doc<"incidents">, version: number) {
  const config = receiverConfig();
  if (step.action !== "pause_shared_login" || step.companyId !== config.company || incident.assetId !== config.asset) return false;
  const existing = await ctx.db.query("responseDeliveries").withIndex("by_stepId_and_kind", q => q.eq("stepId", step._id).eq("kind", "pause")).unique();
  if (existing) return true;
  // The command identity and exact serialized body are committed before scheduling.
  const command = { version: 1, companyId: step.companyId, commandId: `pause-${step._id}`, target: config.target,
    incidentId: step.incidentId, action: "pause_shared_login", policyVersion: version };
  const jobId = await ctx.db.insert("responseDeliveries", { stepId: step._id, companyId: step.companyId,
    kind: "pause", commandId: command.commandId, commandJson: JSON.stringify(command), binding: config.binding,
    status: "ready", createdAt: Date.now(), polls: 0, reason: "Awaiting authorized delivery" });
  await ctx.db.patch("responseSteps", step._id, { executionMode: "external", status: "pending" });
  await schedule(ctx, jobId);
  return true;
}

async function ownStep(ctx: MutationCtx, stepId: Id<"responseSteps">) {
  const viewer = await getViewer(ctx);
  const step = await ctx.db.get("responseSteps", stepId);
  if (!step || viewer.firm || viewer.companyId !== step.companyId || !["it", "controller"].includes(viewer.user.role))
    throw new ConvexError("Only this company's IT lead or controller can manage its receiver commands.");
  return { step, viewer };
}

async function authority(ctx: QueryCtx, step: Doc<"responseSteps">) {
  const incident = await ctx.db.get("incidents", step.incidentId);
  if (incident?.demoResetAt !== undefined) return "Demo reset stopped new pauses for this earlier test; existing commands remain available for recovery";
  if (!incident || !activeEpisode(incident, Date.now()) || incident.responseClass === "observation") return "Incident is no longer eligible for automatic response";
  const source = incident.sourceId ? await ctx.db.get("detectorSources", incident.sourceId) : null;
  if (incident.sourceId && (!source || source.revokedAt !== undefined || source.mode !== "confirm" || source.expiresAt <= Date.now())) return "Report source authorization is no longer active";
  const policy = await ctx.db.query("responsePolicies").withIndex("by_companyId_and_action", q => q.eq("companyId", step.companyId).eq("action", step.action)).unique();
  if (!policy || policy.mode === "notify" || (!step.approvedBy && policy.mode !== "act") || !step.policyRule.endsWith(`:v${policy.version}`)) return "Company policy changed; this command needs review";
  if (step.approvedBy) {
    const approver = await ctx.db.get("users", step.approvedBy);
    if (!approver || approver.companyId !== step.companyId || !["it", "controller"].includes(approver.role)) return "Company approver no longer has authority";
  }
  const asset = await ctx.db.get("assets", incident.assetId);
  const links = await ctx.db.query("links").withIndex("by_assetId", q => q.eq("assetId", incident.assetId)).take(200);
  if (!asset || !links.some(link => link.companyId === step.companyId && responseFor(link, asset).some(r => r.action === step.action && r.cap !== "notify" && (r.cap === "act" || !!step.approvedBy)))) return "Company relationship no longer authorizes this action";
  return null;
}

async function restoreAuthority(ctx: QueryCtx, job: Doc<"responseDeliveries">, step: Doc<"responseSteps">) {
  const person = job.requestedBy ? await ctx.db.get("users", job.requestedBy) : null;
  if (!person || person.companyId !== step.companyId || !["it", "controller"].includes(person.role)) return "Restoration requester no longer has company authority";
  if (step.status !== "done") return "Original pause is no longer eligible for restoration";
  return null;
}

export const claim = internalMutation({
  args: { jobId: v.id("responseDeliveries") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get("responseDeliveries", jobId);
    if (!job || ["confirmed", "refused", "awaiting_operator"].includes(job.status)) return null;
    const step = await ctx.db.get("responseSteps", job.stepId);
    if (!step) return null;
    const config = receiverConfig();
    const sent = job.sentAt !== undefined;
    const reason = config.binding !== job.binding || !config.configured
      ? "Receiver configuration changed or is incomplete; operator review required"
      : !sent && !config.enabled ? "Live receiver execution is disabled"
      : !sent ? (job.kind === "pause" ? await authority(ctx, step) : await restoreAuthority(ctx, job, step)) : null;
    if (reason) {
      await ctx.db.patch("responseDeliveries", jobId, { status: sent ? "unknown" : "refused", reason });
      if (job.kind === "pause") await ctx.db.patch("responseSteps", step._id, { status: sent ? "unknown" : "refused", capNote: reason });
      return null;
    }
    // Scheduled recovery and repeated clicks can only read status after this commit.
    if (job.lastAttemptAt !== undefined && Date.now() - job.lastAttemptAt < 1000) return null;
    await ctx.db.patch("responseDeliveries", jobId, { status: "pending", sentAt: job.sentAt ?? Date.now(),
      lastAttemptAt: Date.now(), polls: sent ? job.polls + 1 : job.polls, reason: sent ? "Checking original command status" : "Command dispatched; confirmation pending" });
    if (!sent) await schedule(ctx, jobId, 45_000); // recovers an action crash without another write
    return { commandJson: job.commandJson, origin: config.origin, statusOnly: sent };
  },
});

export const record = internalMutation({
  args: { jobId: v.id("responseDeliveries"), receipt: v.optional(receiverReceipt) },
  handler: async (ctx, { jobId, receipt }) => {
    const job = await ctx.db.get("responseDeliveries", jobId);
    if (!job || job.sentAt === undefined || ["confirmed", "refused"].includes(job.status)) return;
    const step = await ctx.db.get("responseSteps", job.stepId);
    if (!step) return;
    const command = JSON.parse(job.commandJson);
    if (receipt && (receipt.commandId !== job.commandId || receipt.companyId !== job.companyId || receipt.incidentId !== step.incidentId || receipt.target !== command.target || receipt.action !== command.action ||
      (receipt.status === "confirmed" && (job.kind === "pause" ? receipt.observedState !== "SUSPENDED" : !["ACTIVE", "SUSPENDED"].includes(receipt.observedState ?? ""))))) throw new ConvexError("Receipt does not match command effect");
    const status = receipt?.status ?? "unknown";
    const reason = receipt?.reason ?? "No matching signed receipt. The action may have happened; check the original command.";
    await ctx.db.patch("responseDeliveries", jobId, { status, reason, receipt, updatedAt: Date.now() });
    if (job.kind === "pause") await ctx.db.patch("responseSteps", step._id, {
      status: status === "confirmed" ? "done" : status, capNote: status === "confirmed" ? undefined : reason,
      ...(status === "confirmed" ? { executedAt: receipt!.observedAt! } : {}),
    });
    else if (status === "confirmed") await ctx.db.patch("responseSteps", step._id, { status: "undone", undoneAt: Date.now(), undoneBy: job.requestedBy,
      capNote: receipt!.observedState === "SUSPENDED" ? "This incident's hold was released; other holds keep the account suspended." : undefined });
    if (["confirmed", "refused"].includes(status)) await ctx.db.insert("auditLog", {
      at: Date.now(), actor: "system", action: status === "refused" ? "refused" : job.kind === "pause" ? "respond" : "undo",
      companyId: job.companyId, incidentId: step.incidentId, rule: "signed_company_receiver",
      reason: `Okta receiver ${job.kind}: ${status}; ${reason}. Observed state ${receipt?.observedState ?? "unverified"}.`,
    });
    else if (job.polls < 5) await schedule(ctx, jobId, [2000, 5000, 15_000, 30_000, 60_000][job.polls]);
  },
});

export async function deliverySummary(ctx: QueryCtx, stepId: Id<"responseSteps">) {
  const jobs = await ctx.db.query("responseDeliveries").withIndex("by_stepId_and_kind", q => q.eq("stepId", stepId)).take(2);
  // Deliberately exclude signing keys, receiver host, command bodies and provider credentials.
  return jobs.map(j => ({ id: j._id, kind: j.kind, commandId: j.commandId, status: j.status,
    reason: j.reason, receipt: j.receipt ?? null, updatedAt: j.updatedAt ?? j.createdAt }));
}

export const prepareRestore = mutation({
  args: { stepId: v.id("responseSteps") },
  handler: async (ctx, { stepId }) => {
    const { step, viewer } = await ownStep(ctx, stepId);
    const pause = await ctx.db.query("responseDeliveries").withIndex("by_stepId_and_kind", q => q.eq("stepId", stepId).eq("kind", "pause")).unique();
    if (step.executionMode !== "external" || step.status !== "done" || pause?.receipt?.status !== "confirmed" || !pause.receipt.restoreEligible)
      throw new ConvexError("This pause is not eligible for restoration; the company operator must review it.");
    const prior = await ctx.db.query("responseDeliveries").withIndex("by_stepId_and_kind", q => q.eq("stepId", stepId).eq("kind", "restore")).unique();
    if (prior) return { ok: true as const };
    const command = { ...JSON.parse(pause.commandJson), commandId: `restore-${stepId}`, action: "restore_shared_login", pauseCommandId: pause.commandId };
    await ctx.db.insert("responseDeliveries", { stepId, companyId: step.companyId, kind: "restore", commandId: command.commandId,
      commandJson: JSON.stringify(command), binding: pause.binding, status: "awaiting_operator", createdAt: Date.now(), polls: 0,
      requestedBy: viewer.user._id, reason: "Company operator must approve this command locally after remediation, then send it here." });
    return { ok: true as const };
  },
});

export const checkOrSend = mutation({
  args: { jobId: v.id("responseDeliveries") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get("responseDeliveries", jobId);
    if (!job) throw new ConvexError("Command not found");
    const { viewer } = await ownStep(ctx, job.stepId);
    if (job.status === "confirmed") return { ok: true as const };
    const allowed = await limits.limit(ctx, "receiverCheck", { key: jobId });
    if (!allowed.ok) return { ok: false as const, reason: "Status check already requested; wait ten seconds." };
    // An explicit receiver refusal of this restore means no restoration occurred.
    // Reuse the SAME command after company-local approval; never create a new ID.
    const approvalRefusal = job.kind === "restore" && job.receipt?.reason === "company_operator_restore_approval_required";
    if (job.status === "awaiting_operator" || approvalRefusal) {
      await ctx.db.patch("responseDeliveries", jobId, { status: "ready", sentAt: undefined, lastAttemptAt: undefined,
        receipt: undefined, polls: 0, requestedBy: viewer.user._id, reason: "Checking company-local restoration approval" });
    } else {
      if (job.status === "refused") return { ok: false as const, reason: job.reason };
      if (job.lastAttemptAt && Date.now() - job.lastAttemptAt < 10_000) return { ok: false as const, reason: "Status check already in progress; wait ten seconds." };
    }
    await schedule(ctx, jobId);
    return { ok: true as const };
  },
});

// Operator-only DEV setup inspection. Never returns any credentials.
export const setupState = internalQuery({
  args: {},
  handler: async ctx => {
    const company = await ctx.db.query("companies").withIndex("by_domain", q => q.eq("domain", "cedarridge.example")).unique();
    const asset = (await ctx.db.query("assets").take(100)).find(a => a.name === "Ironclad shared admin account");
    const incidents = asset ? await ctx.db.query("incidents").withIndex("by_assetId", q => q.eq("assetId", asset._id)).order("desc").take(20) : [];
    return { companyId: company?._id ?? null, assetId: asset?._id ?? null,
      policy: company ? await ctx.db.query("responsePolicies").withIndex("by_companyId_and_action", q => q.eq("companyId", company._id).eq("action", "pause_shared_login")).unique() : null,
      configured: receiverConfig().configured, enabled: receiverConfig().enabled,
      incidents: incidents.map(i => ({ id: i._id, containedAt: i.containedAt ?? null, externalId: i.externalId, reviewDueAt: i.reviewDueAt ?? null })) };
  },
});
