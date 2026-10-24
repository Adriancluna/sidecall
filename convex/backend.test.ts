/// <reference types="vite/client" />
// The guarantees we claim on stage, checked against the real functions:
// idempotent replay, atomic fan-out, race-safe acknowledge, segregation of duties,
// balanced ledger, per-company scoping, session-only identity, and
// "same vendor ≠ shared weakness".
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
const PE = "Jordan Ames (Northpass Capital)";

async function seeded() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const userId = (name: string) =>
    t.run(async (ctx) => {
      const user = (await ctx.db.query("users").take(200)).find((u) => u.name === name);
      if (!user) throw new Error(`no seed user ${name}`);
      return user._id;
    });
  // Signed in as a seeded person. Convex Auth puts "<userId>|<sessionId>" in the JWT subject.
  const as = async (name: string) =>
    t.withIdentity({ subject: `${await userId(name)}|session` });
  const companyId = (name: string) =>
    t.run(async (ctx) => {
      const company = (await ctx.db.query("companies").take(100)).find((c) => c.name === name);
      if (!company) throw new Error(`no seed company ${name}`);
      return company._id;
    });
  const fire = async (args = BRIGHTLINE) => {
    const result = await t.mutation(internal.incidents.recordIncident, args);
    if (!result.ok) throw new Error(result.error);
    return result;
  };
  return { t, as, userId, companyId, fire };
}

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
    const { as, fire } = await seeded();
    const { incidentId } = await fire();
    const blast = await (await as(PE)).query(api.blastRadius.getBlastRadius, { incidentId });
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
    const { t, as, fire } = await seeded();
    await fire();
    const outcomes = await t.query(internal.scoring.exportOutcomes, {
      externalId: BRIGHTLINE.externalId,
    });
    const byRef = Object.fromEntries(outcomes!.payments.map((p) => [p.seedRef, p]));
    expect(byRef.pay_C_brightline_480k).toMatchObject({ held: true, bankChangeFlag: true });
    expect(byRef.pay_B_brightline_92k).toMatchObject({ held: true, bankChangeFlag: false });
    expect(byRef.pay_H_brightline_35k).toMatchObject({ held: false, status: "pending" }); // opted out
    expect(byRef.pay_B_brightline_paid).toMatchObject({ held: false, status: "paid" });

    const [summit] = await (await as("Jamie Chen")).query(api.payments.getHeldPayments, {});
    expect(summit.bankChange).toMatchObject({
      accountLast4: "7731",
      previousAccountLast4: "4419", // also an email change: suspect
      lastVerifiedAccountLast4: "2208", // the account confirmed by phone
    });
  });

  test("same vendor is not a shared weakness", async () => {
    const { as, fire } = await seeded();
    const { incidentId } = await fire({
      externalId: "demo-ironclad-cred-002",
      assetName: "Ironclad shared admin account",
      reportedByDomain: "pinecreststaffing.example",
    });
    const blast = await (await as(PE)).query(api.blastRadius.getBlastRadius, { incidentId });
    const summit = blast!.nodes.find((n) => n.name === "Summit Home Health");
    expect(summit).toMatchObject({ exposed: false, relation: "same_vendor_separate_access" });
    expect(blast!.totals.paymentsHeld).toBe(0); // a leaked login is not the vendor's payee account
  });
});

