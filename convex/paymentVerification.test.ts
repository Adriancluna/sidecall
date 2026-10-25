/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { expect, test, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.mutation(internal.seed.run, {});
  await t.mutation(internal.incidents.recordIncident, {
    externalId: "demo-brightline-001", assetName: "Brightline Payroll",
    reportedByDomain: "pinecreststaffing.example",
  });
  const users = await t.run(ctx => ctx.db.query("users").take(100));
  const as = (name: string) => t.withIdentity({ subject: `${users.find(u => u.name === name)!._id}|session` });
  const rosa = as("Rosa Alvarez");
  const row = (await rosa.query(api.payments.getHeldPayments, {})).find(r => r.payment.amountCents === 48_000_000)!;
  const context = row.releaseContext!;
  const args = {
    paymentId: row.payment._id,
    verificationNote: "Called the stored number, spoke to Alex, and confirmed this exact payment destination.",
    verification: { context, confirmedAccountLast4: row.payment.accountLast4, calledPhoneOnFile: true },
  };
  const ledger = async () => (await rosa.query(api.payments.getLedger, {}))!;
  return { t, as, users, rosa, row, context, args, ledger };
}

test("prose confirming the old account cannot release the new destination without matching structured evidence", async () => {
  const { t, rosa, row, args, ledger } = await setup();
  const before = (await ledger()).balances;
  const note = "Called Brightline and confirmed the trusted account ending 2208.";
  expect(await rosa.mutation(api.payments.releasePayment, { paymentId: args.paymentId, verificationNote: note })).toMatchObject({ ok: false });
  expect(await rosa.mutation(api.payments.releasePayment, {
    ...args, verificationNote: note, verification: { ...args.verification, confirmedAccountLast4: "2208" },
  })).toMatchObject({ ok: false, reason: expect.stringContaining("destination") });
  expect((await ledger()).balances).toEqual(before);
  expect(await t.run(ctx => ctx.db.get("payments", row.payment._id))).toMatchObject({ status: "held" });
  const audit = await rosa.query(api.payments.getPaymentAudit, { paymentId: args.paymentId });
  expect(audit.map(a => a.rule)).toContain("structured_verification_required");
  expect(audit.map(a => a.rule)).toContain("verified_account_mismatch");
});

test.each(["amount", "destination", "bill description", "phone", "same-four bank record"] as const)(
  "%s changing during verification invalidates the frozen context without moving cash", async change => {
    const { t, rosa, row, args, context, ledger } = await setup();
    const before = (await ledger()).balances;
    await t.run(async ctx => {
      if (change === "amount") await ctx.db.patch("payments", row.payment._id, { amountCents: row.payment.amountCents + 100 });
      if (change === "destination") await ctx.db.patch("payments", row.payment._id, { accountLast4: "2208" });
      if (change === "bill description") await ctx.db.patch("bills", row.payment.billId, { description: "Substituted invoice purpose" });
      if (change === "phone") await ctx.db.patch("assets", row.payment.assetId, { phoneOnFile: "+1 (415) 555-9999" });
      if (change === "same-four bank record") await ctx.db.insert("bankDetailChanges", {
        assetId: row.payment.assetId, accountLast4: "7731", changedAt: context.latestBankRecord!.changedAt + 1, requestChannel: "email",
      });
    });
    expect(await rosa.mutation(api.payments.releasePayment, args)).toMatchObject({ ok: false, reason: expect.stringContaining("changed since") });
    expect((await ledger()).balances).toEqual(before);
    expect((await t.run(ctx => ctx.db.get("payments", row.payment._id)))?.releaseVerification).toBeUndefined();
  },
);

test("a freshly reviewed context cannot bypass a payment and bill amount mismatch", async () => {
  const { t, rosa, row, args, ledger } = await setup();
  await t.run(ctx => ctx.db.patch("bills", row.payment.billId, { amountCents: row.payment.amountCents + 100 }));
  const updated = (await rosa.query(api.payments.getHeldPayments, {})).find(r => r.payment._id === row.payment._id)!;
  const before = (await ledger()).balances;
  expect(await rosa.mutation(api.payments.releasePayment, { ...args,
    verification: { ...args.verification, context: updated.releaseContext! },
  })).toMatchObject({ ok: false, reason: expect.stringContaining("saved bill") });
  expect((await ledger()).balances).toEqual(before);
});

test("callback attestation and a usable stored number are required even with a fresh context", async () => {
  const { t, rosa, row, args } = await setup();
  expect(await rosa.mutation(api.payments.releasePayment, { ...args,
    verification: { ...args.verification, calledPhoneOnFile: false },
  })).toMatchObject({ ok: false, reason: expect.stringContaining("stored number") });
  await t.run(ctx => ctx.db.patch("assets", row.payment.assetId, { phoneOnFile: "not on file" }));
  const updated = (await rosa.query(api.payments.getHeldPayments, {})).find(r => r.payment._id === row.payment._id)!;
  expect(await rosa.mutation(api.payments.releasePayment, { ...args,
    verification: { ...args.verification, context: updated.releaseContext! },
  })).toMatchObject({ ok: false, reason: expect.stringContaining("callback number") });
});

