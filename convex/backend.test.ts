/// <reference types="vite/client" />
// The guarantees we claim on stage, checked against the real functions:
// idempotent replay, atomic fan-out, race-safe acknowledge, segregation of duties,
// balanced ledger, per-company scoping, and "same vendor ≠ shared weakness".
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const BRIGHTLINE = {
  externalId: "demo-brightline-001",
  assetName: "Brightline Payroll",
  reportedByDomain: "pinecreststaffing.example",
};

async function seeded() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const userId = (name: string) =>
    t.run(async (ctx) => {
      const users = await ctx.db.query("users").take(200);
      const user = users.find((u) => u.name === name);
      if (!user) throw new Error(`no seed user ${name}`);
      return user._id;
    });
  const companyId = (name: string) =>
    t.run(async (ctx) => {
      const companies = await ctx.db.query("companies").take(100);
      const company = companies.find((c) => c.name === name);
      if (!company) throw new Error(`no seed company ${name}`);
      return company._id;
    });
  const fire = async (args = BRIGHTLINE) => {
    const result = await t.mutation(internal.incidents.recordIncident, args);
    if (!result.ok) throw new Error(result.error);
    return result;
  };
  return { t, userId, companyId, fire };
}

const PE = "Jordan Ames (Northpass Capital)";

describe("incident intake", () => {
  test("replaying the webhook writes nothing new", async () => {
    const { t, fire } = await seeded();
    const first = await fire();
    const counts = () =>
      t.run(async (ctx) => ({
        incidents: (await ctx.db.query("incidents").take(100)).length,
        exposures: (await ctx.db.query("exposures").take(100)).length,
        alerts: (await ctx.db.query("alerts").take(100)).length,
        audit: (await ctx.db.query("auditLog").take(100)).length,
      }));
    const before = await counts();
    const replay = await fire();
    expect(replay).toEqual({ ok: true, incidentId: first.incidentId, duplicate: true });
    expect(await counts()).toEqual(before);
  });

  test("one write fans out to the demo headline numbers", async () => {
    const { t, fire, userId } = await seeded();
    const { incidentId } = await fire();
    const blast = await t.query(api.blastRadius.getBlastRadius, {
      incidentId,
      actingUserId: await userId(PE),
    });
    expect(blast?.totals).toEqual({
      companiesExposed: 3,
      peopleExposed: 4200,
      heldCents: 61_200_000,
      paymentsHeld: 4,
    });
    const urgency = Object.fromEntries(
      blast!.nodes.filter((n) => n.exposed).map((n) => [n.name, n.urgency]),
    );
    expect(urgency).toEqual({
      "Cedar Ridge Manufacturing": "urgent",
      "Summit Home Health": "urgent",
      "Bayview Veterinary Partners": "advisory",
    });
  });

  test("only payments to recently changed accounts are flagged", async () => {
    const { t, fire } = await seeded();
    await fire();
    const outcomes = await t.query(internal.scoring.exportOutcomes, {
      externalId: BRIGHTLINE.externalId,
    });
    const byRef = Object.fromEntries(outcomes!.payments.map((p) => [p.seedRef, p]));
    expect(byRef.pay_C_brightline_480k).toMatchObject({ held: true, bankChangeFlag: true });
    expect(byRef.pay_B_brightline_92k).toMatchObject({ held: true, bankChangeFlag: false });
    expect(byRef.pay_H_brightline_35k).toMatchObject({ held: false, status: "pending" }); // opted out
    expect(byRef.pay_B_brightline_paid).toMatchObject({ held: false, status: "paid" });
  });

  test("same vendor is not a shared weakness", async () => {
    const { t, fire, userId } = await seeded();
    const { incidentId } = await fire({
      externalId: "demo-ironclad-cred-002",
      assetName: "Ironclad shared admin account",
      reportedByDomain: "pinecreststaffing.example",
    });
    const blast = await t.query(api.blastRadius.getBlastRadius, {
      incidentId,
      actingUserId: await userId(PE),
    });
    const summit = blast!.nodes.find((n) => n.name === "Summit Home Health");
    expect(summit).toMatchObject({ exposed: false, relation: "same_vendor_separate_access" });
    expect(blast!.totals.paymentsHeld).toBe(0); // a leaked login is not the vendor's payee account
  });
});

