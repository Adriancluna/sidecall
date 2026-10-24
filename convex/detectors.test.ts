/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { SCENARIOS } from "./seed";

const modules = import.meta.glob("./**/*.ts");
const PAYROLL = "Brightline Payroll";
const LOGIN = "Ironclad shared admin account";
const REPORTER = "pinecreststaffing.example";
const encoder = new TextEncoder();
const event = {
  externalId: "detector-report-1", assetName: PAYROLL,
  reportedByDomain: REPORTER, assessment: "confirmed" as const,
  evidenceRefs: ["case:independent-proof"],
};
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, "0")).join("");
const hash = async (value: string) => hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
async function signature(raw: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode("test-legacy-secret"),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `sha256=${hex(await crypto.subtle.sign("HMAC", key, encoder.encode(raw)))}`;
}
async function json(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json();
  expect(value).toBeTypeOf("object");
  return value as Record<string, unknown>;
}
async function fixture() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.mutation(internal.seed.run, {});
  const users = await t.run(ctx => ctx.db.query("users").take(100));
  const as = (name: string) => t.withIdentity({ subject: `${users.find(u => u.name === name)!._id}|session` });
  let nextToken = 0;
  const register = async (options: {
    name?: string; assetNames?: string[]; reporterDomains?: string[];
    mode?: "observe" | "confirm"; expiresAt?: number;
  } = {}) => {
    const token = `sc_detector_${(++nextToken).toString(16).padStart(64, "0")}`;
    const tokenHash = await hash(token);
    const sourceId = await t.mutation(internal.detectors.register, {
      name: `Detector ${nextToken}`, assetNames: [PAYROLL], reporterDomains: [REPORTER],
      ...options, tokenHash,
    });
    return { sourceId, token, tokenHash };
  };
  const post = (token: string, report: unknown = event, headers: Record<string, string> = {}) =>
    t.fetch("/incident", { method: "POST", body: JSON.stringify(report),
      headers: { Authorization: `Bearer ${token}`, ...headers } });
  return { t, as, register, post };
}

