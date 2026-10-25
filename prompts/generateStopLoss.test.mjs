// Deterministic generator/guard tests: temporary config and cache, mocked CLI/model, no network.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createOwnedDev, generationOptions } from "../scripts/scorecard/ownedDev.mjs";
import { generateStopLoss } from "./generateStopLoss.mjs";
import { companyFacts, companyKey, factsKey, portfolioFacts, PORTFOLIO_KEY } from "./stopLoss.ts";

const PEGASUS = "tangible-koala-842";
const OMAR = "brainy-cassowary-804";
const GOOD = "Your team can review the recorded recommendations and adopt the relevant controls before a vendor reports an incident.";
const config = (name = PEGASUS) => `CONVEX_DEPLOYMENT=dev:${name}\nVITE_CONVEX_URL=https://${name}.convex.cloud\n`;
function fixture(t, contents = config()) {
  const cwd = mkdtempSync(join(tmpdir(), "sidecall-generator-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const envPath = join(cwd, ".env.local");
  writeFileSync(envPath, contents);
  return { cwd, envPath, cachePath: join(cwd, "cache.json") };
}
function company(overrides = {}) {
  return { companyId: "synthetic-company", companyName: "Example Co", holdRuleEnabled: false,
    hasItLead: true, playbook: { pause_shared_login: "notify", revoke_vendor_tokens: "notify" },
    links: [{ assetName: "Example Payroll", vendorName: "Example Payroll", assetKind: "payroll",
      phoneOnFile: "+1 (415) 555-0100", shareType: "same_vendor_only", source: "self_reported",
      otherCompaniesOnAsset: 1, otherCompaniesSharingLogin: 0, pendingCents: 10000,
      emailChangedAccounts: [], pendingToChangedAccountsCents: 0, pendingChangedAccounts: [], responseCaps: [] }],
    ...overrides };
}
function cacheFor(companies, body = GOOD) {
  return { generatedAt: "2026-10-24T00:00:00.000Z", model: "test", entries: {
    ...Object.fromEntries(companies.map(c => [companyKey(c.companyName), { facts: factsKey(companyFacts(c)), body }])),
    [PORTFOLIO_KEY]: { facts: factsKey(portfolioFacts(companies)), body: GOOD },
  } };
}
const quiet = { error() {}, log() {} };

test("default reads only: cache reuse needs neither a model call nor an API key", async (t) => {
  const f = fixture(t);
  const companies = [company()];
  writeFileSync(f.cachePath, JSON.stringify(cacheFor(companies)));
  const calls = [];
  const result = await generateStopLoss({ ...f, argv: [], env: {}, log: quiet,
    spawn(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0, stdout: JSON.stringify(companies) };
    },
    callModel() { assert.fail("Cache reuse must not call the model"); },
  });
  assert.equal(result.reused, 2);
  assert.equal(result.generated, 0);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args.slice(0, 4), ["--no-install", "convex", "run", "ai:stopLossContexts"]);
  assert.ok(calls[0].args.includes("--deployment-name"));
  assert.deepEqual(calls[0].args.slice(-2), ["--env-file", f.envPath]);
  assert.equal(calls[0].options.stdio[0], "ignore");
});

test("legacy --no-push also leaves data intact", (t) => {
  const f = fixture(t);
  const calls = [];
  const dev = createOwnedDev({ ...f, argv: ["--no-push"], env: {},
    spawn: (...args) => { calls.push(args); return { status: 0, stdout: "[]" }; } });
  dev.prepare();
  assert.deepEqual(calls, []);
  assert.deepEqual(dev.contexts(1), []);
  assert.equal(calls.length, 1);
});

