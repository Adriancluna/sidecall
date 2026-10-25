// Response playbook (docs/specs/response-playbook.md): the first steps each company has approved
// in advance for Sidecall to take on its behalf. Notify = tell us; prepare = one click by our IT
// lead or controller; act = run it the moment the report lands, logged, with Undo.
// One explicitly configured DEV target can use the signed Okta receiver. Other targets
// retain their labelled sandbox/simulation mode; external results require a signed receipt.
import { enqueueExternal, deliverySummary } from "./responseReceiver";
import { ConvexError, v } from "convex/values";
import {
  internalAction,
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { getViewer, type Viewer } from "./access";
import { playbookAction, responseMode } from "./schema";
import {
  lowerMode,
  raisesMode,
  responseFor,
  type ResponseAction,
  type ResponseMode,
} from "./scoring";
import { activeEpisode, MAX_FANOUT, memo } from "./shared";
import { applySandboxResponse, undoSandboxResponse } from "./sandbox";

// At most this many companies get steps that run without a click from one report, so a forged or
// buggy report can't cause a portfolio-wide outage. The rest are lowered to one click.
export const MAX_ACT_COMPANIES = 3;

type PlaybookAction = ResponseAction | "hold_payments";

export const STEP_INFO: Record<
  PlaybookAction,
  { label: string; effect: (target: string, vendor: string) => string; undo: string; wouldCall: string; finding: string }
> = {
  hold_payments: {
    label: "Hold payments to the breached vendor",
    effect: (_, vendor) => `Hold every pending payment to ${vendor} until someone who didn't request it verifies by phone.`,
    undo: "A controller releases or rejects each payment",
    wouldCall: "Built in (no external call)",
    finding: "Kronos/UKG payroll harm; vendor bank details changed by email",
  },
  pause_shared_login: {
    label: "Pause the shared login",
    effect: (target) => `Suspend ${target} in your own tenant: new sign-ins are blocked while suspended; downstream app sessions may need separate revocation.`,
    undo: "Restore access",
    wouldCall: "Okta POST /users/{id}/lifecycle/suspend · Entra accountEnabled=false + revokeSignInSessions",
    finding: "Snowflake: most accounts used had leaked before, no MFA; attackers move in ~29 min",
  },
  revoke_vendor_tokens: {
    label: "Revoke the vendor's app tokens",
    effect: (_, vendor) => `Revoke ${vendor}'s connected-app (OAuth) grants in your tenant.`,
    undo: "The vendor re-authorises",
    wouldCall: "Google Workspace tokens.delete · Entra OAuth2PermissionGrant delete",
    finding: "Salesloft Drift: stolen app tokens reached 700+ organisations in 10 days",
  },
};

// What the PE firm recommends. Only a company can adopt it (the firm sees, the company decides).
export const RECOMMENDED: Record<PlaybookAction, ResponseMode> = {
  hold_payments: "act",
  pause_shared_login: "prepare",
  revoke_vendor_tokens: "prepare",
};

const RESPONSE_ACTIONS: ResponseAction[] = [
  "pause_shared_login",
  "revoke_vendor_tokens",
];

// ---- planning (inside the incident's own transaction) ----

export type ActBudget = { companies: Set<Id<"companies">> };
export const newActBudget = (): ActBudget => ({ companies: new Set() });

// Called from openExposure, after the externalId dedupe, so a replayed report plans nothing.
// Only "prepare" and "act" steps are stored; "notify" ones are worked out when read.
export async function planResponses(
  ctx: MutationCtx,
  args: {
    incidentId: Id<"incidents">;
    exposureId: Id<"exposures">;
    link: Doc<"links">;
    asset: Doc<"assets">;
    budget: ActBudget;
  },
): Promise<void> {
  const { incidentId, exposureId, link, asset, budget } = args;
  const now = Date.now();
  const episode = await ctx.db.get("incidents", incidentId);
  if (
    !episode ||
    episode.responseClass === "observation" ||
    !activeEpisode(episode, now)
  )
    return;
  for (const rule of responseFor(link, asset)) {
    const policy = await policyFor(ctx, link.companyId, rule.action);
    if (!policy || policy.mode === "notify") continue;
    let mode = lowerMode(policy.mode, rule.cap);
    let capNote = mode !== policy.mode ? rule.capNote : undefined;
    const priorSteps = await ctx.db
      .query("responseSteps")
      .withIndex("by_companyId_and_action_and_target", (q) =>
        q
          .eq("companyId", link.companyId)
          .eq("action", rule.action)
          .eq("target", asset.name),
      )
      .order("desc")
      .take(100);
    const priorEpisodes = await Promise.all(
      priorSteps
        .filter((step) => step.incidentId !== incidentId)
        .map((step) => ctx.db.get("incidents", step.incidentId)),
    );
    if (
      mode === "act" &&
      priorEpisodes.some(
        (prior) =>
          prior &&
          activeEpisode(prior, now) &&
          prior.correlationKey === episode.correlationKey &&
          episode.correlationKey !== undefined,
      )
    ) {
      mode = "prepare";
      capNote =
        "This target already has a response in the same active episode; a company approver must review any repeat action.";
    }
    if (
      mode === "act" &&
      !budget.companies.has(link.companyId) &&
      budget.companies.size >= MAX_ACT_COMPANIES
    ) {
      mode = "prepare";
      capNote = `One click this time: no more than ${MAX_ACT_COMPANIES} companies run steps without a click from one report.`;
    }
    if (mode === "notify") continue;
    if (mode === "act") budget.companies.add(link.companyId);
    const existing = await ctx.db
      .query("responseSteps")
      .withIndex("by_incidentId_and_companyId_and_action", (q) =>
        q
          .eq("incidentId", incidentId)
          .eq("companyId", link.companyId)
          .eq("action", rule.action),
      )
      .unique();
    if (existing) continue; // one step per (incident, company, action), e.g. an AP import reopening
    await ctx.db.insert("responseSteps", {
      incidentId,
      companyId: link.companyId,
      exposureId,
      action: rule.action,
      mode,
      status: mode === "act" ? "queued" : "awaiting_approval",
      target: asset.name,
      policyRule: `playbook:${rule.action}:${policy.mode}:v${policy.version}`,
      capNote,
      plannedAt: now,
    });
  }
}

async function policyFor(ctx: QueryCtx, companyId: Id<"companies">, action: ResponseAction) {
  return await ctx.db
    .query("responsePolicies")
    .withIndex("by_companyId_and_action", (q) => q.eq("companyId", companyId).eq("action", action))
    .unique();
}

const SOURCE_AUTHORITY_NOTE = "This report's authorization is no longer active. Ask the portfolio team to review the evidence before proceeding.";

// Approval never replaces the authority behind the incident's creating report. Queries omit
// `now` so they remain clock-free; mutations always enforce expiry as well as revocation.
async function detectorAuthorityInactive(
  ctx: QueryCtx,
  incident: Doc<"incidents"> | null,
  now?: number,
) {
  if (!incident?.sourceId) return false;
  const source = await ctx.db.get("detectorSources", incident.sourceId);
  return !source || source.revokedAt !== undefined || source.mode !== "confirm" ||
    (now !== undefined && source.expiresAt <= now);
}

async function expireForDetectorAuthority(ctx: MutationCtx, step: Doc<"responseSteps">, now: number) {
  await ctx.db.patch("responseSteps", step._id, { status: "expired", capNote: SOURCE_AUTHORITY_NOTE });
  await ctx.db.insert("auditLog", { at: now, actor: "system", action: "expire",
    incidentId: step.incidentId, companyId: step.companyId, rule: "detector_authority_inactive",
    reason: "Response step expired because its report source no longer has active confirm authority. Company approval cannot replace that authority. Existing money holds and completed actions are unchanged." });
}

// Scheduled per incident/approval. The mutation routes the allowlisted target to a durable
// external job; all other steps retain explicitly labelled sandbox/simulated execution.
export const execute = internalAction({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.responses.recordSimulated, {
      incidentId: args.incidentId,
    });
    return null;
  },
});

