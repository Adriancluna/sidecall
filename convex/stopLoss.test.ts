/// <reference types="vite/client" />
// Role 4: stop-loss advice (ai.getStopLossAdvice) on the demo seed: per-company scoping, the
// rules' picks, and that nothing reads the clock or a model.
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const PE = "Jordan Ames (Northpass Capital)";

async function seeded() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const as = async (name: string) => {
    const user = await t.run(async (ctx) =>
      (await ctx.db.query("users").take(200)).find((u) => u.name === name),
    );
    if (!user) throw new Error(`no user ${name}`);
    return t.withIdentity({ subject: `${user._id}|session` });
  };
  return { t, as };
}

const ids = (brief: { recommendations: { id: string }[] }) =>
  brief.recommendations.map((r) => r.id);

describe("stop-loss advice", () => {
  test("a company sees only its own brief, never the portfolio rollup", async () => {
    const { as } = await seeded();
    const advice = await (await as("Rosa Alvarez")).query(api.ai.getStopLossAdvice, { asOf: Date.now() });
    expect(advice.portfolio).toBeNull();
    expect(advice.companies.map((c) => c.companyName)).toEqual(["Summit Home Health"]);
    const text = JSON.stringify(advice);
    for (const other of ["Pinecrest", "Cedar Ridge", "Bayview", "Granite Peak", "Meridian", "Alder", "Harborline"])
      expect(text).not.toContain(other);
  });

  test("Summit: verify the email bank change behind the $480K first", async () => {
    const { as } = await seeded();
    const [summit] = (await (await as("Rosa Alvarez")).query(api.ai.getStopLossAdvice, { asOf: Date.now() })).companies;
    expect(summit.recommendations[0]).toMatchObject({
      id: "verify_bank_change:Brightline Payroll",
      priority: "now",
      owner: "controller",
      playbookAction: null,
    });
    expect(summit.recommendations[0].why).toContain("$480,000");
    expect(summit.recommendations[0].why).toContain("7731");
    // Holds are already on at Summit, and it has no shared login: neither is recommended.
    expect(ids(summit)).not.toContain("hold_payments");
    expect(ids(summit)).not.toContain("pause_shared_login");
    // The pre-generated summary in data/ai_stop_loss.json matches the seed's facts.
    expect(summit.source).toBe("cache");
  });

  test("Pinecrest: holds off, shared logins, no IT lead", async () => {
    const { as } = await seeded();
    const [pinecrest] = (await (await as("Sofia Bianchi")).query(api.ai.getStopLossAdvice, { asOf: Date.now() })).companies;
    expect(ids(pinecrest)).toEqual(
      expect.arrayContaining([
        "hold_payments",
        "pause_shared_login",
        "separate_credentials:Brightline Payroll",
        "separate_credentials:Ironclad shared admin account",
        "name_it_contact",
      ]),
    );
    const hold = pinecrest.recommendations.find((r) => r.id === "hold_payments")!;
    expect(hold).toMatchObject({ priority: "now", playbookAction: "hold_payments", recommendedMode: "act" });
    // No IT lead on file, so login steps fall to the controller.
    expect(pinecrest.recommendations.find((r) => r.id === "pause_shared_login")!.owner).toBe("controller");
  });

  test("Cedar Ridge already prepared its playbook: no pause or revoke advice", async () => {
    const { as } = await seeded();
    const [cedar] = (await (await as("Elena Ruiz")).query(api.ai.getStopLossAdvice, { asOf: Date.now() })).companies;
    expect(ids(cedar)).not.toContain("pause_shared_login");
    expect(ids(cedar)).not.toContain("revoke_vendor_tokens");
    expect(ids(cedar)).toContain("separate_credentials:Ironclad shared admin account");
  });

  test("an old bank change is not flagged; a candidate DNS link asks to confirm, never 'validated'", async () => {
    const { as } = await seeded();
    // Two years on, every bank change in the seed is outside the 90-day window.
    const [bayview] = (await (await as("Grant Holloway")).query(api.ai.getStopLossAdvice, {
      asOf: Date.now() + 2 * 365 * 24 * 3600 * 1000,
    })).companies;
    expect(ids(bayview).some((id) => id.startsWith("verify_bank_change"))).toBe(false);
    expect(ids(bayview)).toContain("confirm_candidate_link:Brightline Payroll");
    expect(JSON.stringify(bayview)).not.toMatch(/validated/i);
  });

  test("the PE firm gets the portfolio rollup and every company", async () => {
    const { as } = await seeded();
    const advice = await (await as(PE)).query(api.ai.getStopLossAdvice, { asOf: Date.now() });
    expect(advice.companies).toHaveLength(8);
    expect(advice.portfolio).not.toBeNull();
    const rollup = advice.portfolio!;
    expect(rollup.scope).toBe("portfolio");
    expect(rollup.recommendations.every((r) => r.owner === "firm")).toBe(true);
    const holds = rollup.recommendations.find((r) => r.id === "portfolio:hold_payments")!;
    expect(holds.title).toBe("Ask 3 companies to turn on payment holds");
    expect(holds.why).toContain("Granite Peak Software, Meridian Dental Group and Pinecrest Staffing");
    expect(ids(rollup)).toContain("portfolio:separate_credentials:Ironclad shared admin account");
  });

  test("every seeded brief uses its pre-generated summary", async () => {
    const { as } = await seeded();
    const advice = await (await as(PE)).query(api.ai.getStopLossAdvice, { asOf: Date.now() });
    expect([advice.portfolio!, ...advice.companies].map((b) => b.source)).toEqual(Array(9).fill("cache"));
  });

  test("firing an incident doesn't change the advice (held payments still count as unpaid)", async () => {
    const { t, as } = await seeded();
    const rosa = await as("Rosa Alvarez");
    const before = await rosa.query(api.ai.getStopLossAdvice, { asOf: Date.now() });
    await t.mutation(internal.seed.fireDemoIncident, { scenario: "brightline" });
    const after = await rosa.query(api.ai.getStopLossAdvice, { asOf: Date.now() });
    expect(after).toEqual(before);
  });

  test("signed out is refused", async () => {
    const { t } = await seeded();
    await expect(t.query(api.ai.getStopLossAdvice, { asOf: Date.now() })).rejects.toThrow(/Not signed in/);
  });
});
