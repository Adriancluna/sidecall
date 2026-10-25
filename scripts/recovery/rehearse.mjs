#!/usr/bin/env node
// Run after the original own-DEV rehearsal. Never resets, deploys or calls a model.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createTransport, optionsFor, runtimeEnv } from "../release/rehearse.mjs";
import { requireProof, redact, withCleanup } from "../release/core.mjs";

const options = optionsFor(process.argv.slice(2));
requireProof(process.argv.includes("--report"), "Supply an explicit --report scripts/recovery/report.json to preserve release evidence.");
const env = runtimeEnv(), transport = createTransport({ options, env });
requireProof(env.PRESENTER_KEY, "The matching local presenter key is required before any setup mutation; never paste it in chat.");
const report = { format: "sidecall-recovery-proof-v1", author: "Pegasus", sourceCommit: await transport.commit(),
  deployment: options.deployment, startedAt: new Date().toISOString(), passed: false, checks: [], cleanup: [],
  scope: "Synthetic payments and simulated callback assertions on Pegasus DEV. No real bank/Visa integration, model calls or real funds." };
const secrets = [env.PRESENTER_KEY, env.ANTHROPIC_API_KEY].filter(Boolean), cleanup = [], cleanupFailures = [];
const call = (kind, path, args, token) => transport.call(kind, path, args, token);
const query = (path, args, token) => call("query", path, args, token);
const mutate = (path, args, token) => call("mutation", path, args, token);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const check = (name, pass, evidence) => {
  report.checks.push({ name, passed: !!pass, at: new Date().toISOString(), evidence });
  requireProof(pass, `Recovery check failed: ${name}`); console.log(`PASS ${name}`);
};
async function signIn(email) {
  for (const flow of ["signIn", "signUp"]) {
    try {
      const result = await call("action", "auth:signIn", { provider: "password", params: { email, password: "sidecall-demo", flow } });
      if (!result?.tokens?.token) continue;
      const token = result.tokens.token; secrets.push(token, result.tokens.refreshToken);
      cleanup.push(async () => { await call("action", "auth:signOut", {}, token); report.cleanup.push({ email, signedOut: true }); });
      return token;
    } catch { /* Try the alternate seeded-demo authentication flow. */ }
  }
  throw new Error("Synthetic sign-in failed; details withheld.");
}
try {
  await withCleanup(async () => {
    const flags = await transport.flags();
    requireProof(flags.demoMode && !flags.aiLive, "Own DEV requires demo mode and live AI off.");
    const rosa = await signIn("rosa.alvarez@summithomehealth.example"), jamie = await signIn("jamie.chen@summithomehealth.example"), elena = await signIn("elena.ruiz@cedarridge.example");
    const ledger = token => query("payments:getLedger", {}, token);
    const rows = token => query("payments:getHeldPayments", {}, token);
    const baseline = await ledger(rosa), otherBefore = await ledger(elena);
    const bill = (await query("payments:getMyBills", {}, jamie)).find(r => r.bill.amountCents === 48_000_000);
    requireProof(bill?.payment?.status === "pending", "Run the original own-DEV rehearsal first; stage payment must be pending.");
    await transport.operator("seed:fireDemoIncident", { scenario: "brightline" });
    const source = (await rows(rosa)).find(r => r.payment._id === bill.payment._id);
    requireProof(source?.payment?.accountLast4 === "7731" && source.payment.status === "held", "Expected seeded held destination7731.");
    await mutate("payments:rejectPayment", { paymentId: source.payment._id, note: "Synthetic vendor callback confirmed the older destination; reject the changed account." }, rosa);
    const getView = () => query("paymentRecovery:getForPayment", { paymentId: source.payment._id }, rosa);
    let view = await getView();
    check("Rejecting the changed destination preserves cash and offers the known 2208 record", view?.destination?.accountLast4 === "2208" && same(baseline, await ledger(rosa)), { sourcePaymentId: source.payment._id, view, cashCents: baseline.balances.cash });
    const prepareArgs = () => ({ paymentId: source.payment._id, context: view.context, bankRecordId: view.destination.id, bankRecordChangedAt: view.destination.changedAt,
      confirmedAccountLast4: "2208", calledPhoneOnFile: true, verificationNote: "Synthetic callback: Alex confirmed the saved invoice amount and original2208 destination; no real call occurred." });
    const invalid = await mutate("paymentRecovery:prepare", { ...prepareArgs(), confirmedAccountLast4: "7731" }, rosa);
    const selfApproved = await mutate("paymentRecovery:prepare", prepareArgs(), jamie);
    const foreign = await query("paymentRecovery:getForPayment", { paymentId: source.payment._id }, elena);
    check("Wrong destination, self-approval and cross-company access cannot prepare a correction", !invalid.ok && !selfApproved.ok && foreign === null, { invalid, selfApproved, foreign });
    async function prepare() {
      view = await getView(); const result = await mutate("paymentRecovery:prepare", prepareArgs(), rosa);
      requireProof(result.ok, "Controller preparation failed."); return result.proposalId;
    }
    const first = await prepare();
    const controllerRequest = await mutate("paymentRecovery:requestReplacement", { proposalId: first }, rosa);
    const foreignRequest = await mutate("paymentRecovery:requestReplacement", { proposalId: first }, elena);
    check("Only a separate company AP clerk can request the prepared replacement", !controllerRequest.ok && !foreignRequest.ok, { controllerRequest, foreignRequest });
    await mutate("paymentRecovery:revoke", { proposalId: first }, rosa);
    const withdrawn = await mutate("paymentRecovery:requestReplacement", { proposalId: first }, jamie);
    check("Withdrawing the correction stops execution with no cash movement", !withdrawn.ok && same(baseline, await ledger(rosa)), { withdrawn });
    const old = await prepare(), current = await prepare();
    const superseded = await mutate("paymentRecovery:requestReplacement", { proposalId: old }, jamie);
    check("A replacement approval invalidates the previous proposal", !superseded.ok, { superseded, activeProposalId: current });
    const attempts = await Promise.all(Array.from({ length: 8 }, () => mutate("paymentRecovery:requestReplacement", { proposalId: current }, jamie)));
    requireProof(attempts[0].ok, "Replacement request failed.");
    const paymentId = attempts[0].paymentId;
    let all = await rows(rosa), replacement = all.find(r => r.payment._id === paymentId);
    check("Eight concurrent retries create one held2208 replacement and no debit", attempts.every(r => r.ok && r.paymentId === paymentId) &&
      all.filter(r => r.payment.recoveryProposalId === current).length === 1 && replacement?.payment.status === "held" &&
      replacement.payment.accountLast4 === "2208" && replacement.payment.recoveryFromPaymentId === source.payment._id && same(baseline, await ledger(rosa)),
    { attempts, replacement: replacement?.payment, cashCents: (await ledger(rosa)).balances.cash });

    // An unrelated, newly approved purchase can still complete while Brightline is quarantined.
    const loaded = await mutate("purchases:loadSamples", { presenterKey: env.PRESENTER_KEY }, rosa);
    requireProof(loaded.created, "Purchasing samples already exist; start from a clean original rehearsal.");
    const ordinary = (await query("payments:getMyBills", {}, jamie)).find(r => r.vendorName.startsWith("Northstar") && r.bill.amountCents === 18000);
    requireProof(ordinary && !ordinary.payment, "Unused routine invoice unavailable.");
    const mandateId = await mutate("purchases:approve", { billIds: [ordinary.bill._id], perPurchaseCents: 18000, budgetCents: 18000, expiresAt: Date.now() + 900_000 }, rosa);
    cleanup.push(async () => { await mutate("purchases:revoke", { mandateId }, rosa); report.cleanup.push({ approvalRevoked: true }); });
    const ordinaryPaid = await mutate("payments:requestPayment", { billId: ordinary.bill._id, requestId: `recovery-continuity-${source.payment._id}` }, jamie);
    check("An unrelated pre-approved180 purchase completes automatically while payroll stays held", ordinaryPaid.ok && ordinaryPaid.automatic &&
      (await rows(rosa)).find(r => r.payment._id === paymentId)?.payment.status === "held" && baseline.balances.cash - (await ledger(rosa)).balances.cash === 18000,
    { ordinaryPaid, payrollStatus: "held", unrelatedPurchaseCents: 18000 });
    const releaseArgs = { paymentId, verificationNote: "Synthetic final callback: Alex confirmed this corrected2208 request and full amount; no real call occurred.",
      verification: { context: replacement.releaseContext, confirmedAccountLast4: "2208", calledPhoneOnFile: true } };
    const requester = await mutate("payments:releasePayment", releaseArgs, jamie);
    const wrong = await mutate("payments:releasePayment", { ...releaseArgs, verification: { ...releaseArgs.verification, confirmedAccountLast4: "7731" } }, rosa);
    check("Recovery does not bypass requester segregation or final destination verification", !requester.ok && !wrong.ok, { requester, wrong });
    const beforeRelease = await ledger(rosa);
    const releases = await Promise.all([mutate("payments:releasePayment", releaseArgs, rosa), mutate("payments:releasePayment", releaseArgs, rosa)]);
    const afterRelease = await ledger(rosa); all = await rows(rosa); replacement = all.find(r => r.payment._id === paymentId);
    const posting = afterRelease.entries.filter(e => e.paymentId === paymentId);
    check("Verified recovery settles480K once with an auditable rejected-to-corrected ledger chain", releases.filter(r => r.ok).length === 1 &&
      beforeRelease.balances.cash - afterRelease.balances.cash === 48_000_000 && posting.length === 1 && posting[0].billId === source.payment.billId &&
      replacement.payment.status === "paid" && replacement.payment.releaseVerification.confirmedAccountLast4 === "2208" &&
      replacement.payment.releaseVerification.ledgerEntryId === posting[0]._id &&
      all.find(r => r.payment._id === source.payment._id)?.payment.status === "rejected",
    { releases, originalPaymentId: source.payment._id, replacement: replacement.payment, posting });
    view = await getView();
    check("Vendor master remains7731 and another company's ledger is unchanged", view.context.latestBankRecord.accountLast4 === "7731" && same(otherBefore, await ledger(elena)),
      { vendorMasterSuffix: view.context.latestBankRecord.accountLast4, otherCompanyUnchanged: true });
    report.passed = true;
  }, cleanup, cleanupFailures);
} catch { report.failure = "Recovery proof failed; raw error withheld. Inspect the last completed check and rerun from clean own DEV."; }
if (cleanupFailures.length) { report.passed = false; report.cleanupFailures = cleanupFailures; }
report.completedAt = new Date().toISOString();
const path = resolve(options.report); mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, JSON.stringify(redact(report, secrets), null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, cleanup: report.cleanup.length, report: path }));
if (!report.passed) process.exitCode = 1;