export const recordSimulated = internalMutation({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, args) => {
    const queued = await ctx.db
      .query("responseSteps")
      .withIndex("by_incidentId_and_status", (q) =>
        q.eq("incidentId", args.incidentId).eq("status", "queued"),
      )
      .take(MAX_FANOUT);
    const now = Date.now();
    const userName = memo(
      async (id: Id<"users">) =>
        (await ctx.db.get("users", id))?.name ?? "a teammate",
    );
    for (const step of queued) {
      const incident = await ctx.db.get("incidents", step.incidentId);
      const policy = await policyFor(ctx, step.companyId, step.action);
      if (await detectorAuthorityInactive(ctx, incident, now)) {
        await expireForDetectorAuthority(ctx, step, now);
        continue;
      }
      if (
        !incident ||
        !activeEpisode(incident, now) ||
        incident.responseClass === "observation" ||
        !policy ||
        policy.mode === "notify" ||
        (!step.approvedBy && policy.mode !== "act")
      ) {
        await ctx.db.patch("responseSteps", step._id, { status: "expired" });
        continue;
      }
      if (await enqueueExternal(ctx, step, incident, policy.version)) continue;
      const sandbox = await applySandboxResponse(
        ctx,
        step.companyId,
        incident.assetId,
        step.action,
      );
      await ctx.db.patch("responseSteps", step._id, {
        status: "done",
        executedAt: now,
        executionMode: sandbox ? "sandbox" : "simulated",
        verification: sandbox || undefined,
      });
      const how = step.approvedBy
        ? `approved by ${await userName(step.approvedBy)}`
        : `pre-approved in the company's playbook (${step.policyRule.split(":").pop()})`;
      await ctx.db.insert("auditLog", {
        at: now,
        actor: "system",
        action: "respond",
        companyId: step.companyId,
        incidentId: step.incidentId,
        rule: step.policyRule,
        reason: `${STEP_INFO[step.action].label}: ${step.target}, ${how}. ${sandbox ? "Owned sandbox authorization changed; no external identity provider." : "Simulated connector."}`,
      });
    }
    return queued.length;
  },
});

