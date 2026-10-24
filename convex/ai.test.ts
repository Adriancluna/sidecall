/// <reference types="vite/client" />
// Role 4: the breach fix advice query (convex/ai.ts getBreachFixAdvice, rules in
// prompts/breachFix.ts). Scoping, no reporter leak, statuses that follow the live rows.
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const PE = "Jordan Ames (Northpass Capital)";
const REPORTER = "Pinecrest Staffing";

async function seeded() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const as = async (name: string) => {
    const userId = await t.run(async (ctx) => {
      const user = (await ctx.db.query("users").take(200)).find((u) => u.name === name);
      if (!user) throw new Error(`no seed user ${name}`);
      return user._id;
    });
    // Convex Auth puts "<userId>|<sessionId>" in the JWT subject.
    return t.withIdentity({ subject: `${userId}|session` });
  };
  const fire = async (scenario: "brightline" | "ironcladCredential" | "ironcladMsp" | "armadinFinding") => {
    const result = await t.mutation(internal.seed.fireDemoIncident, { scenario });
    if (!result.ok) throw new Error(result.error);
    return result.incidentId;
  };
  const exposureOf = (incidentId: Id<"incidents">, companyName: string) =>
    t.run(async (ctx) => {
      const company = (await ctx.db.query("companies").take(100)).find((c) => c.name === companyName);
      const exposure = await ctx.db
        .query("exposures")
        .withIndex("by_incidentId_and_companyId", (q) => q.eq("incidentId", incidentId).eq("companyId", company!._id))
        .unique();
      if (!exposure) throw new Error(`${companyName} is not exposed`);
      return exposure._id;
    });
  return { t, as, fire, exposureOf };
}

const ids = (brief: { recommendations: { id: string }[] } | null) => brief?.recommendations.map((r) => r.id);
const byId = (brief: { recommendations: { id: string }[] } | null, id: string) =>
  brief?.recommendations.find((r) => r.id === id) as
    | { id: string; status?: string; steps: string[]; owner: string; playbookAction: string | null }
    | undefined;

