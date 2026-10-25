/// <reference types="vite/client" />
// The guarantees we claim on stage, checked against the real functions:
// idempotent replay, atomic fan-out, race-safe acknowledge, segregation of duties,
// balanced ledger, per-company scoping, session-only identity, and
// "same vendor ≠ shared weakness".
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { parseCsv } from "./imports";
import lakesideVendors from "../data/samples/lakeside-vendor-master.csv?raw";
import lakesideBills from "../data/samples/lakeside-open-bills.csv?raw";

const modules = import.meta.glob("./**/*.ts");

const BRIGHTLINE = {
  externalId: "demo-brightline-001",
  assetName: "Brightline Payroll",
  reportedByDomain: "pinecreststaffing.example",
};
const PE = "Jordan Ames (Northpass Capital)";
const IRONCLAD_CREDENTIAL = {
  externalId: "demo-ironclad-cred-002",
  assetName: "Ironclad shared admin account",
  reportedByDomain: "pinecreststaffing.example",
};
// The spec's example finding as a sender would post it (docs/specs/armadin-one-step-ahead.md A6).
const FINDING = {
  source: "armadin",
  findingId: "ARM-2026-0412",
  validatedAt: "2026-10-24T08:12:00Z",
  scope: { organizationDomain: "pinecreststaffing.example", engagementId: "ENG-PINECREST-Q4" },
  technique: { id: "T1078", name: "Valid Accounts" },
  path: [
    { kind: "foothold", label: "Exposed RDP on PC-OPS-12", validated: true },
    { kind: "system", label: "pinecrest-jump01", validated: true },
    { kind: "credential", label: "Ironclad shared admin (ironclad-svc) in jump-host script", validated: true },
  ],
  terminalAsset: { assetName: "Ironclad shared admin account", kind: "credential" },
  evidence: [{ kind: "session", summary: "Interactive logon as ironclad-svc on pinecrest-jump01 08:09 UTC" }],
  confidence: 0.92,
};
// The same finding as stored (what recordIncident takes).
const PINECREST_FINDING_STORED = {
  source: "armadin" as const,
  findingId: "ARM-2026-0412",
  validatedAt: Date.parse("2026-10-24T08:12:00Z"),
  technique: { id: "T1078", name: "Valid Accounts" },
  terminalKind: "credential" as const,
  path: [{ kind: "credential" as const, label: "Ironclad shared admin (ironclad-svc) in jump-host script" }],
  evidence: [],
  confidence: 0.92,
};

async function seeded() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
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
    expect(replay).toEqual({ ok: true, incidentId: first.incidentId, duplicate: true, correlated: false });
    expect(await counts()).toEqual(before);
  });

  test("one write fans out to the demo headline numbers", async () => {
    const { as, fire } = await seeded();
    const { incidentId } = await fire();
    const blast = await (await as(PE)).query(api.blastRadius.getBlastRadius, { incidentId });
    expect(blast?.totals).toEqual({
      companiesExposed: 3,
      companiesNotified: 3,
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
    return { ...s, clerk, paymentId: row.payment._id,
      verification: { context: row.releaseContext!, confirmedAccountLast4: row.payment.accountLast4, calledPhoneOnFile: true } };
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
    const { as, paymentId, verification } = await heldPayment();
    const controller = await as("Rosa Alvarez");
    const ledger = () => controller.query(api.payments.getLedger, {});
    const { cash: cashBefore, accounts_payable: apBefore } = (await ledger())!.balances;

    expect(
      await controller.mutation(api.payments.releasePayment, { paymentId, verification, verificationNote: "  " }),
    ).toMatchObject({ ok: false });
    expect((await ledger())!.balances.cash).toBe(cashBefore); // held money never moves

    expect(
      await controller.mutation(api.payments.releasePayment, { paymentId, verification, verificationNote: "480000" }),
    ).toMatchObject({ ok: false }); // an amount is not a verification

    const args = {
      paymentId, verification,
      verificationNote: "Called Brightline at +1 415 555-0142, they confirmed account 7731",
    };
    expect(await controller.mutation(api.payments.releasePayment, args)).toEqual({ ok: true });
    expect(await controller.mutation(api.payments.releasePayment, args)).toMatchObject({ ok: false });

    const [row] = await controller.query(api.payments.getHeldPayments, {});
    expect(row.notice).toBeNull(); // no "held until verified" text on a paid payment
    expect(row.decision).toMatchObject({ status: "paid", byName: "Rosa Alvarez", note: args.verificationNote });

    const after = (await ledger())!.balances;
    expect(cashBefore - after.cash).toBe(48_000_000);
    expect(apBefore - after.accounts_payable).toBe(48_000_000);
  });

  test("reject leaves cash and the bill untouched", async () => {
    const { as, paymentId } = await heldPayment();
    const controller = await as("Rosa Alvarez");
    const before = (await controller.query(api.payments.getLedger, {}))!.balances;
    expect(await controller.mutation(api.payments.rejectPayment, { paymentId })).toEqual({ ok: true });
    expect((await controller.query(api.payments.getLedger, {}))!.balances).toEqual(before);
  });

  test("every ledger entry balances", async () => {
    const { t, as, paymentId, verification } = await heldPayment();
    await (await as("Rosa Alvarez")).mutation(api.payments.releasePayment, {
      paymentId, verification,
      verificationNote: "Called the number on file, vendor confirmed the account",
    });
    const entries = await t.run((ctx) => ctx.db.query("ledgerEntries").take(500));
    for (const entry of entries) {
      const debits = entry.lines.reduce((s, l) => s + l.debitCents, 0);
      const credits = entry.lines.reduce((s, l) => s + l.creditCents, 0);
      expect(debits, entry.memo).toBe(credits);
    }
  });
});

