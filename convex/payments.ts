// Money layer: holds, release/reject with segregation of duties, ledger and audit log.
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { HeldSummary } from "./scoring";
import { canSeeCompany, getViewer, type Viewer } from "./access";
import { insertReadyAlert } from "./alerts";
import { DAY_MS, formatUsd, MAX_FANOUT, memo } from "./shared";
import { postLedgerEntry } from "./ledger";
import { purchaseLimits } from "./purchaseLimits";
import { evaluatePurchase, recordPurchaseRefusal, settlePurchase, purchaseCanFallBackToManual, invalidatePurchaseApprovalForBill } from "./purchases";
import { livePaymentForBill } from "./paymentLookup";
import { paymentRequestResult } from "./purchaseTypes";
import type { Infer } from "convex/values";

const BANK_CHANGE_WINDOW_MS = 30 * DAY_MS;
const MIN_NOTE_LENGTH = 15;
const ESCALATE_WITHIN_MS = DAY_MS; // a held payment due within 24h gets escalated once


// "Knows when to ask": a held payment nobody has decided, close to its due date, is pushed to
// the company's controllers once, with an alert and an audit row. Never decides for them.
async function escalateIfDue(ctx: MutationCtx, payment: Doc<"payments">, now: number) {
  if (payment.status !== "held" || payment.escalatedAt || payment.dueDate === undefined) return false;
  const msLeft = payment.dueDate - now;
  if (msLeft > ESCALATE_WITHIN_MS) return false;

  const [asset, people] = await Promise.all([
    ctx.db.get("assets", payment.assetId),
    ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", payment.companyId))
      .take(50),
  ]);
  const controllers = people
    .filter((u) => u.role === "controller" && u._id !== payment.requestedBy)
    .map((u) => u.name);
  const hours = Math.round(msLeft / (60 * 60 * 1000));
  const when =
    msLeft <= 0 ? "is past due" : hours < 1 ? "is due within the hour" : `is due in about ${hours} hour${hours === 1 ? "" : "s"}`;
  const vendor = asset?.vendorName ?? "the vendor";
  const body = `Decision needed: the ${formatUsd(payment.amountCents)} payment to ${vendor} ${when} and is still held. ${controllers.join(" or ") || "A controller"}: call ${vendor} at the number on file${asset ? ` (${asset.phoneOnFile})` : ""}, then release or reject it.`;

  await ctx.db.patch("payments", payment._id, { escalatedAt: now });
  await insertReadyAlert(ctx, {
    incidentId: payment.heldByIncidentId!,
    companyId: payment.companyId,
    paymentId: payment._id,
    kind: "escalation",
    body,
  });
  await ctx.db.insert("auditLog", {
    at: now,
    actor: "system",
    action: "escalate",
    companyId: payment.companyId,
    paymentId: payment._id,
    incidentId: payment.heldByIncidentId,
    rule: "undecided_hold_near_due_date",
    reason: `Held payment ${when}; escalated to ${controllers.join(", ") || "the controller"}.`,
  });
  return true;
}

// Every 15 minutes (crons.ts): escalate held payments that have come within 24h of due.
export const escalateDueHolds = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("payments")
      .withIndex("by_status_and_escalatedAt_and_dueDate", (q) =>
        q.eq("status", "held").eq("escalatedAt", undefined).lte("dueDate", now + ESCALATE_WITHIN_MS),
      )
      .take(200);
    let escalated = 0;
    for (const payment of due) {
      if (await escalateIfDue(ctx, payment, now)) escalated += 1;
    }
    return { escalated };
  },
});

// Bank-detail changes to this vendor within 30 days of the incident.
export async function recentBankChanges(ctx: MutationCtx, assetId: Id<"assets">, incidentAt: number) {
  return await ctx.db
    .query("bankDetailChanges")
    .withIndex("by_assetId_and_changedAt", (q) =>
      q
        .eq("assetId", assetId)
        .gte("changedAt", incidentAt - BANK_CHANGE_WINDOW_MS)
        .lte("changedAt", incidentAt + BANK_CHANGE_WINDOW_MS),
    )
    .take(100);
}

