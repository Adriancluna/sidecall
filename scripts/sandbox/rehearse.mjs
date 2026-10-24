#!/usr/bin/env node
// Explicitly opt-in, owned DEV deployment only. Does not reset data or change configuration.
import { randomBytes, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const deployment = process.env.CONVEX_DEPLOYMENT ?? "";
const cloud = process.env.VITE_CONVEX_URL ?? "";
if (!deployment.startsWith("dev:") || !/^https:\/\/[a-z0-9-]+\.convex\.cloud$/.test(cloud) || cloud.includes("judicious-tiger-712")) {
  throw new Error("Use your own configured dev deployment (.env.local with CONVEX_DEPLOYMENT=dev:... and VITE_CONVEX_URL). Production is refused.");
}
if (process.env.CONVEX_DEPLOY_KEY?.startsWith("prod:")) throw new Error("Production deployment keys are refused.");
const site = cloud.replace(/\.cloud$/, ".site");
const run = (name, args) => execFileSync("npx", ["--no-install", "convex", "run", name, JSON.stringify(args)], { encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] });
const token = () => `sc_test_${randomBytes(32).toString("hex")}`;
const targetToken = token();
const unrelatedToken = token();
const hash = (value) => createHash("sha256").update(value).digest("hex");
for (const [domain, credential] of [["cedarridge.example", targetToken], ["summithomehealth.example", unrelatedToken]]) {
  run("sandbox:provision", { companyDomain: domain, assetName: "Ironclad shared admin account", tokenHash: hash(credential) });
}
async function access(credential) {
  const response = await fetch(`${site}/sandbox/resource`, { headers: { authorization: `Bearer ${credential}` }, signal: AbortSignal.timeout(5000) });
  await response.text();
  return response.status;
}
if (await access(targetToken) !== 200 || await access(unrelatedToken) !== 200) {
  throw new Error("Sandbox resources must initially allow access. Use a clean, separately seeded DEV demo; this script never resets data.");
}
const start = performance.now();
run("seed:fireDemoIncident", { scenario: "ironcladCredential" });
let targetStatus;
for (let i = 0; i < 20; i++) {
  targetStatus = await access(targetToken);
  if (targetStatus === 403) break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}
const unrelatedStatus = await access(unrelatedToken);
if (targetStatus !== 403 || unrelatedStatus !== 200) throw new Error("Expected target denied and unrelated access allowed; check the company's pre-approved playbook and that this is a fresh episode.");
console.log(JSON.stringify({ scope: "owned dev sandbox; not an external identity provider", before: { target: 200, unrelated: 200 }, after: { target: targetStatus, unrelated: unrelatedStatus }, observedElapsedMs: Math.round(performance.now() - start), note: "Includes CLI, network and scheduling time; not a production latency benchmark. Sign in as Sam Kowalski to undo the pause." }, null, 2));