// ---- people acting on steps ----

// Steps belong to the company: its IT lead or controller decides. The firm and AP clerks are
// refused, and the refusal is on the record.
async function loadOwnStep(
  ctx: MutationCtx,
  stepId: Id<"responseSteps">,
): Promise<
  | { refused: "not_found" | "not_allowed" }
  | { step: Doc<"responseSteps">; viewer: Viewer & { firm: false } }
> {
  const viewer = await getViewer(ctx);
  const step = await ctx.db.get("responseSteps", stepId);
  if (!step) return { refused: "not_found" as const };
  if (
    viewer.firm ||
    viewer.companyId !== step.companyId ||
    !canDecideSteps(viewer)
  ) {
    await ctx.db.insert("auditLog", {
      at: Date.now(),
      actor: viewer.user._id,
      action: "refused",
      companyId: step.companyId,
      incidentId: step.incidentId,
      rule: "response_playbook",
      reason: `${viewer.user.name} can't act on this company's steps: only its IT lead or controller can.`,
    });
    return { refused: "not_allowed" as const };
  }
  return { step, viewer };
}

const canDecideSteps = (viewer: Viewer) =>
  !viewer.firm &&
  (viewer.user.role === "it" || viewer.user.role === "controller");

const stepResult = v.union(v.object({ ok: v.literal(true) }), v.object({ ok: v.literal(false), reason: v.string() }));

