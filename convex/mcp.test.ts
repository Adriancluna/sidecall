/// <reference types="vite/client" />
// MCP agent access: an AI assistant acting as Summit's AP clerk, with a clerk's limits.
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { sha256Hex } from "./agents";

const modules = import.meta.glob("./**/*.ts");
const TOKEN = "sc_agent_test";
const AGENT = "Summit AP assistant";
const BRIGHTLINE = {
  externalId: "demo-brightline-001",
  assetName: "Brightline Payroll",
  reportedByDomain: "pinecreststaffing.example",
};

async function seeded(tools = ["list_held_payments", "explain_hold"]) {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  await t.run(async (ctx) =>
    ctx.db.insert("agents", {
      name: AGENT,
      tokenHash: await sha256Hex(TOKEN),
      onBehalfOfEmail: "jamie.chen@summithomehealth.example",
      tools,
      createdAt: Date.now(),
    }),
  );
  const user = (name: string) =>
    t.run(async (ctx) => (await ctx.db.query("users").take(300)).find((u) => u.name === name)!);
  const as = async (name: string) => t.withIdentity({ subject: `${(await user(name))._id}|s` });
  const company = (name: string) =>
    t.run(async (ctx) => (await ctx.db.query("companies").take(100)).find((c) => c.name === name)!._id);
  const fire = () => t.mutation(internal.incidents.recordIncident, BRIGHTLINE);
  return { t, as, user, company, fire };
}

describe("agent identity", () => {
  test("authenticate resolves the agent to the clerk it acts for", async () => {
    const { t, company } = await seeded();
    const who = await t.query(internal.agents.authenticate, { tokenHash: await sha256Hex(TOKEN) });
    expect(who).toMatchObject({ name: AGENT, tools: ["list_held_payments", "explain_hold"] });
    expect(who!.companyId).toBe(await company("Summit Home Health"));
  });

  test("a revoked agent or an unknown token does not authenticate", async () => {
    const { t } = await seeded();
    expect(await t.query(internal.agents.authenticate, { tokenHash: await sha256Hex("nope") })).toBeNull();
    expect(await t.mutation(internal.agents.revoke, { name: AGENT })).toEqual({ revoked: 1 });
    expect(await t.query(internal.agents.authenticate, { tokenHash: await sha256Hex(TOKEN) })).toBeNull();
  });

  test("the agent survives a reseed", async () => {
    const { t, company } = await seeded();
    await t.mutation(internal.seed.run, {});
    const who = await t.query(internal.agents.authenticate, { tokenHash: await sha256Hex(TOKEN) });
    expect(who!.companyId).toBe(await company("Summit Home Health"));
  });

  test("logCall writes one agent_call row the company sees, labelled as the agent", async () => {
    const { t, as, fire } = await seeded();
    const fired = await fire();
    if (!fired.ok) throw new Error(fired.error);
    const who = (await t.query(internal.agents.authenticate, { tokenHash: await sha256Hex(TOKEN) }))!;
    await t.mutation(internal.agents.logCall, {
      agentId: who.agentId,
      tool: "list_held_payments",
      ok: true,
      summary: "1 held payment.",
      incidentId: fired.incidentId,
    });
    const rows = await (await as("Rosa Alvarez")).query(api.payments.getIncidentAudit, { incidentId: fired.incidentId });
    expect(rows.filter((r) => r.action === "agent_call").map((r) => r.actorName)).toEqual([`${AGENT} (agent)`]);
  });
});