describe("escalation (knows when to ask)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("a hold due within 24h is escalated to the controller at once; others wait", async () => {
    const { t, as, fire } = await seeded();
    await fire();
    const payments = await t.run((ctx) => ctx.db.query("payments").take(50));
    const escalated = payments.filter((p) => p.escalatedAt !== undefined).map((p) => p.seedRef);
    expect(escalated).toEqual(["pay_C_brightline_480k"]); // due in 20h

    const alerts = await (await as("Rosa Alvarez")).query(api.alerts.getMyAlerts, {});
    const escalation = alerts.find((a) => a.kind === "escalation");
    expect(escalation?.body).toMatch(/Rosa Alvarez/);
    expect(escalation?.body).not.toMatch(/fraud/i);
  });

  test("the cron escalates the rest once they come due, exactly once", async () => {
    const { t, fire } = await seeded();
    await fire();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 2.5 * 24 * 60 * 60 * 1000); // other bills are due at +72h
    expect(await t.mutation(internal.payments.escalateDueHolds, {})).toEqual({ escalated: 3 });
    expect(await t.mutation(internal.payments.escalateDueHolds, {})).toEqual({ escalated: 0 });
  });
});

describe("timeline", () => {
  test("holds land in the report's own transaction; a company sees only its events", async () => {
    const { as, fire } = await seeded();
    const { incidentId } = await fire();
    const firm = await (await as(PE)).query(api.blastRadius.getIncidentTimeline, { incidentId });
    expect(firm!.stats.holdsInReportTransaction).toBe(true);
    const count = (kind: string) => firm!.events.filter((e) => e.kind === kind).length;
    expect([count("reported"), count("hold"), count("flag"), count("escalate")]).toEqual([1, 4, 2, 1]);

    const summit = await (await as("Jamie Chen")).query(api.blastRadius.getIncidentTimeline, { incidentId });
    const names = new Set(summit!.events.map((e) => e.companyName).filter(Boolean));
    expect(names).toEqual(new Set(["Summit Home Health"]));
    expect(JSON.stringify(summit)).not.toContain("Pinecrest");
  });
});

describe("payment requests", () => {
  test("a payment requested after the incident is held and flagged on creation", async () => {
    const { as, fire } = await seeded();
    const clerk = await as("Jamie Chen");
    const unpaid = (await clerk.query(api.payments.getMyBills, {})).find((b) => b.payment === null)!;
    expect(unpaid.bill.description).toBe("November payroll processing");

    await fire();
    const result = await clerk.mutation(api.payments.requestPayment, { billId: unpaid.bill._id });
    expect(result).toMatchObject({ ok: true, held: true, flagged: true }); // pays the email-changed 7731
    if (!result.ok) throw new Error(result.reason);

    const audit = await clerk.query(api.payments.getPaymentAudit, { paymentId: result.paymentId });
    expect(audit.map((a) => a.rule)).toEqual(
      expect.arrayContaining(["hold_payments_requested_during_incident", "bank_change_within_30_days"]),
    );
    expect(await clerk.mutation(api.payments.requestPayment, { billId: unpaid.bill._id })).toMatchObject({ ok: false });
  });

  test("before any incident a request stays pending; only an AP clerk may request", async () => {
    const { as } = await seeded();
    const unpaid = (await (await as("Jamie Chen")).query(api.payments.getMyBills, {})).find((b) => b.payment === null)!;
    expect(
      await (await as("Rosa Alvarez")).mutation(api.payments.requestPayment, { billId: unpaid.bill._id }),
    ).toMatchObject({ ok: false });
    expect(
      await (await as("Tom Becker")).mutation(api.payments.requestPayment, { billId: unpaid.bill._id }),
    ).toMatchObject({ ok: false }); // another company's bill
    expect(
      await (await as("Jamie Chen")).mutation(api.payments.requestPayment, { billId: unpaid.bill._id }),
    ).toMatchObject({ ok: true, held: false });
  });
});

describe("containment", () => {
  test("only the PE firm contains; afterwards new requests aren't held but old holds stay", async () => {
    const { as, fire } = await seeded();
    const { incidentId } = await fire();
    const clerk = await as("Jamie Chen");
    const note = "Brightline rotated every shared credential; confirmed by phone at the number on file";

    expect(await clerk.mutation(api.incidents.containIncident, { incidentId, note })).toMatchObject({ ok: false });
    const pe = await as(PE);
    expect(await pe.mutation(api.incidents.containIncident, { incidentId, note: "done" })).toMatchObject({ ok: false });
    expect(await pe.mutation(api.incidents.containIncident, { incidentId, note })).toEqual({ ok: true });

    const unpaid = (await clerk.query(api.payments.getMyBills, {})).find((b) => b.payment === null)!;
    expect(await clerk.mutation(api.payments.requestPayment, { billId: unpaid.bill._id })).toMatchObject({
      ok: true,
      held: false,
    });
    const held = await clerk.query(api.payments.getHeldPayments, { incidentId });
    expect(held.find((r) => r.payment.amountCents === 48_000_000)?.payment.status).toBe("held");

    const firmTimeline = await pe.query(api.blastRadius.getIncidentTimeline, { incidentId });
    expect(firmTimeline!.events.at(-1)).toMatchObject({ kind: "contain" });
    const companyTimeline = await clerk.query(api.blastRadius.getIncidentTimeline, { incidentId });
    expect(companyTimeline!.events.find((e) => e.kind === "contain")?.label).toMatch(/no longer held/);
  });
});

describe("scale", () => {
  test("one report fans out to 303 companies in a single transaction, totals stay right", async () => {
    const { t, as, fire } = await seeded();
    process.env.DEMO_MODE = "true"; // eslint-disable-line @convex-dev/no-process-env
    await t.mutation(internal.ops.addScalePortfolio, { count: 300 });
    delete process.env.DEMO_MODE; // eslint-disable-line @convex-dev/no-process-env
    const { incidentId } = await fire();

    const blast = await (await as(PE)).query(api.blastRadius.getBlastRadius, { incidentId });
    expect(blast!.totals).toEqual({
      companiesExposed: 303,
      companiesNotified: 303,
      peopleExposed: 4200 + 300 * 100,
      heldCents: 61_200_000 + 300 * 1_000_000,
      paymentsHeld: 304,
    });
    const context = await t.query(internal.alerts.getWritingContext, { incidentId });
    expect(context!.companyAlerts).toHaveLength(303); // the AI writer sees every company
    expect(context!.heldPayments).toHaveLength(304);
  });
});