// Keep scheduled response execution under each test's control, particularly revocation races.
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-24T23:00:00Z")); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("named detector authority", () => {
  test("mint returns a one-time credential but stores and lists no secret", async () => {
    const { t, as } = await fixture();
    const minted = await t.action(internal.detectors.mint, {
      name: "Payroll monitor", assetNames: [PAYROLL], reporterDomains: [REPORTER],
    });
    expect(minted.token).toMatch(/^sc_detector_[a-f0-9]{64}$/);
    const stored = await t.run(ctx => ctx.db.get("detectorSources", minted.sourceId));
    expect(stored).toMatchObject({ mode: "observe", tokenHash: await hash(minted.token) });
    expect(JSON.stringify(stored)).not.toContain(minted.token);
    const listed = await as("Jordan Ames (Northpass Capital)").query(api.detectors.list, {});
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty("tokenHash");
    expect(listed[0]).not.toHaveProperty("token");
    expect(await as("Jamie Chen").query(api.detectors.list, {})).toEqual([]);
    await expect(t.query(api.detectors.list, {})).rejects.toThrow(/Not signed in/);
  });

  test("scope is checked before replay and neither a reporter nor an asset can be impersonated", async () => {
    const { t, register, post } = await fixture();
    const source = await register();
    expect((await post(source.token)).status).toBe(200);
    expect((await post(source.token, { ...event, assetName: LOGIN })).status).toBe(403);
    expect((await post(source.token, { ...event, reportedByDomain: "cedarridge.example" })).status).toBe(403);
    expect((await post(source.token, { ...event, externalId: "forged-fresh", assetName: LOGIN })).status).toBe(403);
    const reports = await t.run(ctx => ctx.db.query("incidentReports").take(20));
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ sourceId: source.sourceId, externalId: event.externalId });
  });

  test("finding-derived reporters are subject to the same source allowlist", async () => {
    const { t, register, post } = await fixture();
    const source = await register({ assetNames: [LOGIN], mode: "confirm" });
    const finding = {
      source: "armadin", findingId: "claimed-test", validatedAt: Date.now(),
      scope: { organizationDomain: "cedarridge.example" }, technique: { id: "T1078" },
      path: [{ kind: "credential", label: "Claimed shared login", validated: true }],
      terminalAsset: { assetName: LOGIN, kind: "credential" },
    };
    expect((await post(source.token, { externalId: "finding-scope", finding,
      assessment: "confirmed", evidenceRefs: ["claimed:evidence"] })).status).toBe(403);
    expect(await t.run(ctx => ctx.db.query("incidents").take(10))).toEqual([]);
  });

  test("credential collisions cannot replace another source's authority", async () => {
    const { t, register, post } = await fixture();
    const first = await register();
    const second = await register({ mode: "confirm" });
    await expect(t.mutation(internal.detectors.register, {
      name: "Impersonating registration", tokenHash: first.tokenHash,
      assetNames: [LOGIN], reporterDomains: [], mode: "confirm",
    })).rejects.toThrow(/already registered/);
    await expect(t.mutation(internal.detectors.replaceKey, {
      sourceId: second.sourceId, tokenHash: first.tokenHash,
    })).rejects.toThrow();
    expect(await json(await post(first.token))).toMatchObject({ assessment: "observation" });
    expect(await json(await post(second.token))).toMatchObject({ assessment: "confirmed" });
    expect(await t.run(ctx => ctx.db.query("detectorSources").take(10))).toHaveLength(2);
  });

  test("default observation authority cannot be promoted by claimed assessment or source metadata", async () => {
    const { t, register, post } = await fixture();
    const source = await register({ name: "Untrusted observation feed" });
    const response = await post(source.token, { ...event,
      sourceId: "attacker-chosen-source", sourceName: "Trusted Armadin", mode: "confirm" });
    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ assessment: "observation" });
    const state = await t.run(async ctx => ({
      incidents: await ctx.db.query("incidents").take(20),
      receipts: await ctx.db.query("incidentReports").take(20),
      payments: await ctx.db.query("payments").take(100),
      steps: await ctx.db.query("responseSteps").take(100),
    }));
    expect(state.incidents[0]).toMatchObject({ responseClass: "observation", sourceId: source.sourceId });
    expect(state.receipts[0]).toMatchObject({ sourceId: source.sourceId, sourceName: "Untrusted observation feed",
      requestedAssessment: "confirmed", effectiveAssessment: "observation" });
    expect(state.payments.filter(p => p.status === "held")).toEqual([]);
    expect(state.steps).toEqual([]);
  });

  test("confirm authority requires an explicit conclusion and evidence on each report", async () => {
    const { t, register, post } = await fixture();
    const source = await register({ mode: "confirm" });
    const missingEvidence = await post(source.token, { ...event, evidenceRefs: [] });
    expect(await json(missingEvidence)).toMatchObject({ assessment: "observation" });
    const missingConclusion = await post(source.token, { ...event, externalId: "no-conclusion", assessment: undefined });
    expect(await json(missingConclusion)).toMatchObject({ assessment: "observation" });
    expect((await t.run(ctx => ctx.db.query("payments").take(100))).some(p => p.status === "held")).toBe(false);
    const confirmed = await post(source.token, { ...event, externalId: "verified-report" });
    expect(await json(confirmed)).toMatchObject({ assessment: "confirmed" });
    expect((await t.run(ctx => ctx.db.query("payments").take(100))).filter(p => p.status === "held")).toHaveLength(4);
  });

  test("replaying an observation as confirmed preserves the original receipt assessment", async () => {
    const { t, register, post } = await fixture();
    const source = await register({ mode: "confirm" });
    const original = await json(await post(source.token, {
      ...event, assessment: "observation", evidenceRefs: [],
    }));
    expect(original).toMatchObject({ duplicate: false, assessment: "observation" });
    const replay = await json(await post(source.token, {
      ...event, assessment: "confirmed", evidenceRefs: ["new:claimed-confirmation"],
    }));
    expect(replay).toMatchObject({ incidentId: original.incidentId, duplicate: true, assessment: "observation" });
    const state = await t.run(async ctx => ({
      receipts: await ctx.db.query("incidentReports").take(10),
      incidents: await ctx.db.query("incidents").take(10),
      payments: await ctx.db.query("payments").take(100),
      steps: await ctx.db.query("responseSteps").take(100),
    }));
    expect(state.receipts).toHaveLength(1);
    expect(state.receipts[0]).toMatchObject({ requestedAssessment: "observation", effectiveAssessment: "observation", evidenceRefs: [] });
    expect(state.incidents).toHaveLength(1);
    expect(state.incidents[0].responseClass).toBe("observation");
    expect(state.payments.filter(p => p.status === "held")).toEqual([]);
    expect(state.steps).toEqual([]);
  });

  test.each(["unknown", "revoked", "malformed"])("%s detector credentials never fall back to valid HMAC or presenter authorization", async kind => {
    vi.stubEnv("INCIDENT_WEBHOOK_SECRET", "test-legacy-secret");
    vi.stubEnv("INCIDENT_AUTO_RESPONSE", "true");
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("PRESENTER_KEY", "stage-test-key");
    const { t, register } = await fixture();
    const source = await register();
    if (kind === "revoked") await t.mutation(internal.detectors.revoke, { sourceId: source.sourceId });
    const token = kind === "revoked" ? source.token : kind === "unknown" ? `sc_detector_${"f".repeat(64)}` : "broken";
    const raw = JSON.stringify({ externalId: SCENARIOS.brightline.externalId, assetName: PAYROLL });
    const result = await t.fetch("/incident", { method: "POST", body: raw, headers: {
      Authorization: `Bearer ${token}`, "X-Sidecall-Presenter": "stage-test-key", "X-Sidecall-Signature": await signature(raw),
    } });
    expect(result.status).toBe(401);
    expect(await t.run(ctx => ctx.db.query("incidents").take(10))).toEqual([]);
  });

  test("sources sharing an external ID keep separate receipts while sharing one response episode", async () => {
    const { t, register, post } = await fixture();
    const first = await register();
    const second = await register();
    const one = await json(await post(first.token));
    const two = await json(await post(second.token));
    expect(one).toMatchObject({ duplicate: false, correlated: false });
    expect(two).toMatchObject({ incidentId: one.incidentId, duplicate: false, correlated: true });
    const receipts = await t.run(ctx => ctx.db.query("incidentReports").take(10));
    expect(receipts).toHaveLength(2);
    expect(new Set(receipts.map(r => r.sourceId))).toEqual(new Set([first.sourceId, second.sourceId]));
    expect(await json(await post(first.token))).toMatchObject({ duplicate: true, incidentId: one.incidentId });
    expect(await t.run(ctx => ctx.db.query("incidents").take(10))).toHaveLength(1);
  });

  test("concurrent replays produce only one receipt and survive credential rotation", async () => {
    const { t, register, post } = await fixture();
    const source = await register();
    const replies = await Promise.all([post(source.token), post(source.token)]);
    const bodies = await Promise.all(replies.map(json));
    expect(bodies.filter(b => b.duplicate === false)).toHaveLength(1);
    expect(bodies.filter(b => b.duplicate === true)).toHaveLength(1);
    const rotated = `sc_detector_${"a".repeat(64)}`;
    await t.mutation(internal.detectors.replaceKey, { sourceId: source.sourceId, tokenHash: await hash(rotated) });
    expect((await post(source.token)).status).toBe(401);
    expect(await json(await post(rotated))).toMatchObject({ duplicate: true, incidentId: bodies[0].incidentId });
    expect(await t.run(ctx => ctx.db.query("incidentReports").take(10))).toHaveLength(1);
  });

  test("revocation takes effect before replay and accepted earlier reports remain durable", async () => {
    const { t, register, post } = await fixture();
    const source = await register();
    expect((await post(source.token)).status).toBe(200);
    await t.mutation(internal.detectors.revoke, { sourceId: source.sourceId });
    expect((await post(source.token)).status).toBe(401);
    expect((await post(source.token, { ...event, externalId: "after-revoke" })).status).toBe(401);
    const notYetUsed = await register();
    await t.mutation(internal.detectors.revoke, { sourceId: notYetUsed.sourceId });
    expect((await post(notYetUsed.token)).status).toBe(401);
    expect(await t.run(ctx => ctx.db.query("incidentReports").take(10))).toHaveLength(1);
    await expect(t.mutation(internal.detectors.replaceKey, {
      sourceId: source.sourceId, tokenHash: "b".repeat(64),
    })).rejects.toThrow(/Only active/);
  });

  test.each(["revoked", "expired"])("%s source authority cancels queued automatic access changes", async loss => {
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("RESPONSE_SANDBOX", "true");
    const { t, register, post, as } = await fixture();
    const sandboxToken = `sc_test_${"d".repeat(64)}`;
    await t.mutation(internal.sandbox.provision, {
      companyDomain: "cedarridge.example", assetName: LOGIN, tokenHash: await hash(sandboxToken),
    });
    const source = await register({ mode: "confirm", assetNames: [LOGIN], expiresAt: Date.now() + 1000 });
    const accepted = await json(await post(source.token, { ...event, assetName: LOGIN }));
    const incidentId = accepted.incidentId as Id<"incidents">;
    const before = await as("Sam Kowalski").query(api.responses.getMyResponsePlan, { incidentId });
    expect(before.find(s => s.action === "pause_shared_login")?.status).toBe("queued");
    if (loss === "revoked") await t.mutation(internal.detectors.revoke, { sourceId: source.sourceId });
    else vi.setSystemTime(Date.now() + 1001);
    await t.mutation(internal.responses.recordSimulated, { incidentId });
    const after = await as("Sam Kowalski").query(api.responses.getMyResponsePlan, { incidentId });
    expect(after.find(s => s.action === "pause_shared_login")?.status).toBe("expired");
    expect((await t.fetch("/sandbox/resource", { headers: { Authorization: `Bearer ${sandboxToken}` } })).status).toBe(200);
    expect((await post(source.token, { ...event, assetName: LOGIN, externalId: "late" })).status).toBe(401);
  });

  test("revoking a detector never releases existing holds or undoes completed access changes", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("RESPONSE_SANDBOX", "true");
    const { t, register, post } = await fixture();
    const sandboxToken = `sc_test_${"e".repeat(64)}`;
    await t.mutation(internal.sandbox.provision, {
      companyDomain: "cedarridge.example", assetName: LOGIN, tokenHash: await hash(sandboxToken),
    });
    const source = await register({ mode: "confirm", assetNames: [PAYROLL, LOGIN] });
    await post(source.token);
    const access = await json(await post(source.token, { ...event, externalId: "access", assetName: LOGIN }));
    await t.mutation(internal.responses.recordSimulated, { incidentId: access.incidentId as Id<"incidents"> });
    await t.mutation(internal.detectors.revoke, { sourceId: source.sourceId });
    expect((await t.fetch("/sandbox/resource", { headers: { Authorization: `Bearer ${sandboxToken}` } })).status).toBe(403);
    expect((await t.run(ctx => ctx.db.query("payments").take(100))).filter(p => p.status === "held")).toHaveLength(4);
  });

  test("an explicit company approval remains independent of revoked detector authority", async () => {
    const { t, register, post, as } = await fixture();
    const source = await register({ mode: "confirm", assetNames: [LOGIN] });
    const accepted = await json(await post(source.token, { ...event, assetName: LOGIN }));
    const incidentId = accepted.incidentId as Id<"incidents">;
    const approver = as("Ben Carter");
    const plan = await approver.query(api.responses.getMyResponsePlan, { incidentId });
    const pause = plan.find(step => step.action === "pause_shared_login");
    expect(pause?.status).toBe("awaiting_approval");
    await t.mutation(internal.detectors.revoke, { sourceId: source.sourceId });
    expect(await approver.mutation(api.responses.approveStep, { stepId: pause!.stepId! })).toMatchObject({ ok: true });
    await t.mutation(internal.responses.recordSimulated, { incidentId });
    expect((await approver.query(api.responses.getMyResponsePlan, { incidentId }))
      .find(step => step.action === "pause_shared_login")?.status).toBe("done");
    expect((await as("Sam Kowalski").query(api.responses.getMyResponsePlan, { incidentId }))
      .find(step => step.action === "pause_shared_login")?.status).toBe("expired");
  });

  test("firm receipts preserve source provenance while company views redact identifying source fields", async () => {
    const { t, register, post, as } = await fixture();
    const source = await register({ name: "Pinecrest private monitor" });
    const accepted = await json(await post(source.token, { ...event, externalId: "Pinecrest-secret-case-001" }));
    const incidentId = accepted.incidentId as Id<"incidents">;
    const firm = await as("Jordan Ames (Northpass Capital)").query(api.responseEvidence.getRecord, { incidentId });
    expect(firm?.reports[0]).toMatchObject({ authenticatedSource: { id: source.sourceId, name: "Pinecrest private monitor" },
      requestedAssessment: "confirmed", effectiveAssessment: "observation" });
    expect(JSON.stringify(firm)).not.toContain(source.token);
    expect(JSON.stringify(firm)).not.toContain(source.tokenHash);
    const company = as("Jamie Chen");
    expect(await company.query(api.detectors.list, {})).toEqual([]);
    expect(await company.query(api.responseEvidence.getRecord, { incidentId })).toBeNull();
    const views = await Promise.all([
      company.query(api.blastRadius.listIncidents, {}), company.query(api.alerts.getMyAlerts, {}),
      company.query(api.blastRadius.getMyExposures, {}), company.query(api.blastRadius.getIncidentTimeline, { incidentId }),
    ]);
    const serialized = JSON.stringify(views);
    expect(serialized).not.toMatch(/Pinecrest|pinecreststaffing|sourceId|sourceName|authenticatedSource/);
    expect(serialized).not.toContain(source.sourceId);
    expect(serialized).not.toContain(source.tokenHash);
    expect((views[0] as { externalId: string }[])[0].externalId).toBe(incidentId);
    expect(await t.run(ctx => ctx.db.query("incidentReports").take(10))).toHaveLength(1);
  });

  test("source quotas persist through rotation and do not throttle another detector", async () => {
    const { t, register, post } = await fixture();
    const noisy = await register();
    const independent = await register();
    for (let i = 0; i < 10; i++) expect((await post(noisy.token, { ...event, externalId: `noise-${i}` })).status).toBe(200);
    const denied = await post(noisy.token, { ...event, externalId: "over-budget" });
    expect(denied.status).toBe(429);
    expect(Number(denied.headers.get("Retry-After"))).toBeGreaterThan(0);
    const rotated = `sc_detector_${"c".repeat(64)}`;
    await t.mutation(internal.detectors.replaceKey, { sourceId: noisy.sourceId, tokenHash: await hash(rotated) });
    expect((await post(rotated, { ...event, externalId: "rotation-bypass" })).status).toBe(429);
    expect((await post(independent.token)).status).toBe(200);
    expect(await t.run(ctx => ctx.db.query("incidentReports").take(30))).toHaveLength(11);
    vi.setSystemTime(Date.now() + 2001);
    expect((await post(rotated, { ...event, externalId: "refilled" })).status).toBe(200);
  });
});

