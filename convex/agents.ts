// AI assistants that use Sidecall over MCP (convex/mcp.ts). Each acts on behalf of one seeded
// person, by email, so the same Viewer scoping, holds and segregation of duties apply to it as to
// that person. Only the sha256 of its bearer token is stored; the token is shown once at mint.
//   npx convex run agents:mint '{"name":"Summit AP assistant","onBehalfOfEmail":"jamie.chen@summithomehealth.example","tools":["list_held_payments","explain_hold"]}'
//   npx convex run agents:revoke '{"name":"Summit AP assistant"}'
import { ConvexError, v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Randomness in an action: mutation randomness is seeded for determinism, so it isn't secret.
export const mint = internalAction({
  args: { name: v.string(), onBehalfOfEmail: v.string(), tools: v.array(v.string()) },
  returns: v.object({ token: v.string() }),
  handler: async (ctx, args) => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = `sc_agent_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
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
  userId: v.id("users"),
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
    return { agentId: agent._id, name: agent.name, tools: agent.tools, userId: user._id, companyId: user.companyId };
  },
});

// One audit row per tools/call, visible to the agent's company in the controls log.
export const logCall = internalMutation({
  args: {
    agentId: v.id("agents"),
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
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", agent.onBehalfOfEmail))
      .unique();
    await ctx.db.insert("auditLog", {
      at: Date.now(),
      actor: agent._id,
      action: "agent_call",
      companyId: user?.companyId,
      paymentId: args.paymentId,
      incidentId: args.incidentId,
      rule: `mcp_tool:${args.tool}`,
      reason: `${agent.name} called ${args.tool}: ${args.ok ? "ok" : "refused"}. ${args.summary}`,
    });
    return null;
  },
});
