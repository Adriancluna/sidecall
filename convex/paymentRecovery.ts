// A correction belongs to one rejected bill. It never changes the vendor master or pays money.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getViewer, type Viewer } from "./access";
import { currentReleaseContext, checkReleaseAttestation, releaseContext, sameReleaseContext } from "./paymentVerification";
import { livePaymentForBill } from "./paymentLookup";
import { holdNewPayment } from "./payments";

const TTL = 15 * 60_000;
const failure = v.object({ ok: v.literal(false), reason: v.string() });
const destinationValidator = v.object({ id: v.id("bankDetailChanges"), accountLast4: v.string(), changedAt: v.number() });

async function sourceFor(ctx: QueryCtx, viewer: Viewer, paymentId: Id<"payments">) {
  const payment = await ctx.db.get("payments", paymentId);
  if (!payment || viewer.firm || viewer.companyId !== payment.companyId) return null;
  return payment;
}
async function destinationFor(ctx: QueryCtx, assetId: Id<"assets">) {
  return await ctx.db.query("bankDetailChanges")
    .withIndex("by_assetId_and_requestChannel_and_changedAt", q => q.eq("assetId", assetId).eq("requestChannel", "verified_call"))
    .order("desc").first();
}
async function latestProposal(ctx: QueryCtx, paymentId: Id<"payments">) {
  return await ctx.db.query("paymentRecoveries").withIndex("by_rejectedPaymentId", q => q.eq("rejectedPaymentId", paymentId)).order("desc").first();
}
async function sourceBlock(ctx: QueryCtx, payment: Doc<"payments">) {
  if (payment.status !== "rejected") return "Reject the original payment before preparing a correction.";
  if (!payment.heldByIncidentId || !await ctx.db.get("incidents", payment.heldByIncidentId))
    return "This payment has no retained incident record for a reviewed replacement.";
  const newestRejected = await ctx.db.query("payments")
    .withIndex("by_billId_and_status", q => q.eq("billId", payment.billId).eq("status", "rejected")).order("desc").first();
  if (newestRejected?._id !== payment._id) return "A newer rejected request exists; recover that request instead.";
  if (await livePaymentForBill(ctx, payment.billId)) return "This bill already has a live or paid payment.";
  return null;
}
async function refuse(ctx: MutationCtx, payment: Doc<"payments">, viewer: Viewer, reason: string) {
  await ctx.db.insert("auditLog", { at: Date.now(), actor: viewer.user._id, action: "refused",
    companyId: payment.companyId, paymentId: payment._id, incidentId: payment.heldByIncidentId,
    rule: "payment_recovery_refused", reason });
  return { ok: false as const, reason };
}

export const getForPayment = query({
  args: { paymentId: v.id("payments") },
  returns: v.union(v.null(), v.object({ context: releaseContext,
    destination: v.union(v.null(), destinationValidator),
    latestProposal: v.union(v.null(), v.object({ id: v.id("paymentRecoveries"),
      status: v.union(v.literal("prepared"), v.literal("requested"), v.literal("revoked"), v.literal("superseded")),
      expiresAt: v.number(), proposedByName: v.string(), accountLast4: v.string(), amountCents: v.number(),
      replacementPaymentId: v.union(v.null(), v.id("payments")) })),
    canPropose: v.boolean(), canRequest: v.boolean(), canRevoke: v.boolean(), blockedReason: v.union(v.null(), v.string()),
    phoneOnFile: v.string(), amountCents: v.number(),
  })),
  handler: async (ctx, { paymentId }) => {
    const viewer = await getViewer(ctx), payment = await sourceFor(ctx, viewer, paymentId);
    if (!payment || payment.status !== "rejected") return null;
    const [context, destination, proposal, blocked] = await Promise.all([
      currentReleaseContext(ctx, payment), destinationFor(ctx, payment.assetId), latestProposal(ctx, paymentId), sourceBlock(ctx, payment),
    ]);
    const blockedReason = blocked ?? (!destination ? "No destination previously confirmed by phone is on file; a new vendor verification is required." :
      destination.accountLast4 === payment.accountLast4 ? "The known destination matches this rejected payment; resolve the rejection before requesting it again." : null);
    const controller = viewer.user.role === "controller" && viewer.user._id !== payment.requestedBy;
    const proposer = proposal ? await ctx.db.get("users", proposal.proposedBy) : null;
    const proposalCurrent = !!proposal && sameReleaseContext(context, proposal.context) &&
      destination?._id === proposal.bankRecordId && destination.changedAt === proposal.bankRecordChangedAt &&
      destination.accountLast4 === proposal.accountLast4 && proposer?.role === "controller" && proposer.companyId === payment.companyId;
    return { context, destination: destination ? { id: destination._id, accountLast4: destination.accountLast4, changedAt: destination.changedAt } : null,
      latestProposal: proposal ? { id: proposal._id, status: proposal.status, expiresAt: proposal.expiresAt,
        proposedByName: proposer?.name ?? "Controller", accountLast4: proposal.accountLast4, amountCents: proposal.context.amountCents,
        replacementPaymentId: proposal.replacementPaymentId ?? null } : null,
      canPropose: controller && !blockedReason,
      canRequest: viewer.user.role === "ap_clerk" && !blockedReason && proposal?.status === "prepared" && proposalCurrent,
      canRevoke: controller && proposal?.status === "prepared",
      blockedReason: blockedReason ?? (proposal?.status === "prepared" && !proposalCurrent ? "The prepared correction is stale; ask the controller to verify again." : null),
      phoneOnFile: context.vendor?.phoneOnFile ?? "", amountCents: payment.amountCents };
  },
});