describe("notifications", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("an incident fills the outboxes once, simulated, and company text never names the reporter", async () => {
    vi.useFakeTimers();
    const { t, as, fire } = await seeded();
    await fire();
    await t.finishAllScheduledFunctions(vi.runAllTimers); // AI writers + dispatch
    const rows = () => t.run((ctx) => ctx.db.query("notifications").take(200));
    const first = await rows();

    const events = first.map((r) => r.event).sort();
    // Advancing every scheduled timer includes the firm's fixed 15-minute review escalation.
    expect(events).toEqual(["alert", "escalation", "hold", "incident", "incident"]);
    expect(first.filter((r) => r.refId.startsWith("review:"))).toHaveLength(1);
    expect(first.every((r) => r.status === "simulated")).toBe(true); // NOTIFY_LIVE off: nothing sent
    for (const r of first.filter((r) => r.event !== "incident")) expect(r.text).not.toContain("Pinecrest");
    expect(first.find((r) => r.event === "incident")!.text).toMatch(/3 companies exposed · 4,200 people · \$612,000/);

    await fire(); // replayed webhook
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await rows()).toHaveLength(first.length);

    const summitOutbox = await (await as("Rosa Alvarez")).query(api.notifications.listOutbox, {});
    expect(summitOutbox.map((r) => r.event).sort()).toEqual(["alert", "escalation", "hold"]);
  });

  test("only the right people add channels, bad URLs are refused and logged, URLs never leave the server", async () => {
    const { t, as } = await seeded();
    const rosa = await as("Rosa Alvarez");
    const slack = (url: string) => ({ scope: "company" as const, kind: "slack" as const, label: "#test", url, events: ["alert" as const] });

    expect(await (await as("Jamie Chen")).mutation(api.notifications.addChannel, slack("https://hooks.slack.com/services/A/B/C"))).toMatchObject({ ok: false });
    for (const bad of [
      "http://hooks.slack.com/services/A/B/C",
      "https://127.0.0.1/services/x",
      "https://localhost/services/x",
      "https://evil.example/services/x",
    ]) {
      expect(await rosa.mutation(api.notifications.addChannel, slack(bad))).toMatchObject({ ok: false });
    }
    expect(
      await rosa.mutation(api.notifications.addChannel, { ...slack("https://hooks.slack.com/services/A/B/C"), scope: "firm" }),
    ).toMatchObject({ ok: false }); // a controller can't set firm channels
    const added = await rosa.mutation(api.notifications.addChannel, slack("https://hooks.slack.com/services/T1/B2/secret1234"));
    expect(added).toMatchObject({ ok: true });

    const refusals = await t.run(async (ctx) =>
      (await ctx.db.query("auditLog").take(200)).filter((a) => a.rule === "notification_settings"),
    );
    expect(refusals).toHaveLength(6);

    const listed = JSON.stringify(await rosa.query(api.notifications.listChannels, {}));
    expect(listed).not.toContain("secret");
    expect(listed).not.toContain("/services/");
    if (!added.ok) throw new Error(added.reason);
    expect(await (await as("Elena Ruiz")).mutation(api.notifications.removeChannel, { channelId: added.channelId })).toMatchObject({
      ok: false,
    }); // another company's controller
    expect(await rosa.mutation(api.notifications.sendTest, { channelId: added.channelId })).toEqual({ ok: true });
  });
});

describe("AP import", () => {
  const files = { vendorsCsv: lakesideVendors, billsCsv: lakesideBills };
  const lakeside = {
    name: "Lakeside Orthopedics",
    domain: "lakesideortho.example",
    sector: "Healthcare",
    headcount: 450,
    apClerkName: "Morgan Ellis",
    controllerName: "Daniel Okoro",
  };

  test("CSV parsing handles quoted commas and $ amounts", () => {
    expect(parseCsv('a,b\n"x, y","$1,200.00"\r\n')).toEqual([["a", "b"], ["x, y", "$1,200.00"]]);
  });

  test("preview spots the swapped bank account before any incident; only the firm can preview", async () => {
    const { as } = await seeded();
    const preview = await (await as(PE)).query(api.imports.previewApImport, files);
    const brightline = preview!.vendors.find((v) => v.matchedTo === "Brightline Payroll Inc.");
    expect(brightline?.warning).toMatch(/••7731.*••2208/);
    expect(preview!.vendors.filter((v) => v.matchedTo === null).map((v) => v.name)).toEqual([
      "Northwind Medical Supply",
      "Cascade Linen Services",
    ]);
    expect(await (await as("Rosa Alvarez")).query(api.imports.previewApImport, files)).toBeNull();
  });

  test("importing during an incident holds and flags the new company's payments and exposes it", async () => {
    const { t, as, fire } = await seeded();
    const { incidentId } = await fire();
    const pe = await as(PE);
    const result = await pe.mutation(api.imports.importPortfolioCompany, { ...files, company: lakeside });
    expect(result).toMatchObject({ bills: 6, held: 2, flagged: 2, heldCents: 6_640_000, newVendors: 2 });

    const blast = await pe.query(api.blastRadius.getBlastRadius, { incidentId });
    expect(blast!.totals).toMatchObject({ companiesExposed: 4, peopleExposed: 4650, paymentsHeld: 6 });
    expect(blast!.nodes.find((n) => n.name === "Lakeside Orthopedics")).toMatchObject({ exposed: true, urgency: "urgent" });

    const controller = t.withIdentity({
      subject: `${await t.run(async (ctx) => (await ctx.db.query("users").take(300)).find((u) => u.name === "Daniel Okoro")!._id)}|s`,
    });
    const held = await controller.query(api.payments.getHeldPayments, {});
    expect(held.map((r) => r.payment.accountLast4)).toEqual(["7731", "7731"]);

    const entries = await t.run((ctx) => ctx.db.query("ledgerEntries").take(500));
    for (const e of entries) {
      expect(e.lines.reduce((s, l) => s + l.debitCents - l.creditCents, 0)).toBe(0);
    }
  });

  test("only the firm imports; bad files and duplicate companies are refused", async () => {
    const { as } = await seeded();
    const pe = await as(PE);
    await expect(
      (await as("Rosa Alvarez")).mutation(api.imports.importPortfolioCompany, { ...files, company: lakeside }),
    ).rejects.toThrow(/PE firm/);
    await expect(
      pe.mutation(api.imports.importPortfolioCompany, { ...files, billsCsv: "Vendor,Notes\nV-100,hi", company: lakeside }),
    ).rejects.toThrow(/amount and due date/);
    await expect(
      pe.mutation(api.imports.importPortfolioCompany, { ...files, company: { ...lakeside, controllerName: "Morgan Ellis" } }),
    ).rejects.toThrow(/two different people/);
    await pe.mutation(api.imports.importPortfolioCompany, { ...files, company: lakeside });
    await expect(pe.mutation(api.imports.importPortfolioCompany, { ...files, company: lakeside })).rejects.toThrow(
      /already in the portfolio/,
    );
  });
});