// One click: "prepare" → queued → done. Two people clicking at once: the second sees "queued".
export const approveStep = mutation({
  args: { stepId: v.id("responseSteps") },
  returns: stepResult,
  handler: async (ctx, args) => {
    const own = await loadOwnStep(ctx, args.stepId);
    if ("refused" in own) return { ok: false as const, reason: own.refused };
    const { step, viewer } = own;
    if (step.status !== "awaiting_approval")
      return { ok: false as const, reason: `already_${step.status}` };
    const now = Date.now();
    const incident = await ctx.db.get("incidents", step.incidentId);
    if (await detectorAuthorityInactive(ctx, incident, now)) {
      await expireForDetectorAuthority(ctx, step, now);
      return { ok: false as const, reason: "detector_authority_inactive" };
    }
    await ctx.db.patch("responseSteps", step._id, {
      status: "queued",
      approvedBy: viewer.user._id,
      approvedAt: now,
    });
    await ctx.db.insert("auditLog", {
      at: now,
      actor: viewer.user._id,
      action: "approve",
      companyId: step.companyId,
      incidentId: step.incidentId,
      rule: step.policyRule,
      reason: `${viewer.user.name} ran "${STEP_INFO[step.action].label}" for ${step.target}.`,
    });
    await ctx.scheduler.runAfter(0, internal.responses.execute, {
      incidentId: step.incidentId,
    });
    return { ok: true as const };
  },
});

export const undoStep = mutation({
  args: { stepId: v.id("responseSteps") },
  returns: stepResult,
  handler: async (ctx, args) => {
    const own = await loadOwnStep(ctx, args.stepId);
    if ("refused" in own) return { ok: false as const, reason: own.refused };
    const { step, viewer } = own;
    if (step.status !== "done")
      return {
        ok: false as const,
        reason: step.status === "undone" ? "already_undone" : `not_done_yet`,
      };
    if (step.executionMode === "external")
      return { ok: false as const, reason: "External restoration requires a separate receiver command and company-local remediation approval." };
    if (step.executionMode === "sandbox") {
      if (step.action === "revoke_vendor_tokens")
        return {
          ok: false as const,
          reason:
            "Revoked sandbox tokens cannot be resurrected; provision a new test token.",
        };
      const latest = await ctx.db
        .query("responseSteps")
        .withIndex("by_companyId_and_action_and_target", (q) =>
          q
            .eq("companyId", step.companyId)
            .eq("action", step.action)
            .eq("target", step.target),
        )
        .order("desc")
        .take(20);
      if (
        latest.some(
          (s) =>
            s._id !== step._id &&
            s.plannedAt >= step.plannedAt &&
            (s.status === "done" || s.status === "queued"),
        )
      ) {
        return {
          ok: false as const,
          reason:
            "A newer response controls this sandbox target; review that response instead.",
        };
      }
      const incident = await ctx.db.get("incidents", step.incidentId);
      if (incident)
        await undoSandboxResponse(ctx, step.companyId, incident.assetId);
    }
    const now = Date.now();
    await ctx.db.patch("responseSteps", step._id, {
      status: "undone",
      undoneBy: viewer.user._id,
      undoneAt: now,
    });
    await ctx.db.insert("auditLog", {
      at: now,
      actor: viewer.user._id,
      action: "undo",
      companyId: step.companyId,
      incidentId: step.incidentId,
      rule: step.policyRule,
      reason: `${viewer.user.name}: ${STEP_INFO[step.action].undo.toLowerCase()} (${step.target}). ${step.executionMode === "sandbox" ? "Owned sandbox access restored." : "Simulated connector."}`,
    });
    return { ok: true as const };
  },
});

// When the firm marks an incident contained, steps nobody ran expire. Paused logins stay paused
// until someone at the company restores them.
export async function expireWaitingSteps(ctx: MutationCtx, incidentId: Id<"incidents">, actor: Id<"users">) {
  const waiting = await ctx.db
    .query("responseSteps")
    .withIndex("by_incidentId_and_status", (q) => q.eq("incidentId", incidentId).eq("status", "awaiting_approval"))
    .take(MAX_FANOUT);
  const now = Date.now();
  for (const step of waiting) {
    await ctx.db.patch("responseSteps", step._id, { status: "expired" });
    await ctx.db.insert("auditLog", {
      at: now,
      actor,
      action: "expire",
      companyId: step.companyId,
      incidentId,
      rule: step.policyRule,
      reason: `"${STEP_INFO[step.action].label}" wasn't run before the incident was contained.`,
    });
  }
}

// ---- the playbook itself ----

