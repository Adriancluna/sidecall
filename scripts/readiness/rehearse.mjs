#!/usr/bin/env node
// Own DEV only, after the original rehearsal. No reset, deployment, model call or incident.
// Temporarily toggles one synthetic company's hold rule, then restores it in finally.
import { writeFileSync } from "node:fs";
import { ConvexClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { createOwnedDev } from "../scorecard/ownedDev.mjs";

const options = process.argv.slice(2);
let reportPath;
let fixturePath;
for (let i = 0; i < options.length; i += 2) {
  if (!options[i + 1] || !["--report", "--fixture"].includes(options[i])) throw Error("Use --report path and optional --fixture path.");
  if (options[i] === "--report") reportPath = options[i + 1];
  else fixturePath = options[i + 1];
}
const { deployment } = createOwnedDev();
const cloud = `https://${deployment}.convex.cloud`;
const startedAt = new Date().toISOString();
const checks = [];
const pass = (name) => { checks.push({ name, passed: true }); console.log(`PASS ${name}`); };
const requireCheck = (value, message) => { if (!value) throw Error(message); };
async function call(kind, path, args = {}, token) {
  const response = await fetch(`${cloud}/api/${kind}`, {
    method: "POST", signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  const result = await response.json();
  if (result.status !== "success") throw Error(`Call ${path} was refused or failed.`);
  return result.value;
}
async function signIn(email) {
  for (const flow of ["signIn", "signUp"]) {
    try {
      const result = await call("action", "auth:signIn", { provider: "password",
        params: { email, password: "sidecall-demo", flow } });
      if (result?.tokens?.token) return result.tokens.token;
    } catch { /* Seeded demo user may need first-use signup. */ }
  }
  throw Error("Demo sign-in failed.");
}
let client;
let stop;
let controller;
let originalMode;
let mustRestore = false;
let restored = false;
let failure = null;
let socketCleanupFailed = false;
try {
  const tokens = await Promise.all([signIn("rosa.alvarez@summithomehealth.example"),
    signIn("sofia.bianchi@pinecreststaffing.example"), signIn("jordan.ames@northpasscapital.example")]);
  const [summitToken, , firmToken] = tokens;
  controller = summitToken;
  const args = { asOf: Date.now() };
  const advice = token => call("query", "ai:getStopLossAdvice", args, token);
  let denied = false;
  try { await advice(); } catch { denied = true; }
  requireCheck(denied, "Signed-out advice was exposed.");
  pass("Signed-out access is refused");
  const [summit, pinecrest, firm] = await Promise.all(tokens.map(advice));
  requireCheck(summit.portfolio === null && summit.companies.length === 1 && summit.readiness.length === 1 &&
    !/Pinecrest|Cedar Ridge|companyNamesForValidation/.test(JSON.stringify(summit)), "Company scope or private validation context leaked.");
  requireCheck(firm.portfolio?.scope === "portfolio" && firm.companies.length === 14 && firm.readiness.length === 14,
    "Expected the clean 14-company fixture and firm rollup.");
  pass("Real company and firm sessions receive only their permitted advice and readiness");
  const payroll = summit.readiness[0].assets.find(a => a.assetName === "Brightline Payroll");
  requireCheck(payroll?.actions.every(a => a.eligibleMode === null) &&
    !summit.companies[0].recommendations.some(r => r.id === "revoke_vendor_tokens"), "Same-vendor relationship promised an unavailable access action.");
  requireCheck(summit.companies[0].recommendations[0].why.includes("$480,000") &&
    summit.companies[0].recommendations[0].why.includes("7731"), "The grounded bank-change check is missing.");
  pass("Summit retains the grounded $480K bank check without a false one-click revoke");
  const incidents = () => call("query", "blastRadius:listIncidents", {}, firmToken);
  requireCheck((await incidents()).length === 0, "Run the original rehearsal first; this script never resets data.");
  requireCheck(pinecrest.readiness[0].status === "assessed" && Number.isFinite(pinecrest.nextReviewAt), "Readiness or expiry metadata is missing.");
  const playbook = await call("query", "responses:getMyPlaybook", {}, controller);
  originalMode = playbook.find(p => p.action === "hold_payments")?.mode;
  requireCheck(originalMode === "act", "Expected the clean Summit enabled hold rule.");

  client = new ConvexClient(cloud, { logger: false });
  client.setAuth(async () => controller);
  let latest;
  let waiter;
  stop = client.onUpdate(makeFunctionReference("ai:getStopLossAdvice"), args,
    value => { latest = value; waiter?.(); }, () => waiter?.(true));
  const waitFor = predicate => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { waiter = undefined; reject(Error("Live subscription did not reach the expected state.")); }, 15_000);
    waiter = failed => {
      if (failed || (latest && predicate(latest))) {
        clearTimeout(timer); waiter = undefined;
        if (failed) reject(Error("Live advice subscription failed.")); else resolve();
      }
    };
    waiter();
  });
  await waitFor(value => value.readiness[0].paymentHoldsEnabled === true);
  mustRestore = true; // Also restore after an ambiguous network outcome.
  const disabled = await call("mutation", "responses:setPlaybookMode", { action: "hold_payments", mode: "notify" }, controller);
  requireCheck(disabled.ok && disabled.applied, "Controller could not toggle the synthetic hold rule.");
  await waitFor(value => value.readiness[0].paymentHoldsEnabled === false &&
    value.companies[0].recommendations.some(r => r.id === "hold_payments"));
  pass("Convex pushes a new setup gap immediately when its controller disables the hold rule");
  const adopted = await call("mutation", "responses:setPlaybookMode", { action: "hold_payments", mode: "act" }, controller);
  requireCheck(adopted.ok && adopted.applied, "Controller could not re-enable the synthetic hold rule.");
  await waitFor(value => value.readiness[0].paymentHoldsEnabled === true &&
    !value.companies[0].recommendations.some(r => r.id === "hold_payments"));
  pass("The gap closes and readiness updates on authorized adoption through the same subscription, without polling");
  requireCheck((await incidents()).length === 0, "Reading readiness or adopting a policy unexpectedly fired an incident.");
  pass("Readiness and setup create no incident or automatic response");
  if (fixturePath) writeFileSync(fixturePath, `${JSON.stringify({ summit, pinecrest, firm }, null, 2)}\n`);
} catch (error) {
  failure = error instanceof Error ? error.message : "Rehearsal failed.";
} finally {
  // Restore business state before socket cleanup: close() may wait indefinitely on reconnect.
  if (mustRestore) {
    try {
      const result = await call("mutation", "responses:setPlaybookMode", { action: "hold_payments", mode: originalMode }, controller);
      const rows = await call("query", "responses:getMyPlaybook", {}, controller);
      restored = result.ok && rows.find(p => p.action === "hold_payments")?.mode === originalMode;
    } catch { /* Fixed cleanup message contains no session credentials. */ }
    if (!restored) failure ??= "Could not verify restoration of the original Summit policy on this DEV.";
    else pass("The original company policy is restored and verified");
  }
  let closeTimer;
  try {
    stop?.();
    if (client) await Promise.race([client.close(), new Promise((_, reject) => {
      closeTimer = setTimeout(() => reject(Error("Socket cleanup timed out.")), 5000);
    })]);
  } catch {
    socketCleanupFailed = true;
    failure ??= "Socket cleanup failed after policy restoration was attempted; inspect restoredOriginalPolicy.";
  } finally { clearTimeout(closeTimer); }
}
const result = { format: "sidecall-readiness-rehearsal-v1", author: "Pegasus", startedAt,
  completedAt: new Date().toISOString(), cloud, passed: failure === null, checks,
  restoredOriginalPolicy: restored, ...(failure ? { failure } : {}),
  scope: "Synthetic own DEV; real sessions, live Convex subscription and authorized policy change. No reset, deployment, model call, incident, real payment or external-provider action." };
if (reportPath) writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (failure) process.exitCode = 1;
// A stuck WebSocket must not keep this one-shot rehearsal alive after its report is saved.
if (socketCleanupFailed) process.exit(1);
