#!/usr/bin/env node
// Run after the full rehearsal on your own clean DEV. Never resets data, deploys,
// or changes flags. DEMO_MODE and RESPONSE_SANDBOX must already be enabled.
// Detector credentials and auth sessions stay in memory; CLI output is captured.
// Usage: node scripts/detectors/rehearse.mjs [--report docs/detector-rehearsal.json]
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";

class CheckError extends Error {}
function requireCheck(condition, message) {
  if (!condition) throw new CheckError(message);
}

const exec = promisify(execFile);
const checks = [];
const sources = [];
const secrets = [];
const cleanup = [];
const startedAt = new Date().toISOString();
const runId = `detector-rehearsal-${Date.now()}`;
let cloud;
let deployment;
let site;
let firm;
let reportPath;
let phase = "configuration";
let failure = null;

// Errors from child_process can embed captured stdout, including minted keys.
// Replace them with a fixed diagnostic before they can reach logs or the report.
async function operator(path, args) {
  let stdout;
  try {
    ({ stdout } = await exec("npx", ["--no-install", "convex", "run", path,
      JSON.stringify(args), "--deployment-name", deployment],
    { timeout: 30_000, maxBuffer: 1024 * 1024 }));
  } catch {
    throw new CheckError(`Operator command ${path} failed; raw output withheld to protect credentials.`);
  }
  // Convex CLI prints no value for successful null-returning mutations.
  // Reaching this branch means exec resolved with a successful exit status.
  if (!stdout.trim()) return null;
  try {
    return JSON.parse(stdout);
  } catch {
    throw new CheckError(`Operator command ${path} succeeded but returned invalid JSON; raw output withheld to protect credentials.`);
  }
}
async function call(kind, path, args = {}, token) {
  let body;
  try {
    const response = await fetch(`${cloud}/api/${kind}`, {
      method: "POST", signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ path, args, format: "json" }),
    });
    body = await response.json();
  } catch {
    throw new CheckError(`HTTP call ${path} failed; response withheld.`);
  }
  requireCheck(body.status === "success", `${path} did not complete successfully.`);
  return body.value;
}
async function signIn(email) {
  for (const flow of ["signIn", "signUp"]) {
    try {
      const value = await call("action", "auth:signIn", {
        provider: "password", params: { email, password: "sidecall-demo", flow },
      });
      if (value?.tokens?.token) {
        secrets.push(value.tokens.token);
        return value.tokens.token;
      }
    } catch { /* The seeded quick-pick signs up on the first use. */ }
  }
  throw new CheckError("Could not sign in to the seeded demo.");
}
const query = (path, args = {}, token = firm) => call("query", path, args, token);
const record = (incidentId, token = firm) => query("responseEvidence:getRecord", { incidentId }, token);
async function mint(suffix, assetName, mode) {
  const result = await operator("detectors:mint", {
    name: `${runId}-${suffix}`, assetNames: [assetName],
    reporterDomains: ["pinecreststaffing.example"],
    ...(mode ? { mode } : {}), expiresAt: Date.now() + 30 * 60_000,
  });
  // Track the source immediately, so even a malformed key result is revoked.
  requireCheck(typeof result?.sourceId === "string", "Mint did not return a source ID.");
  const source = { ...result, assetName, name: `${runId}-${suffix}` };
  sources.push(source);
  requireCheck(/^sc_detector_[a-f0-9]{64}$/.test(result.token), "Mint did not return a detector credential.");
  secrets.push(result.token);
  return source;
}
async function post(token, report, presenter = false) {
  try {
    const response = await fetch(`${site}/incident`, {
      method: "POST", signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`,
        ...(presenter && process.env.PRESENTER_KEY ? { "X-Sidecall-Presenter": process.env.PRESENTER_KEY } : {}) },
      body: JSON.stringify(report),
    });
    return { status: response.status, body: await response.json(),
      retryAfter: Number(response.headers.get("Retry-After")) };
  } catch {
    throw new CheckError("Incident HTTP request failed; response withheld.");
  }
}
async function access(token) {
  try {
    const response = await fetch(`${site}/sandbox/resource`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000),
    });
    await response.text();
    return response.status;
  } catch {
    throw new CheckError("Sandbox access request failed.");
  }
}
function hasNoSecrets(value) {
  const text = JSON.stringify(value);
  requireCheck(!/"(?:tokenHash|token|accessToken|refreshToken)"\s*:/.test(text),
    "Read-only evidence exposed a credential field.");
  requireCheck(!secrets.some((secret) => text.includes(secret)), "Read-only evidence exposed a credential.");
}
function passed(name, evidence) {
  checks.push({ name, passed: true, ...(evidence ? { evidence } : {}) });
  console.log(`PASS ${name}`);
}

try {
  const args = process.argv.slice(2);
  requireCheck(args.length === 0 || (args.length === 2 && args[0] === "--report" && args[1]),
    "Usage: node scripts/detectors/rehearse.mjs [--report path.json]");
  reportPath = args[1];
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  cloud = process.env.VITE_CONVEX_URL ?? "";
  deployment = cloud.match(/^https:\/\/([a-z0-9-]+)\.convex\.cloud$/)?.[1];
  requireCheck(deployment && process.env.CONVEX_DEPLOYMENT === `dev:${deployment}` &&
    !["judicious-tiger-712", "reminiscent-caribou-128"].includes(deployment) && !process.env.CONVEX_DEPLOY_KEY,
  "Use your own matching DEV deployment and cloud URL; prod, Adrian DEV and all deploy keys are refused.");
  site = cloud.replace(/\.cloud$/, ".site");
  if (process.env.PRESENTER_KEY) secrets.push(process.env.PRESENTER_KEY);

  phase = "clean seeded DEV and real auth sessions";
  const tokens = await Promise.all([
    signIn("jordan.ames@northpasscapital.example"),
    signIn("jamie.chen@summithomehealth.example"),
    signIn("sam.kowalski@cedarridge.example"),
  ]);
  [firm] = tokens;
  const [, clerk, itLead] = tokens;
  requireCheck((await query("blastRadius:listIncidents")).length === 0,
    "Run the original full rehearsal first on clean DEV; this script never resets data.");

  phase = "scoped source registration and metadata privacy";
  const observer = await mint("observe-a", "Brightline Payroll");
  const independent = await mint("observe-b", "Brightline Payroll", "observe");
  const sourceList = await query("detectors:list");
  requireCheck(sourceList.some((s) => s.sourceId === observer.sourceId && s.mode === "observe"),
    "Default source authority must be observe.");
  requireCheck(sourceList.some((s) => s.sourceId === independent.sourceId), "Firm source list is missing a registered source.");
  requireCheck((await query("detectors:list", {}, clerk)).length === 0, "Company viewer can read detector authority.");
  hasNoSecrets(sourceList);
  passed("Source registration defaults to observation; metadata is firm-only and contains no keys");

  const payload = { externalId: `${runId}-shared-id`, assetName: "Brightline Payroll",
    reportedByDomain: "pinecreststaffing.example", assessment: "confirmed",
    summary: "Synthetic private Pinecrest detector source detail", evidenceRefs: ["synthetic:detector-rehearsal"] };
  phase = "asset and reporter scope forgery";
  requireCheck((await post(observer.token, { ...payload, assetName: "Ironclad IT Services" })).status === 403,
    "Detector accepted an asset outside its registration.");
  requireCheck((await post(observer.token, { ...payload, reportedByDomain: "summithomehealth.example" })).status === 403,
    "Detector accepted a reporter outside its registration.");
  requireCheck((await query("blastRadius:listIncidents")).length === 0, "Rejected scope created an incident.");
  passed("Forged asset and reporter receive HTTP 403 and create no incident");

  phase = "observation authority and receipt provenance";
  const first = await post(observer.token, payload);
  requireCheck(first.status === 200 && !first.body.duplicate && !first.body.correlated && first.body.assessment === "observation",
    "An observation-only source must not promote itself to confirmed.");
  const before = await record(first.body.incidentId);
  requireCheck(before?.incident.responseClass === "observation" && before.payments.length === 0 && before.steps.length === 0,
    "Observation-only report created a hold or response action.");
  requireCheck(before.reports.length === 1 && before.reports[0].authenticatedSource?.id === observer.sourceId &&
    before.reports[0].authenticatedSource?.name === observer.name && before.reports[0].requestedAssessment === "confirmed" &&
    before.reports[0].effectiveAssessment === "observation", "Source identity or assessment provenance is missing.");
  requireCheck(await record(first.body.incidentId, clerk) === null, "Company viewer can read a firm evidence record.");
  const alerts = await query("alerts:getMyAlerts", {}, clerk);
  requireCheck(alerts.length > 0 && !/Pinecrest|detector source detail|observe-a/.test(JSON.stringify(alerts)),
    "Company alerts leaked the private reporter or source.");
  hasNoSecrets(before);
  passed("Observation-only source cannot trigger holds/actions; requested and effective assessments are recorded privately");

  phase = "cross-source external ID collision";
  const second = await post(independent.token, payload);
  requireCheck(second.status === 200 && !second.body.duplicate && second.body.correlated && second.body.incidentId === first.body.incidentId,
    "Two sources using the same external ID must retain independent receipts in one episode.");
  const paired = await record(first.body.incidentId);
  requireCheck(paired.reports.length === 2 && new Set(paired.reports.map((r) => r.authenticatedSource?.id)).size === 2 &&
    paired.reports.every((r) => r.externalId === payload.externalId), "Cross-source receipt identity collided.");
  passed("Two sources with the same external ID get independent receipts in the same global episode");

  phase = "credential rotation and stable replay identity";
  const oldToken = observer.token;
  const rotated = await operator("detectors:rotate", { sourceId: observer.sourceId });
  requireCheck(/^sc_detector_[a-f0-9]{64}$/.test(rotated?.token), "Rotation did not return a valid credential.");
  secrets.push(rotated.token);
  observer.token = rotated.token;
  requireCheck((await post(oldToken, payload)).status === 401, "Rotated credential is still accepted.");
  const rotatedReplay = await post(observer.token, payload);
  requireCheck(rotatedReplay.status === 200 && rotatedReplay.body.duplicate && !rotatedReplay.body.correlated &&
    rotatedReplay.body.incidentId === first.body.incidentId && (await record(first.body.incidentId)).reports.length === 2,
  "Rotation reset the source replay namespace or repeated effects.");
  passed("Rotation invalidates the old key while preserving source identity and exact-ID deduplication");

  phase = "quota exhaustion and source isolation";
  const burst = await Promise.all(Array.from({ length: 20 }, (_, index) =>
    post(observer.token, { ...payload, externalId: `${runId}-burst-${index}` })));
  requireCheck(burst.every((r) => r.status === 200 || r.status === 429) && burst.some((r) => r.status === 429),
    "Concurrent burst did not hit the isolated HTTP 429 detector quota.");
  requireCheck(burst.filter((r) => r.status === 429).every((r) => Number.isFinite(r.retryAfter) && r.retryAfter >= 1),
    "Quota refusals must include a usable Retry-After header.");
  const healthy = await post(independent.token, { ...payload, externalId: `${runId}-healthy` });
  requireCheck(healthy.status === 200 && healthy.body.incidentId === first.body.incidentId, "One source exhausted another source's quota.");
  const flooded = await record(first.body.incidentId);
  const accepted = burst.filter((r) => r.status === 200).length;
  requireCheck(flooded.reports.length === 3 + accepted && flooded.steps.length === 0 && flooded.payments.length === 0 &&
    flooded.incident.reviewDueAt === before.incident.reviewDueAt, "Flood changed deadlines/actions or lost accepted report receipts.");
  passed("Burst receives HTTP 429 with retry timing while another source continues; no holds or deadline extensions",
    { requests: burst.length, accepted, refused: burst.length - accepted, independentSourceStatus: healthy.status });

  phase = "revocation and demo-fallback refusal";
  await operator("detectors:revoke", { sourceId: observer.sourceId });
  requireCheck((await post(observer.token, payload)).status === 401, "Revoked source still accepts reports.");
  requireCheck((await post(observer.token, { externalId: "demo-brightline-001", assetName: "Brightline Payroll" }, true)).status === 401,
    "Revoked detector credential fell through to the built-in demo route.");
  passed("Revocation returns HTTP 401 even for built-in demo IDs; no authorization fallback");

  phase = "confirmed-source evidence requirement";
  const confirmer = await mint("confirmed", "Ironclad shared admin account", "confirm");
  const confirmation = { externalId: `${runId}-confirmed`, assetName: "Ironclad shared admin account",
    reportedByDomain: "pinecreststaffing.example", assessment: "confirmed",
    summary: "Synthetic authorized detector rehearsal; owned resources only.",
    evidenceRefs: ["synthetic:owned-sandbox-credential-use"] };
  const unsupported = await post(confirmer.token, { ...confirmation, externalId: `${runId}-unsupported`, evidenceRefs: [] });
  requireCheck(unsupported.status === 200 && unsupported.body.assessment === "observation",
    "Confirm authority without evidence must remain an observation.");
  const unsupportedRecord = await record(unsupported.body.incidentId);
  requireCheck(unsupportedRecord.steps.length === 0 && unsupportedRecord.payments.length === 0,
    "Unsupported confirmation created actions.");
  passed("Confirm-capable source without evidence remains notify-only");

  phase = "confirmed automatic response against owned sandbox";
  const targetToken = `sc_test_${randomBytes(32).toString("hex")}`;
  const unrelatedToken = `sc_test_${randomBytes(32).toString("hex")}`;
  secrets.push(targetToken, unrelatedToken);
  for (const [companyDomain, token] of [["cedarridge.example", targetToken], ["summithomehealth.example", unrelatedToken]]) {
    await operator("sandbox:provision", { companyDomain, assetName: confirmation.assetName,
      tokenHash: createHash("sha256").update(token).digest("hex") });
  }
  requireCheck(await access(targetToken) === 200 && await access(unrelatedToken) === 200,
    "Sandbox resources must initially allow access; check pre-existing DEMO_MODE/RESPONSE_SANDBOX and clean DEV.");
  const elapsedStart = performance.now();
  const confirmed = await post(confirmer.token, confirmation);
  requireCheck(confirmed.status === 200 && confirmed.body.assessment === "confirmed" && !confirmed.body.duplicate,
    "Scoped confirmed source with evidence was not accepted.");
  let targetStatus;
  for (let attempt = 0; attempt < 40; attempt++) {
    targetStatus = await access(targetToken);
    if (targetStatus === 403) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  requireCheck(targetStatus === 403 && await access(unrelatedToken) === 200,
    "Expected pre-approved automatic target denial and unrelated access unchanged.");
  const confirmedRecord = await record(confirmed.body.incidentId);
  const verified = confirmedRecord.steps.find((s) => s.executionMode === "sandbox" && s.mode === "act" &&
    s.status === "done" && s.approvedBy === null && s.verification?.accessBefore === true && s.verification?.accessAfter === false);
  requireCheck(verified && confirmedRecord.reports.some((r) => r.authenticatedSource?.id === confirmer.sourceId &&
    r.requestedAssessment === "confirmed" && r.effectiveAssessment === "confirmed") &&
    confirmedRecord.audit.some((a) => a.action === "respond"), "Automatic response lacks source, policy, audit or before/after evidence.");
  hasNoSecrets(confirmedRecord);
  passed("Scoped confirmed source automatically changes owned target access 200→403; unrelated access stays 200",
    { observedElapsedMs: Math.round(performance.now() - elapsedStart), boundary: "Owned sandbox only; includes network/scheduling time, not a production benchmark." });

  phase = "authorized undo and replay after automatic execution";
  await call("mutation", "responses:undoStep", { stepId: verified.id }, itLead);
  requireCheck(await access(targetToken) === 200, "Company-authorized Undo did not restore target access.");
  const replay = await post(confirmer.token, confirmation);
  requireCheck(replay.status === 200 && replay.body.duplicate && await access(targetToken) === 200 && await access(unrelatedToken) === 200,
    "Exact replay repeated the automatic response after Undo.");
  const historical = (await record(confirmed.body.incidentId)).steps.find((s) => s.id === verified.id);
  requireCheck(historical?.undoneAt && historical.verification?.accessAfter === false,
    "Undo erased the historical verification.");
  passed("Authorized Undo restores access; replay does not repeat the action and historical verification remains");
} catch (error) {
  failure = { phase, message: error instanceof CheckError ? error.message : "Unexpected failure; details withheld to protect credentials." };
} finally {
  // Sequential idempotent revocation, including a source explicitly revoked above.
  // A failed cleanup is a failing run, never a passing report with live keys left behind.
  for (const source of sources) {
    let revoked = false;
    for (let attempt = 0; attempt < 2 && !revoked; attempt++) {
      try {
        await operator("detectors:revoke", { sourceId: source.sourceId });
        revoked = true;
      } catch { /* Retry once without emitting CLI output. */ }
    }
    let rejected = false;
    if (revoked && typeof source.token === "string") {
      try {
        rejected = (await post(source.token, { externalId: `${runId}-cleanup`, assetName: source.assetName })).status === 401;
      } catch { /* Verification failure is reported as unsuccessful cleanup. */ }
    }
    cleanup.push({ sourceName: source.name, revoked, rejectedAfterRevocation: rejected });
  }
  if (cleanup.some((item) => !item.revoked || !item.rejectedAfterRevocation)) {
    failure ??= { phase: "cleanup", message: "Could not verify every created detector was revoked; inspect the named rehearsal sources on this DEV." };
  }
  if (!failure && sources.length > 0) passed("Every created detector is revoked and its credential receives HTTP 401 after cleanup");
}

const result = {
  format: "sidecall-detector-rehearsal-v1", author: "Pegasus", startedAt,
  completedAt: new Date().toISOString(), cloud, passed: failure === null, checks, cleanup,
  ...(failure ? { failure } : {}),
  scope: "Synthetic data on owned DEV; actual detector HTTP/auth/Convex execution and owned sandbox checks. No external detector integration or live identity-provider action.",
  unchanged: "No reset, deploy, environment-flag change, real payment or chatbot operation.",
};
if (reportPath) {
  try { writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`); }
  catch { console.error("Could not write the requested report file."); process.exitCode = 1; }
}
console.log(JSON.stringify(result, null, 2));
if (failure) process.exitCode = 1;
