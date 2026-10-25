/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { digest, sign } from "../integrations/company-receiver/protocol.mjs";
import type { ReceiverReceipt } from "./receiverModel";
const modules = import.meta.glob("./**/*.ts");
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function fixture() {
  vi.useFakeTimers();
  const t = convexTest(schema, modules); rateLimiterTest.register(t);
  await t.mutation(internal.seed.run, {});
  const data = await t.run(async ctx => ({ companies: await ctx.db.query("companies").take(100), assets: await ctx.db.query("assets").take(100), users: await ctx.db.query("users").take(100) }));
  const company = data.companies.find(c => c.name === "Cedar Ridge Manufacturing")!;
  const asset = data.assets.find(a => a.name === "Ironclad shared admin account")!;
  vi.stubEnv("DEMO_MODE", "true"); vi.stubEnv("RESPONSE_RECEIVER_LIVE", "true");
  vi.stubEnv("RESPONSE_RECEIVER_URL", "https://receiver.example");
  vi.stubEnv("RESPONSE_RECEIVER_SECRET", "receiver-test-secret-32-characters-long");
  vi.stubEnv("RESPONSE_RECEIVER_COMPANY_ID", company._id);
  vi.stubEnv("RESPONSE_RECEIVER_ASSET_ID", asset._id);
  vi.stubEnv("RESPONSE_RECEIVER_TARGET", "test-vendor-login");
  const incidentId = await t.mutation(internal.seed.fireDemoIncident, { scenario: "ironcladCredential" });
  // fireDemoIncident returns the normal incident result. Find the actual episode.
  const incident = await t.run(async ctx => (await ctx.db.query("incidents").take(100)).find(i => i.assetId === asset._id)!);
  expect(incidentId).toBeDefined();
  await t.mutation(internal.responses.recordSimulated, { incidentId: incident._id });
  const job = await t.run(async ctx => (await ctx.db.query("responseDeliveries").take(10))[0]);
  expect(job).toBeDefined();
  const as = (name: string) => t.withIdentity({ subject: `${data.users.find(u => u.name === name)!._id}|test-session` });
  const { policyVersion: _initialPolicyVersion, ...receiptFields } = JSON.parse(job.commandJson);
  const receipt = (changes: Partial<ReceiverReceipt> = {}): ReceiverReceipt => ({
    ...receiptFields, commandHash: digest(job.commandJson), provider: "okta", status: "confirmed",
    reason: "suspension_verified", observedState: "SUSPENDED", observedAt: Date.now(), sessionRevocation: "provider_acknowledged", restoreEligible: true, ...changes,
  });
  return { t, job, incident, company, as, receipt };
}

test("external target queues a durable command and never reports simulation success", async () => {
  const { t, job } = await fixture();
  const step = await t.run(ctx => ctx.db.get("responseSteps", job.stepId));
  expect(step).toMatchObject({ status: "pending", executionMode: "external" });
  expect(step?.executedAt).toBeUndefined(); expect(step?.verification).toBeUndefined();
  const claim = await t.mutation(internal.responseReceiver.claim, { jobId: job._id });
  expect(claim).toMatchObject({ commandJson: job.commandJson, statusOnly: false });
  expect(await t.mutation(internal.responseReceiver.claim, { jobId: job._id })).toBeNull();
  vi.advanceTimersByTime(1001);
  expect(await t.mutation(internal.responseReceiver.claim, { jobId: job._id })).toMatchObject({ commandJson: job.commandJson, statusOnly: true });
});

test("disabled or changed connection cannot fall back to simulated success", async () => {
  const { t, job } = await fixture(); vi.stubEnv("RESPONSE_RECEIVER_LIVE", "false");
  expect(await t.mutation(internal.responseReceiver.claim, { jobId: job._id })).toBeNull();
  expect(await t.run(ctx => ctx.db.get("responseSteps", job.stepId))).toMatchObject({ status: "refused", executionMode: "external" });
});

test("dispatch rechecks current company policy before the first write", async () => {
  const { t, job, company } = await fixture();
  await t.run(async ctx => { const policy = await ctx.db.query("responsePolicies").withIndex("by_companyId_and_action", q => q.eq("companyId", company._id).eq("action", "pause_shared_login")).unique(); await ctx.db.patch("responsePolicies", policy!._id, { mode: "notify", version: policy!.version + 1 }); });
  expect(await t.mutation(internal.responseReceiver.claim, { jobId: job._id })).toBeNull();
});

