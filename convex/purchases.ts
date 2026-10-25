// Controller-approved purchasing. All settlement is the existing synthetic double-entry ledger;
// this is not a Visa API, bank-account verification service, or payment network connector.
import { ConvexError, v } from "convex/values";
import { env, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getViewer, viewerForUser, type Viewer } from "./access";
import { DAY_MS, formatUsd } from "./shared";
import { postLedgerEntry } from "./ledger";
import { livePaymentForBill } from "./paymentLookup";
import { activeIncidentFor } from "./payments";
import type { Infer } from "convex/values";
import { purchaseEvidence } from "./purchaseTypes";

function cents(value: number) {
  return Number.isSafeInteger(value) && value > 0 && value <= 100_000_000;
}

export const approve = mutation({
  args: {
    billIds: v.array(v.id("bills")),
    perPurchaseCents: v.number(),
    budgetCents: v.number(),
    expiresAt: v.number(),
    executorAgentId: v.optional(v.id("agents")),
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
    if (args.executorAgentId && !(await eligibleAgent(ctx, args.executorAgentId, viewer.companyId)))
      throw new ConvexError("Choose an active payment agent for your company’s AP clerk.");
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
      !Number.isSafeInteger(args.expiresAt) ||
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
      if (await livePaymentForBill(ctx, billId))
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
      executorAgentId: args.executorAgentId,
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

type CompanyViewer = Exclude<Viewer, { firm: true }>;
type Evidence = Infer<typeof purchaseEvidence>;
export type PurchaseDecision =
  | { kind: "manual"; reason: string; evidence: null }
  | { kind: "refused" | "approved"; reason: string; mandate: Doc<"purchaseMandates">; evidence: Evidence };

// This is also used for approval/preview selections. It never grants authority to the query caller.
async function eligibleAgent(ctx: QueryCtx, id: Id<"agents">, companyId: Id<"companies">) {
  const agent = await ctx.db.get("agents", id);
  if (!agent || agent.revokedAt !== undefined || !agent.tools.includes("request_payment")) return null;
  const user = await ctx.db.query("users").withIndex("email", q => q.eq("email", agent.onBehalfOfEmail)).unique();
  return user?.companyId === companyId && user.role === "ap_clerk" ? { agent, user } : null;
}
const billFacts = (bill: Doc<"bills"> | Doc<"purchaseQuotes">) => ({ assetId: bill.assetId,
  amountCents: bill.amountCents, description: bill.description, dueDate: bill.dueDate });

// Read-only evaluator shared by preview and execution. Every execution read and write stays in
// one mutation, so mandate replacement/revocation, bank changes and concurrent spending serialize.
export async function evaluatePurchase(
  ctx: QueryCtx, viewer: CompanyViewer, bill: Doc<"bills">,
  bank: Doc<"bankDetailChanges"> | null, incident: Doc<"incidents"> | null, now: number,
  agentId?: Id<"agents">, expectedMandateId?: Id<"purchaseMandates">,
): Promise<PurchaseDecision> {
  const mandate = await ctx.db.query("purchaseMandates")
    .withIndex("by_companyId_and_assetId", q => q.eq("companyId", viewer.companyId).eq("assetId", bill.assetId))
    .order("desc").first();
  if (!mandate) return { kind: "manual", reason: "No purchasing approval covers this vendor; the normal payment request rules apply.", evidence: null };
  const approver = await ctx.db.get("users", mandate.approvedBy);
  const quote = await ctx.db.query("purchaseQuotes")
    .withIndex("by_mandateId_and_billId", q => q.eq("mandateId", mandate._id).eq("billId", bill._id)).unique();
  const executor = agentId ? await eligibleAgent(ctx, agentId, viewer.companyId) : null;
  const checks: Evidence["checks"] = [];
  const check = (code: string, passed: boolean, reason: string) => checks.push({ code, passed, reason });
  check("demo_only", env.DEMO_MODE === "true", "Automatic settlement requires the demo ledger.");
  check("requester_role", viewer.user.role === "ap_clerk", "Only an AP clerk or its authorized agent can request payment.");
  check("approver_authority", !!approver && approver.role === "controller" && approver.companyId === viewer.companyId && approver._id !== viewer.user._id,
    "The original controller must retain authority and be different from the requester.");
  check("executor_authority", !agentId || (!!executor && executor.user._id === viewer.user._id), "The requesting agent must remain active for this company's AP clerk and payment tool.");
  check("executor_scope", !mandate.executorAgentId || mandate.executorAgentId === agentId, "Requester must match the approval’s company-wide or selected-agent scope.");
  check("approval_inactive", mandate.revokedAt === undefined && now < mandate.expiresAt, "The purchasing approval must not be expired or revoked.");
  check("approval_changed", expectedMandateId === undefined || expectedMandateId === mandate._id, "The request must use the current purchasing approval.");
  check("confirmed_incident", incident === null, "A confirmed vendor incident requires a separate controller decision.");
  check("bill_not_approved", !!quote, "This bill must be in the controller's approved purchases.");
  check("bill_changed", !!quote && quote.assetId === bill.assetId && quote.amountCents === bill.amountCents && quote.description === bill.description && quote.dueDate === bill.dueDate,
    "The bill must match the saved amount, vendor, description and due date.");
  check("payee_changed", !!bank && bank._id === mandate.bankDetailId && bank.accountLast4 === mandate.accountLast4 && bank.changedAt === mandate.bankChangedAt && bank.requestChannel === "verified_call",
    "The payee must match the independently verified record approved by the controller, not only its last four digits.");
  check("purchase_limit", cents(bill.amountCents) && bill.amountCents <= mandate.perPurchaseCents, "The purchase must fit the approved per-purchase limit.");
  check("total_budget", Number.isSafeInteger(mandate.spentCents + bill.amountCents) && mandate.spentCents + bill.amountCents <= mandate.budgetCents,
    "The purchase must fit the remaining approved budget.");
  check("existing_payment", !(await livePaymentForBill(ctx, bill._id)), "This bill must not already have a pending, held or paid payment.");
  const failed = checks.find(c => !c.passed);
  const evidence: Evidence = {
    version: 1, currency: "USD", evaluatedAt: now,
    executorScope: mandate.executorAgentId ? "specific_agent" : "company_ap", executorAgentId: mandate.executorAgentId ?? null,
    checks,
    expected: { mandateId: mandate._id, quoteId: quote?._id ?? null, bill: quote ? billFacts(quote) : null,
      payee: { bankDetailId: mandate.bankDetailId, accountLast4: mandate.accountLast4, changedAt: mandate.bankChangedAt, requestChannel: "verified_call" },
      approvedBy: mandate.approvedBy, expiresAt: mandate.expiresAt },
    current: { bill: billFacts(bill), payee: bank ? { bankDetailId: bank._id, accountLast4: bank.accountLast4, changedAt: bank.changedAt, requestChannel: bank.requestChannel } : null,
      agentId: agentId ?? null, incidentId: incident?._id ?? null },
    budget: { beforeCents: mandate.spentCents, afterCents: failed ? mandate.spentCents : mandate.spentCents + bill.amountCents, limitCents: mandate.budgetCents },
  };
  return { kind: failed ? "refused" : "approved", reason: failed?.reason ?? "All purchasing checks passed. Settlement is available only in the demo ledger.", mandate, evidence };
}

export async function recordPurchaseRefusal(ctx: MutationCtx, viewer: CompanyViewer, bill: Doc<"bills">,
  decision: Exclude<PurchaseDecision, { kind: "manual" }>, agentId?: Id<"agents">, requestId?: string) {
  const rule = decision.evidence.checks.find(c => !c.passed)!.code;
  const receiptId = await ctx.db.insert("purchaseReceipts", { companyId: viewer.companyId,
    mandateId: decision.mandate._id, billId: bill._id, actorId: viewer.user._id, agentId, requestId,
    at: decision.evidence.evaluatedAt, amountCents: bill.amountCents, outcome: "refused", rule,
    reason: decision.reason, evidence: decision.evidence });
  await ctx.db.insert("auditLog", { at: decision.evidence.evaluatedAt, actor: agentId ?? viewer.user._id,
    action: "refused", companyId: viewer.companyId, rule: `purchase:${rule}`, reason: decision.reason });
  return receiptId;
}

export async function settlePurchase(ctx: MutationCtx, viewer: CompanyViewer, bill: Doc<"bills">,
  paymentId: Id<"payments">, decision: Exclude<PurchaseDecision, { kind: "manual" }>, agentId?: Id<"agents">, requestId?: string) {
  if (decision.kind !== "approved" || decision.evidence.checks.some(c => !c.passed))
    throw new ConvexError("Only an approved purchase decision can settle.");
  const { mandate, evidence } = decision;
  const now = evidence.evaluatedAt;
  await ctx.db.patch("purchaseMandates", mandate._id, { spentCents: evidence.budget.afterCents });
  await ctx.db.patch("payments", paymentId, { status: "paid", approvedBy: mandate.approvedBy,
    purchaseMandateId: mandate._id, decidedAt: now,
    verificationNote: "Automatically settled in the demo ledger under the controller's saved purchasing approval." });
  const ledgerEntryId = await postLedgerEntry(ctx, { kind: "payment", companyId: bill.companyId, amountCents: bill.amountCents,
    date: now, memo: `Automatic purchase under approval ${mandate._id} (demo ledger)`, paymentId, billId: bill._id });
  const receiptId = await ctx.db.insert("purchaseReceipts", { companyId: viewer.companyId,
    mandateId: mandate._id, billId: bill._id, paymentId, ledgerEntryId, actorId: viewer.user._id, agentId, requestId,
    at: now, amountCents: bill.amountCents, outcome: "paid_demo", rule: "approved_purchase",
    reason: "Saved bill and payee unchanged; approval active; individual and total limits satisfied. Demo ledger settled atomically.", evidence });
  await ctx.db.insert("auditLog", { at: now, actor: "system", action: "release", companyId: viewer.companyId, paymentId,
    rule: "purchase_mandate", reason: `Automatic demo settlement; controller ${mandate.approvedBy}, mandate ${mandate._id}, receipt ${receiptId}.` });
  return receiptId;
}

export const preview = query({
  args: { billId: v.id("bills"), asOf: v.number(), executorAgentId: v.optional(v.id("agents")) },
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.asOf) || args.asOf < 0) throw new ConvexError("asOf must be a nonnegative safe timestamp.");
    const viewer = await getViewer(ctx);
    const bill = await ctx.db.get("bills", args.billId);
    if (viewer.firm || !bill || bill.companyId !== viewer.companyId) return null;
    const selected = args.executorAgentId ? await eligibleAgent(ctx, args.executorAgentId, viewer.companyId) : null;
    if (args.executorAgentId && !selected) return { decision: "refused" as const,
      reason: "The selected payment agent is unavailable or no longer authorized for your company. Choose another executor.",
      evidence: null, mandateId: null, existingPaymentId: null };
    const executorViewer = selected ? viewerForUser(selected.user) : viewer;
    if (executorViewer.firm) return null;
    const bank = await ctx.db.query("bankDetailChanges")
      .withIndex("by_assetId_and_changedAt", q => q.eq("assetId", bill.assetId)).order("desc").first();
    const incident = await activeIncidentFor(ctx, bill.assetId, args.asOf);
    const result = await evaluatePurchase(ctx, executorViewer, bill, bank, incident, args.asOf, args.executorAgentId);
    return { decision: result.kind, reason: result.reason, evidence: result.evidence,
      mandateId: result.kind === "manual" ? null : result.mandate._id,
      existingPaymentId: (await livePaymentForBill(ctx, bill._id))?._id ?? null };
  },
});

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
    const agentRows = await ctx.db.query("agents").order("desc").take(100);
    const eligibleAgents = [];
    for (const row of agentRows) {
      const match = await eligibleAgent(ctx, row._id, viewer.companyId);
      if (match) eligibleAgents.push({ id: row._id, name: row.name, onBehalfOfName: match.user.name });
    }
    return {
      eligibleAgents,
      canApprove: viewer.user.role === "controller",
      demoOnly: true,
      enabled: env.DEMO_MODE === "true",
      mandates: await Promise.all(
        current.map(async (m) => ({
          ...m,
          executorScope: m.executorAgentId ? "specific_agent" as const : "company_ap" as const,
          executorAgentName: m.executorAgentId ? (await ctx.db.get("agents", m.executorAgentId))?.name ?? "Former agent" : null,
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
