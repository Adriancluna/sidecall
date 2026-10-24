/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { DAY_MS } from "./shared";

const modules = import.meta.glob("./**/*.ts");
const event = {
  externalId: "episode-first",
  assetName: "Brightline Payroll",
  assessment: "confirmed" as const,
};
const note =
  "Independent vendor and access evidence checked by the response team.";
async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const users = await t.run((ctx) => ctx.db.query("users").take(100));
  const as = (name: string) =>
    t.withIdentity({
      subject: `${users.find((u) => u.name === name)!._id}|session`,
    });
  return {
    t,
    firm: as("Jordan Ames (Northpass Capital)"),
    company: as("Jamie Chen"),
    sam: as("Sam Kowalski"),
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

test("correlated IDs are durable no-op replays, including after containment", async () => {
  const { t, firm } = await setup();
  const first = await t.mutation(internal.incidents.recordIncident, event);
  if (!first.ok) throw Error(first.error);
  const next = {
    ...event,
    externalId: "second-id",
    evidenceRefs: ["independent:second"],
    summary: "Additional source evidence",
  };
  expect(
    await t.mutation(internal.incidents.recordIncident, next),
  ).toMatchObject({
    duplicate: false,
    correlated: true,
    incidentId: first.incidentId,
  });
  const before = await firm.query(api.responseEvidence.getRecord, {
    incidentId: first.incidentId,
  });
  expect(
    await t.mutation(internal.incidents.recordIncident, next),
  ).toMatchObject({ duplicate: true, correlated: false });
  expect(
    await firm.query(api.responseEvidence.getRecord, {
      incidentId: first.incidentId,
    }),
  ).toEqual(before);
  await firm.mutation(api.incidents.containIncident, {
    incidentId: first.incidentId,
    note,
  });
  expect(
    await t.mutation(internal.incidents.recordIncident, next),
  ).toMatchObject({ duplicate: true, incidentId: first.incidentId });
  expect(await t.run((ctx) => ctx.db.query("incidents").take(10))).toHaveLength(
    1,
  );
  expect(before?.reports).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        externalId: "second-id",
        evidenceRefs: ["independent:second"],
        summary: "Additional source evidence",
      }),
    ]),
  );
});

test.each(["modern", "legacy"])(
  "a %s episode idle over 30 days cannot swallow a new breach",
  async (kind) => {
    const { t } = await setup();
    const first = await t.mutation(internal.incidents.recordIncident, event);
    if (!first.ok) throw Error(first.error);
    await t.run((ctx) =>
      ctx.db.patch("incidents", first.incidentId, {
        createdAt: Date.now() - 31 * DAY_MS,
        lastReportedAt: Date.now() - 31 * DAY_MS,
        ...(kind === "legacy"
          ? { correlationKey: undefined, responseClass: undefined }
          : {}),
      }),
    );
    const next = await t.mutation(internal.incidents.recordIncident, {
      ...event,
      externalId: "new-breach",
    });
    expect(next).toMatchObject({ duplicate: false, correlated: false });
    if (!next.ok) throw Error(next.error);
    expect(next.incidentId).not.toBe(first.incidentId);
  },
);

test("continued reports do not extend the original new-payment hold window", async () => {
  const { t, company } = await setup();
  const first = await t.mutation(internal.incidents.recordIncident, event);
  if (!first.ok) throw Error(first.error);
  await t.run((ctx) =>
    ctx.db.patch("incidents", first.incidentId, {
      createdAt: Date.now() - 31 * DAY_MS,
      lastReportedAt: Date.now(),
    }),
  );
  expect(
    await t.mutation(internal.incidents.recordIncident, {
      ...event,
      externalId: "recent-repeat",
    }),
  ).toMatchObject({ correlated: true });
  const bills = await company.query(api.payments.getMyBills, {});
  expect(
    await company.mutation(api.payments.requestPayment, {
      billId: bills.find((b) => !b.payment)!.bill._id,
    }),
  ).toMatchObject({ held: false });
  const existing = await t.run((ctx) =>
    ctx.db
      .query("payments")
      .withIndex("by_heldByIncidentId", (q) =>
        q.eq("heldByIncidentId", first.incidentId),
      )
      .take(100),
  );
  expect(existing.length).toBeGreaterThan(0);
  expect(existing.every((p) => p.status === "held")).toBe(true);
});