// Holds one payment for an incident: reasons, flag, audit rows, escalation if due soon.
// Shared by the incident fan-out, payment requests and AP imports.
async function holdPayment(
  ctx: MutationCtx,
  hold: {
    payment: Doc<"payments">;
    incident: Doc<"incidents">;
    asset: Doc<"assets">;
    changes: Doc<"bankDetailChanges">[];
    at: number;
    rule: string;
    reason: string;
  },
): Promise<{ flagged: boolean }> {
  const { payment, incident, asset, at } = hold;
  if (payment.status !== "pending") throw new Error("Only pending payments may acquire a new hold.");
  // Flag only if this payment is going to an account that changed recently.
  const change = hold.changes.find((c) => c.accountLast4 === payment.accountLast4);
  const holdReasons = [hold.reason];
  if (change) {
    const days = Math.round((incident.createdAt - change.changedAt) / DAY_MS);
    holdReasons.push(
      `Bank details for ${asset.vendorName} changed ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ${days >= 0 ? "before" : "after"} the incident via ${change.requestChannel.replace("_", " ")}. Verify by calling the number on file.`,
    );
  }

  await ctx.db.patch("payments", payment._id, {
    status: "held",
    heldByIncidentId: incident._id,
    holdReasons,
    bankChangeFlag: change !== undefined,
    flaggedBankChangeId: change?._id,
  });
  const audit = { at, actor: "system" as const, companyId: payment.companyId, paymentId: payment._id, incidentId: incident._id };
  await ctx.db.insert("auditLog", { ...audit, action: "hold", rule: hold.rule, reason: holdReasons[0] });
  if (change) {
    await ctx.db.insert("auditLog", { ...audit, action: "flag", rule: "bank_change_within_30_days", reason: holdReasons[1] });
  }

  // Already close to due when the hold lands? Ask a controller right away.
  await escalateIfDue(ctx, { ...payment, status: "held", heldByIncidentId: incident._id }, at);
  return { flagged: change !== undefined };
}

// The hold notice a company reads for one of its payments (ready at once, unlike the fan-out's
// AI-written ones). Never "fraud": held until verified, call the number on file.
function holdNoticeBody(asset: Doc<"assets">, payment: Doc<"payments">, flagged: boolean) {
  return `Your ${formatUsd(payment.amountCents)} payment to ${asset.vendorName} is held until verified.${flagged ? ` The account ending ${payment.accountLast4} was added recently.` : ""} Call ${asset.vendorName} at the number on file, ${asset.phoneOnFile}, not a number from a recent email. A controller other than the requester can then release or reject it.`;
}

// Holds a payment created while its vendor's incident is active (a new request or an imported
// bill) and writes its hold notice. Returns whether the payment was flagged.
export async function holdNewPayment(
  ctx: MutationCtx,
  hold: Omit<Parameters<typeof holdPayment>[1], "changes"> & { changes?: Doc<"bankDetailChanges">[] },
) {
  const changes = hold.changes ?? (await recentBankChanges(ctx, hold.asset._id, hold.incident.createdAt));
  const { flagged } = await holdPayment(ctx, { ...hold, changes });
  const payment = (await ctx.db.get("payments", hold.payment._id))!;
  await insertReadyAlert(ctx, {
    incidentId: hold.incident._id,
    companyId: payment.companyId,
    paymentId: payment._id,
    kind: "hold_notice",
    body: holdNoticeBody(hold.asset, payment, flagged),
  });
  return flagged;
}

// Runs inside recordIncident's transaction. Holds every pending payment to the
// compromised asset at companies that opted in. Never cancels anything.
export async function holdPaymentsForIncident(
  ctx: MutationCtx,
  incident: Doc<"incidents">,
  asset: Doc<"assets">,
): Promise<{ byCompany: Map<Id<"companies">, HeldSummary>; held: Doc<"payments">[] }> {
  const byCompany = new Map<Id<"companies">, HeldSummary>();
  const held: Doc<"payments">[] = [];
  const changes = await recentBankChanges(ctx, asset._id, incident.createdAt);
  const pending = await ctx.db
    .query("payments")
    .withIndex("by_assetId_and_status", (q) => q.eq("assetId", asset._id).eq("status", "pending"))
    .take(MAX_FANOUT);

  const companyCache = new Map<Id<"companies">, Doc<"companies"> | null>();
  for (const payment of pending) {
    if (!companyCache.has(payment.companyId)) {
      companyCache.set(payment.companyId, await ctx.db.get("companies", payment.companyId));
    }
    if (!companyCache.get(payment.companyId)?.holdRuleEnabled) continue;

    const { flagged } = await holdPayment(ctx, {
      payment,
      incident,
      asset,
      changes,
      at: incident.createdAt,
      rule: "hold_payments_to_compromised_vendor",
      reason: `${asset.vendorName} is under an active security incident. Payment held until verified.`,
    });
    held.push(payment);
    const summary = byCompany.get(payment.companyId) ?? { count: 0, cents: 0, flagged: 0 };
    summary.count += 1;
    summary.cents += payment.amountCents;
    if (flagged) summary.flagged += 1;
    byCompany.set(payment.companyId, summary);
  }
  return { byCompany, held };
}

