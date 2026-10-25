/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
async function setup() {
  const t = convexTest(schema, modules); rateLimiterTest.register(t);
  await t.mutation(internal.seed.run, {});
  await t.mutation(internal.seed.fireDemoIncident, { scenario: "brightline" });
  const users = await t.run(ctx => ctx.db.query("users").take(100));
  const as = (name: string) => t.withIdentity({ subject: `${users.find(u => u.name === name)!._id}|session` });
  const rosa = as("Rosa Alvarez"), jamie = as("Jamie Chen"), elena = as("Elena Ruiz");
  const row = (await rosa.query(api.payments.getHeldPayments, {})).find(r => r.payment.amountCents === 48_000_000)!;
  await rosa.mutation(api.payments.rejectPayment, { paymentId: row.payment._id, note: "Vendor confirmed the older destination; reject the changed account." });
  const view = (await rosa.query(api.paymentRecovery.getForPayment, { paymentId: row.payment._id }))!;
  const args = { paymentId: row.payment._id, context: view.context, bankRecordId: view.destination!.id, bankRecordChangedAt: view.destination!.changedAt,
    confirmedAccountLast4: "2208", calledPhoneOnFile: true, verificationNote: "Called the stored vendor number; Alex confirmed the amount and original 2208 destination." };
  const prepare = async () => {
    const r = await rosa.mutation(api.paymentRecovery.prepare, args);
    expect(r.ok).toBe(true); if (!r.ok) throw new Error(r.reason); return r.proposalId;
  };
  const ledger = async () => (await rosa.query(api.payments.getLedger, {}))!;
  return { t, users, as, rosa, jamie, elena, row, view, args, prepare, ledger };
}

test("recovery completes reject7731 → corrected2208 held → separately verified one ledger payment without changing vendor master", async () => {
  const { t, rosa, jamie, elena, row, prepare, ledger } = await setup();
  const before = await ledger(), other = await elena.query(api.payments.getLedger, {});
  const bankBefore = await t.run(ctx => ctx.db.query("bankDetailChanges").take(100));
  const proposalId = await prepare();
  const requests = await Promise.all([jamie.mutation(api.paymentRecovery.requestReplacement, { proposalId }), jamie.mutation(api.paymentRecovery.requestReplacement, { proposalId })]);
  expect(requests[0]).toEqual(requests[1]);
  const requested = requests[0]; if (!requested.ok) throw new Error(requested.reason);
  const replacement = (await rosa.query(api.payments.getHeldPayments, {})).find(r => r.payment._id === requested.paymentId)!;
  expect(replacement.payment).toMatchObject({ status: "held", accountLast4: "2208", recoveryFromPaymentId: row.payment._id, recoveryProposalId: proposalId });
  expect(await ledger()).toEqual(before);
  const release = { paymentId: requested.paymentId, verificationNote: "Called vendor again and confirmed this corrected request and destination.",
    verification: { context: replacement.releaseContext!, confirmedAccountLast4: "2208", calledPhoneOnFile: true } };
  expect(await jamie.mutation(api.payments.releasePayment, release)).toMatchObject({ ok: false });
  const settled = await Promise.all([rosa.mutation(api.payments.releasePayment, release), rosa.mutation(api.payments.releasePayment, release)]);
  expect(settled.filter(r => r.ok)).toHaveLength(1);
  const after = await ledger();
  expect(before.balances.cash - after.balances.cash).toBe(48_000_000);
  expect(after.entries.filter(e => e.paymentId === requested.paymentId)).toHaveLength(1);
  expect(await t.run(ctx => ctx.db.get("payments", row.payment._id))).toMatchObject({ status: "rejected", accountLast4: "7731" });
  expect(await t.run(ctx => ctx.db.query("bankDetailChanges").take(100))).toEqual(bankBefore);
  expect(await elena.query(api.payments.getLedger, {})).toEqual(other);
});

test("correction needs distinct company controller and AP roles; a leaked proposal grants no authority", async () => {
  const { rosa, jamie, elena, as, args, prepare, row } = await setup();
  for (const actor of [jamie, elena, as("Jordan Ames (Northpass Capital)")])
    expect(await actor.mutation(api.paymentRecovery.prepare, args)).toMatchObject({ ok: false });
  expect(await elena.query(api.paymentRecovery.getForPayment, { paymentId: row.payment._id })).toBeNull();
  const proposalId = await prepare();
  for (const actor of [rosa, elena, as("Kwame Mensah"), as("Jordan Ames (Northpass Capital)")])
    expect(await actor.mutation(api.paymentRecovery.requestReplacement, { proposalId })).toMatchObject({ ok: false });
  expect(await jamie.mutation(api.paymentRecovery.revoke, { proposalId })).toMatchObject({ ok: false });
});