describe("breach fix advice", () => {
  test("Summit sees its own plan: verify the held payment and treat 7731 as unverified", async () => {
    const { as, fire, exposureOf } = await seeded();
    const incidentId = await fire("brightline");
    const exposureId = await exposureOf(incidentId, "Summit Home Health");
    const brief = await (await as("Rosa Alvarez")).query(api.ai.getBreachFixAdvice, { exposureId });
    expect(brief).toMatchObject({ scope: "company", companyName: "Summit Home Health" });
    expect(brief!.summary.startsWith("Urgent:")).toBe(true);
    // Summit is a Brightline customer with its own login: nothing shared to pause or rotate.
    expect(ids(brief)).toEqual(expect.arrayContaining(["verify_payments", "bank_change", "confirm_separate_login"]));
    expect(ids(brief)).not.toContain("pause_login");
    expect(byId(brief, "verify_payments")).toMatchObject({ owner: "controller", status: "todo", playbookAction: "hold_payments" });
    expect(byId(brief, "bank_change")!.steps.join(" ")).toContain("ending 7731");
    expect(byId(brief, "verify_payments")!.steps.join(" ")).toContain("+1 (415) 555-0142");
    // "now" items come first.
    const order = ["now", "soon", "later"];
    const priorities = brief!.recommendations.map((r) => r.priority);
    expect([...priorities].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(priorities);
  });

  test("Cedar Ridge shares the payroll login: pause is one click away and warns about pay runs", async () => {
    const { as, fire, exposureOf } = await seeded();
    const incidentId = await fire("brightline");
    const brief = await (await as("Sam Kowalski")).query(api.ai.getBreachFixAdvice, {
      exposureId: await exposureOf(incidentId, "Cedar Ridge Manufacturing"),
    });
    expect(ids(brief)).toEqual(expect.arrayContaining(["pause_login", "rotate_login", "check_access", "restore_access"]));
    expect(byId(brief, "pause_login")).toMatchObject({ status: "ready", playbookAction: "pause_shared_login" });
    expect(byId(brief, "pause_login")!.steps.join(" ")).toContain("pay run");
    expect(byId(brief, "bank_change")).toBeUndefined(); // 2208 is the account verified by phone
  });

  test("a company can't read another company's plan; the firm can read any", async () => {
    const { as, fire, exposureOf } = await seeded();
    const incidentId = await fire("brightline");
    const cedar = await exposureOf(incidentId, "Cedar Ridge Manufacturing");
    expect(await (await as("Rosa Alvarez")).query(api.ai.getBreachFixAdvice, { exposureId: cedar })).toBeNull();
    expect(await (await as(PE)).query(api.ai.getBreachFixAdvice, { exposureId: cedar })).toMatchObject({
      companyName: "Cedar Ridge Manufacturing",
    });
  });

  test("no plan ever names the reporting company or another sister", async () => {
    const { t, as, fire } = await seeded();
    for (const scenario of ["brightline", "ironcladCredential", "ironcladMsp", "armadinFinding"] as const) {
      const incidentId = await fire(scenario);
      const exposures = await t.run(async (ctx) =>
        ctx.db.query("exposures").withIndex("by_incidentId_and_companyId", (q) => q.eq("incidentId", incidentId)).take(50),
      );
      const companies = await t.run((ctx) => ctx.db.query("companies").take(100));
      for (const e of exposures) {
        const own = companies.find((c) => c._id === e.companyId)!.name;
        const brief = await (await as(PE)).query(api.ai.getBreachFixAdvice, { exposureId: e._id });
        const text = JSON.stringify(brief);
        for (const other of companies.filter((c) => c.name !== own)) expect(text, `${scenario} ${own}`).not.toContain(other.name);
        expect(text).not.toContain(REPORTER);
        expect(text).not.toMatch(/fraud|auto-mitigat|\bcontain/i);
      }
    }
  });

  test("red-team finding: the backend's check comes first, and a one-click pause reads ready", async () => {
    const { as, fire, exposureOf } = await seeded();
    const incidentId = await fire("armadinFinding");
    const granite = await (await as("Ben Carter")).query(api.ai.getBreachFixAdvice, {
      exposureId: await exposureOf(incidentId, "Granite Peak Software"),
    });
    expect(byId(granite, "check_access")!.steps[0]).toMatch(/^What to check: .*Ironclad shared admin account/);
    expect(byId(granite, "pause_login")).toMatchObject({ status: "ready", playbookAction: "pause_shared_login" });
    // Harborline gives the MSP admin access: ask the vendor to rotate, no pause of its own.
    const harbor = await (await as(PE)).query(api.ai.getBreachFixAdvice, {
      exposureId: await exposureOf(incidentId, "Harborline Foods"),
    });
    expect(ids(harbor)).toContain("vendor_admin");
    expect(ids(harbor)).not.toContain("rotate_login");
  });

  test("statuses follow the live rows; the item list does not change", async () => {
    const { t, as, fire, exposureOf } = await seeded();
    const incidentId = await fire("brightline");
    const exposureId = await exposureOf(incidentId, "Summit Home Health");
    const rosa = await as("Rosa Alvarez");
    const before = await rosa.query(api.ai.getBreachFixAdvice, { exposureId });

    const held = await t.run(async (ctx) =>
      (await ctx.db.query("payments").withIndex("by_heldByIncidentId", (q) => q.eq("heldByIncidentId", incidentId)).take(50)).filter(
        (p) => p.companyId === before!.companyId && p.status === "held",
      ),
    );
    for (const p of held) expect(await rosa.mutation(api.payments.rejectPayment, { paymentId: p._id })).toEqual({ ok: true });
    await (await as("Kwame Mensah")).mutation(api.incidents.acknowledgeExposure, { exposureId });

    const after = await rosa.query(api.ai.getBreachFixAdvice, { exposureId });
    expect(ids(after)).toEqual(ids(before));
    expect(byId(after, "verify_payments")!.status).toBe("done");
    expect(byId(after, "bank_change")!.status).toBe("done");
    expect(byId(after, "acknowledge")!.status).toBe("done");
    expect(after!.summary).toBe(before!.summary);
  });

  test("every demo company gets the pre-generated text, in either firing order", async () => {
    const all = await seeded();
    const sources: string[] = [];
    for (const scenario of ["brightline", "ironcladCredential", "ironcladMsp", "armadinFinding"] as const) {
      const incidentId = await all.fire(scenario);
      const exposures = await all.t.run((ctx) =>
        ctx.db.query("exposures").withIndex("by_incidentId_and_companyId", (q) => q.eq("incidentId", incidentId)).take(50),
      );
      for (const e of exposures) {
        const brief = await (await all.as(PE)).query(api.ai.getBreachFixAdvice, { exposureId: e._id });
        sources.push(`${scenario} ${brief!.companyName} ${brief!.source}`);
      }
    }
    expect(sources.filter((s) => !s.endsWith("cache"))).toEqual([]);
    expect(sources).toHaveLength(12);

    // The red-team scenario fired alone (Cedar's pause is pre-approved, not lowered to one click).
    const alone = await seeded();
    const incidentId = await alone.fire("armadinFinding");
    const cedar = await (await alone.as(PE)).query(api.ai.getBreachFixAdvice, {
      exposureId: await alone.exposureOf(incidentId, "Cedar Ridge Manufacturing"),
    });
    expect(cedar!.source).toBe("cache");
  });
});