// Observations never mask a confirmed incident; only the original 30-day window holds new payments.
export async function activeIncidentFor(ctx: QueryCtx, assetId: Id<"assets">, now: number) {
  // The predicate is in the index: unrelated observations, credential findings and contained
  // episodes cannot crowd a still-active vendor incident out of a bounded result page.
  // Legacy rows have no responseClass; a legacy credential finding still never holds money.
  const candidates: Doc<"incidents">[] = [];
  for (const responseClass of ["vendor", undefined] as const) {
    for (const terminalKind of ["vendor_tenant", undefined] as const) {
      const incident = await ctx.db.query("incidents")
        .withIndex("by_assetId_responseClass_containedAt_terminalKind_createdAt", q => q
          .eq("assetId", assetId).eq("responseClass", responseClass).eq("containedAt", undefined)
          .eq("finding.terminalKind", terminalKind).gte("createdAt", now - 30 * DAY_MS))
        .order("desc").first();
      if (incident) candidates.push(incident);
    }
  }
  return candidates.sort((a, b) => b.createdAt - a.createdAt || b._creationTime - a._creationTime)[0] ?? null;
}

// An AP clerk requests payment of a bill, to the vendor's current bank details on file (the
// latest change). If the vendor's incident is active, the payment is held on creation like the
// ones the incident caught. Shared by the UI mutation and the MCP agent.
type PaymentRequestResult = Infer<typeof paymentRequestResult>;
type RequestOptions = { requestId?: string; expectedMandateId?: Id<"purchaseMandates"> };

export async function requestPaymentFor(ctx: MutationCtx, viewer: Viewer, billId: Id<"bills">,
  agentId?: Id<"agents">, options: RequestOptions = {}): Promise<PaymentRequestResult> {
  if (viewer.firm || viewer.user.role !== "ap_clerk")
    return { ok: false, reason: "Only an AP clerk requests payments; a controller approves them." };
  const { requestId, expectedMandateId } = options;
  if (requestId !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(requestId))
    return { ok: false, reason: "requestId must contain 1–128 letters, digits, dots, underscores, colons or hyphens." };
  const executorKey = agentId ? `agent:${agentId}` : `user:${viewer.user._id}`;
  if (requestId !== undefined) {
    const previous = await ctx.db.query("purchaseRequests")
      .withIndex("by_companyId_and_executorKey_and_requestId", q => q.eq("companyId", viewer.companyId).eq("executorKey", executorKey).eq("requestId", requestId)).unique();
    if (previous) return previous.billId === billId && previous.expectedMandateId === expectedMandateId
      ? previous.result : { ok: false, reason: "requestId already belongs to a different bill or approval; use a new requestId for a new decision." };
  }
  const quota = await purchaseLimits.limit(ctx, "requests", { key: agentId ?? viewer.user._id });
  if (!quota.ok) return { ok: false, reason: `Too many payment requests from this caller. Retry in ${Math.max(1, Math.ceil((quota.retryAfter ?? 1000) / 1000))} seconds; other callers can continue.` };
  const result = await executePaymentRequest(ctx, viewer, billId, agentId, options);
  if (requestId !== undefined) await ctx.db.insert("purchaseRequests", { companyId: viewer.companyId,
    executorKey, requestId, billId, expectedMandateId, result, createdAt: Date.now() });
  return result;
}

