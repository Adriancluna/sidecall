#!/usr/bin/env node
// Run after the original own-DEV rehearsal. Never resets, deploys or calls a model.
import { mkdirSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { createTransport, optionsFor, runtimeEnv } from "../release/rehearse.mjs";
import { ProofError, requireProof, redact, withCleanup } from "../release/core.mjs";

const options = optionsFor(process.argv.slice(2));
requireProof(process.argv.includes("--report"), "Supply an explicit --report scripts/recovery/report.json to preserve release evidence.");
const env = runtimeEnv(), transport = createTransport({ options, env });
requireProof(env.PRESENTER_KEY, "The matching local presenter key is required before any setup mutation; never paste it in chat.");
const report = { format: "sidecall-recovery-proof-v1", author: "Pegasus", sourceCommit: await transport.commit(),
  deployment: options.deployment, startedAt: new Date().toISOString(), passed: false, checks: [], cleanup: [],
  scope: "Synthetic payments and simulated callback assertions on Pegasus DEV. No real bank/Visa integration, model calls, external notifications or real funds. Stale-context, expiry and caller-scoped unlinked refusal audit rows are unit-only, not exercised by this live run. Foreign attempts are checked for no change to the target payment's state or linked audit.",
  retainedFixtures: "Synthetic incident, rejected/corrected payments, sample bills, journals and audits remain as evidence. Cleanup withdraws unused recovery authority, revokes the routine purchase approval and signs out test sessions; it never resets or deletes fixtures." };
const secrets = [env.PRESENTER_KEY, env.ANTHROPIC_API_KEY].filter(Boolean), cleanup = [], cleanupFailures = [];
const call = (kind, path, args, token) => transport.call(kind, path, args, token);
const query = (path, args, token) => call("query", path, args, token);
const mutate = (path, args, token) => call("mutation", path, args, token);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const exec = promisify(execFile);
async function notificationsAreOff() {
  transport.guard();
  const childEnv = { ...env }; delete childEnv.ANTHROPIC_API_KEY;
  try {
    // The shared release transport exposes only demo/AI flags; read this one non-secret flag
    // with the same explicit DEV selector. Never list or print the deployment environment.
    const { stdout } = await exec("npx", ["--no-install", "convex", "env", "get", "NOTIFY_LIVE",
      "--deployment-name", options.deployment, "--env-file", resolve(".env.local")],
    { env: childEnv, timeout: 30_000, maxBuffer: 1024 * 1024 });
    transport.guard();
    return stdout.trim() === "" || stdout.trim() === "false";
  } catch { throw new ProofError("Could not verify NOTIFY_LIVE is off; raw output withheld."); }
}
function exactPosting(entry, payment) {
  return entry?.paymentId === payment._id && entry.billId === payment.billId &&
    entry.companyId === payment.companyId && entry.lines?.length === 2 &&
    entry.lines.some(line => line.account === "accounts_payable" && line.debitCents === payment.amountCents && line.creditCents === 0) &&
    entry.lines.some(line => line.account === "cash" && line.debitCents === 0 && line.creditCents === payment.amountCents);
}
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
    requireProof(await notificationsAreOff(), "Own DEV requires NOTIFY_LIVE=false or unset before any setup mutation.");
    requireProof(/^[a-f0-9]{40}$/.test(report.sourceCommit), "A full source commit is required for the evidence report.");
    report.environment = { ...flags, notifyLive: false };
    const rosa = await signIn("rosa.alvarez@summithomehealth.example"), jamie = await signIn("jamie.chen@summithomehealth.example"), elena = await signIn("elena.ruiz@cedarridge.example");
    const ledger = token => query("payments:getLedger", {}, token);
    const rows = token => query("payments:getHeldPayments", {}, token);
    const controller = await query("access:me", {}, rosa), clerk = await query("access:me", {}, jamie);
    requireProof(controller?.role === "controller" && clerk?.role === "ap_clerk" && controller.companyId === clerk.companyId,
      "Expected separate controller and AP clerk identities are unavailable.");
    const baseline = await ledger(rosa), otherBefore = await ledger(elena);
    requireProof(Array.isArray(baseline?.entries) && baseline.entries.length < 190 && Number.isSafeInteger(baseline.balances?.cash),
      "A small, complete seeded ledger is required for exact journal assertions.");
    const bill = (await query("payments:getMyBills", {}, jamie)).find(r => r.bill.amountCents === 48_000_000 && r.vendorName === "Brightline Payroll Inc.");
    requireProof(bill?.payment?.status === "pending", "Run the original own-DEV rehearsal first; stage payment must be pending.");
    await transport.operator("seed:fireDemoIncident", { scenario: "brightline" });
    const source = (await rows(rosa)).find(r => r.payment._id === bill.payment._id);
    requireProof(source?.payment?.accountLast4 === "7731" && source.payment.status === "held" && source.payment.requestedBy === clerk._id, "Expected seeded held destination 7731.");
    const rejected = await mutate("payments:rejectPayment", { paymentId: source.payment._id, note: "Synthetic vendor callback confirmed the older destination; reject the changed account." }, rosa);
    const getView = () => query("paymentRecovery:getForPayment", { paymentId: source.payment._id }, rosa);
    let view = await getView();
    const rejectedPayment = (await rows(rosa)).find(r => r.payment._id === source.payment._id)?.payment;
    const destinationAgeDays = Math.floor((Date.now() - view?.destination?.changedAt) / 86_400_000);
    check("Rejecting the changed destination preserves cash and discloses the 150-day-old 2208 record and three later changes", rejected.ok &&
      rejectedPayment?.status === "rejected" && rejectedPayment.accountLast4 === "7731" && rejectedPayment.approvedBy === controller._id &&
      view?.destination?.accountLast4 === "2208" && destinationAgeDays === 150 &&
      view.destination.laterChangesCount === 3 && view.destination.laterChangesCapped === false &&
      view.latestProposal === null && same(baseline, await ledger(rosa)),
    { sourcePaymentId: source.payment._id, rejectedPayment, view, destinationAgeDays, cashCents: baseline.balances.cash });
    const originalBankRecord = view.context.latestBankRecord, originalDestination = view.destination;

    // Register before any preparation: an HTTP timeout can hide a successful server commit.
    // This source had no proposal before this run, so rediscovery cannot revoke prior work.
    let unknownPreparation = false, unknownPriorProposalId = null, knownProposalId = null;
    cleanup.push(async () => {
      const cleanupView = await getView();
      requireProof(cleanupView, "Recovery source became unavailable; cleanup is unverified.");
      let latest = cleanupView.latestProposal;
      const unknownResolved = !unknownPreparation || (latest && latest.id !== unknownPriorProposalId);
      if (latest?.status === "prepared") {
        await mutate("paymentRecovery:revoke", { proposalId: latest.id }, rosa);
        const verified = (await getView())?.latestProposal;
        requireProof(verified?.id === latest.id && verified.status === "revoked", "Prepared recovery authority was not withdrawn.");
        latest = verified;
      }
      requireProof(unknownResolved && (latest || !knownProposalId), "Preparation outcome could not be resolved; cleanup is unverified.");
      requireProof(!latest || ["requested", "revoked", "superseded"].includes(latest.status), "Recovery authority remains active.");
      report.cleanup.push({ kind: "payment_recovery", sourcePaymentId: source.payment._id,
        proposalId: latest?.id ?? null, storedStatus: latest?.status ?? "none", unusedAuthorityInactive: true,
        resolvedUnknownOutcome: unknownPreparation });
    });
    async function prepareRecovery(args, token) {
      const beforeId = (await getView())?.latestProposal?.id ?? null;
      try {
        const result = await mutate("paymentRecovery:prepare", args, token);
        if (result.ok) knownProposalId = result.proposalId;
        return result;
      } catch (error) { unknownPreparation = true; unknownPriorProposalId = beforeId; throw error; }
    }
    async function stateSnapshot() {
      const [accounting, held, bills, currentView] = await Promise.all([
        ledger(rosa), rows(rosa), query("payments:getMyBills", {}, jamie), getView(),
      ]);
      return { ledger: accounting, payments: held.filter(r => r.payment.billId === source.payment.billId)
        .map(r => r.payment).sort((a, b) => a._id.localeCompare(b._id)),
      billPayment: bills.find(r => r.bill._id === source.payment.billId)?.payment ?? null,
      recovery: currentView };
    }
    async function refusedWithoutEffects(label, run, auditPaymentId = source.payment._id, expectedRule = "payment_recovery_refused") {
      const before = await stateSnapshot();
      const beforeAudit = await query("payments:getPaymentAudit", { paymentId: auditPaymentId }, rosa);
      const outcome = await run();
      const after = await stateSnapshot();
      const audit = await query("payments:getPaymentAudit", { paymentId: auditPaymentId }, rosa);
      const previousIds = new Set(beforeAudit.map(row => row._id));
      const added = audit.filter(row => !previousIds.has(row._id));
      const correctAudit = expectedRule === null ? same(beforeAudit, audit)
        : added.length === 1 && added[0].action === "refused" && added[0].rule === expectedRule;
      requireProof(outcome?.ok === false && same(before, after) && correctAudit,
        `${label}: expected a refusal, unchanged stored payment/proposal/ledger and the appropriate audit.`);
      return { outcome, unchangedState: true, audit: added, auditScope: expectedRule === null
        ? "Target payment's linked audit unchanged; caller-scoped unlinked refusal is unit-tested only."
        : "One refusal linked to the caller's own-company payment." };
    }
    const prepareArgs = () => ({ paymentId: source.payment._id, context: view.context, bankRecordId: view.destination.id, bankRecordChangedAt: view.destination.changedAt,
      confirmedAccountLast4: "2208", calledPhoneOnFile: true, verificationNote: "Synthetic callback: Alex confirmed the saved invoice amount and original 2208 destination; no real call occurred." });
    const invalid = await refusedWithoutEffects("Wrong destination", () => prepareRecovery({ ...prepareArgs(), confirmedAccountLast4: "7731" }, rosa));
    const selfApproved = await refusedWithoutEffects("Requester preparation", () => prepareRecovery(prepareArgs(), jamie));
    const foreign = await query("paymentRecovery:getForPayment", { paymentId: source.payment._id }, elena);
    const foreignPrepare = await refusedWithoutEffects("Foreign preparation", () => prepareRecovery(prepareArgs(), elena), source.payment._id, null);
    check("Wrong destination, self-approval and cross-company access cannot prepare a correction", invalid.unchangedState && selfApproved.unchangedState && foreignPrepare.unchangedState && foreign === null,
      { invalid, selfApproved, foreignPrepare, foreign });
    const preparationAudits = [];
    async function prepare() {
      const beforeAudit = await query("payments:getPaymentAudit", { paymentId: source.payment._id }, rosa);
      view = await getView(); const result = await prepareRecovery(prepareArgs(), rosa);
      requireProof(result.ok, "Controller preparation failed.");
      const saved = (await getView())?.latestProposal;
      requireProof(saved?.id === result.proposalId && saved.status === "prepared" && saved.accountLast4 === "2208" && saved.amountCents === source.payment.amountCents,
        "Prepared response must match the saved correction.");
      const beforeIds = new Set(beforeAudit.map(row => row._id));
      const added = (await query("payments:getPaymentAudit", { paymentId: source.payment._id }, rosa)).filter(row => !beforeIds.has(row._id));
      requireProof(added.length === 1 && added[0].action === "prepare" && added[0].rule === "payment_recovery_prepared" &&
        added[0].actor === controller._id && added[0].companyId === controller.companyId && added[0].paymentId === source.payment._id,
      "Controller preparation must record preparation, not payment approval or release.");
      preparationAudits.push({ proposalId: result.proposalId, audit: added[0] });
      return result.proposalId;
    }
    const first = await prepare();
    const controllerRequest = await refusedWithoutEffects("Controller execution", () => mutate("paymentRecovery:requestReplacement", { proposalId: first }, rosa));
    const foreignRequest = await refusedWithoutEffects("Foreign execution", () => mutate("paymentRecovery:requestReplacement", { proposalId: first }, elena), source.payment._id, null);
    check("Only a separate company AP clerk can request the prepared replacement", controllerRequest.unchangedState && foreignRequest.unchangedState, { controllerRequest, foreignRequest });
    const revoked = await mutate("paymentRecovery:revoke", { proposalId: first }, rosa);
    const revokedState = (await getView()).latestProposal;
    const withdrawn = await refusedWithoutEffects("Withdrawn correction", () => mutate("paymentRecovery:requestReplacement", { proposalId: first }, jamie));
    check("Withdrawing the correction stops execution with no cash movement", revoked.ok && revokedState.id === first && revokedState.status === "revoked" &&
      withdrawn.unchangedState && same(baseline, await ledger(rosa)), { revoked, revokedState, withdrawn });
    const old = await prepare(), current = await prepare();
    const superseded = await refusedWithoutEffects("Superseded correction", () => mutate("paymentRecovery:requestReplacement", { proposalId: old }, jamie));
    check("A new preparation invalidates the previous proposal and is audited as prepare", superseded.unchangedState && (await getView()).latestProposal.id === current,
      { superseded, activeProposalId: current, preparationAudits });
    const attempts = await Promise.all(Array.from({ length: 8 }, () => mutate("paymentRecovery:requestReplacement", { proposalId: current }, jamie)));
    requireProof(attempts[0].ok, "Replacement request failed.");
    const paymentId = attempts[0].paymentId;
    let all = await rows(rosa), replacement = all.find(r => r.payment._id === paymentId);
    const consumed = (await getView()).latestProposal;
    const recoveryHoldAudit = (await query("payments:getPaymentAudit", { paymentId }, rosa))
      .filter(row => row.action === "hold" && row.rule === "payment_recovery_requires_release");
    const ageAtHoldDays = Math.floor((recoveryHoldAudit[0]?.at - originalDestination.changedAt) / 86_400_000);
    const ageWarning = `Destination 2208 was last confirmed by phone ${ageAtHoldDays} days ago; superseded by 3 later bank changes. Confirm on the call that this is still current.`;
    check("Eight concurrent retries create one held 2208 replacement and no debit", attempts.every(r => r.ok && r.paymentId === paymentId) &&
      all.filter(r => r.payment.recoveryProposalId === current).length === 1 && replacement?.payment.status === "held" &&
      all.filter(r => r.payment.billId === source.payment.billId && r.payment.status !== "rejected").length === 1 &&
      replacement.payment.accountLast4 === "2208" && replacement.payment.requestedBy === clerk._id && replacement.payment.recoveryFromPaymentId === source.payment._id &&
      recoveryHoldAudit.length === 1 && ageAtHoldDays === 150 && replacement.holdReasons.join(" ").includes(ageWarning) &&
      recoveryHoldAudit[0].reason === replacement.holdReasons[0] && recoveryHoldAudit[0].actor === "system" &&
      recoveryHoldAudit[0].companyId === controller.companyId &&
      consumed.id === current && consumed.status === "requested" && consumed.replacementPaymentId === paymentId && same(baseline, await ledger(rosa)),
    { attempts, consumed, replacement: replacement?.payment, holdReasons: replacement?.holdReasons, recoveryHoldAudit, ageAtHoldDays,
      cashCents: (await ledger(rosa)).balances.cash });

    // An unrelated, newly approved purchase can still complete while Brightline is quarantined.
    const loaded = await mutate("purchases:loadSamples", { presenterKey: env.PRESENTER_KEY }, rosa);
    requireProof(loaded.created, "Purchasing samples already exist; start from a clean original rehearsal.");
    const ordinary = (await query("payments:getMyBills", {}, jamie)).find(r => r.vendorName.startsWith("Northstar") && r.bill.amountCents === 18000);
    requireProof(ordinary && !ordinary.payment, "Unused routine invoice unavailable.");
    const mandateForSample = async () => (await query("purchases:overview", {}, rosa))?.mandates?.find(m => m.assetId === ordinary.bill.assetId);
    requireProof(!await mandateForSample(), "The new routine-purchase fixture must not have an existing approval.");
    let mandateId = null, unknownApproval = false;
    cleanup.push(async () => {
      // The asset was freshly created by this run and had no approval. Rediscover it even if
      // approve committed but its response timed out, without touching another vendor's grant.
      let saved = await mandateForSample();
      if (!saved) {
        requireProof(!mandateId && !unknownApproval, "Unknown purchase approval outcome could not be resolved; cleanup is unverified.");
        report.cleanup.push({ kind: "purchase_approval", assetId: ordinary.bill.assetId, storedStatus: "none" });
        return;
      }
      requireProof((!mandateId || saved._id === mandateId) && saved.companyId === controller.companyId && saved.approvedBy === controller._id &&
        saved.perPurchaseCents === 18000 && saved.budgetCents === 18000 && saved.billCount === 1, "Discovered approval does not match this rehearsal.");
      const ownedId = saved._id;
      await mutate("purchases:revoke", { mandateId: ownedId }, rosa);
      saved = await mandateForSample();
      requireProof(saved?._id === ownedId && typeof saved.revokedAt === "number", "Purchase approval revocation was not stored.");
      report.cleanup.push({ kind: "purchase_approval", mandateId: ownedId, approvalRevoked: true, revokedAt: saved.revokedAt,
        resolvedUnknownOutcome: unknownApproval });
    });
    try { mandateId = await mutate("purchases:approve", { billIds: [ordinary.bill._id], perPurchaseCents: 18000, budgetCents: 18000, expiresAt: Date.now() + 900_000 }, rosa); }
    catch (error) { unknownApproval = true; throw error; }
    const ordinaryPaid = await mutate("payments:requestPayment", { billId: ordinary.bill._id, requestId: `recovery-continuity-${source.payment._id}` }, jamie);
    const ordinaryRow = (await query("payments:getMyBills", {}, jamie)).find(r => r.bill._id === ordinary.bill._id);
    const ordinaryPosting = (await ledger(rosa)).entries.filter(e => e.paymentId === ordinaryPaid.paymentId);
    check("An unrelated pre-approved $180 purchase completes automatically while payroll stays held", ordinaryPaid.ok && ordinaryPaid.automatic &&
      ordinaryRow?.payment?._id === ordinaryPaid.paymentId && ordinaryRow.payment.status === "paid" &&
      ordinaryRow.payment.purchaseMandateId === mandateId && ordinaryPosting.length === 1 &&
      exactPosting(ordinaryPosting[0], { ...ordinary.bill, _id: ordinaryPaid.paymentId, billId: ordinary.bill._id }) &&
      (await rows(rosa)).find(r => r.payment._id === paymentId)?.payment.status === "held" && baseline.balances.cash - (await ledger(rosa)).balances.cash === 18000,
    { ordinaryPaid, ordinaryPayment: ordinaryRow?.payment, ordinaryPosting, payrollStatus: "held", unrelatedPurchaseCents: 18000 });
    const releaseArgs = { paymentId, verificationNote: "Synthetic final callback: Alex confirmed this corrected 2208 request and full amount; no real call occurred.",
      verification: { context: replacement.releaseContext, confirmedAccountLast4: "2208", calledPhoneOnFile: true } };
    const requester = await refusedWithoutEffects("Requester release", () => mutate("payments:releasePayment", releaseArgs, jamie), paymentId, "segregation_of_duties");
    const wrong = await refusedWithoutEffects("Wrong final destination", () => mutate("payments:releasePayment", { ...releaseArgs, verification: { ...releaseArgs.verification, confirmedAccountLast4: "7731" } }, rosa), paymentId, "verified_account_mismatch");
    check("Recovery does not bypass requester segregation or final destination verification", requester.unchangedState && wrong.unchangedState, { requester, wrong });
    const beforeRelease = await ledger(rosa);
    const auditBeforeRelease = await query("payments:getPaymentAudit", { paymentId }, rosa);
    const releases = await Promise.all([mutate("payments:releasePayment", releaseArgs, rosa), mutate("payments:releasePayment", releaseArgs, rosa)]);
    const afterRelease = await ledger(rosa); all = await rows(rosa); replacement = all.find(r => r.payment._id === paymentId);
    const posting = afterRelease.entries.filter(e => e.paymentId === paymentId);
    const previousEntries = new Set(beforeRelease.entries.map(e => e._id));
    const newEntries = afterRelease.entries.filter(e => !previousEntries.has(e._id));
    const releaseAudit = await query("payments:getPaymentAudit", { paymentId }, rosa);
    const previousAudits = new Set(auditBeforeRelease.map(a => a._id));
    const newReleaseAudits = releaseAudit.filter(a => !previousAudits.has(a._id) && a.action === "release");
    const paid = replacement?.payment, proof = paid?.releaseVerification;
    check("Verified recovery settles $480K once with an auditable rejected-to-corrected ledger chain", releases.filter(r => r.ok === true).length === 1 &&
      releases.filter(r => r.ok === false).length === 1 &&
      beforeRelease.balances.cash - afterRelease.balances.cash === 48_000_000 &&
      beforeRelease.balances.accounts_payable - afterRelease.balances.accounts_payable === 48_000_000 &&
      beforeRelease.balances.expense === afterRelease.balances.expense && beforeRelease.balances.equity === afterRelease.balances.equity &&
      newEntries.length === 1 && posting.length === 1 && newEntries[0]._id === posting[0]._id && afterRelease.entries.length === beforeRelease.entries.length + 1 &&
      paid?.status === "paid" && paid.amountCents === source.payment.amountCents && paid.accountLast4 === "2208" && exactPosting(posting[0], paid) &&
      paid.billId === source.payment.billId && paid.companyId === source.payment.companyId && paid.requestedBy === clerk._id && paid.approvedBy === controller._id &&
      paid.recoveryFromPaymentId === source.payment._id && paid.recoveryProposalId === current &&
      proof?.confirmedAccountLast4 === "2208" && proof.calledPhoneOnFile === true && proof.attestedBy === controller._id &&
      proof.method === "controller_phone_attestation" && proof.identityScope === "masked_demo_account" &&
      same(proof.context, releaseArgs.verification.context) && proof.ledgerEntryId === posting[0]._id && proof.attestedAt === paid.decidedAt && posting[0].date === paid.decidedAt &&
      newReleaseAudits.length === 1 && releaseAudit.filter(a => a.action === "release").length === 1 &&
      newReleaseAudits[0].actor === controller._id && newReleaseAudits[0].rule === "controller_release_after_verification" &&
      newReleaseAudits[0].reason === releaseArgs.verificationNote && same(all.find(r => r.payment._id === source.payment._id)?.payment, rejectedPayment),
    { releases, originalPaymentId: source.payment._id, replacement: paid, posting, releaseAudit,
      balancesBefore: beforeRelease.balances, balancesAfter: afterRelease.balances });
    view = await getView();
    check("Vendor master remains 7731 and another company's ledger is unchanged", same(view.context.latestBankRecord, originalBankRecord) &&
      same(view.destination, originalDestination) && view.context.latestBankRecord.accountLast4 === "7731" && same(otherBefore, await ledger(elena)),
      { vendorMasterSuffix: view.context.latestBankRecord.accountLast4, otherCompanyUnchanged: true });
    report.passed = true;
  }, cleanup, cleanupFailures);
} catch (error) { report.failure = error instanceof ProofError ? error.message : "Recovery proof failed; raw error withheld. Inspect the last completed check and rerun from clean own DEV."; }
if (cleanupFailures.length) { report.passed = false; report.cleanupFailures = cleanupFailures; }
report.completedAt = new Date().toISOString();
const path = resolve(options.report); mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, JSON.stringify(redact(report, secrets), null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, cleanup: report.cleanup.length, report: path }));
if (!report.passed) process.exitCode = 1;
