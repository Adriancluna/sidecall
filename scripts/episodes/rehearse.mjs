#!/usr/bin/env node
// Run after the full rehearsal on your own clean DEV. Does not reset data or change flags.
// Intake uses the operator-only Convex CLI; this does not test webhook authentication.
// Browser-facing queries and review decisions use actual HTTP sessions.
import { execFile } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import assert from "node:assert/strict";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const cloud = process.env.VITE_CONVEX_URL ?? "";
const deployment = cloud.match(/^https:\/\/([a-z0-9-]+)\.convex\.cloud$/)?.[1];
if (!deployment || process.env.CONVEX_DEPLOYMENT !== `dev:${deployment}` ||
    ["judicious-tiger-712", "reminiscent-caribou-128"].includes(deployment) ||
    process.env.CONVEX_DEPLOY_KEY) {
  throw Error("Use your own matching DEV deployment and cloud URL; prod, Adrian DEV and deploy keys are refused.");
}
const exec = promisify(execFile);
async function intake(args) {
  const { stdout } = await exec("npx", ["--no-install", "convex", "run",
    "incidents:recordIncident", JSON.stringify(args), "--deployment-name", deployment],
  { timeout: 30_000, maxBuffer: 1024 * 1024 });
  const result = JSON.parse(stdout);
  assert.equal(result.ok, true, "operator intake accepted");
  return result;
}
async function call(kind, path, args = {}, token) {
  const response = await fetch(`${cloud}/api/${kind}`, {
    method: "POST", signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  const body = await response.json();
  assert.equal(body.status, "success", `${path} completed`);
  return body.value;
}
async function signIn(email) {
  for (const flow of ["signIn", "signUp"]) {
    try {
      const value = await call("action", "auth:signIn", {
        provider: "password", params: { email, password: "sidecall-demo", flow },
      });
      if (value?.tokens?.token) return value.tokens.token;
    } catch { /* Demo quick-pick tries sign-up on the first sign-in. */ }
  }
  throw Error("Could not sign in to the seeded demo.");
}
const [firm, clerk] = await Promise.all([
  signIn("jordan.ames@northpasscapital.example"),
  signIn("jamie.chen@summithomehealth.example"),
]);
const query = (path, args = {}, token = firm) => call("query", path, args, token);
const mutate = (path, args, token = firm) => call("mutation", path, args, token);
const record = (incidentId, token = firm) => query("responseEvidence:getRecord", { incidentId }, token);
assert.equal((await query("blastRadius:listIncidents")).length, 0,
  "Use a clean DEV after the full rehearsal; this script never resets data.");
const checks = [];
function passed(name) { checks.push({ name, passed: true }); console.log(`PASS ${name}`); }
const runId = `episode-rehearsal-${Date.now()}`;
const report = {
  externalId: `${runId}-first`, assetName: "Brightline Payroll", assessment: "observation",
  reportedByDomain: "pinecreststaffing.example", summary: "Pinecrest private source detail",
  evidenceRefs: ["synthetic:episode-rehearsal"],
};
const first = await intake(report);
const before = await record(first.incidentId);
assert.equal(first.duplicate, false);
assert.equal(first.correlated, false);
assert.equal(before.incident.responseClass, "observation");
assert.ok(before.companies.length > 0);
assert.ok(before.companies.every((c) => c.assessment === "unconfirmed_notify_only"));
assert.deepEqual(before.steps, []);
assert.deepEqual(before.payments, []);
const companyAlerts = await query("alerts:getMyAlerts", {}, clerk);
assert.ok(companyAlerts.length > 0);
assert.doesNotMatch(JSON.stringify(companyAlerts), /Pinecrest|private source/);
const companyIncidents = await query("blastRadius:listIncidents", {}, clerk);
assert.ok(companyIncidents.every((i) => i.reportedByCompanyId === null && i.summary === null));
assert.equal(await record(first.incidentId, clerk), null);
passed("Unconfirmed warnings are visible; no holds/steps and no reporter or firm-record leak");

// Four concurrent arrivals, followed by another four: conflicts must retry into one episode.
const results = [];
for (let offset = 0; offset < 8; offset += 4) {
  results.push(...await Promise.all(Array.from({ length: 4 }, (_, i) => intake({
    ...report, externalId: `${runId}-repeat-${offset + i}`,
  }))));
}
assert.ok(results.every((r) => r.incidentId === first.incidentId && r.correlated && !r.duplicate));
const flooded = await record(first.incidentId);
assert.equal(flooded.reports.length, 9);
assert.equal(flooded.incident.correlatedReports, 8);
assert.equal(flooded.incident.reviewDueAt, before.incident.reviewDueAt);
assert.deepEqual(flooded.steps, []);
assert.deepEqual(flooded.payments, []);
assert.deepEqual(await query("alerts:getMyAlerts", {}, clerk), companyAlerts);
const outbox = await query("notifications:listOutbox", { incidentId: first.incidentId });
assert.equal(outbox.filter((n) => n.text.includes("additional unconfirmed report")).length, 1);
passed("Eight concurrent reports retain receipts but coalesce notices and cannot restart deadlines/actions");

const replayInput = { ...report, externalId: `${runId}-repeat-0` };
const replays = await Promise.all([intake(replayInput), intake(replayInput)]);
assert.ok(replays.every((r) => r.duplicate && !r.correlated));
assert.deepEqual(await record(first.incidentId), flooded);
passed("Concurrent exact-ID replays do not add receipts, actions or audit entries");

const bills = await query("payments:getMyBills", {}, clerk);
const unpaid = bills.find((b) => !b.payment);
assert.ok(unpaid, "Seeded unpaid bill available");
const requested = await mutate("payments:requestPayment", { billId: unpaid.bill._id }, clerk);
assert.equal(requested.ok, true);
assert.equal(requested.held, false);
assert.equal((await query("payments:getMyBills", {}, clerk))
  .find((b) => b.bill._id === unpaid.bill._id).payment.status, "pending");
passed("Business continues: the $38K bill can enter the normal pending flow during alert noise");

const review = { incidentId: first.incidentId, decision: "confirm",
  note: "Synthetic rehearsal: independent vendor evidence was checked by the portfolio reviewer." };
assert.equal((await mutate("incidents:reviewReport", review, clerk)).ok, false);
assert.deepEqual((await record(first.incidentId)).payments, []);
passed("A company clerk cannot promote observations to portfolio-wide actions");
assert.equal((await mutate("incidents:reviewReport", review)).ok, true);
const reviewed = await record(first.incidentId);
assert.ok(reviewed.companies.every((c) => c.status === "closed"));
const confirmed = (await query("blastRadius:listIncidents"))
  .find((i) => i._id !== first.incidentId && i.responseClass !== "observation");
assert.ok(confirmed, "Confirmation creates a confirmed response episode");
const confirmedRecord = await record(confirmed._id);
assert.equal(confirmedRecord.payments.reduce((sum, p) => sum + p.amountCents, 0), 65_000_000);
assert.ok(confirmedRecord.payments.every((p) => p.status === "held"));
passed("Independent confirmation closes warnings and holds exactly $650K including the newly requested bill");

assert.equal((await intake(replayInput)).incidentId, first.incidentId);
assert.deepEqual(await record(first.incidentId), reviewed);
assert.deepEqual((await record(confirmed._id)).payments, confirmedRecord.payments);
passed("Old correlated IDs remain no-ops after confirmation");

assert.equal((await mutate("incidents:containIncident", { incidentId: confirmed._id,
  note: "Synthetic remediation independently verified; closing this rehearsal response episode." })).ok, true);
const fresh = await intake({ ...report, externalId: `${runId}-genuine-new`, assessment: "confirmed" });
assert.equal(fresh.correlated, false);
assert.equal(fresh.duplicate, false);
assert.notEqual(fresh.incidentId, confirmed._id);
assert.deepEqual((await record(confirmed._id)).payments, confirmedRecord.payments);
passed("Containment allows a genuine new episode and never releases existing held money");

const result = {
  generatedAt: new Date().toISOString(), deployment: cloud,
  intake: "operator-only internal mutation via Convex CLI; webhook authentication is covered separately",
  data: "synthetic seeded portfolio; no external payment or provider action",
  checks,
};
const output = process.argv.indexOf("--report");
if (output !== -1) {
  assert.ok(process.argv[output + 1], "--report needs a file path");
  writeFileSync(process.argv[output + 1], `${JSON.stringify(result, null, 2)}\n`);
}
console.log(`${checks.length}/${checks.length} live episode checks passed on ${deployment}.`);