async function executePaymentRequest(ctx: MutationCtx, viewer: Exclude<Viewer, { firm: true }>, billId: Id<"bills">,
  agentId: Id<"agents"> | undefined, options: RequestOptions): Promise<PaymentRequestResult> {
  const bill = await ctx.db.get("bills", billId);
  if (!bill || viewer.companyId !== bill.companyId) return { ok: false, reason: "That bill isn't your company's." };
  if (await livePaymentForBill(ctx, bill._id)) return { ok: false, reason: "This bill already has a payment." };
  const asset = await ctx.db.get("assets", bill.assetId);
  if (!asset) return { ok: false, reason: "Unknown vendor." };
  const latestChange = await ctx.db.query("bankDetailChanges")
    .withIndex("by_assetId_and_changedAt", q => q.eq("assetId", asset._id)).order("desc").first();
  const now = Date.now();
  const incident = await activeIncidentFor(ctx, asset._id, now);
  const company = await ctx.db.get("companies", bill.companyId);
  const decision = await evaluatePurchase(ctx, viewer, bill, latestChange, incident, now, agentId, options.expectedMandateId);
  let receiptId: Id<"purchaseReceipts"> | undefined;
  if (decision.kind === "refused") {
    receiptId = await recordPurchaseRefusal(ctx, viewer, bill, decision, agentId, options.requestId);
    // A confirmed incident retains the existing hold path, with separate human release authority.
    if (!purchaseCanFallBackToManual(decision, !!(incident && company?.holdRuleEnabled)))
      return { ok: false, reason: decision.reason, receiptId };
  }
  if (!latestChange) return { ok: false, reason: "No bank details on file for this vendor.", ...(receiptId ? { receiptId } : {}) };
  const paymentId = await ctx.db.insert("payments", { billId: bill._id, companyId: bill.companyId, assetId: asset._id,
    amountCents: bill.amountCents, accountLast4: latestChange.accountLast4, status: "pending", requestedBy: viewer.user._id, dueDate: bill.dueDate });
  if (decision.kind === "approved") {
    receiptId = await settlePurchase(ctx, viewer, bill, paymentId, decision, agentId, options.requestId);
    return { ok: true, paymentId, held: false, flagged: false, automatic: true, receiptId };
  }
  if (!incident || !company?.holdRuleEnabled) {
    if (receiptId) await ctx.db.patch("purchaseReceipts", receiptId, { paymentId });
    return { ok: true, paymentId, held: false, flagged: false, ...(receiptId ? { receiptId } : {}) };
  }
  const flagged = await holdNewPayment(ctx, { payment: (await ctx.db.get("payments", paymentId))!, incident, asset, at: now,
    rule: "hold_payments_requested_during_incident", reason: `Requested while ${asset.vendorName} is under an active security incident. Payment held until verified.` });
  if (receiptId) await ctx.db.patch("purchaseReceipts", receiptId, { paymentId });
  return { ok: true, paymentId, held: true, flagged, ...(receiptId ? { receiptId } : {}) };
}

export const requestPayment = mutation({
  args: { billId: v.id("bills"), requestId: v.optional(v.string()), expectedMandateId: v.optional(v.id("purchaseMandates")) },
  returns: paymentRequestResult,
  handler: async (ctx, { billId, ...options }) => await requestPaymentFor(ctx, await getViewer(ctx), billId, undefined, options),
});

// A company's bills and whether each has a payment yet (the AP clerk's "Bills to pay").
export async function billsFor(ctx: QueryCtx, viewer: Viewer) {
  if (viewer.firm) return [];
  const bills = await ctx.db
    .query("bills")
    .withIndex("by_companyId", (q) => q.eq("companyId", viewer.companyId))
    .take(100);
  // Indexed status checks keep old rejected attempts from hiding a live payment.
  const asset = memo((id: Id<"assets">) => ctx.db.get("assets", id));
  return await Promise.all(
    bills.map(async (bill) => {
      const vendor = await asset(bill.assetId);
      const payment = await livePaymentForBill(ctx, bill._id);
      return {
        bill,
        vendorName: vendor?.vendorName ?? "",
        payment: payment ? { _id: payment._id, status: payment.status, purchaseMandateId: payment.purchaseMandateId } : null,
      };
    }),
  );
}

export const getMyBills = query({
  args: {},
  handler: async (ctx) => await billsFor(ctx, await getViewer(ctx)),
});

type Decision = { ok: true } | { ok: false; reason: string };
const decisionValidator = v.union(
  v.object({ ok: v.literal(true) }),
  v.object({ ok: v.literal(false), reason: v.string() }),
);

