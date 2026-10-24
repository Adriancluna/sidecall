// Controller-approved purchasing. All settlement is the existing synthetic double-entry ledger;
// this is not a Visa API, bank-account verification service, or payment network connector.
import { ConvexError, v } from "convex/values";
import { env, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getViewer, type Viewer } from "./access";
import { DAY_MS, formatUsd } from "./shared";
import { postLedgerEntry } from "./ledger";

function cents(value: number) {
  return Number.isSafeInteger(value) && value > 0 && value <= 100_000_000;
}

export const approve = mutation({
  args: {
    billIds: v.array(v.id("bills")),
    perPurchaseCents: v.number(),
    budgetCents: v.number(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (viewer.firm || viewer.user.role !== "controller")
      throw new ConvexError(
        "Only your company's controller can approve automatic purchases.",
      );
    if (env.DEMO_MODE !== "true")
      throw new ConvexError(
        "Automatic settlement is available only in the demo ledger.",
      );
    const now = Date.now();
    if (
      !cents(args.perPurchaseCents) ||
      !cents(args.budgetCents) ||
      args.perPurchaseCents > args.budgetCents
    )
      throw new ConvexError(
        "Set positive limits in cents, with the purchase limit no greater than the total budget.",
      );
    if (
      !Number.isFinite(args.expiresAt) ||
      args.expiresAt <= now ||
      args.expiresAt > now + DAY_MS
    )
      throw new ConvexError("Approval must expire within 24 hours.");
    if (
      !args.billIds.length ||
      args.billIds.length > 25 ||
      new Set(args.billIds).size !== args.billIds.length
    )
      throw new ConvexError("Choose 1–25 different bills from one vendor.");
    const bills: Doc<"bills">[] = [];
    for (const billId of args.billIds) {
      const bill = await ctx.db.get("bills", billId);
      if (!bill || bill.companyId !== viewer.companyId)
        throw new ConvexError("Choose only your company's bills.");
      if (!cents(bill.amountCents))
        throw new ConvexError("A bill has an invalid amount.");
      const payment = await ctx.db
        .query("payments")
        .withIndex("by_billId", (q) => q.eq("billId", billId))
        .take(10);
      if (payment.some((p) => p.status !== "rejected"))
        throw new ConvexError("Choose bills without an existing payment.");
      bills.push(bill);
    }
    const assetId = bills[0].assetId;
    if (bills.some((b) => b.assetId !== assetId))
      throw new ConvexError("Each approval covers exactly one vendor.");
    const bank = await ctx.db
      .query("bankDetailChanges")
      .withIndex("by_assetId_and_changedAt", (q) => q.eq("assetId", assetId))
      .order("desc")
      .first();
    if (!bank || bank.requestChannel !== "verified_call")
      throw new ConvexError(
        "This vendor's current payee record has not been verified by a call. Automatic purchasing is unavailable.",
      );
    const mandateId = await ctx.db.insert("purchaseMandates", {
      companyId: viewer.companyId,
      assetId,
      bankDetailId: bank._id,
      accountLast4: bank.accountLast4,
      bankChangedAt: bank.changedAt,
      perPurchaseCents: args.perPurchaseCents,
      budgetCents: args.budgetCents,
      spentCents: 0,
      approvedBy: viewer.user._id,
      createdAt: now,
      expiresAt: args.expiresAt,
    });
    for (const bill of bills)
      await ctx.db.insert("purchaseQuotes", {
        mandateId,
        billId: bill._id,
        assetId: bill.assetId,
        amountCents: bill.amountCents,
        description: bill.description,
        dueDate: bill.dueDate,
      });
    await ctx.db.insert("auditLog", {
      at: now,
      actor: viewer.user._id,
      action: "policy",
      companyId: viewer.companyId,
      rule: "purchase_mandate",
      reason: `Approved ${bills.length} saved bills; ${formatUsd(args.perPurchaseCents)} per purchase, ${formatUsd(args.budgetCents)} total, expires ${new Date(args.expiresAt).toISOString()}. Demo ledger only. Mandate ${mandateId}.`,
    });
    return mandateId;
  },
});

export const revoke = mutation({
  args: { mandateId: v.id("purchaseMandates") },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const mandate = await ctx.db.get("purchaseMandates", args.mandateId);
    if (
      viewer.firm ||
      viewer.user.role !== "controller" ||
      !mandate ||
      mandate.companyId !== viewer.companyId
    )
      throw new ConvexError(
        "Only your company's controller can revoke this approval.",
      );
    if (mandate.revokedAt !== undefined) return null;
    await ctx.db.patch("purchaseMandates", mandate._id, {
      revokedAt: Date.now(),
    });
    await ctx.db.insert("auditLog", {
      at: Date.now(),
      actor: viewer.user._id,
      action: "policy",
      companyId: viewer.companyId,
      rule: "purchase_mandate_revoked",
      reason: `Revoked automatic purchase approval ${mandate._id}. Previous receipts remain unchanged.`,
    });
    return null;
  },
});

