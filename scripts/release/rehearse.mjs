#!/usr/bin/env node
// Focused LIVE synthetic release checks. Only tangible-koala-842; no reset, deploy or model calls.
// node scripts/release/rehearse.mjs --deployment tangible-koala-842 --report scripts/release/report.json
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv, promisify } from "node:util";
import { createOwnedDev, ProofError, requireProof, redact, withCleanup } from "./core.mjs";

const exec = promisify(execFile);
const DEPLOYMENT = "tangible-koala-842";
const EMAIL = {
  controller: "rosa.alvarez@summithomehealth.example",
  clerk: "jamie.chen@summithomehealth.example",
  otherController: "elena.ruiz@cedarridge.example",
};

export function optionsFor(argv) {
  const options = { deployment: null, report: "scripts/release/report.json" };
  const names = { "--deployment": "deployment", "--report": "report" };
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    requireProof(names[flag] && !seen.has(flag) && argv[i + 1] && !argv[i + 1].startsWith("--"),
      "Use only --deployment tangible-koala-842 and optional --report path.json.");
    seen.add(flag);
    options[names[flag]] = argv[++i];
  }
  requireProof(options.deployment === DEPLOYMENT, "This release rehearsal requires explicit --deployment tangible-koala-842.");
  return options;
}

export function runtimeEnv({ cwd = process.cwd(), env = process.env } = {}) {
  let result = {};
  for (const name of [".env", ".env.local"]) {
    if (!existsSync(resolve(cwd, name))) continue;
    try { result = { ...result, ...parseEnv(readFileSync(resolve(cwd, name), "utf8")) }; }
    catch { throw new ProofError(`Could not read ${name}; contents withheld.`); }
  }
  return { ...result, ...env };
}

export function createTransport({ options, cwd = process.cwd(), env = process.env,
  owned = createOwnedDev, fetchImpl = fetch, execImpl = exec }) {
  const guard = () => {
    requireProof(options.deployment === DEPLOYMENT, "Only the Pegasus DEV release rehearsal is allowed.");
    const target = owned({ argv: ["--deployment", DEPLOYMENT], cwd, env });
    requireProof(target.deployment === DEPLOYMENT, "Owned-DEV configuration changed; no request made.");
  };
  guard();
  async function cli(args) {
    guard();
    const childEnv = { ...env };
    delete childEnv.ANTHROPIC_API_KEY;
    try {
      const { stdout } = await execImpl("npx", ["--no-install", "convex", ...args,
        "--deployment-name", DEPLOYMENT, "--env-file", resolve(cwd, ".env.local")],
      { cwd, env: childEnv, timeout: 30_000, maxBuffer: 1024 * 1024 });
      return stdout.trim();
    } catch { throw new ProofError("Owned-DEV operator command failed; raw output withheld."); }
  }
  return {
    guard,
    async flags() {
      // Read only these two non-secret flags. In this CLI version an unset variable exits
      // successfully with empty stdout; command/network failures remain failures.
      const [demo, ai] = await Promise.all([cli(["env", "get", "DEMO_MODE"]), cli(["env", "get", "AI_LIVE"])]);
      return { demoMode: demo === "true", aiLive: ai === "true" };
    },
    async call(kind, path, args = {}, token) {
      guard();
      let response;
      try {
        response = await fetchImpl(`https://${DEPLOYMENT}.convex.cloud/api/${kind}`, {
          method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ path, args, format: "json" }), signal: AbortSignal.timeout(15_000),
        });
      } catch { throw new ProofError("Owned-DEV request failed; no mutation retry was made."); }
      let body;
      try { body = await response.json(); }
      catch { throw new ProofError("Owned-DEV returned invalid JSON; raw response withheld."); }
      requireProof(response.status === 200 && body?.status === "success", `Convex ${path} failed; raw response withheld.`);
      return body.value;
    },
    async operator(path, args) {
      requireProof(["seed:fireDemoIncident", "paymentVerificationLab:replaceDemoPayeeRecord"].includes(path),
        "Only the reviewed synthetic incident and release-verification fixture are allowed.");
      const raw = await cli(["run", path, JSON.stringify(args)]);
      if (!raw) return null;
      try { return JSON.parse(raw); }
      catch { throw new ProofError("Operator succeeded but returned invalid JSON; raw output withheld."); }
    },
    async commit() {
      try { return (await execImpl("git", ["rev-parse", "HEAD"], { cwd, timeout: 5000 })).stdout.trim(); }
      catch { throw new ProofError("Could not identify the source commit for release evidence."); }
    },
  };
}

