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

describe("POST /mcp", () => {
  type T = Awaited<ReturnType<typeof seeded>>["t"];
  const post = (t: T, body: string, headers: Record<string, string> = {}) =>
    t.fetch("/mcp", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...headers },
      body,
    });
  const rpc = async (t: T, method: string, params: unknown = {}, id: number | undefined = 1) =>
    (await post(t, JSON.stringify({ jsonrpc: "2.0", ...(id === undefined ? {} : { id }), method, params }))).json();
  const call = async (t: T, name: string, args: Record<string, unknown> = {}) =>
    (await rpc(t, "tools/call", { name, arguments: args })).result as { content: { text: string }[]; isError?: boolean };

  test("initialize, tools/list, ping", async () => {
    const { t } = await seeded();
    const init = await rpc(t, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect(init.result.capabilities.tools).toBeDefined();
    expect(init.result.serverInfo.name).toBe("sidecall");
    const tools = await rpc(t, "tools/list");
    expect(tools.result.tools.map((x: { name: string }) => x.name)).toEqual(["list_held_payments", "explain_hold"]);
    expect((await rpc(t, "ping")).result).toEqual({});
  });

  test("protocol edge cases", async () => {
    const { t } = await seeded();
    const note = await post(t, JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
    expect(note.status).toBe(202);
    expect(await note.text()).toBe("");
    expect((await t.fetch("/mcp", { method: "GET" })).status).toBe(405);
    expect((await post(t, "{}", { Authorization: "Bearer wrong" })).status).toBe(401);
    expect((await post(t, "{}", { Origin: "https://evil.example" })).status).toBe(403);
    expect((await (await post(t, "{")).json()).error.code).toBe(-32700);
    expect((await (await post(t, "[]")).json()).error.code).toBe(-32600);
    expect((await rpc(t, "foo/bar")).error.code).toBe(-32601);
    expect((await (await post(t, JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }), { "MCP-Protocol-Version": "1999-01-01" })).json()).error.code).toBe(-32600);
  });

  test("list_held_payments shows Summit's holds only, never the reporter", async () => {
    const { t, fire } = await seeded();
    await fire();
    const res = await call(t, "list_held_payments");
    const rows = JSON.parse(res.content[0].text) as { vendorName: string; amountCents: number; bankChangeFlag: boolean }[];
    expect(rows.every((r) => r.vendorName === "Brightline Payroll Inc.")).toBe(true);
    expect(rows.find((r) => r.amountCents === 48_000_000)?.bankChangeFlag).toBe(true);
    for (const name of ["Pinecrest", "Cedar Ridge", "Bayview"]) expect(res.content[0].text).not.toContain(name);
  });

  test("explain_hold says a person must act; other companies' payments are not found", async () => {
    const { t, fire } = await seeded();
    await fire();
    const rows = JSON.parse((await call(t, "list_held_payments")).content[0].text) as { paymentId: string; amountCents: number }[];
    const big = rows.find((r) => r.amountCents === 48_000_000)!;
    const explained = JSON.parse((await call(t, "explain_hold", { paymentId: big.paymentId })).content[0].text);
    expect(explained.nextStep).toContain("number on file");
    expect(explained.nextStep).toContain("cannot release");
    expect(explained.bankChange).toMatchObject({ accountLast4: "7731", lastVerifiedAccountLast4: "2208" });
    expect(JSON.stringify(explained)).not.toContain("Pinecrest");

    const cedarPayment = await t.run(async (ctx) => {
      const cedar = (await ctx.db.query("companies").take(100)).find((c) => c.name === "Cedar Ridge Manufacturing")!;
      return (await ctx.db.query("payments").take(100)).find((p) => p.companyId === cedar._id && p.status === "held")!._id;
    });
    for (const paymentId of [cedarPayment, "garbage"]) {
      const res = await call(t, "explain_hold", { paymentId });
      expect(res).toMatchObject({ isError: true, content: [{ text: "Payment not found." }] });
    }
  });

  test("every tools/call writes exactly one agent_call audit row", async () => {
    const { t, fire } = await seeded();
    await fire();
    const count = () => t.run(async (ctx) => (await ctx.db.query("auditLog").take(500)).filter((a) => a.action === "agent_call").length);
    const before = await count();
    await call(t, "list_held_payments");
    await call(t, "explain_hold", { paymentId: "garbage" });
    await rpc(t, "tools/call", { name: "release_payment", arguments: {} }); // doesn't exist: refused
    expect((await count()) - before).toBe(3);
  });
});

describe("agent requests a payment", () => {
  const ALL = ["list_held_payments", "explain_hold", "list_bills", "request_payment"];
  type T = Awaited<ReturnType<typeof seeded>>["t"];
  const call = async (t: T, name: string, args: Record<string, unknown> = {}) => {
    const res = await t.fetch("/mcp", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    });
    const { result } = (await res.json()) as { result: { content: { text: string }[]; isError?: boolean } };
    return JSON.parse(result.content[0].text);
  };
  async function requested() {
    const s = await seeded(ALL);
    await s.fire();
    const bills = (await call(s.t, "list_bills")) as { billId: string; description: string; payment: unknown }[];
    const november = bills.find((b) => b.description === "November payroll processing")!;
    expect(november.payment).toBeNull();
    const result = await call(s.t, "request_payment", { billId: november.billId });
    return { ...s, result };
  }

  test("an agent-requested payment to a compromised vendor is held and flagged", async () => {
    const { result } = await requested();
    expect(result).toMatchObject({ ok: true, held: true, flagged: true });
  });

  test("the clerk the agent acts for cannot release it; the controller can", async () => {
    const { t, as, result } = await requested();
    const jamie = await (await as("Jamie Chen")).mutation(api.payments.releasePayment, {
      paymentId: result.paymentId,
      verificationNote: "Called Brightline at number on file, confirmed account",
    });
    expect(jamie.ok).toBe(false);
    const rules = await t.run(async (ctx) =>
      (await ctx.db.query("auditLog").take(500)).filter((a) => a.paymentId === result.paymentId).map((a) => a.rule),
    );
    expect(rules).toContain("segregation_of_duties");
    const rosa = await (await as("Rosa Alvarez")).mutation(api.payments.releasePayment, {
      paymentId: result.paymentId,
      verificationNote: "Called Brightline at number on file, confirmed account",
    });
    expect(rosa).toEqual({ ok: true });
  });

  test("request_payment writes exactly one agent_call row, linked to the payment", async () => {
    const { t, result } = await requested();
    const rows = await t.run(async (ctx) =>
      (await ctx.db.query("auditLog").take(500)).filter((a) => a.rule === "mcp_tool:request_payment"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].paymentId).toBe(result.paymentId);
    expect(rows[0].reason).toMatch(/held until verified and flagged/);
  });
});