test("explicit push/seed target matching Omar DEV and accept a successful empty mutation result", (t) => {
  const f = fixture(t, config(OMAR));
  const calls = [];
  const dev = createOwnedDev({ ...f, argv: ["--deployment", OMAR, "--push", "--seed"], env: {},
    spawn(command, args) { calls.push(args); return { status: 0, stdout: args.includes("ai:stopLossContexts") ? "[]" : " \n" }; } });
  dev.prepare();
  dev.contexts(1);
  assert.equal(dev.deployment, OMAR);
  assert.deepEqual(calls.map(args => args[2] === "dev" ? "push" : args[3]), ["push", "seed:run", "ai:stopLossContexts"]);
  assert.ok(calls.every(args => args.at(-1) === f.envPath));
});

test("mutation opt-ins are independent", (t) => {
  const f = fixture(t);
  for (const flag of ["--push", "--seed"]) {
    const calls = [];
    const dev = createOwnedDev({ ...f, argv: ["--deployment", PEGASUS, flag], env: {},
      spawn(command, args) { calls.push(args); return { status: 0, stdout: "" }; } });
    dev.prepare();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].includes("seed:run"), flag === "--seed");
    assert.equal(calls[0].includes("dev"), flag === "--push");
  }
});

test("mutation requires the explicit expected name; unsupported and ambiguous flags fail closed", () => {
  for (const argv of [["--push"], ["--seed"], ["--prod"], ["--deployment"],
    ["--deployment", "prod:judicious-tiger-712"], ["--url", "https://example.invalid"],
    ["--deployment", PEGASUS, "--push", "--no-push"], ["--seed", "--seed"]]) {
    assert.throws(() => generationOptions(argv));
  }
});

test("production, Adrian DEV, mismatched local URL or expected deployment are refused before CLI calls", (t) => {
  const cases = [
    { text: config().replace("dev:", "prod:") },
    { text: config("judicious-tiger-712") },
    { text: config("reminiscent-caribou-128") },
    { text: config().replace(`https://${PEGASUS}`, `https://${OMAR}`) },
    { text: config(), argv: ["--deployment", OMAR, "--seed"] },
    { text: `CONVEX_DEPLOYMENT=dev:${PEGASUS}\n` },
  ];
  for (const item of cases) {
    const f = fixture(t, item.text);
    assert.throws(() => createOwnedDev({ ...f, argv: item.argv ?? [], env: {},
      spawn() { assert.fail("Invalid config must not run the CLI"); } }));
  }
});

test("deploy keys, token alias and self-hosted selectors are refused in process and local config", (t) => {
  const secret = "SYNTHETIC_DO_NOT_PRINT";
  for (const key of ["CONVEX_DEPLOY_KEY", "CONVEX_DEPLOYMENT_TOKEN", "CONVEX_SELF_HOSTED_URL", "CONVEX_SELF_HOSTED_ADMIN_KEY"]) {
    for (const location of ["process", "local"]) {
      const f = fixture(t, config() + (location === "local" ? `${key}=${secret}\n` : ""));
      assert.throws(() => createOwnedDev({ ...f, argv: ["--deployment", PEGASUS, "--seed"],
        env: location === "process" ? { [key]: secret } : {},
        spawn() { assert.fail("Credential override must not run CLI"); } }),
      error => /refused/.test(error.message) && !error.message.includes(secret));
    }
  }
});

test("environment overrides cannot redirect an otherwise valid local target", (t) => {
  const f = fixture(t);
  for (const env of [{ CONVEX_DEPLOYMENT: `dev:${OMAR}` }, { VITE_CONVEX_URL: `https://${OMAR}.convex.cloud` }]) {
    assert.throws(() => createOwnedDev({ ...f, env }), /overrides disagree/);
  }
});

test("config is rechecked before each mutation, including between push and seed", (t) => {
  const f = fixture(t);
  let calls = 0;
  const dev = createOwnedDev({ ...f, env: {}, argv: ["--deployment", PEGASUS, "--push", "--seed"],
    spawn() { calls++; writeFileSync(f.envPath, config(OMAR)); return { status: 0, stdout: "" }; } });
  assert.throws(() => dev.prepare(), /match exactly/);
  assert.equal(calls, 1, "The seed must not follow a changed target");
});