test.each(["wrong suffix", "no callback", "short note", "email bank record"] as const)("preparation refuses %s", async attack => {
  const { rosa, args, view } = await setup();
  const input = { ...args };
  if (attack === "wrong suffix") input.confirmedAccountLast4 = "7731";
  if (attack === "no callback") input.calledPhoneOnFile = false;
  if (attack === "short note") input.verificationNote = "ok";
  if (attack === "email bank record") input.bankRecordId = view.context.latestBankRecord!.id;
  expect(await rosa.mutation(api.paymentRecovery.prepare, input)).toMatchObject({ ok: false });
});

test.each(["invoice", "phone", "new email record", "verified destination", "controller authority"] as const)("prepared correction fails closed when %s changes", async change => {
  const { t, rosa, jamie, row, args, prepare, ledger, users } = await setup();
  const proposalId = await prepare(), before = await ledger();
  await t.run(async ctx => {
    if (change === "invoice") await ctx.db.patch("bills", row.payment.billId, { amountCents: row.payment.amountCents + 1 });
    if (change === "phone") await ctx.db.patch("assets", row.payment.assetId, { phoneOnFile: "+1 555 777 9999" });
    if (change === "new email record") await ctx.db.insert("bankDetailChanges", { assetId: row.payment.assetId, changedAt: Date.now() + 1, accountLast4: "7731", requestChannel: "email" });
    if (change === "verified destination") await ctx.db.patch("bankDetailChanges", args.bankRecordId, { accountLast4: "9999" });
    if (change === "controller authority") await ctx.db.patch("users", users.find(u => u.name === "Rosa Alvarez")!._id, { role: "it" });
  });
  expect(await jamie.mutation(api.paymentRecovery.requestReplacement, { proposalId })).toMatchObject({ ok: false });
  expect(await ledger()).toEqual(before);
  if (change !== "controller authority") expect(await rosa.mutation(api.paymentRecovery.prepare, args)).toMatchObject({ ok: false });
});

test.each(["revoked", "expired", "superseded"] as const)("%s correction cannot create a replacement", async state => {
  const { t, rosa, jamie, prepare, ledger } = await setup();
  const proposalId = await prepare(), before = await ledger();
  if (state === "revoked") expect(await rosa.mutation(api.paymentRecovery.revoke, { proposalId })).toEqual({ ok: true });
  if (state === "expired") await t.run(ctx => ctx.db.patch("paymentRecoveries", proposalId, { expiresAt: Date.now() - 1 }));
  if (state === "superseded") await prepare();
  expect(await jamie.mutation(api.paymentRecovery.requestReplacement, { proposalId })).toMatchObject({ ok: false });
  expect(await ledger()).toEqual(before);
});

test("containment and disabled automatic holds never bypass the final recovery release", async () => {
  const { t, jamie, row, prepare } = await setup();
  const proposalId = await prepare();
  await t.run(async ctx => {
    await ctx.db.patch("incidents", row.payment.heldByIncidentId!, { containedAt: Date.now() });
    await ctx.db.patch("companies", row.payment.companyId, { holdRuleEnabled: false });
  });
  const result = await jamie.mutation(api.paymentRecovery.requestReplacement, { proposalId });
  if (!result.ok) throw new Error(result.reason);
  expect(await t.run(ctx => ctx.db.get("payments", result.paymentId))).toMatchObject({ status: "held", accountLast4: "2208" });
});

test("a racing ordinary request and correction can create only one live payment for the bill", async () => {
  const { t, jamie, row, prepare } = await setup();
  const proposalId = await prepare();
  const results = await Promise.all([jamie.mutation(api.paymentRecovery.requestReplacement, { proposalId }),
    jamie.mutation(api.payments.requestPayment, { billId: row.payment.billId })]);
  expect(results.filter(r => r.ok)).toHaveLength(1);
  const all = await t.run(ctx => ctx.db.query("payments").withIndex("by_billId_and_status", q => q.eq("billId", row.payment.billId)).take(10));
  expect(all.filter(p => p.status !== "rejected")).toHaveLength(1);
});


