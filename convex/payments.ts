// Money layer: holds, release/reject with segregation of duties, ledger and audit log.
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { HeldSummary } from "./scoring";
import { canSeeCompany, getViewer } from "./access";

const DAY_MS = 24 * 60 * 60 * 1000;
export const BANK_CHANGE_WINDOW_MS = 30 * DAY_MS;
const MIN_NOTE_LENGTH = 15;
const ESCALATE_WITHIN_MS = DAY_MS; // a held payment due within 24h gets escalated once

const dollars = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;

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
  const when = msLeft <= 0 ? "is past due" : `is due in about ${hours} hour${hours === 1 ? "" : "s"}`;
  const vendor = asset?.vendorName ?? "the vendor";
  const body = `Decision needed: the ${dollars(payment.amountCents)} payment to ${vendor} ${when} and is still held. ${controllers.join(" or ") || "A controller"}: call ${vendor} at the number on file${asset ? ` (${asset.phoneOnFile})` : ""}, then release or reject it.`;

  await ctx.db.patch("payments", payment._id, { escalatedAt: now });
  await ctx.db.insert("alerts", {
    incidentId: payment.heldByIncidentId!,
    companyId: payment.companyId,
    paymentId: payment._id,
    kind: "escalation",
    status: "ready",
    body,
    readyAt: now,
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
      .withIndex("by_status_and_dueDate", (q) =>
        q.eq("status", "held").lte("dueDate", now + ESCALATE_WITHIN_MS),
      )
      .take(200);
    let escalated = 0;
    for (const payment of due) {
      if (await escalateIfDue(ctx, payment, now)) escalated += 1;
    }
    return { escalated };
  },
});

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

    // Already close to due when the hold lands? Ask a controller right away.
    await escalateIfDue(ctx, { ...payment, status: "held", heldByIncidentId: incident._id }, incident.createdAt);

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
    incidentId: v.optional(v.id("incidents")),
    companyId: v.optional(v.id("companies")), // firm only; company users are pinned to their own
  },
  handler: async (ctx, rawArgs) => {
    const viewer = await getViewer(ctx);
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
            .withIndex("by_paymentId_and_kind", (q) =>
              q.eq("paymentId", payment._id).eq("kind", "hold_notice"),
            )
            .first(),
        ]);
        const change = payment.flaggedBankChangeId
          ? await ctx.db.get("bankDetailChanges", payment.flaggedBankChangeId)
          : null;
        const approver = payment.approvedBy ? await ctx.db.get("users", payment.approvedBy) : null;
        // Earlier bank details for the same vendor, newest first, for the "old vs new" flag.
        const earlier = change
          ? await ctx.db
              .query("bankDetailChanges")
              .withIndex("by_assetId_and_changedAt", (q) =>
                q.eq("assetId", change.assetId).lt("changedAt", change.changedAt),
              )
              .order("desc")
              .take(20)
          : [];
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
                  previousAccountLast4: earlier[0]?.accountLast4 ?? null,
                  lastVerifiedAccountLast4:
                    earlier.find((c) => c.requestChannel === "verified_call")?.accountLast4 ?? null,
                  requestChannel: change.requestChannel,
                  daysBeforeIncident: Math.round(
                    (incident.createdAt - change.changedAt) / DAY_MS,
                  ),
                }
              : null,
          holdReasons: payment.holdReasons ?? [],
          // The hold notice only applies while the payment is still held.
          notice: payment.status === "held" ? (notice?.body ?? null) : null,
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
  },
});

export const getPaymentAudit = query({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
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
          .take(500)
      : await ctx.db
          .query("auditLog")
          .withIndex("by_companyId_and_incidentId", (q) =>
            q.eq("companyId", viewer.companyId).eq("incidentId", args.incidentId),
          )
          .order("desc")
          .take(500);

    const names = new Map<string, string>();
    const nameOf = async (id: Id<"users"> | Id<"companies">, table: "users" | "companies") => {
      if (!names.has(id)) {
        const doc =
          table === "users"
            ? await ctx.db.get("users", id as Id<"users">)
            : await ctx.db.get("companies", id as Id<"companies">);
        names.set(id, doc?.name ?? "");
      }
      return names.get(id)!;
    };

    return await Promise.all(
      rows.map(async (row) => ({
        _id: row._id,
        at: row.at,
        action: row.action,
        rule: row.rule,
        reason: row.reason,
        paymentId: row.paymentId ?? null,
        actorName: row.actor === "system" ? "System" : await nameOf(row.actor, "users"),
        companyName: row.companyId ? await nameOf(row.companyId, "companies") : null,
      })),
    );
  },
});