describe("notification sender (NOTIFY_LIVE)", () => {
  /* eslint-disable @convex-dev/no-process-env */
  afterEach(() => {
    delete process.env.NOTIFY_LIVE;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function fireLive(respond: (url: string) => Response) {
    vi.useFakeTimers();
    process.env.NOTIFY_LIVE = "true";
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { body: string }) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return respond(url);
      }),
    );
    const s = await seeded();
    await s.fire();
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    const rows = await s.t.run((ctx) => ctx.db.query("notifications").take(50));
    return { ...s, calls, rows };
  }

  test("rows stuck in sending after a crashed run are requeued and sent; fresh claims are left alone", async () => {
    vi.useFakeTimers();
    const { t } = await seeded();
    const ids = await t.run(async (ctx) => {
      const channelId = (await ctx.db.query("notificationChannels").first())!._id;
      const row = { channelId, event: "test" as const, status: "sending" as const, text: "x", createdAt: 0 };
      return {
        stuck: await ctx.db.insert("notifications", { ...row, refId: "stuck", claimedAt: Date.now() - 11 * 60_000 }),
        fresh: await ctx.db.insert("notifications", { ...row, refId: "fresh", claimedAt: Date.now() }),
      };
    });
    expect(await t.mutation(internal.notifications.requeueStuck, {})).toBe(1);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const status = (id: typeof ids.stuck) => t.run(async (ctx) => (await ctx.db.get("notifications", id))?.status);
    expect(await status(ids.stuck)).toBe("simulated");
    expect(await status(ids.fresh)).toBe("sending");
  });

  test("live: Slack gets { text } and every row ends sent", async () => {
    const { calls, rows } = await fireLive(() => new Response("ok", { status: 200 }));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.status === "sent" && r.sentAt !== undefined)).toBe(true);
    expect(calls.every((c) => c.url.startsWith("https://hooks.slack.com/services/"))).toBe(true);
    expect(calls.every((c) => typeof (c.body as { text: unknown }).text === "string")).toBe(true);
  });

  test("live: a 5xx is retried once then marked failed; a 4xx isn't retried; the URL never leaks", async () => {
    const server = await fireLive(() => new Response("down", { status: 503 }));
    expect(server.rows.every((r) => r.status === "failed" && r.error === "HTTP 503")).toBe(true);
    expect(server.calls.length).toBe(server.rows.length * 2); // one retry each

    vi.unstubAllGlobals();
    const bad = await fireLive(() => new Response("gone", { status: 404 }));
    expect(bad.calls.length).toBe(bad.rows.length); // no retry
    for (const r of bad.rows) expect(r.error).not.toContain("hooks.slack.com");
  });
  /* eslint-enable @convex-dev/no-process-env */
});