test("contained incident cannot dispatch a new pause", async () => {
  const { t, job, incident } = await fixture();
  await t.run(ctx => ctx.db.patch("incidents", incident._id, { containedAt: Date.now() }));
  expect(await t.mutation(internal.responseReceiver.claim, { jobId: job._id })).toBeNull();
});

test.each(["revoked", "expired"])("%s detector authority blocks a previously queued external command", async loss => {
  const { t, job, incident } = await fixture();
  const sourceId = await t.mutation(internal.detectors.register, { name: "Receiver test detector", tokenHash: "a".repeat(64),
    assetNames: ["Ironclad shared admin account"], reporterDomains: ["pinecreststaffing.example"], mode: "confirm", expiresAt: Date.now() + 60_000 });
  await t.run(ctx => ctx.db.patch("incidents", incident._id, { sourceId }));
  if (loss === "revoked") await t.mutation(internal.detectors.revoke, { sourceId });
  else vi.setSystemTime(Date.now() + 60_001);
  expect(await t.mutation(internal.responseReceiver.claim, { jobId: job._id })).toBeNull();
  expect(await t.run(ctx => ctx.db.get("responseSteps", job.stepId))).toMatchObject({ status: "refused" });
});

test("status checks are bounded and cannot be requested by another company", async () => {
  const { job, as } = await fixture();
  await expect(as("Ben Carter").mutation(api.responseReceiver.checkOrSend, { jobId: job._id })).rejects.toThrow();
  expect(await as("Sam Kowalski").mutation(api.responseReceiver.checkOrSend, { jobId: job._id })).toMatchObject({ ok: true });
  expect(await as("Sam Kowalski").mutation(api.responseReceiver.checkOrSend, { jobId: job._id })).toMatchObject({ ok: false });
});

test("lost receipt stays unknown; disabling pauses still permits read-only reconciliation", async () => {
  const { t, job, as } = await fixture();
  await t.mutation(internal.responseReceiver.claim, { jobId: job._id });
  await t.mutation(internal.responseReceiver.record, { jobId: job._id });
  expect(await t.run(ctx => ctx.db.get("responseSteps", job.stepId))).toMatchObject({ status: "unknown" });
  expect(await as("Sam Kowalski").mutation(api.responses.undoStep, { stepId: job.stepId })).toMatchObject({ ok: false });
  vi.stubEnv("RESPONSE_RECEIVER_LIVE", "false"); vi.advanceTimersByTime(1001);
  expect(await t.mutation(internal.responseReceiver.claim, { jobId: job._id })).toMatchObject({ statusOnly: true });
});

test("a changed receiver binding prevents commands and reconciliation reaching another service", async () => {
  const { t, job } = await fixture();
  await t.mutation(internal.responseReceiver.claim, { jobId: job._id });
  vi.stubEnv("RESPONSE_RECEIVER_URL", "https://other.example"); vi.advanceTimersByTime(1001);
  expect(await t.mutation(internal.responseReceiver.claim, { jobId: job._id })).toBeNull();
  expect(await t.run(ctx => ctx.db.get("responseSteps", job.stepId))).toMatchObject({ status: "unknown" });
});

test("confirmed receipt updates live query evidence; late uncertainty cannot erase it", async () => {
  const { t, job, receipt, incident, as } = await fixture();
  await t.mutation(internal.responseReceiver.claim, { jobId: job._id });
  await t.mutation(internal.responseReceiver.record, { jobId: job._id, receipt: receipt() });
  await t.mutation(internal.responseReceiver.record, { jobId: job._id });
  const plan = await as("Sam Kowalski").query(api.responses.getMyResponsePlan, { incidentId: incident._id });
  expect(plan.find(p => p.stepId === job.stepId)).toMatchObject({ status: "done", executionMode: "external", canUndo: false, canManageReceiver: true,
    deliveries: [{ status: "confirmed", receipt: { observedState: "SUSPENDED" } }] });
  expect(JSON.stringify(plan)).not.toContain("receiver-test-secret"); expect(JSON.stringify(plan)).not.toContain("https://receiver.example");
});