test("editing verified provenance in place invalidates a controller's already-open correction form", async () => {
  const { t, rosa, args } = await setup();
  await t.run(ctx => ctx.db.patch("bankDetailChanges", args.bankRecordId, { changedAt: args.bankRecordChangedAt + 1 }));
  expect(await rosa.mutation(api.paymentRecovery.prepare, args)).toMatchObject({ ok: false });
});

test("old verified destination discloses subsequent changes in the form and hold evidence; preparation is not approval", async () => {
  const { rosa, jamie, row, view, prepare } = await setup();
  expect(view.destination).toMatchObject({ accountLast4: "2208", laterChangesCount: 3, laterChangesCapped: false });
  const ageDays = Math.floor((Date.now() - view.destination!.changedAt) / 86_400_000);
  expect(ageDays).toBe(150);
  const proposalId = await prepare();
  const audit = await rosa.query(api.payments.getPaymentAudit, { paymentId: row.payment._id });
  expect(audit.find(a => a.rule === "payment_recovery_prepared")?.action).toBe("prepare");
  const result = await jamie.mutation(api.paymentRecovery.requestReplacement, { proposalId });
  if (!result.ok) throw new Error(result.reason);
  const replacement = (await rosa.query(api.payments.getHeldPayments, {})).find(r => r.payment._id === result.paymentId)!;
  expect(replacement.holdReasons.join(" ")).toContain("last confirmed by phone 150 days ago; superseded by 3 later bank changes");
  expect(replacement.holdReasons.join(" ")).toContain("Confirm on the call that this is still current.");
});

test("large bank history is bounded and disclosed as a lower bound", async () => {
  const { t, rosa, row, view } = await setup();
  await t.run(async ctx => {
    for (let i = 1; i <= 101; i++) await ctx.db.insert("bankDetailChanges", {
      assetId: row.payment.assetId, changedAt: view.destination!.changedAt + i,
      accountLast4: "0193", requestChannel: "portal",
    });
  });
  const current = await rosa.query(api.paymentRecovery.getForPayment, { paymentId: row.payment._id });
  expect(current?.destination).toMatchObject({ laterChangesCount: 100, laterChangesCapped: true });
});

const refusedCases = (["prepare", "request", "revoke"] as const).flatMap(operation =>
  (["foreign", "unknown", "wrong role"] as const).map(scope => ({ operation, scope })));
test.each(refusedCases)("$operation logs $scope refusals without leaking foreign payment facts", async ({ operation, scope }) => {
  const { t, rosa, jamie, elena, row, args, prepare, ledger, users } = await setup();
  const proposalId = await prepare();
  if (scope === "unknown") await t.run(async ctx => {
    if (operation === "prepare") await ctx.db.delete("payments", row.payment._id);
    else await ctx.db.delete("paymentRecoveries", proposalId);
  });
  const actor = scope === "foreign" ? elena : scope === "wrong role" ? (operation === "request" ? rosa : jamie) : rosa;
  const actorName = scope === "foreign" ? "Elena Ruiz" : scope === "wrong role" && operation !== "request" ? "Jamie Chen" : "Rosa Alvarez";
  const user = users.find(u => u.name === actorName)!;
  const before = await t.run(ctx => ctx.db.query("auditLog").take(100)), cashBefore = await ledger();
  const result = operation === "prepare" ? await actor.mutation(api.paymentRecovery.prepare, args)
    : operation === "request" ? await actor.mutation(api.paymentRecovery.requestReplacement, { proposalId })
    : await actor.mutation(api.paymentRecovery.revoke, { proposalId });
  expect(result.ok).toBe(false);
  const oldIds = new Set(before.map(a => a._id));
  const added = (await t.run(ctx => ctx.db.query("auditLog").take(100))).filter(a => !oldIds.has(a._id));
  expect(added).toHaveLength(1);
  expect(added[0]).toMatchObject({ actor: user._id, companyId: user.companyId, action: "refused", rule: "payment_recovery_refused" });
  if (scope === "wrong role") expect(added[0].paymentId).toBe(row.payment._id);
  else {
    expect(added[0].paymentId).toBeUndefined();
    expect(added[0].incidentId).toBeUndefined();
    expect(added[0].reason).not.toMatch(/2208|7731|Brightline|480000/);
  }
  expect(await ledger()).toEqual(cashBefore);
});