test("correlation alerts the firm but coalesces channel delivery during a flood", async () => {
  vi.useFakeTimers();
  const { t } = await setup();
  const first = await t.mutation(internal.incidents.recordIncident, event);
  if (!first.ok) throw Error(first.error);
  for (let i = 0; i < 100; i++)
    await t.mutation(internal.incidents.recordIncident, {
      ...event,
      externalId: `flood-${i}`,
    });
  const state = await t.run(async (ctx) => ({
    notifications: await ctx.db.query("notifications").take(500),
    receipts: await ctx.db
      .query("incidentReports")
      .withIndex("by_incidentId", (q) => q.eq("incidentId", first.incidentId))
      .take(500),
  }));
  expect(state.receipts).toHaveLength(101);
  expect(
    state.notifications.filter((n) => n.refId.startsWith("correlated:")),
  ).toHaveLength(1);
  vi.setSystemTime(Date.now() + 16 * 60 * 1000);
  await t.mutation(internal.incidents.recordIncident, {
    ...event,
    externalId: "later-evidence",
  });
  expect(
    (await t.run((ctx) => ctx.db.query("notifications").take(500))).filter(
      (n) => n.refId.startsWith("correlated:"),
    ),
  ).toHaveLength(2);
});

test.each(["confirm", "dismiss"] as const)(
  "review %s closes notify-only exposures without leaking reporter details",
  async (decision) => {
    const { t, firm, company, sam } = await setup();
    const first = await t.mutation(internal.incidents.recordIncident, {
      ...event,
      assessment: "observation",
      reportedByDomain: "pinecreststaffing.example",
      summary: "Pinecrest private source detail",
    });
    if (!first.ok) throw Error(first.error);
    const companyRows = await company.query(api.blastRadius.listIncidents, {});
    expect(companyRows).toHaveLength(1);
    expect(companyRows[0]).toMatchObject({
      responseClass: "observation",
      reportedByCompanyId: null,
      summary: null,
    });
    expect(
      await sam.query(api.responses.getMyResponsePlan, {
        incidentId: first.incidentId,
      }),
    ).toEqual([]);
    expect(
      JSON.stringify(await company.query(api.alerts.getMyAlerts, {})),
    ).not.toMatch(/Pinecrest|private source/);
    expect(
      await company.query(api.responseEvidence.getRecord, {
        incidentId: first.incidentId,
      }),
    ).toBeNull();
    expect(
      await firm.mutation(api.incidents.reviewReport, {
        incidentId: first.incidentId,
        decision,
        note,
      }),
    ).toMatchObject({ ok: true });
    const old = await t.run((ctx) =>
      ctx.db
        .query("exposures")
        .withIndex("by_incidentId_and_companyId", (q) =>
          q.eq("incidentId", first.incidentId),
        )
        .take(100),
    );
    expect(old.every((e) => e.status === "closed")).toBe(true);
    const holds = (
      await t.run((ctx) => ctx.db.query("payments").take(100))
    ).filter((p) => p.status === "held");
    expect(holds.length > 0).toBe(decision === "confirm");
  },
);

test("expired prior actions do not downgrade a fresh episode and simulations never claim verification", async () => {
  const { t, sam, firm } = await setup();
  const input = {
    externalId: "credential-old",
    assetName: "Ironclad shared admin account",
  };
  const first = await t.mutation(internal.incidents.recordIncident, input);
  if (!first.ok) throw Error(first.error);
  await t.mutation(internal.responses.recordSimulated, {
    incidentId: first.incidentId,
  });
  await t.run((ctx) =>
    ctx.db.patch("incidents", first.incidentId, {
      createdAt: Date.now() - 31 * DAY_MS,
      lastReportedAt: Date.now() - 31 * DAY_MS,
    }),
  );
  const next = await t.mutation(internal.incidents.recordIncident, {
    ...input,
    externalId: "credential-fresh",
  });
  if (!next.ok) throw Error(next.error);
  const plan = await sam.query(api.responses.getMyResponsePlan, {
    incidentId: next.incidentId,
  });
  expect(plan.find((s) => s.action === "pause_shared_login")).toMatchObject({
    mode: "act",
    status: "queued",
  });
  await t.mutation(internal.responses.recordSimulated, {
    incidentId: next.incidentId,
  });
  const record = await firm.query(api.responseEvidence.getRecord, {
    incidentId: next.incidentId,
  });
  const executed = record!.steps.filter((s) => s.status === "done");
  expect(executed.length).toBeGreaterThan(0);
  expect(
    executed.every(
      (s) => s.executionMode === "simulated" && s.verification === null,
    ),
  ).toBe(true);
  expect(record!.audit.some((a) => a.action === "respond")).toBe(true);
  expect(JSON.stringify(record)).not.toMatch(/tokenHash|accountLast4|sc_test_/);
});

test("response export explicitly marks sections truncated instead of claiming a complete record", async () => {
  const { t, firm } = await setup();
  const first = await t.mutation(internal.incidents.recordIncident, event);
  if (!first.ok) throw Error(first.error);
  await t.run(async (ctx) => {
    for (let i = 0; i < 500; i++)
      await ctx.db.insert("incidentReports", {
        incidentId: first.incidentId,
        externalId: `receipt-${i}`,
        receivedAt: Date.now(),
        evidenceRefs: [],
      });
  });
  const record = await firm.query(api.responseEvidence.getRecord, {
    incidentId: first.incidentId,
  });
  expect(record?.reports).toHaveLength(500);
  expect(record?.limits.truncated.reports).toBe(true);
});
