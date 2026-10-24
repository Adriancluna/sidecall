// Money layer: holds, release/reject with segregation of duties, ledger and audit log.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { HeldSummary } from "./scoring";
import { canSeeCompany, getViewer } from "./access";

const DAY_MS = 24 * 60 * 60 * 1000;
export const BANK_CHANGE_WINDOW_MS = 30 * DAY_MS;

// Runs inside recordIncident's transaction. Holds every pending payment to the
// compromised asset at companies that opted in. Never cancels anything.
export async function holdPaymentsForIncident(
  ctx: MutationCtx,
  incident: Doc<"incidents">,
  asset: Doc<"assets">,
): Promise<Map<Id<"companies">, HeldSummary>> {
  const byCompany = new Map<Id<"companies">, HeldSummary>();

  const recentChanges = await ctx.db
    .query("bankDetailChanges")
    .withIndex("by_assetId_and_changedAt", (q) =>
      q
        .eq("assetId", asset._id)
        .gte("changedAt", incident.createdAt - BANK_CHANGE_WINDOW_MS)
        .lte("changedAt", incident.createdAt + BANK_CHANGE_WINDOW_MS),
    )
    .take(100);

  const pending = await ctx.db
    .query("payments")
    .withIndex("by_assetId_and_status", (q) =>
      q.eq("assetId", asset._id).eq("status", "pending"),
    )
    .take(500);

  const companyCache = new Map<Id<"companies">, Doc<"companies"> | null>();
  for (const payment of pending) {
    if (!companyCache.has(payment.companyId)) {
      companyCache.set(payment.companyId, await ctx.db.get("companies", payment.companyId));
    }
    const company = companyCache.get(payment.companyId);
    if (!company?.holdRuleEnabled) continue;

    // Flag only if this payment is going to an account that changed recently.
    const change = recentChanges.find(
      (c) => c.accountLast4 === payment.accountLast4,
    );
    const holdReasons = [
      `${asset.vendorName} is under an active security incident. Payment held until verified.`,
    ];
    if (change) {
      const days = Math.round((incident.createdAt - change.changedAt) / DAY_MS);
      holdReasons.push(
        `Bank details for ${asset.vendorName} changed ${Math.abs(days)} day(s) ${days >= 0 ? "before" : "after"} the incident via ${change.requestChannel}. Verify by calling the number on file.`,
      );
    }

    await ctx.db.patch("payments", payment._id, {
      status: "held",
      heldByIncidentId: incident._id,
      holdReasons,
      bankChangeFlag: change !== undefined,
      flaggedBankChangeId: change?._id,
    });

    await ctx.db.insert("auditLog", {
      at: incident.createdAt,
      actor: "system",
      action: "hold",
      companyId: payment.companyId,
      paymentId: payment._id,
      incidentId: incident._id,
      rule: "hold_payments_to_compromised_vendor",
      reason: holdReasons[0],
    });
    if (change) {
      await ctx.db.insert("auditLog", {
        at: incident.createdAt,
        actor: "system",
        action: "flag",
        companyId: payment.companyId,
        paymentId: payment._id,
        incidentId: incident._id,
        rule: "bank_change_within_30_days",
        reason: holdReasons[1],
      });
    }

    const summary = byCompany.get(payment.companyId) ?? {
      count: 0,
      cents: 0,
      flagged: 0,
    };
    summary.count += 1;
    summary.cents += payment.amountCents;
    if (change) summary.flagged += 1;
    byCompany.set(payment.companyId, summary);
  }

  return byCompany;
}

type Decision = { ok: true } | { ok: false; reason: string };

