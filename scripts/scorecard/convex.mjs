// Role 4: run Convex functions from Node scripts through the Convex CLI.
// Targets whatever deployment the CLI would: CONVEX_DEPLOY_KEY if set, else the dev
// deployment in .env.local. Never production: these scripts reseed (wipe) the data.
import { spawnSync } from "node:child_process";

// The four demo scenarios of seed:fireDemoIncident (convex/seed.ts SCENARIOS), in firing order.
export const SCENARIOS = [
  // Order matters: the Ironclad credential case expects Ironclad payments untouched,
  // so it fires before the Ironclad MSP case on the same seed.
  { scenario: "brightline", externalId: "demo-brightline-001" },
  { scenario: "ironcladCredential", externalId: "demo-ironclad-cred-002" },
  { scenario: "ironcladMsp", externalId: "demo-ironclad-msp-003" },
  // The red-team finding: same asset and exposures as ironcladCredential, so it holds no
  // payments and firing it last changes nothing for the scorecard (it has no answer-key entry).
  // It is here so prompts/generate.mjs gets its writing context (pathSummary, technique).
  { scenario: "armadinFinding", externalId: "demo-armadin-004" },
];

export function refuseProd() {
  const key = process.env.CONVEX_DEPLOY_KEY ?? "";
  if (process.argv.includes("--prod") || key.startsWith("prod:")) {
    console.error(
      "Refusing to run against production: this script reseeds the deployment (wipes demo data).\n" +
        "Use a development deployment (dev deploy key or `npx convex dev`).",
    );
    process.exit(1);
  }
}

function npx(args) {
  const result = spawnSync("npx", ["convex", ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `npx convex ${args.join(" ")} failed:\n${result.stderr || result.stdout}`,
    );
  }
  return result.stdout;
}

// Pushes the code in this checkout (so data/*.json and convex/ match the repo), once.
export function push() {
  console.error("Pushing functions (npx convex dev --once)…");
  npx(["dev", "--once"]);
}

export function run(fn, args = {}) {
  const out = npx(["run", fn, JSON.stringify(args)]).trim();
  try {
    return out === "" ? null : JSON.parse(out);
  } catch {
    throw new Error(`Could not parse output of ${fn}:\n${out.slice(0, 500)}`);
  }
}

// Fresh seed, then every scenario in order. Returns [{ scenario, externalId, incidentId }].
export function seedAndFireAll() {
  const seed = run("seed:run");
  console.error(
    `Seeded: dnsImported=${seed?.dnsImported}, dnsSkipped=${seed?.dnsSkipped?.length ?? 0}`,
  );
  return SCENARIOS.map((s) => {
    const result = run("seed:fireDemoIncident", { scenario: s.scenario });
    if (!result?.ok)
      throw new Error(
        `fireDemoIncident ${s.scenario} failed: ${JSON.stringify(result)}`,
      );
    console.error(
      `Fired ${s.externalId}${result.duplicate ? " (duplicate!)" : ""}`,
    );
    return { ...s, incidentId: result.incidentId };
  });
}