// Shared checks for release and reject. Refusals are logged, so they return instead of throwing.
async function checkDecision(
  ctx: MutationCtx,
  payment: Doc<"payments">,
  actorId: Id<"users">,
  action: "release" | "reject",
): Promise<Decision> {
  const user = await ctx.db.get("users", actorId);
  let reason: string | null = null;
  let rule = "";
  if (payment.status !== "held") {
    reason = `Payment is ${payment.status}, not held.`;
    rule = "only_held_payments";
  } else if (actorId === payment.requestedBy) {
    reason = "The person who requested a payment cannot also approve it.";
    rule = "segregation_of_duties";
  } else if (
    !user ||
    user.companyId !== payment.companyId ||
    user.role !== "controller"
  ) {
    reason = "Only a controller at this company can decide a held payment.";
    rule = "controller_at_company";
  }
  if (reason === null) return { ok: true };

  await ctx.db.insert("auditLog", {
    at: Date.now(),
    actor: user ? user._id : "system",
    action: "refused",
    companyId: payment.companyId,
    paymentId: payment._id,
    incidentId: payment.heldByIncidentId,
    rule,
    reason: `Refused ${action}: ${reason}`,
  });
  return { ok: false, reason };
}

export const releasePayment = mutation({
  args: {
    paymentId: v.id("payments"),
    verificationNote: v.string(),
  },
  returns: decisionValidator,
  handler: async (ctx, args): Promise<Decision> => {
    const payment = await ctx.db.get("payments", args.paymentId);
    if (!payment) return { ok: false, reason: "Payment not found." };

    const actor = (await getViewer(ctx)).user._id;
    const check = await checkDecision(ctx, payment, actor, "release");
    if (!check.ok) return check;

    // A release must say who was called and what they confirmed, not just "ok" or an amount.
    const note = args.verificationNote.trim();
    if (note.length < MIN_NOTE_LENGTH || !/[a-z]{2,}\s+[a-z]{2,}/i.test(note)) {
      await ctx.db.insert("auditLog", {
        at: Date.now(),
        actor,
        action: "refused",
        companyId: payment.companyId,
        paymentId: payment._id,
        incidentId: payment.heldByIncidentId,
        rule: "verification_required",
        reason: "Refused release: verification note missing or too short (call the number on file first).",
      });
      return {
        ok: false,
        reason: "Describe the verification call: who you called at the number on file and what they confirmed.",
      };
    }

    const now = Date.now();
    await ctx.db.patch("payments", payment._id, {
      status: "paid",
      approvedBy: actor,
      verificationNote: note,
      decidedAt: now,
    });
    await postLedgerEntry(ctx, {
      kind: "payment",
      companyId: payment.companyId,
      amountCents: payment.amountCents,
      date: now,
      memo: `Payment released after verification: ${note}`,
      paymentId: payment._id,
      billId: payment.billId,
    });
    await ctx.db.insert("auditLog", {
      at: now,
      actor,
      action: "release",
      companyId: payment.companyId,
      paymentId: payment._id,
      incidentId: payment.heldByIncidentId,
      rule: "controller_release_after_verification",
      reason: note,
    });
    return { ok: true };
  },
});

export const rejectPayment = mutation({
  args: {
    paymentId: v.id("payments"),
    note: v.optional(v.string()),
  },
  returns: decisionValidator,
  handler: async (ctx, args): Promise<Decision> => {
    const payment = await ctx.db.get("payments", args.paymentId);
    if (!payment) return { ok: false, reason: "Payment not found." };

    const actor = (await getViewer(ctx)).user._id;
    const check = await checkDecision(ctx, payment, actor, "reject");
    if (!check.ok) return check;

    const now = Date.now();
    await invalidatePurchaseApprovalForBill(ctx, payment, actor, now);
    await ctx.db.patch("payments", payment._id, {
      status: "rejected",
      approvedBy: actor,
      verificationNote: args.note,
      decidedAt: now,
    });
    // No ledger entry: the bill stays in accounts payable, cash never moves.
    await ctx.db.insert("auditLog", {
      at: now,
      actor,
      action: "reject",
      companyId: payment.companyId,
      paymentId: payment._id,
      incidentId: payment.heldByIncidentId,
      rule: "controller_reject",
      reason: args.note ?? "Rejected by controller.",
    });
    return { ok: true };
  },
});