test("a controller can explicitly verify the existing historical account without redirecting to the newest account", async () => {
  const { t, as, args } = await setup();
  const controller = as("Elena Ruiz");
  const row = (await controller.query(api.payments.getHeldPayments, {})).find(r => r.payment.accountLast4 === "2208")!;
  expect(row.releaseContext!.latestBankRecord!.accountLast4).toBe("7731");
  const before = (await controller.query(api.payments.getLedger, {}))!.balances.cash;
  expect(await controller.mutation(api.payments.releasePayment, {
    ...args, paymentId: row.payment._id,
    verification: { context: row.releaseContext!, confirmedAccountLast4: "2208", calledPhoneOnFile: true },
  })).toEqual({ ok: true });
  const saved = await t.run(ctx => ctx.db.get("payments", row.payment._id));
  expect(saved).toMatchObject({ status: "paid", accountLast4: "2208",
    releaseVerification: { confirmedAccountLast4: "2208", context: { latestBankRecord: { accountLast4: "7731" } } } });
  expect(before - (await controller.query(api.payments.getLedger, {}))!.balances.cash).toBe(row.payment.amountCents);
});

test("concurrent duplicate held payments for one bill cannot double-settle", async () => {
  const { t, rosa, row, args, ledger } = await setup();
  const duplicateId = await t.run(async ctx => {
    const { _id, _creationTime, ...payment } = (await ctx.db.get("payments", row.payment._id))!;
    void _id; void _creationTime;
    return await ctx.db.insert("payments", payment);
  });
  const duplicate = (await rosa.query(api.payments.getHeldPayments, {})).find(r => r.payment._id === duplicateId)!;
  const before = (await ledger()).balances.cash;
  const results = await Promise.all([
    rosa.mutation(api.payments.releasePayment, args),
    rosa.mutation(api.payments.releasePayment, { ...args, paymentId: duplicateId,
      verification: { ...args.verification, context: duplicate.releaseContext! } }),
  ]);
  expect(results.filter(r => r.ok)).toHaveLength(1);
  expect(results.find(r => !r.ok)).toMatchObject({ reason: expect.stringContaining("already has a paid payment") });
  expect(before - (await ledger()).balances.cash).toBe(row.payment.amountCents);
  expect(await t.run(async ctx => (await ctx.db.query("payments")
    .withIndex("by_billId_and_status", q => q.eq("billId", row.payment.billId).eq("status", "paid")).take(2)).length)).toBe(1);
});

test("successful release records immutable scoped facts and the exact balanced ledger entry", async () => {
  const { t, rosa, row, args, users } = await setup();
  expect(await rosa.mutation(api.payments.releasePayment, args)).toEqual({ ok: true });
  const saved = (await t.run(ctx => ctx.db.get("payments", row.payment._id)))!;
  const evidence = saved.releaseVerification!;
  expect(evidence).toMatchObject({ context: args.verification.context,
    confirmedAccountLast4: "7731", calledPhoneOnFile: true,
    attestedBy: users.find(u => u.name === "Rosa Alvarez")!._id,
    method: "controller_phone_attestation", identityScope: "masked_demo_account" });
  const ledgerEntry = await t.run(ctx => ctx.db.get("ledgerEntries", evidence.ledgerEntryId));
  expect(ledgerEntry).toMatchObject({ paymentId: row.payment._id, billId: row.payment.billId,
    lines: [ { account: "accounts_payable", debitCents: 48_000_000, creditCents: 0 },
      { account: "cash", debitCents: 0, creditCents: 48_000_000 } ] });
  await t.run(ctx => ctx.db.patch("assets", row.payment.assetId, { phoneOnFile: "+1 (415) 555-9999" }));
  expect((await t.run(ctx => ctx.db.get("payments", row.payment._id)))!.releaseVerification).toEqual(evidence);
  expect(await rosa.mutation(api.payments.releasePayment, args)).toMatchObject({ ok: false });
  expect((await rosa.query(api.payments.getHeldPayments, {})).find(r => r.payment._id === row.payment._id)!.releaseContext).toBeNull();
});

test("structured evidence grants no authority to the requester, a foreign controller or the firm", async () => {
  const { as, args } = await setup();
  for (const name of ["Jamie Chen", "Elena Ruiz", "Jordan Ames (Northpass Capital)"])
    expect(await as(name).mutation(api.payments.releasePayment, args)).toMatchObject({ ok: false });
});


test("same-suffix rehearsal fixture is restricted to demo mode and the seeded held stage payment", async () => {
  const { t, row, context } = await setup();
  try {
    vi.stubEnv("DEMO_MODE", "false");
    await expect(t.mutation(internal.paymentVerificationLab.replaceDemoPayeeRecord, { paymentId: row.payment._id })).rejects.toThrow("Demo mode");
    vi.stubEnv("DEMO_MODE", "true");
    const id = await t.mutation(internal.paymentVerificationLab.replaceDemoPayeeRecord, { paymentId: row.payment._id });
    expect(await t.run(ctx => ctx.db.get("bankDetailChanges", id))).toMatchObject({ accountLast4: context.latestBankRecord!.accountLast4 });
    await t.run(ctx => ctx.db.patch("payments", row.payment._id, { seedRef: "not-the-stage-fixture" }));
    await expect(t.mutation(internal.paymentVerificationLab.replaceDemoPayeeRecord, { paymentId: row.payment._id })).rejects.toThrow("seeded held");
  } finally { vi.unstubAllEnvs(); }
});