test("CLI command and parsing failures remain distinguishable without exposing raw output", (t) => {
  const f = fixture(t);
  const secret = "SYNTHETIC_DO_NOT_PRINT";
  for (const [result, message] of [
    [{ status: 1, stdout: secret, stderr: secret }, /command failed/],
    [{ status: 0, stdout: secret }, /invalid JSON/],
    [{ status: null, error: Error(secret), stdout: secret }, /command failed/],
  ]) {
    const dev = createOwnedDev({ ...f, env: {}, spawn: () => result });
    assert.throws(() => dev.contexts(1), error => message.test(error.message) && !error.message.includes(secret));
  }
});

test("facts-matching unsafe cache is regenerated and invented amounts never overwrite the cache", async (t) => {
  const f = fixture(t);
  const companies = [company()];
  const bad = "Your team should verify the account first because $999,000 is pending, then review the remaining recorded recommendations.";
  const previous = JSON.stringify(cacheFor(companies, bad));
  writeFileSync(f.cachePath, previous);
  let calls = 0;
  await assert.rejects(generateStopLoss({ ...f, argv: [], env: { ANTHROPIC_API_KEY: "synthetic-key" }, log: quiet,
    spawn: () => ({ status: 0, stdout: JSON.stringify(companies) }),
    callModel() { calls++; return bad; },
  }), /recorded-fact checks three times/);
  assert.equal(calls, 3);
  assert.equal(readFileSync(f.cachePath, "utf8"), previous);
});

test("a fresh safe model summary replaces a rejected cache without changing backend records", async (t) => {
  const f = fixture(t);
  const companies = [company()];
  writeFileSync(f.cachePath, JSON.stringify(cacheFor(companies, "Your payment is held until verified. Call the vendor now.")));
  let modelCalls = 0;
  let cliCalls = 0;
  const result = await generateStopLoss({ ...f, argv: [], env: { ANTHROPIC_API_KEY: "synthetic-key" }, log: quiet,
    spawn(command, args) { cliCalls++; assert.equal(args[3], "ai:stopLossContexts"); return { status: 0, stdout: JSON.stringify(companies) }; },
    callModel(key) { assert.equal(key, "synthetic-key"); modelCalls++; return GOOD; },
  });
  assert.equal(modelCalls, 1);
  assert.equal(cliCalls, 1);
  assert.equal(result.generated, 1);
  assert.equal(JSON.parse(readFileSync(f.cachePath, "utf8")).entries[companyKey(companies[0].companyName)].body, GOOD);
});

test("provider failures do not echo API credentials or overwrite a previous cache", async (t) => {
  const f = fixture(t);
  const companies = [company()];
  const previous = JSON.stringify(cacheFor(companies));
  writeFileSync(f.cachePath, previous);
  const secret = "SYNTHETIC_DO_NOT_PRINT";
  await assert.rejects(generateStopLoss({ ...f, argv: ["--regenerate"], env: { ANTHROPIC_API_KEY: secret }, log: quiet,
    spawn: () => ({ status: 0, stdout: JSON.stringify(companies) }),
    callModel() { throw Error(secret); },
  }), error => /provider output withheld/.test(error.message) && !error.message.includes(secret));
  assert.equal(readFileSync(f.cachePath, "utf8"), previous);
});

test("missing and partial relationship evidence retain runtime canned summaries without model calls", async (t) => {
  const f = fixture(t);
  const companies = [company({ links: [] }), company({ companyName: "Partial Co", evidenceComplete: false })];
  const result = await generateStopLoss({ ...f, argv: [], env: {}, log: quiet,
    spawn: () => ({ status: 0, stdout: JSON.stringify(companies) }),
    callModel() { assert.fail("Incomplete evidence must not generate a readiness claim"); },
  });
  assert.equal(result.summaries, 0);
  assert.deepEqual(JSON.parse(readFileSync(f.cachePath, "utf8")).entries, {});
});