// Turning a step down takes one person. Turning it up to "act" takes two different people: the
// first call proposes, a second person at the same company confirms (like requester ≠ approver).
// Holds keep their existing single controller switch (companies.holdRuleEnabled).
export const setPlaybookMode = mutation({
  args: { action: playbookAction, mode: responseMode },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      applied: v.boolean(),
      awaitingSecondPerson: v.boolean(),
    }),
    v.object({ ok: v.literal(false), reason: v.string() }),
  ),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const refuse = async (reason: string) => {
      await ctx.db.insert("auditLog", {
        at: Date.now(),
        actor: viewer.user._id,
        action: "refused",
        companyId: viewer.firm ? undefined : viewer.companyId,
        rule: "response_playbook",
        reason,
      });
      return { ok: false as const, reason };
    };
    if (viewer.firm)
      return await refuse(
        "The PE firm can recommend a playbook but only the company can set it.",
      );
    if (!canDecideSteps(viewer))
      return await refuse(
        `${viewer.user.name} can't change the playbook: only the IT lead or controller can.`,
      );
    const now = Date.now();
    const log = (reason: string, rule: string) =>
      ctx.db.insert("auditLog", {
        at: now,
        actor: viewer.user._id,
        action: "policy",
        companyId: viewer.companyId,
        rule,
        reason,
      });

    if (args.action === "hold_payments") {
      if (viewer.user.role !== "controller")
        return await refuse("Only a controller switches payment holds.");
      if (args.mode === "prepare")
        return {
          ok: false as const,
          reason: "Holds are either on (pre-approved) or off (notify only).",
        };
      await ctx.db.patch("companies", viewer.companyId, {
        holdRuleEnabled: args.mode === "act",
      });
      await log(
        `${viewer.user.name} set payment holds ${args.mode === "act" ? "on" : "off"}.`,
        `playbook:hold_payments:${args.mode}`,
      );
      return { ok: true as const, applied: true, awaitingSecondPerson: false };
    }

    const action = args.action;
    const policy = await policyFor(ctx, viewer.companyId, action);
    const current: ResponseMode = policy?.mode ?? "notify";
    const version = (policy?.version ?? 0) + 1;
    const apply = async (setBy: Id<"users">, confirmedBy?: Id<"users">) => {
      const fields = {
        mode: args.mode,
        version,
        setBy,
        confirmedBy,
        setAt: now,
        proposedMode: undefined,
        proposedBy: undefined,
        proposedAt: undefined,
      };
      if (policy) await ctx.db.patch("responsePolicies", policy._id, fields);
      else
        await ctx.db.insert("responsePolicies", {
          companyId: viewer.companyId,
          action,
          ...fields,
        });
    };

    if (!raisesMode(current, args.mode)) {
      if (args.mode === current && !policy?.proposedMode)
        return {
          ok: true as const,
          applied: false,
          awaitingSecondPerson: false,
        };
      await apply(viewer.user._id);
      await log(
        `${viewer.user.name} set "${STEP_INFO[action].label}" to ${args.mode} (v${version}).`,
        `playbook:${action}:${args.mode}:v${version}`,
      );
      return { ok: true as const, applied: true, awaitingSecondPerson: false };
    }
    // Raising: confirm someone else's matching proposal, or propose.
    if (
      policy?.proposedMode === args.mode &&
      policy.proposedBy &&
      policy.proposedBy !== viewer.user._id
    ) {
      const proposer = await ctx.db.get("users", policy.proposedBy);
      await apply(policy.proposedBy, viewer.user._id);
      await log(
        `${viewer.user.name} confirmed ${proposer?.name ?? "a teammate"}'s change: "${STEP_INFO[action].label}" is now ${args.mode} (v${version}).`,
        `playbook:${action}:${args.mode}:v${version}`,
      );
      return { ok: true as const, applied: true, awaitingSecondPerson: false };
    }
    if (policy)
      await ctx.db.patch("responsePolicies", policy._id, {
        proposedMode: args.mode,
        proposedBy: viewer.user._id,
        proposedAt: now,
      });
    else
      await ctx.db.insert("responsePolicies", {
        companyId: viewer.companyId,
        action,
        mode: "notify",
        version: 0,
        setBy: viewer.user._id,
        setAt: now,
        proposedMode: args.mode,
        proposedBy: viewer.user._id,
        proposedAt: now,
      });
    await log(
      `${viewer.user.name} proposed "${STEP_INFO[action].label}" → ${args.mode}; a second person must confirm.`,
      `playbook:${action}:proposed:${args.mode}`,
    );
    return { ok: true as const, applied: false, awaitingSecondPerson: true };
  },
});

