// AI assistants that use Sidecall over MCP (convex/mcp.ts). Each acts on behalf of one seeded
// person, by email, so the same Viewer scoping, holds and segregation of duties apply to it as to
// that person. Only the sha256 of its bearer token is stored; the token is shown once at mint.
//   npx convex run agents:mint '{"name":"Summit AP assistant","onBehalfOfEmail":"jamie.chen@summithomehealth.example","tools":["list_held_payments","explain_hold"]}'
//   npx convex run agents:revoke '{"name":"Summit AP assistant"}'
import { ConvexError, v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { viewerForUser } from "./access";
import { billsFor, heldPaymentsFor, paymentAuditFor, requestPaymentFor, type HeldPaymentRow } from "./payments";
import { formatUsd, toHex } from "./shared";

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return toHex(digest);
}

// Randomness in an action: mutation randomness is seeded for determinism, so it isn't secret.
export const mint = internalAction({
  args: { name: v.string(), onBehalfOfEmail: v.string(), tools: v.array(v.string()) },
  returns: v.object({ token: v.string() }),
  handler: async (ctx, args) => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = `sc_agent_${toHex(bytes)}`;
    await ctx.runMutation(internal.agents.insertAgent, { ...args, tokenHash: await sha256Hex(token) });
    return { token };
  },
});

export const insertAgent = internalMutation({
  args: { name: v.string(), onBehalfOfEmail: v.string(), tools: v.array(v.string()), tokenHash: v.string() },
  returns: v.id("agents"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agents")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .take(20);
    if (existing.some((a) => a.revokedAt === undefined)) {
      throw new ConvexError(`An active agent named "${args.name}" exists; revoke it first.`);
    }
    return await ctx.db.insert("agents", {
      name: args.name,
      tokenHash: args.tokenHash,
      onBehalfOfEmail: args.onBehalfOfEmail.trim().toLowerCase(),
      tools: args.tools,
      createdAt: Date.now(),
    });
  },
});

export const revoke = internalMutation({
  args: { name: v.string() },
  returns: v.object({ revoked: v.number() }),
  handler: async (ctx, args) => {
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .take(20);
    let revoked = 0;
    for (const agent of agents) {
      if (agent.revokedAt !== undefined) continue;
      await ctx.db.patch("agents", agent._id, { revokedAt: Date.now() });
      revoked += 1;
    }
    return { revoked };
  },
});

const authenticated = v.object({
  agentId: v.id("agents"),
  name: v.string(),
  tools: v.array(v.string()),
  companyId: v.id("companies"),
});

// Null for an unknown or revoked token, or when the person it acts for no longer exists or has no
// company (a firm-scoped agent isn't allowed). Resolved per call, so reseeds don't break it.
export const authenticate = internalQuery({
  args: { tokenHash: v.string() },
  returns: v.union(v.null(), authenticated),
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (!agent || agent.revokedAt !== undefined) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", agent.onBehalfOfEmail))
      .unique();
    if (!user?.companyId || user.role === "pe_partner") return null;
    return { agentId: agent._id, name: agent.name, tools: agent.tools, companyId: user.companyId };
  },
});