test("mismatched receipt or wrong provider effect cannot complete a step", async () => {
  const { t, job, receipt } = await fixture(); await t.mutation(internal.responseReceiver.claim, { jobId: job._id });
  for (const changes of [{ commandId: "wrong-command" }, { observedState: "ACTIVE" as const }]) {
    await expect(t.mutation(internal.responseReceiver.record, { jobId: job._id, receipt: receipt(changes) })).rejects.toThrow();
  }
});

test("restoration is separate, scoped, operator-gated and cannot use ordinary Undo", async () => {
  const { t, job, as, receipt } = await fixture(); await t.mutation(internal.responseReceiver.claim, { jobId: job._id });
  await t.mutation(internal.responseReceiver.record, { jobId: job._id, receipt: receipt() });
  const sam = as("Sam Kowalski");
  expect(await sam.mutation(api.responses.undoStep, { stepId: job.stepId })).toMatchObject({ ok: false });
  await sam.mutation(api.responseReceiver.prepareRestore, { stepId: job.stepId });
  await sam.mutation(api.responseReceiver.prepareRestore, { stepId: job.stepId });
  const restore = await t.run(ctx => ctx.db.query("responseDeliveries").withIndex("by_stepId_and_kind", q => q.eq("stepId", job.stepId).eq("kind", "restore")).unique());
  expect(restore).toMatchObject({ status: "awaiting_operator" });
  expect(await t.mutation(internal.responseReceiver.claim, { jobId: restore!._id })).toBeNull();
  const bad = await t.run(async ctx => (await ctx.db.query("users").take(100)).find(u => u.role === "ap_clerk")!);
  await expect(t.withIdentity({ subject: `${bad._id}|session` }).mutation(api.responseReceiver.checkOrSend, { jobId: restore!._id })).rejects.toThrow();
  await sam.mutation(api.responseReceiver.checkOrSend, { jobId: restore!._id });
  const claim = await t.mutation(internal.responseReceiver.claim, { jobId: restore!._id });
  expect(JSON.parse(claim!.commandJson)).toMatchObject({ pauseCommandId: job.commandId, action: "restore_shared_login" });
  const command = JSON.parse(claim!.commandJson);
  const { pauseCommandId: _pauseCommandId, policyVersion: _policyVersion, ...fields } = command;
  await t.mutation(internal.responseReceiver.record, { jobId: restore!._id, receipt: receipt({ ...fields, commandHash: digest(claim!.commandJson), observedState: "ACTIVE", reason: "restoration_verified", restoreEligible: false }) });
  expect(await t.run(ctx => ctx.db.get("responseSteps", job.stepId))).toMatchObject({ status: "undone" });
});

test("demo reset cannot erase external command history even after disabling execution", async () => {
  const { t, as } = await fixture(); vi.stubEnv("RESPONSE_RECEIVER_LIVE", "false");
  expect(await as("Sam Kowalski").query(api.seed.resetAvailability, {})).toMatchObject({ allowed: false });
  await expect(t.mutation(internal.seed.run, {})).rejects.toThrow("Reset blocked");
  expect(await t.run(ctx => ctx.db.query("companies").take(20))).toHaveLength(14);
});

test("transport rejects forged receipt and preserves uncertainty instead of marking done", async () => {
  const { t, job } = await fixture();
  vi.stubGlobal("fetch", vi.fn(async () => new Response('{}', { status: 200, headers: { 'x-sidecall-signature': 'forged' } })));
  await t.action(internal.receiverTransport.dispatch, { jobId: job._id });
  expect(await t.run(ctx => ctx.db.get("responseSteps", job.stepId))).toMatchObject({ status: "unknown" });
});

test("transport accepts a correctly bound signed receiver receipt", async () => {
  const { t, job, receipt } = await fixture();
  // Provider receipts exclude the command-only policyVersion field.
  const value = receipt(); delete (value as ReceiverReceipt & { policyVersion?: number }).policyVersion;
  const raw = JSON.stringify(value);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(raw, { status: 200, headers: { 'x-sidecall-signature': sign('receiver-test-secret-32-characters-long', '/v1/commands:receipt', raw) } })));
  await t.action(internal.receiverTransport.dispatch, { jobId: job._id });
  expect(await t.run(ctx => ctx.db.get("responseSteps", job.stepId))).toMatchObject({ status: "done", executionMode: "external" });
});