describe("demo readiness", () => {
  test("fresh seed is ready; after firing it says to Reset", async () => {
    const { t, fire } = await seeded();
    process.env.DEMO_MODE = "true"; // eslint-disable-line @convex-dev/no-process-env
    const fresh = await t.action(internal.ops.demoReadiness, {});
    expect(fresh.ready).toBe(true);
    await fire();
    const after = await t.action(internal.ops.demoReadiness, {});
    expect(after.ready).toBe(false);
    expect(after.checks.find((c) => c.name === "$480K payment ready")?.detail).toMatch(/Reset/);
    delete process.env.DEMO_MODE; // eslint-disable-line @convex-dev/no-process-env
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
    expect(peRows.filter((r) => r.action === "escalate")).toHaveLength(1);
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

describe("directory and timeline access", () => {
  /* eslint-disable @convex-dev/no-process-env */
  const original = process.env.DEMO_MODE;
  afterEach(() => {
    process.env.DEMO_MODE = original;
  });

  test("off DEMO_MODE the directory needs a session, and a company sees only its colleagues' emails", async () => {
    const { t, as, companyId } = await seeded();
    delete process.env.DEMO_MODE;
    expect(await t.query(api.blastRadius.listUsers, {})).toEqual([]);
    expect(await t.query(api.blastRadius.listCompanies, {})).toEqual([]);
    expect(await t.query(api.blastRadius.listAssets, {})).toEqual([]);

    const summit = await companyId("Summit Home Health");
    const people = await (await as("Jamie Chen")).query(api.blastRadius.listUsers, {});
    expect(people.filter((u) => u.companyId === summit).every((u) => u.email)).toBe(true);
    expect(people.filter((u) => u.companyId !== summit).every((u) => u.email === undefined)).toBe(true);
    expect((await (await as(PE)).query(api.blastRadius.listUsers, {})).every((u) => u.email)).toBe(true);

    process.env.DEMO_MODE = "true"; // the sign-in quick-pick runs before anyone is signed in
    expect((await t.query(api.blastRadius.listUsers, {})).length).toBeGreaterThan(0);
  });

  test("a company can't read the timeline of an incident that never touched it", async () => {
    const { as, fire } = await seeded();
    const { incidentId } = await fire();
    expect(await (await as("Dana Whitfield")).query(api.blastRadius.getIncidentTimeline, { incidentId })).toBeNull();
    expect(await (await as("Jamie Chen")).query(api.blastRadius.getIncidentTimeline, { incidentId })).not.toBeNull();
  });
  /* eslint-enable @convex-dev/no-process-env */
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

  test("refuses unless DEMO_MODE=true and someone is signed in", async () => {
    const { t, as } = await seeded();
    const presenter = await as("Jamie Chen");
    await expect(presenter.mutation(api.seed.resetDemo, {})).rejects.toThrow(/DEMO_MODE/);
    process.env.DEMO_MODE = "true";
    await expect(t.mutation(api.seed.resetDemo, {})).rejects.toThrow(/Not signed in/);
    await expect(presenter.mutation(api.seed.resetDemo, {})).resolves.toMatchObject({ companies: 14, continuing: false });
  });

  test("with a presenter key set, a signed-in visitor can't reset; the presenter can", async () => {
    const { as } = await seeded();
    process.env.DEMO_MODE = "true";
    process.env.PRESENTER_KEY = "stage-secret";
    try {
      const visitor = await as("Jordan Ames (Northpass Capital)");
      await expect(visitor.mutation(api.seed.resetDemo, {})).rejects.toThrow(/presenter-only/);
      await expect(visitor.mutation(api.seed.resetDemo, { presenterKey: "guess" })).rejects.toThrow(/presenter-only/);
      await expect(visitor.mutation(api.seed.resetDemo, { presenterKey: "stage-secret" })).resolves.toMatchObject({ companies: 14 });
    } finally {
      delete process.env.PRESENTER_KEY;
    }
  });

  test("a reset too big for one transaction finishes in follow-up runs", async () => {
    vi.useFakeTimers();
    const { t } = await seeded();
    await t.run(async (ctx) => {
      const channelId = (await ctx.db.query("notificationChannels").first())!._id;
      for (let i = 0; i < 4500; i++) {
        await ctx.db.insert("notifications", {
          channelId, event: "test", refId: `bulk:${i}`, status: "simulated", text: "x", createdAt: 0,
        });
      }
    });
    expect(await t.mutation(internal.seed.run, {})).toMatchObject({ continuing: true, companies: 0 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const after = await t.run(async (ctx) => ({
      notifications: (await ctx.db.query("notifications").take(5000)).length,
      companies: (await ctx.db.query("companies").take(100)).length,
    }));
    expect(after).toEqual({ notifications: 0, companies: 14 });
    vi.useRealTimers();
  });
});

describe("POST /incident", () => {
  const original = { demo: process.env.DEMO_MODE, secret: process.env.INCIDENT_WEBHOOK_SECRET };
  beforeEach(() => {
    delete process.env.DEMO_MODE;
    delete process.env.INCIDENT_WEBHOOK_SECRET;
  });
  afterEach(() => {
    process.env.DEMO_MODE = original.demo;
    process.env.INCIDENT_WEBHOOK_SECRET = original.secret;
  });

  const post = (t: Awaited<ReturnType<typeof seeded>>["t"], body: object, signature?: string) =>
    t.fetch("/incident", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(signature ? { "X-Sidecall-Signature": signature } : {}) },
      body: JSON.stringify(body),
    });

  async function sign(secret: string, body: object) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(JSON.stringify(body)));
    return `sha256=${Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("")}`;
  }

  test("unsigned requests are refused unless they are a demo scenario on a DEMO_MODE deployment", async () => {
    const { t } = await seeded();
    const forged = { externalId: "attacker-1", assetName: "Brightline Payroll" };
    expect((await post(t, forged)).status).toBe(401);
    expect((await post(t, BRIGHTLINE)).status).toBe(401); // demo scenario, but DEMO_MODE off
    process.env.DEMO_MODE = "true";
    expect((await post(t, forged)).status).toBe(401); // DEMO_MODE only unlocks the built-in scenarios
    const ok = await post(t, BRIGHTLINE);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ duplicate: false });
    expect(await (await post(t, BRIGHTLINE)).json()).toMatchObject({ duplicate: true }); // replay beat
  });

  test("signed requests from a real sender are accepted; a bad signature is not", async () => {
    const { t } = await seeded();
    process.env.INCIDENT_WEBHOOK_SECRET = "test-secret";
    const body = { externalId: "armadin-finding-77", assetName: "Keystone SSO" };
    expect((await post(t, body, await sign("wrong-secret", body))).status).toBe(401);
    expect((await post(t, body, await sign("test-secret", body))).status).toBe(200);
  });

  test("a finding is validated field by field; ids and asset default from it; replay writes nothing", async () => {
    const { t } = await seeded();
    process.env.INCIDENT_WEBHOOK_SECRET = "test-secret";
    const send = async (body: object) => {
      const res = await post(t, body, await sign("test-secret", body));
      return { status: res.status, body: (await res.json()) as { error?: string; duplicate?: boolean } };
    };
    const hops = FINDING.path;
    const bad = [
      { ...FINDING, path: [...hops.slice(0, 2), { ...hops[2], validated: false }] },
      { ...FINDING, technique: { id: "T78" } },
      { ...FINDING, path: hops.slice(0, 2) }, // ends on a system, not the credential
      { ...FINDING, validatedAt: "2099-01-01T00:00:00Z" },
    ];
    for (const finding of bad) expect((await send({ finding })).status).toBe(400);
    expect((await send({ finding: bad[0] })).body.error).toMatch(/only validated hops/);

    const disagree = await send({ reportedByDomain: "cedarridge.example", finding: FINDING });
    expect(disagree).toMatchObject({ status: 400, body: { error: expect.stringMatching(/disagree/) } });
    const unknown = await send({ finding: { ...FINDING, scope: { organizationDomain: "nobody.example" } } });
    expect(unknown).toMatchObject({ status: 404, body: { error: "unknown_reporter" } });

    expect(await send({ finding: FINDING })).toMatchObject({ status: 200, body: { duplicate: false } });
    expect(await send({ finding: FINDING })).toMatchObject({ status: 200, body: { duplicate: true } });
    const incident = await t.run((ctx) =>
      ctx.db.query("incidents").withIndex("by_externalId", (q) => q.eq("externalId", "armadin:ARM-2026-0412")).unique(),
    );
    expect(incident?.finding).toMatchObject({ findingId: "ARM-2026-0412", technique: { id: "T1078", name: "Valid Accounts" } });
  });

  test("with a presenter key set, the unsigned stage Fire needs it; signed senders don't", async () => {
    const { t } = await seeded();
    process.env.DEMO_MODE = "true";
    process.env.PRESENTER_KEY = "stage-secret";
    process.env.INCIDENT_WEBHOOK_SECRET = "test-secret";
    try {
      const res = await post(t, BRIGHTLINE);
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ error: expect.stringMatching(/presenter-only/) });
      const presenter = await t.fetch("/incident", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Sidecall-Presenter": "stage-secret" },
        body: JSON.stringify(BRIGHTLINE),
      });
      expect(presenter.status).toBe(200);
      const body = { externalId: "real-sender-1", assetName: "Keystone SSO" };
      expect((await post(t, body, await sign("test-secret", body))).status).toBe(200);
    } finally {
      delete process.env.PRESENTER_KEY;
    }
  });

  test("an unsigned demo request runs the stored scenario, never the body's own finding", async () => {
    const { t } = await seeded();
    process.env.DEMO_MODE = "true";
    const forged = { ...FINDING, path: FINDING.path.map((h) => ({ ...h, label: "FORGED" })) };
    const ids = { externalId: "demo-armadin-004", assetName: "Ironclad shared admin account" };
    expect((await post(t, { ...ids, summary: "FORGED", finding: forged })).status).toBe(200);
    expect((await post(t, { ...IRONCLAD_CREDENTIAL, finding: forged })).status).toBe(200);
    const incidents = await t.run((ctx) => ctx.db.query("incidents").take(10));
    expect(JSON.stringify(incidents)).not.toContain("FORGED");
    expect(incidents.find((i) => i.externalId === "demo-armadin-004")?.finding?.findingId).toBe("ARM-2026-0412");
    expect(incidents.find((i) => i.externalId === IRONCLAD_CREDENTIAL.externalId)?.finding).toBeUndefined();
  });
});