// Payments an incident touched (held, then paid or rejected), for one viewer: company users only
// ever get their own rows, never who reported. Shared by the UI query and the MCP agent.
export async function heldPaymentsFor(
  ctx: QueryCtx,
  viewer: Viewer,
  args: { incidentId?: Id<"incidents">; companyId?: Id<"companies">; paymentId?: Id<"payments"> },
) {
  const companyId = viewer.firm ? args.companyId : viewer.companyId;
  let payments: Doc<"payments">[];
  if (args.paymentId) {
    // One payment (the MCP agent's explain_hold): only if this viewer may see it and it was held.
    const one = await ctx.db.get("payments", args.paymentId);
    payments = one && one.heldByIncidentId !== undefined && canSeeCompany(viewer, one.companyId) ? [one] : [];
  } else if (args.incidentId) {
    payments = await ctx.db
      .query("payments")
      .withIndex("by_heldByIncidentId", (q) => q.eq("heldByIncidentId", args.incidentId))
      .take(MAX_FANOUT);
    if (companyId) payments = payments.filter((p) => p.companyId === companyId);
  } else if (companyId) {
    payments = (
      await ctx.db
        .query("payments")
        .withIndex("by_companyId_and_status", (q) => q.eq("companyId", companyId))
        .take(200)
    ).filter((p) => p.heldByIncidentId !== undefined);
  } else {
    return [];
  }

  // Rows share companies, vendors, incidents and approvers: read each once.
  const company = memo((id: Id<"companies">) => ctx.db.get("companies", id));
  const asset = memo((id: Id<"assets">) => ctx.db.get("assets", id));
  const incident = memo((id: Id<"incidents">) => ctx.db.get("incidents", id));
  const user = memo((id: Id<"users">) => ctx.db.get("users", id));
  // The flagged change plus the vendor's earlier bank details, newest first ("old vs new").
  const bankChange = memo(async (id: Id<"bankDetailChanges">) => {
    const change = await ctx.db.get("bankDetailChanges", id);
    const earlier = change
      ? await ctx.db
          .query("bankDetailChanges")
          .withIndex("by_assetId_and_changedAt", (q) => q.eq("assetId", change.assetId).lt("changedAt", change.changedAt))
          .order("desc")
          .take(20)
      : [];
    return { change, earlier };
  });
  // Hold notices: one query for the whole incident when scoped to one, else per payment.
  const noticesByPayment = args.incidentId
    ? new Map(
        (
          await ctx.db
            .query("alerts")
            .withIndex("by_incidentId_and_kind", (q) => q.eq("incidentId", args.incidentId!).eq("kind", "hold_notice"))
            .take(MAX_FANOUT)
        ).map((a) => [a.paymentId, a] as const),
      )
    : null;
  const notice = async (paymentId: Id<"payments">) =>
    noticesByPayment
      ? (noticesByPayment.get(paymentId) ?? null)
      : await ctx.db
          .query("alerts")
          .withIndex("by_paymentId_and_kind", (q) => q.eq("paymentId", paymentId).eq("kind", "hold_notice"))
          .first();

  return await Promise.all(
    payments.map(async (payment) => {
      const [co, vendor, inc, holdNotice, approver, bank] = await Promise.all([
        company(payment.companyId),
        asset(payment.assetId),
        payment.heldByIncidentId ? incident(payment.heldByIncidentId) : null,
        notice(payment._id),
        payment.approvedBy ? user(payment.approvedBy) : null,
        payment.flaggedBankChangeId ? bankChange(payment.flaggedBankChangeId) : null,
      ]);
      const change = bank?.change ?? null;
      const earlier = bank?.earlier ?? [];
      return {
        payment,
        companyName: co?.name ?? "",
        vendorName: vendor?.vendorName ?? "",
        phoneOnFile: vendor?.phoneOnFile ?? "",
        bankChange:
          change && inc
            ? {
                changedAt: change.changedAt,
                accountLast4: change.accountLast4,
                previousAccountLast4: earlier[0]?.accountLast4 ?? null,
                lastVerifiedAccountLast4: earlier.find((c) => c.requestChannel === "verified_call")?.accountLast4 ?? null,
                requestChannel: change.requestChannel,
                daysBeforeIncident: Math.round((inc.createdAt - change.changedAt) / DAY_MS),
              }
            : null,
        holdReasons: payment.holdReasons ?? [],
        // The hold notice only applies while the payment is still held.
        notice: payment.status === "held" ? (holdNotice?.body ?? null) : null,
        decision:
          payment.status === "paid" || payment.status === "rejected"
            ? {
                status: payment.status,
                byName: approver?.name ?? null,
                note: payment.verificationNote ?? null,
                at: payment.decidedAt ?? null,
              }
            : null,
      };
    }),
  );
}
export type HeldPaymentRow = Awaited<ReturnType<typeof heldPaymentsFor>>[number];