export const prepare = mutation({
  args: { paymentId: v.id("payments"), context: releaseContext, bankRecordId: v.id("bankDetailChanges"), bankRecordChangedAt: v.number(),
    confirmedAccountLast4: v.string(), calledPhoneOnFile: v.boolean(), verificationNote: v.string() },
  returns: v.union(failure, v.object({ ok: v.literal(true), proposalId: v.id("paymentRecoveries") })),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx), payment = await sourceFor(ctx, viewer, args.paymentId);
    if (!payment) return { ok: false as const, reason: "This payment is unavailable to your company." };
    if (viewer.user.role !== "controller" || viewer.user._id === payment.requestedBy)
      return await refuse(ctx, payment, viewer, "A different controller at this company must verify the correction.");
    const blocked = await sourceBlock(ctx, payment);
    if (blocked) return await refuse(ctx, payment, viewer, blocked);
    const context = await currentReleaseContext(ctx, payment), bank = await destinationFor(ctx, payment.assetId);
    if (!sameReleaseContext(context, args.context)) return await refuse(ctx, payment, viewer, "Payment, invoice or vendor facts changed. Start the verification again.");
    if (!bank || bank._id !== args.bankRecordId || bank.changedAt !== args.bankRecordChangedAt || bank.accountLast4 === payment.accountLast4)
      return await refuse(ctx, payment, viewer, "Choose the current destination previously confirmed by phone; it must differ from the rejected destination.");
    // Validate bill consistency and callback assertion against the corrected destination,
    // while retaining the original rejected snapshot separately as immutable provenance.
    const correctedContext = { ...context, accountLast4: bank.accountLast4 };
    const verified = checkReleaseAttestation(correctedContext, { context: correctedContext,
      confirmedAccountLast4: args.confirmedAccountLast4, calledPhoneOnFile: args.calledPhoneOnFile });
    if (!verified.ok) return await refuse(ctx, payment, viewer, verified.reason);
    const note = args.verificationNote.trim();
    if (note.length < 15 || note.length > 2000 || !/[a-z]{2,}\s+[a-z]{2,}/i.test(note))
      return await refuse(ctx, payment, viewer, "Describe who confirmed the corrected destination in 15–2,000 characters.");
    const previous = await latestProposal(ctx, payment._id);
    if (previous?.status === "prepared") await ctx.db.patch("paymentRecoveries", previous._id, { status: "superseded" });
    const now = Date.now();
    const proposalId = await ctx.db.insert("paymentRecoveries", { companyId: payment.companyId, billId: payment.billId,
      rejectedPaymentId: payment._id, context, bankRecordId: bank._id, bankRecordChangedAt: bank.changedAt, accountLast4: bank.accountLast4,
      proposedBy: viewer.user._id, proposedAt: now, expiresAt: now + TTL, verificationNote: note, calledPhoneOnFile: true, status: "prepared" });
    await ctx.db.insert("auditLog", { at: now, actor: viewer.user._id, action: "approve", companyId: payment.companyId,
      paymentId: payment._id, incidentId: payment.heldByIncidentId, rule: "payment_recovery_prepared",
      reason: `Controller prepared a bill-specific request to account ending ${bank.accountLast4}; AP must request it within 15 minutes, then a controller must release it. No vendor-master change or money movement. ${note}` });
    return { ok: true as const, proposalId };
  },
});

