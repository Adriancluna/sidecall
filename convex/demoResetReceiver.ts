import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { receiverConfig } from "./responseReceiver";

// Called transactionally before any demo data is removed. Work is serialized
// per target by the receiver; a sent command is only ever checked, never resent.
export async function restoreDemoAccounts(ctx: MutationCtx, state: Doc<"demoResetState">): Promise<string | null> {
  const jobs = await ctx.db.query("responseDeliveries").take(1001);
  if (jobs.length > 1000) return "Too much receiver history; operator review is required.";
  const config = receiverConfig();
  const waitFor = async (job: Doc<"responseDeliveries">) => {
    if (Date.now() - state.startedAt > 180_000) return "Okta recovery could not be confirmed within three minutes. Check the original commands, then retry Reset.";
    if (!job.lastAttemptAt || Date.now() - job.lastAttemptAt >= 10_000)
      await ctx.scheduler.runAfter(0, internal.receiverTransport.dispatch, { jobId: job._id });
    return "waiting";
  };
  // Resolve all possibly-sent pauses before releasing any hold.
  for (const pause of jobs.filter(j => j.kind === "pause" && j.sentAt !== undefined)) {
    if (["pending", "unknown", "ready"].includes(pause.status)) return await waitFor(pause);
  }
  for (const pause of jobs.filter(j => j.kind === "pause" && j.status === "confirmed")) {
    const restore = jobs.find(j => j.stepId === pause.stepId && j.kind === "restore");
    if (restore?.status === "confirmed") continue;
    if (pause.binding !== config.binding || !config.configured || !config.enabled)
      return "The original receiver connection is unavailable or changed. Restore it before resetting.";
    const step = await ctx.db.get("responseSteps", pause.stepId);
    if (!step || !state.protectedIncidents.includes(step.incidentId) || !pause.receipt?.restoreEligible)
      return "The receiver cannot prove it owns this suspension. Manual account recovery is required; demo data was kept.";
    if (restore && ["pending", "unknown", "ready"].includes(restore.status)) return await waitFor(restore);
    const approvalRefusal = restore?.receipt?.reason === "company_operator_restore_approval_required";
    const retryableDemoRefusal = restore && JSON.parse(restore.commandJson).demoReset === true &&
      ["demo_reset_not_authorized_for_owned_target", "receiver_disabled", "receiver_command_budget_exhausted", "target_has_unresolved_command"]
        .includes(restore.receipt?.reason ?? "");
    if (restore && restore.status !== "awaiting_operator" && !approvalRefusal && !retryableDemoRefusal)
      return `Okta restoration was refused: ${restore.reason}. Demo data was kept.`;
    // Only an unsent request or an explicit admission refusal can be changed.
    // Neither has a durable receiver command/effect to conflict with.
    const command = { ...JSON.parse(pause.commandJson), commandId: restore?.commandId ?? `restore-${pause.stepId}`,
      action: "restore_shared_login", pauseCommandId: pause.commandId, demoReset: true };
    const value = { stepId: pause.stepId, companyId: pause.companyId, kind: "restore" as const,
      commandId: command.commandId, commandJson: JSON.stringify(command), binding: pause.binding,
      status: "ready" as const, createdAt: Date.now(), polls: 0, reason: "Presenter requested disposable demo account recovery" };
    const id = restore ? restore._id : await ctx.db.insert("responseDeliveries", value);
    if (restore) await ctx.db.replace("responseDeliveries", id, value);
    await ctx.scheduler.runAfter(0, internal.receiverTransport.dispatch, { jobId: id });
    return "waiting";
  }
  // Releasing one hold can leave others active. The last restoration for each
  // binding must prove ACTIVE, not merely report that one hold was released.
  const latest = new Map<string, Doc<"responseDeliveries">>();
  for (const job of jobs.filter(j => j.kind === "restore" && j.status === "confirmed")) {
    const previous = latest.get(job.binding);
    if (!previous || (job.receipt?.observedAt ?? 0) >= (previous.receipt?.observedAt ?? 0)) latest.set(job.binding, job);
  }
  if ([...latest.values()].some(j => j.receipt?.observedState !== "ACTIVE"))
    return "Other account holds remain. Reset stopped without clearing demo data; review the receiver holds.";
  return null;
}