describe("acknowledge", () => {
  test("two simultaneous clicks: exactly one wins", async () => {
    const { t, fire, userId } = await seeded();
    await fire();
    const controller = await userId("Rosa Alvarez");
    const it = await userId("Kwame Mensah");
    const [exposure] = await t.query(api.blastRadius.getMyExposures, { actingUserId: controller });
    const results = await Promise.all([
      t.mutation(api.incidents.acknowledgeExposure, { exposureId: exposure._id, actingUserId: controller }),
      t.mutation(api.incidents.acknowledgeExposure, { exposureId: exposure._id, actingUserId: it }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, reason: "already_acknowledged" });
  });

  test("another company cannot acknowledge your exposure", async () => {
    const { t, fire, userId } = await seeded();
    await fire();
    const [exposure] = await t.query(api.blastRadius.getMyExposures, {
      actingUserId: await userId("Rosa Alvarez"),
    });
    const result = await t.mutation(api.incidents.acknowledgeExposure, {
      exposureId: exposure._id,
      actingUserId: await userId("Tom Becker"),
    });
    expect(result).toEqual({ ok: false, reason: "not_your_company" });
  });
});

describe("payment release", () => {
  async function heldPayment() {
    const s = await seeded();
    await s.fire();
    const clerk = await s.userId("Jamie Chen"); // requested the $480K
    const [row] = await s.t.query(api.payments.getHeldPayments, { actingUserId: clerk });
    return { ...s, clerk, paymentId: row.payment._id };
  }

  test("requester, other companies and the PE firm are refused, and each refusal is logged", async () => {
    const { t, userId, clerk, paymentId } = await heldPayment();
    const note = "Called the number on file";
    for (const actor of [clerk, await userId("Elena Ruiz"), await userId(PE)]) {
      const result = await t.mutation(api.payments.releasePayment, {
        paymentId,
        actingUserId: actor,
        verificationNote: note,
      });
      expect(result.ok).toBe(false);
    }
    const audit = await t.query(api.payments.getPaymentAudit, { paymentId, actingUserId: clerk });
    expect(audit.filter((a) => a.action === "refused").map((a) => a.rule)).toEqual([
      "segregation_of_duties",
      "controller_at_company",
      "controller_at_company",
    ]);
  });

  test("controller release needs a note, pays once, and moves cash", async () => {
    const { t, userId, paymentId } = await heldPayment();
    const controller = await userId("Rosa Alvarez");
    const ledger = () => t.query(api.payments.getLedger, { actingUserId: controller });
    const cashBefore = (await ledger())!.balances.cash;

    expect(
      await t.mutation(api.payments.releasePayment, { paymentId, actingUserId: controller, verificationNote: "  " }),
    ).toMatchObject({ ok: false });
    expect((await ledger())!.balances.cash).toBe(cashBefore); // held money never moves

    const args = { paymentId, actingUserId: controller, verificationNote: "Called +1 415 555-0142, confirmed" };
    expect(await t.mutation(api.payments.releasePayment, args)).toEqual({ ok: true });
    expect(await t.mutation(api.payments.releasePayment, args)).toMatchObject({ ok: false });

    const after = (await ledger())!.balances;
    expect(cashBefore - after.cash).toBe(48_000_000);
    expect(after.accounts_payable).toBe(0);
  });

  test("reject leaves cash and the bill untouched", async () => {
    const { t, userId, paymentId } = await heldPayment();
    const controller = await userId("Rosa Alvarez");
    const before = (await t.query(api.payments.getLedger, { actingUserId: controller }))!.balances;
    expect(await t.mutation(api.payments.rejectPayment, { paymentId, actingUserId: controller })).toEqual({ ok: true });
    const after = (await t.query(api.payments.getLedger, { actingUserId: controller }))!.balances;
    expect(after).toEqual(before);
  });

  test("every ledger entry balances", async () => {
    const { t, userId, paymentId } = await heldPayment();
    await t.mutation(api.payments.releasePayment, {
      paymentId,
      actingUserId: await userId("Rosa Alvarez"),
      verificationNote: "Verified by phone",
    });
    const entries = await t.run((ctx) => ctx.db.query("ledgerEntries").take(500));
    for (const entry of entries) {
      const debits = entry.lines.reduce((s, l) => s + l.debitCents, 0);
      const credits = entry.lines.reduce((s, l) => s + l.creditCents, 0);
      expect(debits, entry.memo).toBe(credits);
    }
  });
});

describe("scoping", () => {
  test("a company never sees another company's data or who reported", async () => {
    const { t, fire, userId, companyId } = await seeded();
    const { incidentId } = await fire();
    const cedarClerk = await userId("Tom Becker");
    const summit = await companyId("Summit Home Health");

    expect(await t.query(api.blastRadius.getBlastRadius, { incidentId, actingUserId: cedarClerk })).toBeNull();
    expect(await t.query(api.alerts.getIncidentAlerts, { incidentId, actingUserId: cedarClerk })).toEqual([]);

    const held = await t.query(api.payments.getHeldPayments, {
      incidentId,
      companyId: summit, // asking for someone else's company
      actingUserId: cedarClerk,
    });
    expect(held.map((r) => r.companyName)).toEqual(["Cedar Ridge Manufacturing"]);

    const [incident] = await t.query(api.blastRadius.listIncidents, { actingUserId: cedarClerk });
    expect(incident).toMatchObject({ reportedByCompanyId: null, summary: null });

    const alerts = await t.query(api.alerts.getMyAlerts, { actingUserId: cedarClerk });
    for (const alert of alerts) expect(alert.body).not.toContain("Pinecrest");
  });
});

describe("identity", () => {
  test("signed-out calls with no actingUserId are refused", async () => {
    const { t } = await seeded();
    await expect(t.query(api.blastRadius.getMyExposures, {})).rejects.toThrow(/Not signed in/);
  });

  test("a signed-in session beats a spoofed actingUserId", async () => {
    const { t, fire, userId } = await seeded();
    await fire();
    const clerk = await userId("Jamie Chen");
    // Convex Auth puts "<userId>|<sessionId>" in the JWT subject.
    const asClerk = t.withIdentity({ subject: `${clerk}|session` });
    const [row] = await asClerk.query(api.payments.getHeldPayments, {});
    const result = await asClerk.mutation(api.payments.releasePayment, {
      paymentId: row.payment._id,
      actingUserId: await userId("Rosa Alvarez"), // claims to be the controller
      verificationNote: "spoof",
    });
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/requested/) });
  });
});