export const getHeldPayments = query({
  args: {
    incidentId: v.optional(v.id("incidents")),
    companyId: v.optional(v.id("companies")), // firm only; company users are pinned to their own
  },
  handler: async (ctx, args) => await heldPaymentsFor(ctx, await getViewer(ctx), args),
});

// A payment's audit trail, for one viewer (empty if they can't see the payment).
export async function paymentAuditFor(ctx: QueryCtx, viewer: Viewer, paymentId: Id<"payments">) {
  const payment = await ctx.db.get("payments", paymentId);
  if (!payment || !canSeeCompany(viewer, payment.companyId)) return [];
  const rows = await ctx.db
    .query("auditLog")
    .withIndex("by_paymentId", (q) => q.eq("paymentId", paymentId))
    .take(100);
  const actorName = memo((actor: Doc<"auditLog">["actor"]) => actorLabel(ctx, actor));
  return await Promise.all(rows.map(async (row) => ({ ...row, actorName: await actorName(row.actor) })));
}

export const getPaymentAudit = query({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => await paymentAuditFor(ctx, await getViewer(ctx), args.paymentId),
});

// Who did it, for audit displays: "System", a person's name, or "<agent> (agent)".
async function actorLabel(ctx: QueryCtx, actor: Doc<"auditLog">["actor"]): Promise<string> {
  if (actor === "system") return "System";
  const agentId = ctx.db.normalizeId("agents", actor);
  if (agentId) {
    const agent = await ctx.db.get("agents", agentId);
    return agent ? `${agent.name} (agent)` : "Unknown agent";
  }
  const userId = ctx.db.normalizeId("users", actor);
  return (userId && (await ctx.db.get("users", userId))?.name) || "Unknown user";
}

export const getLedger = query({
  args: {
    companyId: v.optional(v.id("companies")), // firm only; company users get their own
  },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const companyId = viewer.firm ? args.companyId : viewer.companyId;
    if (!companyId) return null;
    const ledger = () =>
      ctx.db
        .query("ledgerEntries")
        .withIndex("by_companyId_and_date", (q) => q.eq("companyId", companyId));
    const entries = await ledger().order("desc").take(200); // what the UI lists
    // Balances cover every entry, not just the listed ones. Natural sign: assets/expense
    // debit-positive, liabilities/equity credit-positive.
    const balances = { cash: 0, accounts_payable: 0, expense: 0, equity: 0 };
    for await (const entry of ledger()) {
      for (const line of entry.lines) {
        const net = line.debitCents - line.creditCents;
        balances[line.account] +=
          line.account === "cash" || line.account === "expense" ? net : -net;
      }
    }
    return { entries, balances };
  },
});

// Controls log: every hold, flag, refusal, release and reject an incident caused, with who
// and where. The PE firm sees the whole portfolio; a company sees only its own rows.
export const getIncidentAudit = query({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    // A company reads only its own rows through the index; the firm reads the incident's rows.
    const rows = viewer.firm
      ? await ctx.db
          .query("auditLog")
          .withIndex("by_incidentId", (q) => q.eq("incidentId", args.incidentId))
          .order("desc")
          .take(MAX_FANOUT)
      : await ctx.db
          .query("auditLog")
          .withIndex("by_companyId_and_incidentId", (q) =>
            q.eq("companyId", viewer.companyId).eq("incidentId", args.incidentId),
          )
          .order("desc")
          .take(MAX_FANOUT);

    // Shared per call: rows repeat the same companies and actors.
    const companyName = memo(async (id: Id<"companies">) => (await ctx.db.get("companies", id))?.name ?? "");
    const actorName = memo((actor: Doc<"auditLog">["actor"]) => actorLabel(ctx, actor));

    return await Promise.all(
      rows.map(async (row) => ({
        _id: row._id,
        at: row.at,
        action: row.action,
        rule: row.rule,
        reason: row.reason,
        paymentId: row.paymentId ?? null,
        actorName: await actorName(row.actor),
        companyName: row.companyId ? await companyName(row.companyId) : null,
      })),
    );
  },
});
