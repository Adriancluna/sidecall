// Guarded runner for the stop-loss generator. The legacy scorecard runner stays unchanged.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

const FORBIDDEN = new Set(["judicious-tiger-712", "reminiscent-caribou-128"]);
const AUTH_OVERRIDES = ["CONVEX_DEPLOY_KEY", "CONVEX_DEPLOYMENT_TOKEN",
  "CONVEX_SELF_HOSTED_URL", "CONVEX_SELF_HOSTED_ADMIN_KEY"];

export function generationOptions(argv) {
  const options = { deployment: undefined, push: false, seed: false, regenerate: false };
  let noPush = false;
  const seen = new Set();
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (seen.has(flag)) throw new Error("Duplicate generator option.");
    seen.add(flag);
    if (flag === "--deployment") {
      const name = argv[++index];
      if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(name))
        throw new Error("--deployment requires an explicit cloud DEV deployment name.");
      options.deployment = name;
    } else if (flag === "--push") options.push = true;
    else if (flag === "--seed") options.seed = true;
    else if (flag === "--regenerate") options.regenerate = true;
    else if (flag === "--no-push") noPush = true; // Safe compatibility with old instructions.
    else throw new Error("Unknown generator option; use --deployment, --push, --seed or --regenerate.");
  }
  if (options.push && noPush) throw new Error("--push and --no-push cannot be combined.");
  if ((options.push || options.seed) && !options.deployment)
    throw new Error("--push and --seed require --deployment naming your own DEV.");
  return Object.freeze(options);
}

export function createOwnedDev({ argv = [], cwd = process.cwd(), env = process.env, spawn = spawnSync } = {}) {
  const options = generationOptions(argv);
  const envPath = resolve(cwd, ".env.local");

  function validate(expected) {
    let local;
    try { local = parseEnv(readFileSync(envPath, "utf8")); }
    catch { throw new Error("A readable .env.local with a matching DEV selector and cloud URL is required."); }
    if (AUTH_OVERRIDES.some((key) => Boolean(env[key]) || Boolean(local[key])))
      throw new Error("Deploy keys, deployment tokens and self-hosted overrides are refused; use your signed-in Convex account.");
    const name = local.CONVEX_DEPLOYMENT?.match(/^dev:([a-z0-9]+(?:-[a-z0-9]+)+)$/)?.[1];
    if (!name || FORBIDDEN.has(name))
      throw new Error("Only your own cloud DEV is allowed; production and Adrian's DEV are refused.");
    if (local.VITE_CONVEX_URL !== `https://${name}.convex.cloud` || (expected && name !== expected))
      throw new Error("The named deployment, .env.local DEV selector and VITE_CONVEX_URL must match exactly.");
    for (const key of ["CONVEX_DEPLOYMENT", "VITE_CONVEX_URL"]) {
      if (env[key] && env[key] !== local[key])
        throw new Error("Process environment overrides disagree with the local DEV configuration.");
    }
    return name;
  }

  // Read-only runs may infer the matching local DEV. A mutation always needs its explicit name.
  const deployment = validate(options.deployment);
  function cli(args, label) {
    validate(deployment); // Refuse a config or environment switch between generation steps.
    let result;
    try {
      result = spawn("npx", ["--no-install", "convex", ...args, "--env-file", envPath], {
        cwd, env: { ...env }, encoding: "utf8", timeout: 120_000,
        stdio: ["ignore", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024,
      });
    } catch { throw new Error(`${label} command failed; raw output withheld.`); }
    if (result.error || result.status !== 0)
      throw new Error(`${label} command failed; raw output withheld.`);
    return result.stdout?.trim() ?? "";
  }
  function run(path, args = {}) {
    const output = cli(["run", path, JSON.stringify(args), "--deployment-name", deployment], "Convex function");
    if (!output) return null; // Successful null-returning mutations print nothing.
    try { return JSON.parse(output); }
    catch { throw new Error("Convex function succeeded but returned invalid JSON; raw output withheld."); }
  }
  return {
    options,
    deployment,
    prepare() {
      if (options.push) cli(["dev", "--once"], "Convex push");
      if (options.seed) run("seed:run");
    },
    contexts(asOf) { return run("ai:stopLossContexts", { asOf }); },
  };
}