describe("REQUIRE_SESSION", () => {
  /* eslint-disable @convex-dev/no-process-env */
  afterEach(() => {
    delete process.env.REQUIRE_SESSION;
  });
  test("when on, actingUserId alone no longer works", async () => {
    const { t, userId } = await seeded();
    const clerk = await userId("Jamie Chen");
    await expect(t.query(api.blastRadius.getMyExposures, { actingUserId: clerk })).resolves.toEqual([]);
    process.env.REQUIRE_SESSION = "true";
    await expect(t.query(api.blastRadius.getMyExposures, { actingUserId: clerk })).rejects.toThrow(/Not signed in/);
    const signedIn = t.withIdentity({ subject: `${clerk}|session` });
    await expect(signedIn.query(api.blastRadius.getMyExposures, {})).resolves.toEqual([]);
  });
  /* eslint-enable @convex-dev/no-process-env */
});

// Tests set the deployment env var directly; convex-test exposes process.env as the typed env.
/* eslint-disable @convex-dev/no-process-env */
describe("demo reset", () => {
  const original = process.env.DEMO_MODE;
  beforeEach(() => {
    delete process.env.DEMO_MODE;
  });
  afterEach(() => {
    process.env.DEMO_MODE = original;
  });

  test("refuses unless DEMO_MODE=true", async () => {
    const { t } = await seeded();
    await expect(t.mutation(api.seed.resetDemo, {})).rejects.toThrow(/DEMO_MODE/);
    process.env.DEMO_MODE = "true";
    await expect(t.mutation(api.seed.resetDemo, {})).resolves.toMatchObject({ companies: 8 });
  });
});