export const requestReplacement = mutation({
  args: { proposalId: v.id("paymentRecoveries") },
  returns: v.union(failure, v.object({ ok: v.literal(true), paymentId: v.id("payments") })),
  handler: async (ctx, { proposalId }) => {
    const viewer = await getViewer(ctx), proposal = await ctx.db.get("paymentRecoveries", proposalId);
    if (!proposal || viewer.firm || viewer.companyId !== proposal.companyId)
      return { ok: false as const, reason: "This correction is unavailable to your company." };
    const payment = await sourceFor(ctx, viewer, proposal.rejectedPaymentId);
    if (!payment) return { ok: false as const, reason: "Original payment is unavailable." };
    if (viewer.user.role !== "ap_clerk" || viewer.user._id === proposal.proposedBy)
      return await refuse(ctx, payment, viewer, "A separate AP clerk must request the corrected payment.");
    if (proposal.status === "requested" && proposal.replacementPaymentId) return { ok: true as const, paymentId: proposal.replacementPaymentId };
    if (proposal.status !== "prepared" || Date.now() >= proposal.expiresAt)
      return await refuse(ctx, payment, viewer, "The correction expired, was revoked or was replaced. Ask the controller to verify again.");
    const blocked = await sourceBlock(ctx, payment);
    if (blocked) return await refuse(ctx, payment, viewer, blocked);
    const approver = await ctx.db.get("users", proposal.proposedBy);
    if (approver?.role !== "controller" || approver.companyId !== proposal.companyId)
      return await refuse(ctx, payment, viewer, "The verifying controller no longer has authority at this company.");
    const context = await currentReleaseContext(ctx, payment), bank = await destinationFor(ctx, payment.assetId);
    if (!sameReleaseContext(context, proposal.context) || !bank || bank._id !== proposal.bankRecordId ||
      bank.changedAt !== proposal.bankRecordChangedAt || bank.accountLast4 !== proposal.accountLast4)
      return await refuse(ctx, payment, viewer, "Invoice, contact or bank details changed after verification. Ask the controller to verify again.");
    const incident = (await ctx.db.get("incidents", payment.heldByIncidentId!))!, asset = (await ctx.db.get("assets", payment.assetId))!;
    const now = Date.now();
    const paymentId = await ctx.db.insert("payments", { billId: payment.billId, companyId: payment.companyId, assetId: payment.assetId,
      amountCents: payment.amountCents, dueDate: context.bill!.dueDate, accountLast4: proposal.accountLast4, status: "pending",
      requestedBy: viewer.user._id, recoveryFromPaymentId: payment._id, recoveryProposalId: proposalId });
    // Recovery always requires a fresh controller release, even after containment or with
    // an automatic purchase mandate. Preparing a correction is never settlement authority.
    await holdNewPayment(ctx, { payment: (await ctx.db.get("payments", paymentId))!, incident, asset, at: now,
      rule: "payment_recovery_requires_release", reason: "Corrected request for a rejected payment. A controller must verify and release this exact destination before any money moves." });
    await ctx.db.patch("paymentRecoveries", proposalId, { status: "requested", replacementPaymentId: paymentId,
      requestedBy: viewer.user._id, requestedAt: now });
    await ctx.db.insert("auditLog", { at: now, actor: viewer.user._id, action: "approve", companyId: payment.companyId,
      paymentId, incidentId: incident._id, rule: "payment_recovery_requested",
      reason: `AP requested the bill-specific correction from account ending ${payment.accountLast4} to ${proposal.accountLast4}. Original request remains rejected; replacement is held, with no cash movement.` });
    return { ok: true as const, paymentId };
  },
});

export const revoke = mutation({
  args: { proposalId: v.id("paymentRecoveries") },
  returns: v.union(failure, v.object({ ok: v.literal(true) })),
  handler: async (ctx, { proposalId }) => {
    const viewer = await getViewer(ctx), proposal = await ctx.db.get("paymentRecoveries", proposalId);
    if (!proposal || viewer.firm || viewer.companyId !== proposal.companyId || viewer.user.role !== "controller")
      return { ok: false as const, reason: "Only this company's controller can withdraw a correction." };
    if (proposal.status !== "prepared") return { ok: false as const, reason: "Only an unused correction can be withdrawn; decide any replacement through its held-payment controls." };
    await ctx.db.patch("paymentRecoveries", proposalId, { status: "revoked", revokedAt: Date.now() });
    const payment = await ctx.db.get("payments", proposal.rejectedPaymentId);
    await ctx.db.insert("auditLog", { at: Date.now(), actor: viewer.user._id, action: "undo", companyId: proposal.companyId,
      paymentId: proposal.rejectedPaymentId, incidentId: payment?.heldByIncidentId, rule: "payment_recovery_revoked",
      reason: "Controller withdrew the unused payment correction. The original payment remains rejected." });
    return { ok: true as const };
  },
});