type Decision =
  | { kind: "manual" }
  | { kind: "refused"; reason: string }
  | { kind: "approved"; mandate: Doc<"purchaseMandates"> };

// Called inside the same mutation as payment creation and the ledger write. Concurrent requests
// read/write the same mandate; Convex serializes them, so split orders cannot overspend it.
export async function checkPurchase(
  ctx: MutationCtx,
  viewer: Exclude<Viewer, { firm: true }>,
  bill: Doc<"bills">,
  bank: Doc<"bankDetailChanges">,
  incident: Doc<"incidents"> | null,
): Promise<Decision> {
  const mandate = await ctx.db
    .query("purchaseMandates")
    .withIndex("by_companyId_and_assetId", (q) =>
      q.eq("companyId", viewer.companyId).eq("assetId", bill.assetId),
    )
    .order("desc")
    .first();
  if (!mandate) return { kind: "manual" };
  const now = Date.now();
  const approver = await ctx.db.get("users", mandate.approvedBy);
  const quote = await ctx.db
    .query("purchaseQuotes")
    .withIndex("by_mandateId_and_billId", (q) =>
      q.eq("mandateId", mandate._id).eq("billId", bill._id),
    )
    .unique();
  let rule = "",
    reason = "";
  if (env.DEMO_MODE !== "true") {
    rule = "demo_only";
    reason = "Automatic settlement requires the demo ledger.";
  } else if (
    !approver ||
    approver.role !== "controller" ||
    approver.companyId !== viewer.companyId ||
    approver._id === viewer.user._id
  ) {
    rule = "approver_authority";
    reason =
      "The original controller no longer has authority for this purchase.";
  } else if (mandate.revokedAt !== undefined || now >= mandate.expiresAt) {
    rule = "approval_inactive";
    reason = "The purchasing approval has expired or been revoked.";
  } else if (incident) {
    rule = "confirmed_incident";
    reason =
      "A confirmed vendor incident requires a separate controller decision.";
  } else if (!quote) {
    rule = "bill_not_approved";
    reason = "This bill is outside the controller's approved purchases.";
  } else if (
    quote.assetId !== bill.assetId ||
    quote.amountCents !== bill.amountCents ||
    quote.description !== bill.description ||
    quote.dueDate !== bill.dueDate
  ) {
    rule = "bill_changed";
    reason =
      "The bill changed after approval. The original approval cannot authorize it.";
  } else if (
    bank._id !== mandate.bankDetailId ||
    bank.accountLast4 !== mandate.accountLast4 ||
    bank.changedAt !== mandate.bankChangedAt ||
    bank.requestChannel !== "verified_call"
  ) {
    rule = "payee_changed";
    reason =
      "The payee record changed after approval. Verify it independently before approving again.";
  } else if (
    !cents(bill.amountCents) ||
    bill.amountCents > mandate.perPurchaseCents
  ) {
    rule = "purchase_limit";
    reason = "This purchase exceeds the approved per-purchase limit.";
  } else if (mandate.spentCents + bill.amountCents > mandate.budgetCents) {
    rule = "total_budget";
    reason = "This purchase would exceed the remaining approved budget.";
  }
  if (rule) {
    await ctx.db.insert("purchaseReceipts", {
      companyId: viewer.companyId,
      mandateId: mandate._id,
      billId: bill._id,
      actorId: viewer.user._id,
      at: now,
      amountCents: bill.amountCents,
      outcome: "refused",
      rule,
      reason,
    });
    await ctx.db.insert("auditLog", {
      at: now,
      actor: viewer.user._id,
      action: "refused",
      companyId: viewer.companyId,
      rule: `purchase:${rule}`,
      reason,
    });
    return { kind: "refused", reason };
  }
  return { kind: "approved", mandate };
}

export async function settlePurchase(
  ctx: MutationCtx,
  viewer: Exclude<Viewer, { firm: true }>,
  bill: Doc<"bills">,
  paymentId: Id<"payments">,
  mandate: Doc<"purchaseMandates">,
) {
  const now = Date.now();
  await ctx.db.patch("purchaseMandates", mandate._id, {
    spentCents: mandate.spentCents + bill.amountCents,
  });
  await ctx.db.patch("payments", paymentId, {
    status: "paid",
    approvedBy: mandate.approvedBy,
    purchaseMandateId: mandate._id,
    decidedAt: now,
    verificationNote:
      "Automatically settled in the demo ledger under the controller's saved purchasing approval.",
  });
  await postLedgerEntry(ctx, {
    kind: "payment",
    companyId: bill.companyId,
    amountCents: bill.amountCents,
    date: now,
    memo: `Automatic purchase under approval ${mandate._id} (demo ledger)`,
    paymentId,
    billId: bill._id,
  });
  await ctx.db.insert("purchaseReceipts", {
    companyId: viewer.companyId,
    mandateId: mandate._id,
    billId: bill._id,
    paymentId,
    actorId: viewer.user._id,
    at: now,
    amountCents: bill.amountCents,
    outcome: "paid_demo",
    rule: "approved_purchase",
    reason:
      "Saved bill and payee unchanged; approval active; individual and total limits satisfied. Demo ledger settled atomically.",
  });
  await ctx.db.insert("auditLog", {
    at: now,
    actor: "system",
    action: "release",
    companyId: viewer.companyId,
    paymentId,
    rule: "purchase_mandate",
    reason: `Automatic demo settlement; controller ${mandate.approvedBy}, mandate ${mandate._id}.`,
  });
}