// Shared checks for release and reject. Refusals are logged, so they return instead of throwing.
async function checkDecision(
  ctx: MutationCtx,
  payment: Doc<"payments">,
  actingUserId: Id<"users">,
  action: "release" | "reject",
): Promise<Decision> {
  const user = await ctx.db.get("users", actingUserId);
  let reason: string | null = null;
  let rule = "";
  if (payment.status !== "held") {
    reason = `Payment is ${payment.status}, not held.`;
    rule = "only_held_payments";
  } else if (actingUserId === payment.requestedBy) {
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
    actingUserId: v.optional(v.id("users")),
    verificationNote: v.string(),
  },
  handler: async (ctx, args): Promise<Decision> => {
    const payment = await ctx.db.get("payments", args.paymentId);
    if (!payment) return { ok: false, reason: "Payment not found." };

    const actor = (await getViewer(ctx, args.actingUserId)).user._id;
    const check = await checkDecision(ctx, payment, actor, "release");
    if (!check.ok) return check;

    const note = args.verificationNote.trim();
    if (note.length === 0) {
      await ctx.db.insert("auditLog", {
        at: Date.now(),
        actor,
        action: "refused",
        companyId: payment.companyId,
        paymentId: payment._id,
        incidentId: payment.heldByIncidentId,
        rule: "verification_required",
        reason: "Refused release: no verification note (call the number on file first).",
      });
      return { ok: false, reason: "Add a verification note before releasing." };
    }

    const now = Date.now();
    await ctx.db.patch("payments", payment._id, {
      status: "paid",
      approvedBy: actor,
      verificationNote: note,
      decidedAt: now,
    });
    await ctx.db.insert("ledgerEntries", {
      companyId: payment.companyId,
      date: now,
      memo: `Payment released after verification: ${note}`,
      paymentId: payment._id,
      billId: payment.billId,
      lines: [
        { account: "accounts_payable", debitCents: payment.amountCents, creditCents: 0 },
        { account: "cash", debitCents: 0, creditCents: payment.amountCents },
      ],
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
    actingUserId: v.optional(v.id("users")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Decision> => {
    const payment = await ctx.db.get("payments", args.paymentId);
    if (!payment) return { ok: false, reason: "Payment not found." };

    const actor = (await getViewer(ctx, args.actingUserId)).user._id;
    const check = await checkDecision(ctx, payment, actor, "reject");
    if (!check.ok) return check;

    const now = Date.now();
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

// Payments an incident touched (held, then paid or rejected), or a company's touched payments.
// Company users only ever get their own company's rows. Never includes who reported the incident.
export const getHeldPayments = query({
  args: {
    actingUserId: v.optional(v.id("users")),
    incidentId: v.optional(v.id("incidents")),
    companyId: v.optional(v.id("companies")), // firm only; company users are pinned to their own
  },
  handler: async (ctx, rawArgs) => {
    const viewer = await getViewer(ctx, rawArgs.actingUserId);
    const args = {
      incidentId: rawArgs.incidentId,
      companyId: viewer.firm ? rawArgs.companyId : viewer.companyId,
    };
    let payments: Doc<"payments">[];
    if (args.incidentId) {
      payments = await ctx.db
        .query("payments")
        .withIndex("by_heldByIncidentId", (q) =>
          q.eq("heldByIncidentId", args.incidentId),
        )
        .take(200);
      if (args.companyId) {
        payments = payments.filter((p) => p.companyId === args.companyId);
      }
    } else if (args.companyId) {
      const companyId = args.companyId;
      payments = (
        await ctx.db
          .query("payments")
          .withIndex("by_companyId_and_status", (q) => q.eq("companyId", companyId))
          .take(200)
      ).filter((p) => p.heldByIncidentId !== undefined);
    } else {
      return [];
    }

    return await Promise.all(
      payments.map(async (payment) => {
        const [company, asset, incident, notice] = await Promise.all([
          ctx.db.get("companies", payment.companyId),
          ctx.db.get("assets", payment.assetId),
          payment.heldByIncidentId ? ctx.db.get("incidents", payment.heldByIncidentId) : null,
          ctx.db
            .query("alerts")
            .withIndex("by_paymentId", (q) => q.eq("paymentId", payment._id))
            .first(),
        ]);
        const change = payment.flaggedBankChangeId
          ? await ctx.db.get("bankDetailChanges", payment.flaggedBankChangeId)
          : null;
        return {
          payment,
          companyName: company?.name ?? "",
          vendorName: asset?.vendorName ?? "",
          phoneOnFile: asset?.phoneOnFile ?? "",
          bankChange:
            change && incident
              ? {
                  changedAt: change.changedAt,
                  accountLast4: change.accountLast4,
                  requestChannel: change.requestChannel,
                  daysBeforeIncident: Math.round(
                    (incident.createdAt - change.changedAt) / DAY_MS,
                  ),
                }
              : null,
          holdReasons: payment.holdReasons ?? [],
          notice: notice?.body ?? null,
        };
      }),
    );
  },
});

export const getPaymentAudit = query({
  args: { paymentId: v.id("payments"), actingUserId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx, args.actingUserId);
    const payment = await ctx.db.get("payments", args.paymentId);
    if (!payment || !canSeeCompany(viewer, payment.companyId)) return [];
    return await ctx.db
      .query("auditLog")
      .withIndex("by_paymentId", (q) => q.eq("paymentId", args.paymentId))
      .take(100);
  },
});

export const getLedger = query({
  args: {
    actingUserId: v.optional(v.id("users")),
    companyId: v.optional(v.id("companies")), // firm only; company users get their own
  },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx, args.actingUserId);
    const companyId = viewer.firm ? args.companyId : viewer.companyId;
    if (!companyId) return null;
    const entries = await ctx.db
      .query("ledgerEntries")
      .withIndex("by_companyId_and_date", (q) => q.eq("companyId", companyId))
      .order("desc")
      .take(200);
    // Balances in natural sign: assets/expense debit-positive, liabilities/equity credit-positive.
    const balances = { cash: 0, accounts_payable: 0, expense: 0, equity: 0 };
    for (const entry of entries) {
      for (const line of entry.lines) {
        const net = line.debitCents - line.creditCents;
        balances[line.account] +=
          line.account === "cash" || line.account === "expense" ? net : -net;
      }
    }
    return { entries, balances };
  },
});