function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function ledgerSnapshot(ledger) {
  requireProof(Array.isArray(ledger?.entries) && Number.isSafeInteger(ledger?.balances?.cash), "Ledger evidence unavailable.");
  return { balances: ledger.balances, entryIds: ledger.entries.map(row => row._id).sort() };
}
function paymentSnapshot(rows) {
  return rows.map(({ payment: p }) => ({ id: p._id, companyId: p.companyId, billId: p.billId,
    status: p.status, amountCents: p.amountCents, accountLast4: p.accountLast4,
    heldByIncidentId: p.heldByIncidentId, approvedBy: p.approvedBy, decidedAt: p.decidedAt }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
function exactPosting(entry, payment) {
  return entry && entry.paymentId === payment._id && entry.billId === payment.billId &&
    entry.companyId === payment.companyId && entry.lines?.length === 2 &&
    entry.lines.some(line => line.account === "accounts_payable" && line.debitCents === payment.amountCents && line.creditCents === 0) &&
    entry.lines.some(line => line.account === "cash" && line.debitCents === 0 && line.creditCents === payment.amountCents);
}

export async function runRehearsal({ options, transport, env = process.env,
  runId = `release-${randomUUID()}`, now = () => Date.now(), onProgress = () => {} }) {
  requireProof(options.deployment === DEPLOYMENT, "Only the Pegasus DEV release rehearsal is allowed.");
  transport.guard();
  const cleanup = [], cleanupFailures = [], secrets = [env.PRESENTER_KEY, env.ANTHROPIC_API_KEY].filter(Boolean);
  const report = { format: "sidecall.release-proof.v1", author: "Pegasus", runId,
    startedAt: new Date(now()).toISOString(), deployment: DEPLOYMENT, sourceCommit: null,
    source: "Live authenticated Convex queries/mutations with synthetic fixtures and concurrent release HTTP requests.",
    scope: "Demo ledger only; phone confirmations are simulated assertions, not evidence of real telephone calls or bank verification.",
    passed: false, checks: [], cleanup: [] };
  const check = (name, passed, evidence) => {
    report.checks.push({ name, passed: Boolean(passed), at: new Date(now()).toISOString(), evidence });
    requireProof(passed, `Release proof failed: ${name}.`);
    onProgress(`PASS ${name}`);
  };
  const query = (path, args, token) => transport.call("query", path, args, token);
  const mutate = (path, args, token) => transport.call("mutation", path, args, token);
  async function signIn(role) {
    for (const flow of ["signIn", "signUp"]) {
      try {
        const result = await transport.call("action", "auth:signIn", {
          provider: "password", params: { email: EMAIL[role], password: "sidecall-demo", flow },
        });
        const token = result?.tokens?.token;
        if (typeof token !== "string") continue;
        secrets.push(token, result.tokens.refreshToken);
        cleanup.push(async () => {
          await transport.call("action", "auth:signOut", {}, token);
          report.cleanup.push({ role, signedOut: true });
        });
        return token;
      } catch { /* Existing seeded identities can need the alternate auth flow. */ }
    }
    throw new ProofError(`Could not sign in as the synthetic ${role}.`);
  }
  try {
    await withCleanup(async () => {
      report.sourceCommit = await transport.commit();
      requireProof(/^[a-f0-9]{40}$/.test(report.sourceCommit), "Source commit must be a full Git SHA.");
      const flags = await transport.flags();
      requireProof(flags.demoMode === true && flags.aiLive === false,
        "Require own-DEV DEMO_MODE=true and AI_LIVE=false or unset; no setup mutation made.");
      report.environment = flags;
      const rosa = await signIn("controller"), jamie = await signIn("clerk"), elena = await signIn("otherController");
      const bills = await query("payments:getMyBills", {}, jamie);
      const targetBill = bills.find(row => row.bill.amountCents === 48_000_000 && row.vendorName === "Brightline Payroll Inc.");
      requireProof(targetBill?.payment?.status === "pending", "Expected unused $480K stage payment is unavailable; run the original own-DEV rehearsal separately first.");
      const sourcePayments = await query("payments:getHeldPayments", {}, rosa);
      requireProof(!sourcePayments.some(row => row.payment._id === targetBill.payment._id), "Stage payment already has an incident; start from clean own DEV.");
      await transport.operator("seed:fireDemoIncident", { scenario: "brightline" });
      const heldRows = await query("payments:getHeldPayments", {}, rosa);
      const held = heldRows.find(row => row.payment._id === targetBill.payment._id);
      requireProof(held?.payment.status === "held" && held.payment.accountLast4 === "7731" && held.releaseContext,
        "Deploy releaseContext and prepare the synthetic 7731 held payment before running this rehearsal.");
      report.payment = { paymentId: held.payment._id, billId: held.payment.billId, companyId: held.payment.companyId,
        amountCents: held.payment.amountCents, accountLast4: held.payment.accountLast4, releaseContext: held.releaseContext };
      const otherBaseline = {
        ledger: ledgerSnapshot(await query("payments:getLedger", {}, elena)),
        payments: paymentSnapshot(await query("payments:getHeldPayments", {}, elena)),
      };
      const heldNow = async (paymentId, token = rosa) => (await query("payments:getHeldPayments", {}, token))
        .find(row => row.payment._id === paymentId);
      const verification = (row, last4 = row.payment.accountLast4, called = true) => ({
        context: row.releaseContext, confirmedAccountLast4: last4, calledPhoneOnFile: called,
      });
      const note = "Synthetic rehearsal: Alex Morgan confirmed the displayed destination using the stored vendor phone; no real call occurred.";
      const release = (row, fields, token = rosa) => mutate("payments:releasePayment", {
        paymentId: row.payment._id, verificationNote: note, ...fields,
      }, token);
      async function refuses(name, row, fields, expectedRule, token = rosa) {
        const before = ledgerSnapshot(await query("payments:getLedger", {}, rosa));
        const beforeAudit = await query("payments:getPaymentAudit", { paymentId: row.payment._id }, rosa);
        const outcome = await release(row, fields, token);
        const after = ledgerSnapshot(await query("payments:getLedger", {}, rosa));
        const state = await heldNow(row.payment._id);
        const audit = await query("payments:getPaymentAudit", { paymentId: row.payment._id }, rosa);
        const ids = new Set(beforeAudit.map(item => item._id));
        const newRefusals = audit.filter(item => !ids.has(item._id) && item.action === "refused");
        check(name, outcome?.ok === false && state?.payment.status === "held" &&
          state.payment.accountLast4 === row.payment.accountLast4 && same(before, after) && newRefusals.length === 1 &&
          newRefusals[0].rule === expectedRule,
        { outcome, cashBeforeCents: before.balances.cash, cashAfterCents: after.balances.cash,
          unchangedLedger: same(before, after), refusal: newRefusals[0], accountLast4: state?.payment.accountLast4 });
      }
      await refuses("Legacy release without structured verification is audited and refused", held, {}, "structured_verification_required");
      await refuses("Confirming account 2208 cannot release the payment addressed to 7731", held,
        { verification: verification(held, "2208") }, "verified_account_mismatch");
      await refuses("The stored vendor phone must be confirmed", held,
        { verification: verification(held, "7731", false) }, "trusted_callback_required");
      await refuses("The requesting AP clerk cannot authorize its own release", held,
        { verification: verification(held) }, "segregation_of_duties", jamie);
      await refuses("Another company's controller cannot release Summit's payment", held,
        { verification: verification(held) }, "controller_at_company", elena);

      const stale = await heldNow(held.payment._id);
      await transport.operator("paymentVerificationLab:replaceDemoPayeeRecord", { paymentId: held.payment._id });
      const fresh = await heldNow(held.payment._id);
      check("A new same-suffix payee record changes the server's release context",
        fresh?.releaseContext?.latestBankRecord && stale.releaseContext.latestBankRecord &&
        fresh.releaseContext.latestBankRecord.id !== stale.releaseContext.latestBankRecord.id &&
        fresh.releaseContext.latestBankRecord.accountLast4 === stale.releaseContext.latestBankRecord.accountLast4 &&
        fresh.payment.accountLast4 === stale.payment.accountLast4 && !same(stale.releaseContext, fresh.releaseContext),
      { oldContext: stale.releaseContext, newContext: fresh?.releaseContext, unchangedPaymentAccount: stale.payment.accountLast4 });
      await refuses("A genuinely stale payee context cannot authorize release", stale,
        { verification: verification(stale) }, "verification_context_changed");

      const current = await heldNow(held.payment._id);
      const beforeRace = await query("payments:getLedger", {}, rosa);
      const race = await Promise.all([release(current, { verification: verification(current) }), release(current, { verification: verification(current) })]);
      const afterRace = await query("payments:getLedger", {}, rosa);
      const paid = await heldNow(current.payment._id);
      const postings = afterRace.entries.filter(entry => entry.paymentId === current.payment._id);
      const raceAudit = await query("payments:getPaymentAudit", { paymentId: current.payment._id }, rosa);
      check("Concurrent valid $480K releases settle once to the verified 7731 destination",
        race.filter(value => value?.ok === true).length === 1 && race.filter(value => value?.ok === false).length === 1 &&
        paid?.payment.status === "paid" && paid.payment.accountLast4 === "7731" &&
        beforeRace.balances.cash - afterRace.balances.cash === 48_000_000 &&
        postings.length === 1 && exactPosting(postings[0], current.payment) &&
        afterRace.entries.length === beforeRace.entries.length + 1 &&
        raceAudit.filter(row => row.action === "release").length === 1,
      { race, payment: paid?.payment, posting: postings[0], cashBeforeCents: beforeRace.balances.cash,
        cashAfterCents: afterRace.balances.cash, audit: raceAudit });
      const otherAfter = { ledger: ledgerSnapshot(await query("payments:getLedger", {}, elena)),
        payments: paymentSnapshot(await query("payments:getHeldPayments", {}, elena)) };
      check("Summit refusals and release leave Cedar Ridge payments and ledger unchanged", same(otherBaseline, otherAfter),
        { before: otherBaseline, after: otherAfter });

      const historic = (await query("payments:getHeldPayments", {}, elena))
        .find(row => row.payment.amountCents === 9_200_000 && row.payment.accountLast4 === "2208");
      requireProof(historic?.payment.status === "held" && historic.releaseContext?.latestBankRecord?.accountLast4 === "7731",
        "Cedar Ridge's historical 2208 payment with a different current vendor account is unavailable.");
      const beforeHistoric = await query("payments:getLedger", {}, elena);
      const historicResult = await release(historic, { verification: verification(historic, "2208") }, elena);
      const afterHistoric = await query("payments:getLedger", {}, elena);
      const historicPaid = await heldNow(historic.payment._id, elena);
      const historicEntries = afterHistoric.entries.filter(entry => entry.paymentId === historic.payment._id);
      check("A separately verified historical 2208 payment settles without account redirection",
        historicResult?.ok === true && historicPaid?.payment.status === "paid" && historicPaid.payment.accountLast4 === "2208" &&
        beforeHistoric.balances.cash - afterHistoric.balances.cash === 9_200_000 &&
        historicEntries.length === 1 && exactPosting(historicEntries[0], historic.payment) &&
        same(ledgerSnapshot(afterRace), ledgerSnapshot(await query("payments:getLedger", {}, rosa))),
      { outcome: historicResult, payment: historicPaid?.payment, context: historic.releaseContext, posting: historicEntries[0],
        cashBeforeCents: beforeHistoric.balances.cash, cashAfterCents: afterHistoric.balances.cash });
      report.passed = true;
    }, cleanup, cleanupFailures);
  } catch (error) {
    report.failure = error instanceof ProofError ? error.message : "Unexpected release rehearsal failure; details withheld to protect credentials.";
  }
  if (cleanupFailures.length) { report.cleanupFailures = cleanupFailures; report.passed = false; }
  report.completedAt = new Date(now()).toISOString();
  return redact(report, secrets);
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log("node scripts/release/rehearse.mjs --deployment tangible-koala-842 [--report path.json]\nLive synthetic release checks; never resets or deploys. Run the original own-DEV rehearsal first. See scripts/release/README.md.");
    return;
  }
  const options = optionsFor(process.argv.slice(2));
  const env = runtimeEnv();
  const transport = createTransport({ options, env });
  const report = await runRehearsal({ options, env, transport, onProgress: line => console.log(line) });
  const target = resolve(options.report);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, report: target, cleanup: report.cleanup.length }));
  if (!report.passed) process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof ProofError ? error.message : "Release rehearsal could not start; details withheld.");
    process.exitCode = 1;
  });
}