// ---- reads ----

const nameOf = (ctx: QueryCtx) => memo(async (id: Id<"users">) => (await ctx.db.get("users", id))?.name ?? null);

// The company's playbook, one row per step. The firm gets [] (it sees the tracker instead).
export const getMyPlaybook = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (viewer.firm) return [];
    const company = await ctx.db.get("companies", viewer.companyId);
    const name = nameOf(ctx);
    const canEdit = canDecideSteps(viewer);
    type Row = {
      action: PlaybookAction;
      mode: ResponseMode;
      allowedModes: ResponseMode[];
      version: number | null;
      setByName: string | null;
      confirmedByName: string | null;
      setAt: number | null;
      proposedMode: ResponseMode | null;
      proposedByName: string | null;
      canEdit: boolean;
    };
    const rows: Row[] = [
      {
        action: "hold_payments",
        mode: company?.holdRuleEnabled ? "act" : "notify",
        allowedModes: ["notify", "act"],
        version: null,
        setByName: null,
        confirmedByName: null,
        setAt: null,
        proposedMode: null,
        proposedByName: null,
        canEdit: viewer.user.role === "controller",
      },
    ];
    for (const action of RESPONSE_ACTIONS) {
      const p = await policyFor(ctx, viewer.companyId, action);
      rows.push({
        action,
        mode: p?.mode ?? "notify",
        allowedModes: ["notify", "prepare", "act"],
        version: p?.version ?? null,
        setByName: p && p.setBy !== "seed" ? await name(p.setBy) : null,
        confirmedByName: p?.confirmedBy ? await name(p.confirmedBy) : null,
        setAt: p?.setAt ?? null,
        proposedMode: p?.proposedMode ?? null,
        proposedByName: p?.proposedBy ? await name(p.proposedBy) : null,
        canEdit,
      });
    }
    return rows.map((r) => ({
      ...r,
      label: STEP_INFO[r.action].label,
      undo: STEP_INFO[r.action].undo,
      wouldCall: STEP_INFO[r.action].wouldCall,
      finding: STEP_INFO[r.action].finding,
      recommendedMode: RECOMMENDED[r.action],
    }));
  },
});

// The steps for the viewer's company in one incident: stored ones plus "notify" ones worked out
// from the rule table. Never names the reporter (targets come from our own asset rows).
export const getMyResponsePlan = query({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (viewer.firm) return [];
    const incident = await ctx.db.get("incidents", args.incidentId);
    if (!incident || incident.responseClass === "observation") return [];
    const exposure = await ctx.db
      .query("exposures")
      .withIndex("by_incidentId_and_companyId", (q) =>
        q.eq("incidentId", incident._id).eq("companyId", viewer.companyId),
      )
      .first();
    if (!exposure) return [];
    const asset = await ctx.db.get("assets", incident.assetId);
    if (!asset) return [];
    const link = (
      await ctx.db
        .query("links")
        .withIndex("by_assetId", (q) => q.eq("assetId", asset._id))
        .take(MAX_FANOUT)
    )
      .filter((l) => l.companyId === viewer.companyId)
      .sort((a, b) => linkRank(b) - linkRank(a))[0];
    if (!link) return [];
    const name = nameOf(ctx);
    const decider = canDecideSteps(viewer);
    const sourceInactive = await detectorAuthorityInactive(ctx, incident);
    const plan = [];
    for (const rule of responseFor(link, asset)) {
      const step = await ctx.db
        .query("responseSteps")
        .withIndex("by_incidentId_and_companyId_and_action", (q) =>
          q
            .eq("incidentId", incident._id)
            .eq("companyId", viewer.companyId)
            .eq("action", rule.action),
        )
        .unique();
      const info = STEP_INFO[rule.action];
      plan.push({
        stepId: step?._id ?? null,
        action: rule.action,
        label: info.label,
        effect: info.effect(asset.name, asset.vendorName),
        undo: info.undo,
        wouldCall: info.wouldCall,
        executionMode: step?.executionMode ?? "simulated",
        verification: step?.verification ?? null,
        deliveries: step?.executionMode === "external" ? await deliverySummary(ctx, step._id) : [],
        canManageReceiver: decider && step?.executionMode === "external",
        mode: step?.mode ?? "notify",
        status: step?.status ?? ("recommended" as const),
        capNote:
          (sourceInactive && (step?.status === "awaiting_approval" || step?.status === "queued")
            ? SOURCE_AUTHORITY_NOTE : step?.capNote) ??
          (rule.cap === "notify" ? (rule.capNote ?? null) : null),
        policyRule: step?.policyRule ?? null,
        approvedByName: step?.approvedBy ? await name(step.approvedBy) : null,
        undoneByName: step?.undoneBy ? await name(step.undoneBy) : null,
        executedAt: step?.executedAt ?? null,
        msAfterReport:
          step?.executedAt !== undefined
            ? step.executedAt - incident.createdAt
            : null,
        canApprove: decider && step?.status === "awaiting_approval" && !sourceInactive,
        canUndo:
          decider &&
          step?.status === "done" && step.executionMode !== "external" &&
          !(
            step.executionMode === "sandbox" &&
            step.action === "revoke_vendor_tokens"
          ),
      });
    }
    return plan;
  },
});

