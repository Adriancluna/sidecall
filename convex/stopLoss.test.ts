/// <reference types="vite/client" />
// Role 4: stop-loss advice (ai.getStopLossAdvice) on the demo seed: per-company scoping, the
// rules' picks, and that nothing reads the clock or a model.
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { DAY_MS, MAX_FANOUT } from "./shared";
import { BANK_CHANGE_WINDOW_DAYS } from "../prompts/stopLoss";

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
    // The old summary recommends revoking a same-vendor-only relationship. Changed
    // eligibility invalidates that cached copy rather than continuing to promise it.
    expect(ids(summit)).not.toContain("revoke_vendor_tokens");
    expect(summit.source).toBe("canned");
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
    expect(pinecrest.source).toBe("cache");
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
    expect(advice.companies).toHaveLength(14);
    expect(advice.portfolio).not.toBeNull();
    const rollup = advice.portfolio!;
    expect(rollup.scope).toBe("portfolio");
    expect(rollup.recommendations.every((r) => r.owner === "firm")).toBe(true);
    const holds = rollup.recommendations.find((r) => r.id === "portfolio:hold_payments")!;
    expect(holds.title).toBe("Ask 5 companies to turn on payment holds");
    expect(holds.why).toContain(
      "Fairhaven Physical Therapy, Granite Peak Software, Meridian Dental Group, Pinecrest Staffing and Wrenfield Fleet Software",
    );
    expect(ids(rollup)).toContain("portfolio:separate_credentials:Ironclad shared admin account");
  });

  test("unchanged facts retain AI copy while changed eligibility uses the current rules", async () => {
    const { as } = await seeded();
    const advice = await (await as(PE)).query(api.ai.getStopLossAdvice, { asOf: Date.now() });
    expect(advice.companies.find(c => c.companyName === "Pinecrest Staffing")?.source).toBe("cache");
    expect(advice.companies.find(c => c.companyName === "Summit Home Health")?.source).toBe("canned");
    expect(advice.companies.find(c => c.companyName === "Oakmont Specialty Pharmacy")?.summary).not.toContain("Your stop-losses are in place");
    expect(advice.portfolio?.source).toBe("canned");
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

  test("fresh bank changes appear with the same aging anchor and schedule their exact expiry", async () => {
    const { t, as } = await seeded();
    const anchor = Date.now();
    const changedAt = anchor + 10_000;
    await t.run(async ctx => {
      const asset = await ctx.db.query("assets").withIndex("by_name", q => q.eq("name", "Brightline Payroll")).unique();
      for (const change of await ctx.db.query("bankDetailChanges").take(100)) await ctx.db.delete("bankDetailChanges", change._id);
      await ctx.db.insert("bankDetailChanges", { assetId: asset!._id, changedAt,
        accountLast4: "7731", requestChannel: "email" });
    });
    const rosa = await as("Rosa Alvarez");
    const result = await rosa.query(api.ai.getStopLossAdvice, { asOf: anchor });
    expect(result.companies[0].recommendations[0].id).toBe("verify_bank_change:Brightline Payroll");
    const expiry = changedAt + BANK_CHANGE_WINDOW_DAYS * DAY_MS + 1;
    expect(result.nextReviewAt).toBe(expiry);
    const atBoundary = await rosa.query(api.ai.getStopLossAdvice, { asOf: expiry - 1 });
    expect(ids(atBoundary.companies[0])).toContain("verify_bank_change:Brightline Payroll");
    const after = await rosa.query(api.ai.getStopLossAdvice, { asOf: expiry });
    expect(ids(after.companies[0])).not.toContain("verify_bank_change:Brightline Payroll");
    expect(after.nextReviewAt).toBeNull();
  });

  test("later stronger links replace earlier relationships and share the incident response caps", async () => {
    const { t, as } = await seeded();
    await t.run(async ctx => {
      const asset = await ctx.db.query("assets").withIndex("by_name", q => q.eq("name", "Brightline Payroll")).unique();
      const company = await ctx.db.query("companies").withIndex("by_domain", q => q.eq("domain", "summithomehealth.example")).unique();
      await ctx.db.insert("links", { assetId: asset!._id, companyId: company!._id,
        shareType: "shared_credential", source: "dns_inferred" });
      await ctx.db.insert("links", { assetId: asset!._id, companyId: company!._id,
        shareType: "shared_credential", source: "self_reported" });
    });
    const contexts = await t.query(internal.ai.stopLossContexts, { asOf: Date.now() });
    const summit = contexts.find(c => c.companyName === "Summit Home Health")!;
    const payroll = summit.links.filter(l => l.assetName === "Brightline Payroll");
    expect(payroll).toHaveLength(1);
    expect(payroll[0]).toMatchObject({ shareType: "shared_credential", source: "self_reported",
      otherCompaniesSharingLogin: 2, responseCaps: [
        { action: "pause_shared_login", cap: "prepare" }, { action: "revoke_vendor_tokens", cap: "act" },
      ] });
    const result = await (await as("Rosa Alvarez")).query(api.ai.getStopLossAdvice, { asOf: Date.now() });
    expect(ids(result.companies[0])).toContain("separate_credentials:Brightline Payroll");
    expect(ids(result.companies[0])).not.toContain("confirm_candidate_link:Brightline Payroll");
    expect(result.readiness[0].assets.find(a => a.assetName === "Brightline Payroll")).toMatchObject({
      relationship: "shared_credential", source: "self_reported",
    });
  });

  test("same-vendor and inferred links cannot promise executable access controls", async () => {
    const { t, as } = await seeded();
    const rosa = await as("Rosa Alvarez");
    const sameVendor = await rosa.query(api.ai.getStopLossAdvice, { asOf: Date.now() });
    const payroll = sameVendor.readiness[0].assets.find(a => a.assetName === "Brightline Payroll")!;
    expect(payroll.actions.every(a => a.eligibleMode === null)).toBe(true);
    expect(ids(sameVendor.companies[0])).not.toContain("revoke_vendor_tokens");
    await t.run(async ctx => {
      const company = await ctx.db.query("companies").withIndex("by_domain", q => q.eq("domain", "summithomehealth.example")).unique();
      const asset = await ctx.db.query("assets").withIndex("by_name", q => q.eq("name", "Brightline Payroll")).unique();
      await ctx.db.insert("links", { companyId: company!._id, assetId: asset!._id,
        shareType: "shared_credential", source: "dns_inferred" });
    });
    const inferred = await rosa.query(api.ai.getStopLossAdvice, { asOf: Date.now() });
    const inferredPayroll = inferred.readiness[0].assets.find(a => a.assetName === "Brightline Payroll")!;
    expect(inferredPayroll.actions.every(a => a.eligibleMode === "notify")).toBe(true);
    expect(ids(inferred.companies[0])).not.toContain("pause_shared_login");
    expect(ids(inferred.companies[0])).not.toContain("separate_credentials:Brightline Payroll");
    expect(ids(inferred.companies[0])).toContain("confirm_candidate_link:Brightline Payroll");
  });

  test("a candidate sibling cannot establish a shared credential until the relationship is confirmed", async () => {
    const { t, as } = await seeded();
    const siblingLinkId = await t.run(async ctx => {
      const summit = await ctx.db.query("companies").withIndex("by_domain", q => q.eq("domain", "summithomehealth.example")).unique();
      const cedar = await ctx.db.query("companies").withIndex("by_domain", q => q.eq("domain", "cedarridge.example")).unique();
      const assetId = await ctx.db.insert("assets", { name: "Candidate sibling login", vendorName: "Test vendor", kind: "idp", phoneOnFile: "not on file" });
      await ctx.db.insert("links", { companyId: summit!._id, assetId, shareType: "shared_credential", source: "self_reported" });
      return await ctx.db.insert("links", { companyId: cedar!._id, assetId, shareType: "shared_credential", source: "dns_inferred" });
    });
    const contexts = await t.query(internal.ai.stopLossContexts, { asOf: Date.now() });
    const link = (name: string) => contexts.find(c => c.companyName === name)!.links.find(l => l.assetName === "Candidate sibling login")!;
    expect(link("Summit Home Health").otherCompaniesSharingLogin).toBe(0);
    expect(link("Cedar Ridge Manufacturing").otherCompaniesSharingLogin).toBe(0);
    const rosa = await as("Rosa Alvarez");
    const before = await rosa.query(api.ai.getStopLossAdvice, { asOf: Date.now() });
    expect(ids(before.companies[0])).not.toContain("separate_credentials:Candidate sibling login");
    await t.run(ctx => ctx.db.patch("links", siblingLinkId, { source: "self_reported" }));
    const confirmed = await t.query(internal.ai.stopLossContexts, { asOf: Date.now() });
    for (const name of ["Summit Home Health", "Cedar Ridge Manufacturing"])
      expect(confirmed.find(c => c.companyName === name)!.links.find(l => l.assetName === "Candidate sibling login")!.otherCompaniesSharingLogin).toBe(1);
    const after = await rosa.query(api.ai.getStopLossAdvice, { asOf: Date.now() });
    expect(ids(after.companies[0])).toContain("separate_credentials:Candidate sibling login");
  });

  test.each(["assets", "companies", "links", "payments", "changes", "users"] as const)("%s overflow is marked partial instead of silently claiming readiness", async table => {
    const { t, as } = await seeded();
    await t.run(async ctx => {
      const company = await ctx.db.query("companies").withIndex("by_domain", q => q.eq("domain", "summithomehealth.example")).unique();
      const asset = await ctx.db.query("assets").withIndex("by_name", q => q.eq("name", "Brightline Payroll")).unique();
      const existing = await ctx.db.query("payments").withIndex("by_companyId_and_status", q => q.eq("companyId", company!._id)).first();
      for (let n = 0; n <= MAX_FANOUT; n++) {
        if (table === "assets") await ctx.db.insert("assets", { name: `Extra vendor ${n}`, vendorName: `Extra ${n}`, kind: "other", phoneOnFile: "not on file" });
        if (table === "companies") await ctx.db.insert("companies", { name: `Private company ${n}`, domain: `extra-${n}.example`, sector: "Test", headcount: 1, holdRuleEnabled: false });
        if (table === "links") await ctx.db.insert("links", { companyId: company!._id, assetId: asset!._id, shareType: "same_vendor_only", source: "self_reported" });
        if (table === "payments") await ctx.db.insert("payments", { billId: existing!.billId,
          companyId: company!._id, assetId: asset!._id, amountCents: 100,
          accountLast4: "7731", status: "pending", requestedBy: existing!.requestedBy });
        if (table === "changes") await ctx.db.insert("bankDetailChanges", { assetId: asset!._id,
          changedAt: Date.now(), accountLast4: "7731", requestChannel: "email" });
        if (table === "users") await ctx.db.insert("users", { companyId: company!._id, name: `Extra clerk ${n}`, role: "ap_clerk" });
      }
    });
    const result = await (await as("Rosa Alvarez")).query(api.ai.getStopLossAdvice, { asOf: Date.now() });
    expect(result.readiness).toHaveLength(1);
    expect(result.readiness[0].status).toBe("partial");
    expect(result.companies[0].source).toBe("canned");
    expect(result.companies[0].summary).toMatch(/partial/i);
    expect(JSON.stringify(result)).not.toContain("Private company");
    expect(JSON.stringify(result)).not.toContain("companyNamesForValidation");
  });

  test("readiness distinguishes missing evidence, remains company-scoped, and writes no business state", async () => {
    const { t, as } = await seeded();
    await t.run(async ctx => {
      const company = await ctx.db.query("companies").withIndex("by_domain", q => q.eq("domain", "summithomehealth.example")).unique();
      for (const link of await ctx.db.query("links").take(100))
        if (link.companyId === company!._id) await ctx.db.delete("links", link._id);
      await ctx.db.patch("companies", company!._id, { holdRuleEnabled: false });
    });
    const state = () => t.run(async ctx => ({
      payments: await ctx.db.query("payments").take(100), policies: await ctx.db.query("responsePolicies").take(100),
      steps: await ctx.db.query("responseSteps").take(100), audits: await ctx.db.query("auditLog").take(100),
    }));
    const before = await state();
    const result = await (await as("Rosa Alvarez")).query(api.ai.getStopLossAdvice, { asOf: Date.now() });
    expect(result.readiness).toHaveLength(1);
    expect(result.readiness[0]).toMatchObject({ companyName: "Summit Home Health", status: "needs_evidence", paymentHoldsEnabled: false, assets: [] });
    expect(result.companies[0].summary).toContain("Payment holds are disabled");
    expect(result.portfolio).toBeNull();
    expect(JSON.stringify(result)).not.toContain("Pinecrest");
    expect(await state()).toEqual(before);
    const firm = await (await as(PE)).query(api.ai.getStopLossAdvice, { asOf: Date.now() });
    expect(firm.readiness).toHaveLength(14);
    expect(firm.readiness.find(c => c.companyName === "Summit Home Health")?.status).toBe("needs_evidence");
  });

  test.each([-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid aging anchor %s", async asOf => {
    const { t, as } = await seeded();
    await expect((await as("Rosa Alvarez")).query(api.ai.getStopLossAdvice, { asOf })).rejects.toThrow();
    await expect(t.query(internal.ai.stopLossContexts, { asOf })).rejects.toThrow();
  });
});