describe("red-team finding, one step ahead", () => {
  const fireArmadin = async (s: Awaited<ReturnType<typeof seeded>>) => {
    const result = await s.t.mutation(internal.seed.fireDemoIncident, { scenario: "armadinFinding" });
    if (!result.ok) throw new Error(result.error);
    return result.incidentId;
  };
  const exposuresOf = (t: Awaited<ReturnType<typeof seeded>>["t"], incidentId: string) =>
    t.run(async (ctx) =>
      (await ctx.db.query("exposures").take(50))
        .filter((e) => e.incidentId === incidentId)
        .map(({ companyId, score, urgency, confidence, reasons }) => ({ companyId, score, urgency, confidence, reasons }))
        .sort((a, b) => a.companyId.localeCompare(b.companyId)),
    );

  test("same exposures, scores and urgency as the plain credential report: a finding raises nothing", async () => {
    const plain = await seeded();
    const { incidentId: plainId } = await plain.fire(IRONCLAD_CREDENTIAL);
    const withFinding = await seeded();
    const findingId = await fireArmadin(withFinding);
    expect(await exposuresOf(withFinding.t, findingId)).toEqual(await exposuresOf(plain.t, plainId));
    expect((await exposuresOf(withFinding.t, findingId)).length).toBe(3);
  });

  test("a leaked login reaches only companies sharing it, not every customer of the vendor", async () => {
    const { t } = await seeded();
    const msp = { externalId: "msp-cred-1", assetName: "Ironclad IT Services", reportedByDomain: "pinecreststaffing.example" };
    const credential = { ...PINECREST_FINDING_STORED, terminalKind: "credential" as const };
    const r = await t.mutation(internal.incidents.recordIncident, { ...msp, finding: credential });
    if (!r.ok) throw new Error(r.error);
    expect(await exposuresOf(t, r.incidentId)).toEqual([]); // Ironclad IT Services links are all same_vendor_only
  });

  test("sister companies never see the reporter, its hops or ids, or 'validated' without 'not tested'", async () => {
    const s = await seeded();
    const incidentId = await fireArmadin(s);
    const cedar = await s.as("Tom Becker");
    const [exposure] = await cedar.query(api.blastRadius.getMyExposures, {});
    const views = [
      exposure,
      await cedar.query(api.blastRadius.getExposureEvidence, { exposureId: exposure._id }),
      await cedar.query(api.alerts.getMyAlerts, {}),
      await cedar.query(api.blastRadius.listIncidents, {}),
      await cedar.query(api.blastRadius.getIncidentTimeline, { incidentId }),
      await cedar.query(api.notifications.listOutbox, {}),
    ];
    const text = JSON.stringify(views);
    for (const secret of ["Pinecrest", "PC-OPS-12", "jump01", "ironclad-svc", "ARM-2026", "ENG-PINECREST", "Exposed RDP"]) {
      expect(text).not.toContain(secret);
    }
    const strings: string[] = [];
    const walk = (x: unknown): void => {
      if (typeof x === "string") strings.push(x);
      else if (x && typeof x === "object") Object.values(x).forEach(walk);
    };
    walk(views);
    // Prose only: the enum labels validated_at_source / reachable_not_tested travel as a pair.
    const sentences = strings.filter((x) => /validated/i.test(x) && x.includes(" "));
    for (const str of sentences) expect(str).toContain("not tested");
    expect(sentences.length).toBeGreaterThan(0); // the path sentence is there

    const evidence = await cedar.query(api.blastRadius.getExposureEvidence, { exposureId: exposure._id });
    expect(evidence?.path).toEqual({
      techniqueId: "T1078",
      techniqueName: "Valid Accounts",
      sharedHop: "Ironclad Managed IT (Ironclad shared admin account)",
      linkType: "shared_credential",
      source: "validated_at_source",
      here: "reachable_not_tested",
      whatToCheck:
        "What to check: sign-ins to Ironclad shared admin account in the last 30 days, especially after Oct 24, 08:12 UTC. " +
        "Rotate that login today, even if nothing looks wrong.",
    });
    expect(evidence?.evidence.some((e) => e.kind === "what_to_check")).toBe(true);
    const [alert] = await cedar.query(api.alerts.getMyAlerts, {});
    expect(alert.body).toContain("What to check: sign-ins to Ironclad shared admin account");
    expect(await cedar.query(api.blastRadius.getBlastRadius, { incidentId })).toBeNull();
  });

  test("the firm map labels the proven edge and the inferred ones; the AI gets safe context", async () => {
    const s = await seeded();
    const incidentId = await fireArmadin(s);
    const map = await (await s.as(PE)).query(api.blastRadius.getBlastRadius, { incidentId });
    const pathOf = async (company: string) => {
      const companyId = await s.companyId(company);
      return map!.edges.find((e) => e.compromised && e.companyId === companyId)?.path;
    };
    expect(map?.incident.finding?.findingId).toBe("ARM-2026-0412");
    expect(await pathOf("Pinecrest Staffing")).toBe("validated_at_source");
    expect(await pathOf("Cedar Ridge Manufacturing")).toBe("reachable_not_tested");
    expect(map!.edges.filter((e) => !e.compromised).every((e) => e.path === null)).toBe(true);

    const [row] = await (await s.as(PE)).query(api.blastRadius.listIncidents, {});
    expect(row.findingSource).toBe("armadin");
    const context = await s.t.query(internal.alerts.getWritingContext, { incidentId });
    expect(context?.technique).toEqual({ id: "T1078", name: "Valid Accounts" });
    expect(context?.companyAlerts.every((a) => a.pathSummary?.includes("not tested"))).toBe(true);
    expect(context?.companyAlerts.every((a) => a.whatToCheck?.startsWith("What to check:"))).toBe(true);
    // Harborline gives Ironclad admin access rather than sharing the login: a different action.
    const harborline = context?.companyAlerts.find((a) => a.companyName === "Harborline Foods");
    expect(harborline?.whatToCheck).toContain("Ask Ironclad Managed IT to rotate the admin account it uses for you");
  });
});

