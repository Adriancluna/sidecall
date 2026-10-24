#!/usr/bin/env node
// Explicitly opt-in, owned DEV deployment only. Does not reset data or change configuration.
import { randomBytes, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const deployment = process.env.CONVEX_DEPLOYMENT ?? "";
const cloud = process.env.VITE_CONVEX_URL ?? "";
if (
  !deployment.startsWith("dev:") ||
  !/^https:\/\/[a-z0-9-]+\.convex\.cloud$/.test(cloud) ||
  cloud.includes("judicious-tiger-712")
) {
  throw new Error(
    "Use your own configured dev deployment (.env.local with CONVEX_DEPLOYMENT=dev:... and VITE_CONVEX_URL). Production is refused.",
  );
}
if (process.env.CONVEX_DEPLOY_KEY?.startsWith("prod:"))
  throw new Error("Production deployment keys are refused.");
const site = cloud.replace(/\.cloud$/, ".site");
const run = (name, args) =>
  execFileSync(
    "npx",
    ["--no-install", "convex", "run", name, JSON.stringify(args)],
    { encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] },
  );
const token = () => `sc_test_${randomBytes(32).toString("hex")}`;
const targetToken = token();
const unrelatedToken = token();
const hash = (value) => createHash("sha256").update(value).digest("hex");
for (const [domain, credential] of [
  ["cedarridge.example", targetToken],
  ["summithomehealth.example", unrelatedToken],
]) {
  run("sandbox:provision", {
    companyDomain: domain,
    assetName: "Ironclad shared admin account",
    tokenHash: hash(credential),
  });
}
async function access(credential) {
  const response = await fetch(`${site}/sandbox/resource`, {
    headers: { authorization: `Bearer ${credential}` },
    signal: AbortSignal.timeout(5000),
  });
  await response.text();
  return response.status;
}
if (
  (await access(targetToken)) !== 200 ||
  (await access(unrelatedToken)) !== 200
) {
  throw new Error(
    "Sandbox resources must initially allow access. Use a clean, separately seeded DEV demo; this script never resets data.",
  );
}
const start = performance.now();
const incident = JSON.parse(
  run("seed:fireDemoIncident", { scenario: "ironcladCredential" }),
);
if (!incident.ok) throw new Error("Sandbox incident was rejected.");
let targetStatus;
for (let i = 0; i < 20; i++) {
  targetStatus = await access(targetToken);
  if (targetStatus === 403) break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}
const unrelatedStatus = await access(unrelatedToken);
if (targetStatus !== 403 || unrelatedStatus !== 200)
  throw new Error(
    "Expected target denied and unrelated access allowed; check the company's pre-approved playbook and that this is a fresh episode.",
  );
const observedElapsedMs = Math.round(performance.now() - start);
async function call(kind, path, args, authToken) {
  const response = await fetch(`${cloud}/api/${kind}`, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: {
      "content-type": "application/json",
      ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  const body = await response.json();
  if (body.status !== "success") throw new Error(`${path} did not succeed`);
  return body.value;
}
async function signIn(email) {
  for (const flow of ["signIn", "signUp"]) {
    try {
      const result = await call("action", "auth:signIn", {
        provider: "password",
        params: { email, password: "sidecall-demo", flow },
      });
      if (result?.tokens?.token) return result.tokens.token;
    } catch {
      /* try the demo account's initial sign-up */
    }
  }
  throw new Error("Demo sign-in failed");
}
const firmToken = await signIn("jordan.ames@northpasscapital.example");
const record = await call(
  "query",
  "responseEvidence:getRecord",
  { incidentId: incident.incidentId },
  firmToken,
);
const verified = record.steps.find(
  (s) =>
    s.executionMode === "sandbox" &&
    s.verification?.accessBefore === true &&
    s.verification?.accessAfter === false,
);
if (
  !verified ||
  !record.audit.some((a) => a.action === "respond") ||
  !record.reports.length
)
  throw new Error(
    "Response record is missing execution evidence, audit or report receipt.",
  );
const companyToken = await signIn("sam.kowalski@cedarridge.example");
if (
  (await call(
    "query",
    "responseEvidence:getRecord",
    { incidentId: incident.incidentId },
    companyToken,
  )) !== null
)
  throw new Error("Company viewer must not read firm response records.");
await call(
  "mutation",
  "responses:undoStep",
  { stepId: verified.id },
  companyToken,
);
if ((await access(targetToken)) !== 200)
  throw new Error("Authorized undo did not restore access.");
const replay = JSON.parse(
  run("seed:fireDemoIncident", { scenario: "ironcladCredential" }),
);
if (
  !replay.duplicate ||
  (await access(targetToken)) !== 200 ||
  (await access(unrelatedToken)) !== 200
)
  throw new Error("Replay repeated a response after undo.");
const afterUndo = await call(
  "query",
  "responseEvidence:getRecord",
  { incidentId: incident.incidentId },
  firmToken,
);
const historical = afterUndo.steps.find((s) => s.id === verified.id);
if (!historical.undoneAt || historical.verification.accessAfter !== false)
  throw new Error("Undo must preserve the historical execution check.");
console.log(
  JSON.stringify(
    {
      scope: "owned dev sandbox; not an external identity provider",
      before: { target: 200, unrelated: 200 },
      after: { target: targetStatus, unrelated: unrelatedStatus },
      afterUndoAndReplay: { target: 200, unrelated: 200 },
      observedElapsedMs,
      evidence: {
        policy: verified.policyRule,
        check: verified.verification.method,
        auditRecorded: true,
        firmOnly: true,
        historicalCheckPreserved: true,
      },
      note: "Includes CLI, network and scheduling time; not a production latency benchmark.",
    },
    null,
    2,
  ),
);