describe("acknowledge", () => {
  test("two simultaneous clicks: exactly one wins", async () => {
    const { as, fire } = await seeded();
    await fire();
    const controller = await as("Rosa Alvarez");
    const itLead = await as("Kwame Mensah");
    const [exposure] = await controller.query(api.blastRadius.getMyExposures, {});
    const results = await Promise.all([
      controller.mutation(api.incidents.acknowledgeExposure, { exposureId: exposure._id }),
      itLead.mutation(api.incidents.acknowledgeExposure, { exposureId: exposure._id }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, reason: "already_acknowledged" });
  });

  test("another company cannot acknowledge your exposure", async () => {
    const { as, fire } = await seeded();
    await fire();
    const [exposure] = await (await as("Rosa Alvarez")).query(api.blastRadius.getMyExposures, {});
    const result = await (await as("Tom Becker")).mutation(api.incidents.acknowledgeExposure, {
      exposureId: exposure._id,
    });
    expect(result).toEqual({ ok: false, reason: "not_your_company" });
  });
});

describe("payment release", () => {
  async function heldPayment() {
    const s = await seeded();
    await s.fire();
    const clerk = await s.as("Jamie Chen"); // requested the $480K
    const [row] = await clerk.query(api.payments.getHeldPayments, {});
    return { ...s, clerk, paymentId: row.payment._id };
  }

  test("requester, other companies and the PE firm are refused, and each refusal is logged", async () => {
    const { as, clerk, paymentId } = await heldPayment();
    const args = { paymentId, verificationNote: "Called the number on file" };
    for (const actor of [clerk, await as("Elena Ruiz"), await as(PE)]) {
      expect((await actor.mutation(api.payments.releasePayment, args)).ok).toBe(false);
    }
    const audit = await clerk.query(api.payments.getPaymentAudit, { paymentId });
    expect(audit.filter((a) => a.action === "refused").map((a) => a.rule)).toEqual([
      "segregation_of_duties",
      "controller_at_company",
      "controller_at_company",
    ]);
  });

  test("controller release needs a note, pays once, and moves cash", async () => {
    const { as, paymentId } = await heldPayment();
    const controller = await as("Rosa Alvarez");
    const ledger = () => controller.query(api.payments.getLedger, {});
    const cashBefore = (await ledger())!.balances.cash;

    expect(
      await controller.mutation(api.payments.releasePayment, { paymentId, verificationNote: "  " }),
    ).toMatchObject({ ok: false });
    expect((await ledger())!.balances.cash).toBe(cashBefore); // held money never moves

    const args = { paymentId, verificationNote: "Called +1 415 555-0142, confirmed" };
    expect(await controller.mutation(api.payments.releasePayment, args)).toEqual({ ok: true });
    expect(await controller.mutation(api.payments.releasePayment, args)).toMatchObject({ ok: false });

    const after = (await ledger())!.balances;
    expect(cashBefore - after.cash).toBe(48_000_000);
    expect(after.accounts_payable).toBe(0);
  });

  test("reject leaves cash and the bill untouched", async () => {
    const { as, paymentId } = await heldPayment();
    const controller = await as("Rosa Alvarez");
    const before = (await controller.query(api.payments.getLedger, {}))!.balances;
    expect(await controller.mutation(api.payments.rejectPayment, { paymentId })).toEqual({ ok: true });
    expect((await controller.query(api.payments.getLedger, {}))!.balances).toEqual(before);
  });

  test("every ledger entry balances", async () => {
    const { t, as, paymentId } = await heldPayment();
    await (await as("Rosa Alvarez")).mutation(api.payments.releasePayment, {
      paymentId,
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

describe("controls log", () => {
  test("PE sees every company's rows, a company only its own", async () => {
    const { as, fire } = await seeded();
    const { incidentId } = await fire();
    const peRows = await (await as(PE)).query(api.payments.getIncidentAudit, { incidentId });
    const summitRows = await (await as("Jamie Chen")).query(api.payments.getIncidentAudit, { incidentId });
    expect(new Set(peRows.map((r) => r.companyName))).toEqual(
      new Set(["Summit Home Health", "Cedar Ridge Manufacturing", "Bayview Veterinary Partners"]),
    );
    expect(peRows.filter((r) => r.action === "hold")).toHaveLength(4);
    expect(peRows.filter((r) => r.action === "flag")).toHaveLength(2);
    expect(new Set(summitRows.map((r) => r.companyName))).toEqual(new Set(["Summit Home Health"]));
  });
});

describe("scoping", () => {
  test("a company never sees another company's data or who reported", async () => {
    const { as, fire, companyId } = await seeded();
    const { incidentId } = await fire();
    const cedarClerk = await as("Tom Becker");

    expect(await cedarClerk.query(api.blastRadius.getBlastRadius, { incidentId })).toBeNull();
    expect(await cedarClerk.query(api.alerts.getIncidentAlerts, { incidentId })).toEqual([]);

    const held = await cedarClerk.query(api.payments.getHeldPayments, {
      incidentId,
      companyId: await companyId("Summit Home Health"), // asking for someone else's company
    });
    expect(held.map((r) => r.companyName)).toEqual(["Cedar Ridge Manufacturing"]);

    const [incident] = await cedarClerk.query(api.blastRadius.listIncidents, {});
    expect(incident).toMatchObject({ reportedByCompanyId: null, summary: null });

    for (const alert of await cedarClerk.query(api.alerts.getMyAlerts, {})) {
      expect(alert.body).not.toContain("Pinecrest");
    }
  });
});

describe("identity", () => {
  test("signed-out calls are refused", async () => {
    const { t } = await seeded();
    await expect(t.query(api.blastRadius.getMyExposures, {})).rejects.toThrow(/Not signed in/);
    await expect(t.query(api.payments.getLedger, {})).rejects.toThrow(/Not signed in/);
  });

  test("functions no longer accept a user id from the client", async () => {
    const { as, userId } = await seeded();
    const clerk = await as("Jamie Chen");
    await expect(
      // @ts-expect-error actingUserId was removed from the API
      clerk.query(api.blastRadius.getMyExposures, { actingUserId: await userId("Rosa Alvarez") }),
    ).rejects.toThrow(/actingUserId/);
  });
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