export const overview = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (viewer.firm) return null;
    const mandates = await ctx.db
      .query("purchaseMandates")
      .withIndex("by_companyId_and_assetId", (q) =>
        q.eq("companyId", viewer.companyId),
      )
      .order("desc")
      .take(100);
    // One current mandate per vendor. Old grants cannot reactivate after a revocation or expiry.
    const seen = new Set<string>();
    const current = mandates.filter((m) => {
      if (seen.has(m.assetId)) return false;
      seen.add(m.assetId);
      return true;
    });
    const receipts = await ctx.db
      .query("purchaseReceipts")
      .withIndex("by_companyId", (q) => q.eq("companyId", viewer.companyId))
      .order("desc")
      .take(50);
    return {
      canApprove: viewer.user.role === "controller",
      demoOnly: true,
      enabled: env.DEMO_MODE === "true",
      mandates: await Promise.all(
        current.map(async (m) => ({
          ...m,
          vendorName:
            (await ctx.db.get("assets", m.assetId))?.vendorName ?? "Vendor",
          approvedByName:
            (await ctx.db.get("users", m.approvedBy))?.name ??
            "Former controller",
          billCount: (
            await ctx.db
              .query("purchaseQuotes")
              .withIndex("by_mandateId_and_billId", (q) =>
                q.eq("mandateId", m._id),
              )
              .take(25)
          ).length,
        })),
      ),
      receipts,
    };
  },
});

// Optional stage fixture, separate from reset/seed so the original four demo scenarios stay exact.
export const loadSamples = mutation({
  args: { presenterKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (
      viewer.firm ||
      viewer.user.role !== "controller" ||
      env.DEMO_MODE !== "true" ||
      (env.PRESENTER_KEY && args.presenterKey !== env.PRESENTER_KEY)
    )
      throw new ConvexError(
        "Only an authorized demo controller can load these sample purchases.",
      );
    const name = `Office supplies demo · ${viewer.companyId}`;
    const existing = await ctx.db
      .query("assets")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();
    if (existing) return { created: false };
    const now = Date.now();
    const assetId = await ctx.db.insert("assets", {
      name,
      vendorName: "Northstar Office Supplies (demo)",
      kind: "other",
      phoneOnFile: "+1 (415) 555-0100",
    });
    await ctx.db.insert("bankDetailChanges", {
      assetId,
      accountLast4: "4242",
      requestChannel: "verified_call",
      changedAt: now,
    });
    await ctx.db.insert("links", {
      assetId,
      companyId: viewer.companyId,
      shareType: "same_vendor_only",
      source: "self_reported",
    });
    for (const [description, amountCents] of [
      ["Office supplies · SC-101", 12000],
      ["Printer supplies · SC-102", 18000],
      ["Desk accessories · SC-103", 21000],
    ] as const) {
      const billId = await ctx.db.insert("bills", {
        companyId: viewer.companyId,
        assetId,
        amountCents,
        description,
        dueDate: now + DAY_MS,
      });
      await postLedgerEntry(ctx, {
        kind: "bill",
        companyId: viewer.companyId,
        amountCents,
        date: now,
        memo: `Sample purchase: ${description}`,
        billId,
      });
    }
    return { created: true };
  },
});

// Include the original approvals and saved quotes behind the latest decisions, even after a new
// approval supersedes them. Current settings alone cannot explain an earlier settlement.
export const getRecord = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (viewer.firm) return null;
    const rows = await ctx.db
      .query("purchaseReceipts")
      .withIndex("by_companyId", (q) => q.eq("companyId", viewer.companyId))
      .order("desc")
      .take(51);
    const receipts = rows.slice(0, 50);
    const approvals = [];
    for (const id of new Set(receipts.map((r) => r.mandateId))) {
      const mandate = await ctx.db.get("purchaseMandates", id);
      if (!mandate || mandate.companyId !== viewer.companyId) continue;
      const quotes = await ctx.db
        .query("purchaseQuotes")
        .withIndex("by_mandateId_and_billId", (q) => q.eq("mandateId", id))
        .take(26);
      approvals.push({
        ...mandate,
        quotes: quotes.slice(0, 25),
        quotesTruncated: quotes.length > 25,
      });
    }
    return {
      format: "sidecall.purchase-record.v1",
      settlement: "demo_ledger",
      companyId: viewer.companyId,
      receipts,
      approvals,
      receiptsTruncated: rows.length > 50,
      scope:
        "Latest 50 purchase decisions and their original approvals; not a payment-network receipt or cryptographic attestation.",
    };
  },
});
