import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOwnedDev, redact, withCleanup } from "./core.mjs";
import { optionsFor, createTransport } from "./rehearse.mjs";

const selector = "CONVEX_DEPLOYMENT=dev:tangible-koala-842\nVITE_CONVEX_URL=https://tangible-koala-842.convex.cloud\n";
function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), "sidecall-release-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const file = join(cwd, ".env.local");
  writeFileSync(file, selector);
  return { cwd, file, env: {}, argv: ["--deployment", "tangible-koala-842"] };
}
test("explicit target and matching local configuration are required", t => {
  const f = fixture(t);
  assert.equal(createOwnedDev(f).deployment, "tangible-koala-842");
  for (const args of [[], ["--deployment", "judicious-tiger-712"], ["--deployment", "reminiscent-caribou-128"],
    ["--deployment", "tangible-koala-842", "--deploy"]]) assert.throws(() => optionsFor(args));
  writeFileSync(f.file, selector.replace("dev:tangible-koala-842", "prod:judicious-tiger-712"));
  assert.throws(() => createOwnedDev(f));
});
test("credential and selector overrides cannot redirect operator calls", t => {
  const f = fixture(t);
  for (const key of ["CONVEX_DEPLOY_KEY", "CONVEX_DEPLOYMENT_TOKEN", "CONVEX_SELF_HOSTED_URL", "CONVEX_SELF_HOSTED_ADMIN_KEY", "CONVEX_DEPLOYMENT", "VITE_CONVEX_URL"])
    assert.throws(() => createOwnedDev({ ...f, env: { [key]: "other" } }));
  writeFileSync(f.file, selector + "CONVEX_DEPLOY_KEY=other\n");
  assert.throws(() => createOwnedDev(f));
});
test("changing the on-disk target stops a previously created transport before fetch", async t => {
  const f = fixture(t); let calls = 0;
  const transport = createTransport({ ...f, options: optionsFor(f.argv), fetchImpl: async () => { calls++; } });
  writeFileSync(f.file, selector.replace("https://tangible-koala-842", "https://other-dev"));
  await assert.rejects(transport.call("mutation", "payments:releasePayment", {}));
  assert.equal(calls, 0);
});
test("operator allowlist rejects reset and unrelated fixtures before command execution", async t => {
  const f = fixture(t); let calls = 0;
  const transport = createTransport({ ...f, options: optionsFor(f.argv), execImpl: async () => { calls++; } });
  for (const path of ["seed:resetDemo", "purchases:loadSamples", "purchaseLab:inject"])
    await assert.rejects(transport.operator(path, {}));
  assert.equal(calls, 0);
});
test("report redaction removes nested and embedded credentials", () => {
  const result = redact({ token: "secret", rows: [{ message: "custom-secret sk-ant-example Bearer abc", password: "pw" }] }, ["custom-secret"]);
  assert.equal(result.token, "[REDACTED]");
  assert.equal(result.rows[0].password, "[REDACTED]");
  assert.doesNotMatch(result.rows[0].message, /custom-secret|sk-ant|abc/);
});
test("failed work still attempts every session cleanup and records cleanup failures", async () => {
  const done = [], failures = [];
  await assert.rejects(withCleanup(async () => { throw new Error("failed"); }, [
    async () => done.push("first"), async () => { done.push("second"); throw new Error("secret"); },
  ], failures));
  assert.deepEqual(done, ["second", "first"]);
  assert.equal(failures.length, 1);
  assert.doesNotMatch(failures[0], /secret/);
});