function linkRank(link: Doc<"links">): number {
  const share = {
    shared_credential: 3,
    shared_admin_access: 2,
    same_vendor_only: 1,
  }[link.shareType];
  return share * 2 + (link.source === "self_reported" ? 1 : 0);
}

// The firm's view: how far each exposed company's own pre-approved steps got.
export const getResponseTracker = query({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer.firm)
      throw new ConvexError("Only the PE firm sees the portfolio tracker.");
    const incident = await ctx.db.get("incidents", args.incidentId);
    if (!incident) return null;
    const [exposures, steps] = await Promise.all([
      ctx.db
        .query("exposures")
        .withIndex("by_incidentId_and_companyId", (q) =>
          q.eq("incidentId", incident._id),
        )
        .take(MAX_FANOUT),
      ctx.db
        .query("responseSteps")
        .withIndex("by_incidentId_and_companyId_and_action", (q) =>
          q.eq("incidentId", incident._id),
        )
        .take(MAX_FANOUT * 2),
    ]);
    const companies = exposures.map((e) => {
      const mine = steps.filter((s) => s.companyId === e.companyId);
      const done = mine.filter(
        (s) => s.status === "done" || s.status === "undone",
      );
      const first = done.reduce<number | null>(
        (min, s) =>
          s.executedAt !== undefined && (min === null || s.executedAt < min)
            ? s.executedAt
            : min,
        null,
      );
      return {
        companyId: e.companyId,
        done: done.length,
        ready: mine.filter(
          (s) => s.status === "awaiting_approval" || s.status === "queued",
        ).length,
        firstStepMs: first === null ? null : first - incident.createdAt,
        pending: mine.filter(s => s.status === "pending").length,
        unknown: mine.filter(s => s.status === "unknown").length,
        refused: mine.filter(s => s.status === "refused").length,
        external: mine.some(s => s.executionMode === "external"),
        notifyOnly: mine.length === 0,
        lowered: mine.filter((s) => s.capNote).map((s) => s.capNote!),
      };
    });
    return {
      companies,
      totals: {
        exposed: companies.length,
        firstStepDone: companies.filter((c) => c.done > 0).length,
        ready: companies.filter((c) => c.done === 0 && c.ready > 0).length,
        notifyOnly: companies.filter((c) => c.notifyOnly).length,
      },
      simulated: steps.every((step) => step.executionMode !== "sandbox" && step.executionMode !== "external"),
      external: steps.some(step => step.executionMode === "external"),
      sandbox: steps.some((step) => step.executionMode === "sandbox"),
    };
  },
});