describe("bounded intake and compatibility", () => {
  test("rejects multibyte payloads by byte length and cancels oversized streams early", async () => {
    const { t, register } = await fixture();
    const source = await register();
    const body = JSON.stringify({ ...event, summary: "🙂".repeat(9000) });
    expect(body.length).toBeLessThan(32 * 1024);
    expect(encoder.encode(body).byteLength).toBeGreaterThan(32 * 1024);
    expect((await t.fetch("/incident", { method: "POST", body,
      headers: { Authorization: `Bearer ${source.token}` } })).status).toBe(413);
    let pulls = 0;
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { pulls++; controller.enqueue(new Uint8Array(4096)); if (pulls === 100) controller.close(); },
      cancel() { canceled = true; },
    });
    const init: RequestInit & { duplex: "half" } = { method: "POST", body: stream, duplex: "half",
      headers: { Authorization: `Bearer ${source.token}` } };
    expect((await t.fetch("/incident", init)).status).toBe(413);
    expect(canceled).toBe(true);
    expect(pulls).toBeLessThan(100);
    expect(await t.run(ctx => ctx.db.query("incidents").take(10))).toEqual([]);
  });

  test("rejects invalid UTF-8, JSON arrays and oversized identifier/summary fields before writing", async () => {
    const { t, register, post } = await fixture();
    const source = await register();
    for (const report of [[], { ...event, externalId: "x".repeat(201) }, { ...event, summary: "x".repeat(4001) },
      { ...event, assetName: "x".repeat(201) }, { ...event, reportedByDomain: "x".repeat(254) }])
      expect((await post(source.token, report)).status).toBe(400);
    expect((await t.fetch("/incident", { method: "POST", body: new Uint8Array([0xc3, 0x28]),
      headers: { Authorization: `Bearer ${source.token}` } })).status).toBe(400);
    expect(await t.run(ctx => ctx.db.query("incidentReports").take(10))).toEqual([]);
  });

  test("legacy signed intake preserves its observation default and explicit enrollment semantics", async () => {
    vi.stubEnv("INCIDENT_WEBHOOK_SECRET", "test-legacy-secret");
    vi.stubEnv("INCIDENT_AUTO_RESPONSE", "false");
    const { t, register, post } = await fixture();
    const raw = JSON.stringify(event);
    const response = await t.fetch("/incident", { method: "POST", body: raw,
      headers: { "X-Sidecall-Signature": await signature(raw) } });
    expect(response.status).toBe(200);
    const legacy = await json(response);
    const source = await register();
    expect(await json(await post(source.token))).toMatchObject({ duplicate: false, correlated: true, incidentId: legacy.incidentId });
    vi.stubEnv("INCIDENT_AUTO_RESPONSE", "true");
    const confirmedRaw = JSON.stringify({ ...event, externalId: "legacy-confirmed" });
    expect((await t.fetch("/incident", { method: "POST", body: confirmedRaw,
      headers: { "X-Sidecall-Signature": await signature(confirmedRaw) } })).status).toBe(200);
    const incidents = await t.run(ctx => ctx.db.query("incidents").take(10));
    expect(incidents.map(i => i.responseClass)).toEqual(["observation", "vendor"]);
    expect(incidents.every(i => i.sourceId === undefined)).toBe(true);
  });

  test.each(Object.values(SCENARIOS))("the $externalId presenter scenario remains immediate and replay-safe", async scenario => {
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("PRESENTER_KEY", "stage-test-key");
    const { t } = await fixture();
    const body = JSON.stringify({ externalId: scenario.externalId, assetName: scenario.assetName,
      summary: "ATTACKER CONTROLLED TEXT", assessment: "observation" });
    expect((await t.fetch("/incident", { method: "POST", body })).status).toBe(401);
    const send = () => t.fetch("/incident", { method: "POST", body, headers: { "X-Sidecall-Presenter": "stage-test-key" } });
    const first = await json(await send());
    expect(first).toMatchObject({ duplicate: false, correlated: false });
    expect(await json(await send())).toMatchObject({ duplicate: true, incidentId: first.incidentId });
    const incident = await t.run(ctx => ctx.db.get("incidents", first.incidentId as Id<"incidents">));
    expect(incident?.responseClass).not.toBe("observation");
    expect(incident?.summary).toBe(scenario.summary);
    expect(incident?.sourceId).toBeUndefined();
  });
});