// One audit row per tools/call, visible to the agent's company in the controls log.
export const logCall = internalMutation({
  args: {
    agentId: v.id("agents"),
    companyId: v.id("companies"), // from authenticate, so the user isn't looked up again
    tool: v.string(),
    ok: v.boolean(),
    summary: v.string(),
    paymentId: v.optional(v.id("payments")),
    incidentId: v.optional(v.id("incidents")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const agent = await ctx.db.get("agents", args.agentId);
    if (!agent) return null;
    await ctx.db.insert("auditLog", {
      at: Date.now(),
      actor: agent._id,
      action: "agent_call",
      companyId: args.companyId,
      paymentId: args.paymentId,
      incidentId: args.incidentId,
      rule: `mcp_tool:${args.tool}`,
      reason: `${agent.name} called ${args.tool}: ${args.ok ? "ok" : "refused"}. ${args.summary}`,
    });
    return null;
  },
});

// ---- Tool internals (read-only). Each builds the Viewer of the person the agent acts for, so
// the agent sees exactly what that person would: their own company, never the reporter. ----


async function agentViewer(ctx: QueryCtx, agentId: Id<"agents">) {
  const agent = await ctx.db.get("agents", agentId);
  if (!agent || agent.revokedAt !== undefined) throw new ConvexError("Agent not active");
  const user = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", agent.onBehalfOfEmail))
    .unique();
  if (!user) throw new ConvexError("The person this agent acts for no longer exists");
  return { agent, viewer: viewerForUser(user) };
}

const decisionOut = (row: HeldPaymentRow) =>
  row.decision ? { status: row.decision.status, byName: row.decision.byName, at: row.decision.at } : null;

export const listHeldPayments = internalQuery({
  args: {
    agentId: v.id("agents"),
    status: v.optional(v.union(v.literal("held"), v.literal("paid"), v.literal("rejected"))),
  },
  handler: async (ctx, args) => {
    const { viewer } = await agentViewer(ctx, args.agentId);
    const rows = await heldPaymentsFor(ctx, viewer, {});
    return rows
      .filter((r) => !args.status || r.payment.status === args.status)
      .map((r) => ({
        paymentId: r.payment._id,
        vendorName: r.vendorName,
        amountCents: r.payment.amountCents,
        amount: formatUsd(r.payment.amountCents),
        status: r.payment.status,
        bankChangeFlag: r.payment.bankChangeFlag ?? false,
        holdReasons: r.holdReasons,
        dueDate: r.payment.dueDate ?? null,
        decision: decisionOut(r),
      }));
  },
});

export const explainHold = internalQuery({
  args: { agentId: v.id("agents"), paymentId: v.string() },
  handler: async (ctx, args) => {
    const { viewer } = await agentViewer(ctx, args.agentId);
    const paymentId = ctx.db.normalizeId("payments", args.paymentId);
    if (!paymentId) return null;
    const [row] = await heldPaymentsFor(ctx, viewer, { paymentId });
    if (!row) return null; // not this company's, or never held: same answer, no leak
    const audit = await paymentAuditFor(ctx, viewer, paymentId);
    const status = row.payment.status;
    const nextStep =
      status === "held"
        ? `Held until verified. A controller other than the requester must call ${row.vendorName} at the number on file (${row.phoneOnFile}), not a number from a recent email, then release or reject it in Sidecall. This assistant cannot release or reject payments.`
        : row.decision
          ? `Decided (${status}) by ${row.decision.byName}. No action needed.`
          : "Not held.";
    return {
      paymentId,
      vendorName: row.vendorName,
      amount: formatUsd(row.payment.amountCents),
      status,
      holdReasons: row.holdReasons,
      bankChange: row.bankChange
        ? {
            daysBeforeIncident: row.bankChange.daysBeforeIncident,
            requestChannel: row.bankChange.requestChannel,
            accountLast4: row.bankChange.accountLast4,
            lastVerifiedAccountLast4: row.bankChange.lastVerifiedAccountLast4,
          }
        : null,
      phoneOnFile: row.phoneOnFile,
      decision: decisionOut(row),
      audit: audit.map((a) => ({ at: a.at, action: a.action, rule: a.rule, reason: a.reason })),
      incidentId: row.payment.heldByIncidentId ?? null,
      nextStep,
    };
  },
});

export const listBills = internalQuery({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const { viewer } = await agentViewer(ctx, args.agentId);
    const bills = await billsFor(ctx, viewer);
    return bills.map((b) => ({
      billId: b.bill._id,
      vendorName: b.vendorName,
      amount: formatUsd(b.bill.amountCents),
      dueDate: b.bill.dueDate,
      description: b.bill.description,
      payment: b.payment ? { paymentId: b.payment._id, status: b.payment.status } : null,
    }));
  },
});

// Requests a payment as the clerk the agent acts for, through the same code as the UI, and writes
// the agent_call audit row in the same transaction (the HTTP handler doesn't log this tool again).
export const requestPayment = internalMutation({
  args: { agentId: v.id("agents"), billId: v.string() },
  handler: async (ctx, args) => {
    const { agent, viewer } = await agentViewer(ctx, args.agentId);
    const billId = ctx.db.normalizeId("bills", args.billId);
    const result = billId
      ? await requestPaymentFor(ctx, viewer, billId)
      : { ok: false as const, reason: "That bill isn't your company's." };
    const payment = result.ok ? await ctx.db.get("payments", result.paymentId) : null;
    await ctx.db.insert("auditLog", {
      at: Date.now(),
      actor: agent._id,
      action: "agent_call",
      companyId: viewer.firm ? undefined : viewer.companyId,
      paymentId: payment?._id,
      incidentId: payment?.heldByIncidentId,
      rule: "mcp_tool:request_payment",
      reason: `${agent.name} called request_payment: ${result.ok ? "ok" : "refused"}. ${
        result.ok
          ? `Requested ${formatUsd(payment!.amountCents)}${result.held ? `, held until verified${result.flagged ? " and flagged" : ""}` : ""}.`
          : result.reason
      }`,
    });
    return result;
  },
});