describe("response playbook (pre-approved steps)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const fireRedTeam = async (s: Awaited<ReturnType<typeof seeded>>) => {
    vi.useFakeTimers();
    const r = await s.t.mutation(internal.seed.fireDemoIncident, { scenario: "armadinFinding" });
    if (!r.ok) throw new Error(r.error);
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    return r.incidentId;
  };
  const stepsOf = (t: Awaited<ReturnType<typeof seeded>>["t"]) =>
    t.run(async (ctx) => await ctx.db.query("responseSteps").take(100));

  test("each company's own rule runs: Cedar pre-approved, Granite one click, Harborline notify", async () => {
    const s = await seeded();
    const incidentId = await fireRedTeam(s);
    const cedar = await s.companyId("Cedar Ridge Manufacturing");
    const granite = await s.companyId("Granite Peak Software");
    const steps = await stepsOf(s.t);
    const find = (c: string, a: string) => steps.find((x) => x.companyId === c && x.action === a);
    expect(find(cedar, "pause_shared_login")).toMatchObject({ mode: "act", status: "done", policyRule: "playbook:pause_shared_login:act:v1" });
    expect(find(cedar, "revoke_vendor_tokens")).toMatchObject({ mode: "prepare", status: "awaiting_approval" });
    expect(find(granite, "pause_shared_login")).toMatchObject({ mode: "prepare", status: "awaiting_approval" });
    const harborline = await s.companyId("Harborline Foods");
    expect(steps.some((x) => x.companyId === harborline)).toBe(false);

    const tracker = await (await s.as(PE)).query(api.responses.getResponseTracker, { incidentId });
    expect(tracker?.totals).toEqual({ exposed: 3, firstStepDone: 1, ready: 1, notifyOnly: 1 });
    expect(tracker?.companies.find((c) => c.companyId === cedar)?.firstStepMs).toBeGreaterThanOrEqual(0);

    // The plan Cedar's IT lead sees: what ran, what's one click away, nothing about who was hit.
    const plan = await (await s.as("Sam Kowalski")).query(api.responses.getMyResponsePlan, { incidentId });
    expect(plan.map((p) => [p.action, p.status])).toEqual([
      ["pause_shared_login", "done"],
      ["revoke_vendor_tokens", "awaiting_approval"],
    ]);
    expect(plan[0]).toMatchObject({ canUndo: true, effect: expect.stringContaining("Ironclad shared admin account") });
    expect(JSON.stringify(plan)).not.toMatch(/Pinecrest|jump01|ARM-2026/);

    // On the record, as the system acting under Cedar's own rule.
    const timeline = await (await s.as("Sam Kowalski")).query(api.blastRadius.getIncidentTimeline, { incidentId });
    expect(timeline?.events.some((e) => e.kind === "respond" && e.label.includes("Simulated connector"))).toBe(true);
  });

  test("a replayed report plans and runs nothing new", async () => {
    const s = await seeded();
    await fireRedTeam(s);
    const before = (await stepsOf(s.t)).length;
    const again = await s.t.mutation(internal.seed.fireDemoIncident, { scenario: "armadinFinding" });
    expect(again).toMatchObject({ duplicate: true });
    expect((await stepsOf(s.t)).length).toBe(before);
  });

  test("two people click one-click at once: exactly one runs it", async () => {
    const s = await seeded();
    await fireRedTeam(s);
    const granite = await s.companyId("Granite Peak Software");
    const step = (await stepsOf(s.t)).find((x) => x.companyId === granite)!;
    const [ben, aisha] = [await s.as("Ben Carter"), await s.as("Aisha Rahman")];
    const results = await Promise.all([
      ben.mutation(api.responses.approveStep, { stepId: step._id }),
      aisha.mutation(api.responses.approveStep, { stepId: step._id }),
    ]);
    expect(results.filter((r) => r.ok).length).toBe(1);
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await stepsOf(s.t)).find((x) => x._id === step._id)?.status).toBe("done");
  });

  test("only the company's IT lead or controller acts; everyone else is refused and logged", async () => {
    const s = await seeded();
    await fireRedTeam(s);
    const granite = await s.companyId("Granite Peak Software");
    const step = (await stepsOf(s.t)).find((x) => x.companyId === granite)!;
    for (const who of ["Noah Fischer", PE, "Sam Kowalski"]) {
      expect(await (await s.as(who)).mutation(api.responses.approveStep, { stepId: step._id })).toMatchObject({ ok: false });
    }
    expect(await (await s.as(PE)).mutation(api.responses.setPlaybookMode, { action: "pause_shared_login", mode: "act" })).toMatchObject({ ok: false });
    expect(await (await s.as("Noah Fischer")).mutation(api.responses.setPlaybookMode, { action: "pause_shared_login", mode: "act" })).toMatchObject({ ok: false });
    const refusals = await s.t.run(async (ctx) =>
      (await ctx.db.query("auditLog").take(200)).filter((a) => a.action === "refused" && a.rule === "response_playbook"),
    );
    expect(refusals.length).toBe(5);
  });

  test("caps: payroll logins and vendor admin accounts stop at one click; DNS guesses and same-vendor links get nothing", async () => {
    const s = await seeded();
    // Harborline (vendor admin access) and every company pre-approve pausing.
    await s.t.run(async (ctx) => {
      for (const p of await ctx.db.query("responsePolicies").take(50)) await ctx.db.patch("responsePolicies", p._id, { mode: "act" });
      const harborline = (await ctx.db.query("companies").take(20)).find((c) => c.name === "Harborline Foods")!;
      const pause = (await ctx.db.query("responsePolicies").take(50)).find((p) => p.companyId === harborline._id && p.action === "pause_shared_login")!;
      await ctx.db.patch("responsePolicies", pause._id, { mode: "act" });
    });
    await fireRedTeam(s);
    const harborline = await s.companyId("Harborline Foods");
    const pause = (await stepsOf(s.t)).find((x) => x.companyId === harborline && x.action === "pause_shared_login");
    expect(pause).toMatchObject({ mode: "prepare", status: "awaiting_approval", capNote: expect.stringContaining("recovery") });

    // Brightline is a payroll vendor: Cedar's pre-approved pause waits for a click there.
    const s2 = await seeded();
    vi.useFakeTimers();
    const { incidentId } = await s2.fire();
    await s2.t.finishAllScheduledFunctions(vi.runAllTimers);
    const cedar = await s2.companyId("Cedar Ridge Manufacturing");
    const bl = (await stepsOf(s2.t)).filter((x) => x.incidentId === incidentId);
    expect(bl.find((x) => x.companyId === cedar && x.action === "pause_shared_login")).toMatchObject({
      mode: "prepare",
      capNote: expect.stringContaining("payroll"),
    });
    expect(bl.every((x) => x.companyId === cedar)).toBe(true); // Summit (same vendor) and Bayview (DNS) get no steps
  });

  test("no more than 3 companies run steps without a click from one report", async () => {
    const s = await seeded();
    await s.t.run(async (ctx) => {
      const asset = (await ctx.db.query("assets").take(20)).find((a) => a.name === "Ironclad shared admin account")!;
      for (const p of await ctx.db.query("responsePolicies").take(50)) await ctx.db.patch("responsePolicies", p._id, { mode: "act" });
      for (const name of ["Extra One", "Extra Two"]) {
        const companyId = await ctx.db.insert("companies", { name, domain: `${name.replace(" ", "").toLowerCase()}.example`, sector: "Test", headcount: 10, holdRuleEnabled: false });
        await ctx.db.insert("links", { companyId, assetId: asset._id, shareType: "shared_credential", source: "self_reported" });
        await ctx.db.insert("responsePolicies", { companyId, action: "pause_shared_login", mode: "act", version: 1, setBy: "seed", setAt: 0 });
      }
    });
    await fireRedTeam(s);
    const steps = await stepsOf(s.t);
    const actCompanies = new Set(steps.filter((x) => x.mode === "act").map((x) => x.companyId));
    expect(actCompanies.size).toBe(3);
    expect(steps.some((x) => x.capNote?.includes("no more than 3"))).toBe(true);
  });

  test("raising a step to pre-approved takes two different people; lowering takes one", async () => {
    const s = await seeded();
    const [ben, aisha] = [await s.as("Ben Carter"), await s.as("Aisha Rahman")];
    const set = (who: typeof ben, mode: "notify" | "prepare" | "act") =>
      who.mutation(api.responses.setPlaybookMode, { action: "pause_shared_login", mode });
    expect(await set(ben, "act")).toMatchObject({ ok: true, applied: false, awaitingSecondPerson: true });
    expect(await set(ben, "act")).toMatchObject({ applied: false, awaitingSecondPerson: true }); // same person again
    expect(await set(aisha, "act")).toMatchObject({ ok: true, applied: true });
    const row = (await aisha.query(api.responses.getMyPlaybook, {})).find((r) => r.action === "pause_shared_login");
    expect(row).toMatchObject({ mode: "act", version: 2, setByName: "Ben Carter", confirmedByName: "Aisha Rahman" });
    expect(await set(ben, "notify")).toMatchObject({ applied: true });
    expect((await ben.query(api.responses.getMyPlaybook, {})).find((r) => r.action === "pause_shared_login")?.mode).toBe("notify");
  });

  test("payment holds keep their single controller switch", async () => {
    const s = await seeded();
    const summit = await s.companyId("Summit Home Health");
    expect(await (await s.as("Kwame Mensah")).mutation(api.responses.setPlaybookMode, { action: "hold_payments", mode: "notify" })).toMatchObject({ ok: false });
    expect(await (await s.as("Rosa Alvarez")).mutation(api.responses.setPlaybookMode, { action: "hold_payments", mode: "notify" })).toMatchObject({ ok: true, applied: true });
    expect((await s.t.run((ctx) => ctx.db.get("companies", summit)))?.holdRuleEnabled).toBe(false);
  });

  test("undo restores; containment expires steps nobody ran", async () => {
    const s = await seeded();
    const incidentId = await fireRedTeam(s);
    const cedar = await s.companyId("Cedar Ridge Manufacturing");
    const done = (await stepsOf(s.t)).find((x) => x.companyId === cedar && x.status === "done")!;
    const sam = await s.as("Sam Kowalski");
    expect(await sam.mutation(api.responses.undoStep, { stepId: done._id })).toEqual({ ok: true });
    expect(await sam.mutation(api.responses.undoStep, { stepId: done._id })).toEqual({ ok: false, reason: "already_undone" });
    await (await s.as(PE)).mutation(api.incidents.containIncident, { incidentId, note: "Ironclad rotated the shared admin account, confirmed by phone" });
    const after = await stepsOf(s.t);
    expect(after.filter((x) => x.status === "awaiting_approval")).toEqual([]);
    expect(after.filter((x) => x.status === "expired").length).toBe(2);
  });
});
