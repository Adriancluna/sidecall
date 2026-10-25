import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClaude, discoverTools, documentRecord, modelPricing, redact, runAssistantCase,
  validArguments, withCleanup } from "./core.mjs";
import { createTransport, loadRuntimeEnv, optionsFor, preflight, runProof } from "./rehearse.mjs";

const fixture = JSON.parse(readFileSync(new URL("./fixtures.json", import.meta.url), "utf8"))[0];
const object = properties => ({ type: "object", properties, additionalProperties: false });
const string = { type: "string" };
const tools = [
  { name: "list_bills", description: "Read saved bills.", inputSchema: object({}) },
  { name: "request_payment", description: "Request a saved bill.", inputSchema: {
    ...object({ billId: string, requestId: string, expectedMandateId: string }), required: ["billId"] } },
  { name: "explain_hold", description: "Read a held payment.", inputSchema: { ...object({ paymentId: string }), required: ["paymentId"] } },
  { name: "list_held_payments", description: "Read held payments.", inputSchema: object({ status: { type: "string", enum: ["held", "paid", "rejected"] } }) },
];
const content = value => ({ content: [{ type: "text", text: JSON.stringify(value) }] });
const response = (...blocks) => ({ id: "msg-test", requestId: "api-request-test", content: blocks,
  stop_reason: blocks.some(b => b.type === "tool_use") ? "tool_use" : "end_turn", usage: { input_tokens: 50, output_tokens: 20 } });
const tool = (id, name, input) => ({ type: "tool_use", id, name, input });
const done = text => response({ type: "text", text });
const read = () => response(tool("read", "read_source_document", { documentId: fixture.id }));
const list = () => response(tool("list", "list_bills", {}));
const buy = input => response(tool("buy", "request_payment", input ?? { billId: "bill-180" }));
function sequence(outputs) {
  const inputs = [];
  return { inputs, usage: { calls: 0 }, async next(input) {
    inputs.push(input); this.usage.calls++; assert.ok(outputs.length, "Unexpected extra model call"); return outputs.shift();
  } };
}
function caseArgs(model, invoke, extra = {}) {
  return { fixture, prompt: `Read ${fixture.id} and request the matching saved bill.`, discovered: tools,
    billId: "bill-180", requestId: "fixed-request", expectedMandateId: "mandate-original", model, invoke, ...extra };
}
const options = optionsFor(["--deployment", "tangible-koala-842"]);
const fakeOwned = () => ({ deployment: options.deployment });

test("missing presenter configuration fails before any rehearsal setup", () => {
  assert.throws(() => preflight(options, { env: { ANTHROPIC_API_KEY: "fake-key" }, owned: () => assert.fail("No DEV call expected") }), /PRESENTER_KEY is missing/);
});

test("source documents have deterministic hashes and preserve untrusted provenance", () => {
  const a = documentRecord(fixture);
  assert.match(a.sha256, /^[a-f0-9]{64}$/);
  assert.equal(a.sha256, documentRecord({ ...fixture }).sha256);
  assert.notEqual(a.sha256, documentRecord({ ...fixture, content: `${fixture.content}!` }).sha256);
  assert.equal(a.trusted, false);
  assert.throws(() => documentRecord({ ...fixture, content: "x".repeat(32_769) }), /oversized/);
});

test("real model-selected read→list→request sequence retains API IDs, actual results and host bindings", async () => {
  const model = sequence([read(), list(), response({ type: "text", text: "The printer invoice is $180." },
    tool("buy", "request_payment", { billId: "bill-180" })), done("Settled in the demo ledger only.")]);
  const calls = [];
  const observed = await runAssistantCase(caseArgs(model, async (name, args) => {
    calls.push({ name, args });
    return name === "list_bills" ? content([{ billId: "bill-180", amount: "$180", description: fixture.title }])
      : content({ ok: true, automatic: true, held: false, paymentId: "payment-1", receiptId: "receipt-1" });
  }));
  assert.deepEqual(calls, [{ name: "list_bills", args: {} }, { name: "request_payment", args: {
    billId: "bill-180", requestId: "fixed-request", expectedMandateId: "mandate-original" } }]);
  assert.equal(observed.sourceRead, true);
  assert.equal(observed.attempts[0].result.receiptId, "receipt-1");
  assert.deepEqual(observed.attempts[0].input, { billId: "bill-180" });
  assert.equal(observed.trace[0].requestId, "api-request-test");
  for (const input of model.inputs.slice(1)) {
    const last = input.messages.at(-1);
    assert.equal(last.role, "user");
    assert.equal(last.content[0].type, "tool_result");
    assert.equal(last.content[0].tool_use_id, input.messages.at(-2).content.find(b => b.type === "tool_use").id);
  }
  const sourceResult = model.inputs[1].messages.at(-1).content[0];
  assert.equal(JSON.parse(sourceResult.content[0].text).trusted, false);
  assert.ok(!model.inputs[0].messages[0].content.includes(fixture.content));
});

test("host request identity and mandate are absent from model schema; unknown extra arguments are rejected", async () => {
  const advertised = discoverTools(tools).modelTools.find(row => row.name === "request_payment");
  assert.deepEqual(Object.keys(advertised.input_schema.properties), ["billId"]);
  const model = sequence([read(), list(), buy({ billId: "bill-180", amountCents: 1 }),
    buy({ billId: "bill-180", requestId: "attacker", expectedMandateId: "evil" }), done("Stopped.")]);
  const dispatched = [];
  const observed = await runAssistantCase(caseArgs(model, async name => {
    dispatched.push(name); return content([{ billId: "bill-180" }]);
  }));
  assert.deepEqual(dispatched, ["list_bills"]);
  assert.equal(observed.attempts.length, 0);
  assert.equal(observed.trace.filter(row => row.kind === "tool_result" && row.name === "request_payment" && row.origin === "harness").length, 2);
});

test("cannot request before document/bill discovery, use another bill, or invoke a release tool", async () => {
  const model = sequence([buy(), read(), buy(), list(), buy({ billId: "other-company" }),
    response(tool("release", "release_payment", { paymentId: "payment" })), done("No request made.")]);
  const dispatched = [];
  const observed = await runAssistantCase(caseArgs(model, async name => {
    dispatched.push(name); return content([{ billId: "bill-180" }, { billId: "other-company" }]);
  }));
  assert.deepEqual(dispatched, ["list_bills"]);
  assert.equal(observed.outcome, "model_no_payment_request");
});

test("backend refusal is distinct from model choosing not to request", async () => {
  const refusal = await runAssistantCase(caseArgs(sequence([read(), list(), buy(), done("Stored bill changed; refused.")]), async name =>
    name === "list_bills" ? content([{ billId: "bill-180" }]) : {
      ...content({ ok: false, reason: "Stored bill changed", receiptId: "receipt-refused" }), isError: true }));
  assert.equal(refusal.attempts[0].result.ok, false);
  assert.equal(refusal.attempts[0].isError, true);
  assert.equal(refusal.trace.find(row => row.name === "request_payment").origin, "mcp");
  const noCall = await runAssistantCase(caseArgs(sequence([read(), done("I will not request it.")]), async () => assert.fail("No MCP expected")));
  assert.equal(noCall.outcome, "model_no_payment_request");
  assert.equal(noCall.attempts.length, 0);
});

test("held payment is explained only after a real scoped result provides its ID", async () => {
  const model = sequence([read(), response(tool("bad", "explain_hold", { paymentId: "foreign" })), list(), buy(),
    response(tool("explain", "explain_hold", { paymentId: "held-1" })), done("A different controller must verify by phone.")]);
  const calls = [];
  await runAssistantCase(caseArgs(model, async name => {
    calls.push(name);
    if (name === "list_bills") return content([{ billId: "bill-180" }]);
    if (name === "request_payment") return content({ ok: true, held: true, paymentId: "held-1" });
    return content({ paymentId: "held-1", phoneOnFile: "+1 (415) 555-0142", status: "held" });
  }, { expectedMandateId: undefined }));
  assert.deepEqual(calls, ["list_bills", "request_payment", "explain_hold"]);
});

test("tool round limit fails rather than manufacturing a completed proof", async () => {
  await assert.rejects(runAssistantCase(caseArgs(sequence([read()]), async () => assert.fail(), { maxRounds: 1 })), /round limit/);
});

test("provider refusal/output truncation and invalid tool batches fail with safe diagnostics", async () => {
  for (const stop_reason of ["refusal", "max_tokens"]) {
    await assert.rejects(runAssistantCase(caseArgs(sequence([{ ...done("not evidence"), stop_reason }]), async () => assert.fail())),
      /declined|output-token limit/);
  }
});

test("redaction removes explicit secrets, credential fields and recognizable keys while keeping evidence IDs", () => {
  const secret = "my-private-session";
  const out = redact({ token: "anything", tokenHash: "hash", nested: [secret, "sk-ant-api03-secret",
    `sc_agent_${"a".repeat(64)}`, "Bearer random-private-token", "eyJabc.def.ghi"],
    requestId: "safe-request", receiptId: "safe-receipt" }, [secret]);
  const serialized = JSON.stringify(out);
  for (const forbidden of [secret, "api03-secret", "random-private-token", "eyJabc", "a".repeat(64)]) assert.ok(!serialized.includes(forbidden));
  assert.equal(out.requestId, "safe-request");
  assert.equal(out.receiptId, "safe-receipt");
});

test("schema validation checks required fields, enums, types and rejects array/null/unknown keys", () => {
  const schema = { ...object({ status: { type: "string", enum: ["held"] } }), required: ["status"] };
  assert.equal(validArguments(schema, { status: "held" }), true);
  for (const args of [{}, null, [], { status: 1 }, { status: "paid" }, { status: "held", admin: true }]) {
    assert.equal(validArguments(schema, args), false);
  }
  assert.throws(() => discoverTools(tools.filter(row => row.name !== "list_bills")), /not deployed/);
  const old = structuredClone(tools); delete old[1].inputSchema.properties.requestId;
  assert.throws(() => discoverTools(old), /request identity/);
});

test("missing API key fails before the owned guard, network or any setup mutation", async () => {
  const never = () => assert.fail("No setup or guard expected without key");
  assert.throws(() => preflight(options, { env: {}, owned: never }), /ANTHROPIC_API_KEY is missing/);
  await assert.rejects(runProof({ options, env: {}, owned: never, transport: new Proxy({}, { get: never }) }), /ANTHROPIC_API_KEY is missing/);
});

test("dotenv loading is nonmutating and uses process > local > base precedence without expanding secrets", () => {
  const cwd = mkdtempSync(join(tmpdir(), "assistant-dotenv-"));
  try {
    writeFileSync(join(cwd, ".env"), 'ANTHROPIC_API_KEY="base-private"\nBASE_ONLY=yes\nLITERAL="$(never-run)"\n');
    const env = { PROCESS_ONLY: "yes" };
    assert.equal(loadRuntimeEnv({ cwd, env }).ANTHROPIC_API_KEY, "base-private");
    writeFileSync(join(cwd, ".env.local"), 'ANTHROPIC_API_KEY="local-private"\n');
    assert.equal(loadRuntimeEnv({ cwd, env }).ANTHROPIC_API_KEY, "local-private");
    const explicit = { ...env, ANTHROPIC_API_KEY: "process-private" };
    const resolved = loadRuntimeEnv({ cwd, env: explicit });
    assert.equal(resolved.ANTHROPIC_API_KEY, "process-private");
    assert.equal(resolved.LITERAL, "$(never-run)");
    assert.deepEqual(explicit, { PROCESS_ONLY: "yes", ANTHROPIC_API_KEY: "process-private" });
    assert.equal(loadRuntimeEnv({ cwd, env: { ANTHROPIC_API_KEY: "" } }).ANTHROPIC_API_KEY, "");
    assert.match(readFileSync(join(cwd, ".env"), "utf8"), /base-private/);
    assert.match(readFileSync(join(cwd, ".env.local"), "utf8"), /local-private/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("exact owned DEV guard rejects mismatches, production, Adrian and both deployment keys", () => {
  const cwd = mkdtempSync(join(tmpdir(), "assistant-guard-"));
  const local = (selector, url, extra = "") => writeFileSync(join(cwd, ".env.local"), `CONVEX_DEPLOYMENT=${selector}\nVITE_CONVEX_URL=${url}\n${extra}`);
  const env = { ANTHROPIC_API_KEY: "fake-key", PRESENTER_KEY: "fake-presenter" };
  try {
    local("dev:tangible-koala-842", "https://tangible-koala-842.convex.cloud");
    assert.equal(preflight(options, { env, cwd }).cloud, "https://tangible-koala-842.convex.cloud");
    assert.throws(() => preflight(options, { env: { ...env, CONVEX_DEPLOYMENT_TOKEN: "private" }, cwd }), /tokens/);
    assert.throws(() => preflight(options, { env: { ...env, CONVEX_DEPLOY_KEY: "private" }, cwd }), /keys/);
    local("prod:tangible-koala-842", "https://tangible-koala-842.convex.cloud");
    assert.throws(() => preflight(options, { env, cwd }), /own cloud DEV/);
    local("dev:judicious-tiger-712", "https://judicious-tiger-712.convex.cloud");
    assert.throws(() => preflight(options, { env, cwd }), /Adrian/);
    local("dev:tangible-koala-842", "https://other-own-123.convex.cloud");
    assert.throws(() => preflight(options, { env, cwd }), /match exactly/);
    local("dev:tangible-koala-842", "https://tangible-koala-842.convex.cloud", "CONVEX_DEPLOYMENT_TOKEN=private\n");
    assert.throws(() => preflight(options, { env, cwd }), /tokens/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("transport revalidates before every request and sanitizes operator errors/null output", async () => {
  let validations = 0;
  let switched = false;
  let operatorMode = "null";
  const env = { ANTHROPIC_API_KEY: "fake-key", PRESENTER_KEY: "fake-presenter" };
  const transport = createTransport({ options, env,
    owned: () => { validations++; if (switched) throw new Error("switched"); return fakeOwned(); },
    fetchImpl: async () => new Response(JSON.stringify({ status: "success", value: 42 })),
    execImpl: async (_cmd, _args, child) => {
      assert.equal(child.env.ANTHROPIC_API_KEY, undefined);
      if (operatorMode === "throw") throw new Error("raw secret must not escape");
      return { stdout: operatorMode === "bad" ? "raw secret" : "" };
    } });
  assert.equal(await transport.call("query", "read:test"), 42);
  assert.equal(await transport.operator("test:null"), null);
  operatorMode = "bad";
  await assert.rejects(transport.operator("test:bad"), error => /invalid JSON/.test(error.message) && !/raw secret/.test(error.message));
  operatorMode = "throw";
  await assert.rejects(transport.operator("test:throw"), error => /raw output withheld/.test(error.message) && !/raw secret/.test(error.message));
  switched = true;
  await assert.rejects(transport.call("mutation", "test:write"), /switched/);
  assert.equal(validations, 6);
});

test("Claude client counts input before each model call and records actual usage", async () => {
  const urls = [];
  const model = createClaude({ apiKey: "fake-key", model: "claude-opus-5-5", fetchImpl: async (url, request) => {
    urls.push(url);
    const body = JSON.parse(request.body);
    assert.equal(request.headers["anthropic-version"], "2026-10-21");
    if (url.endsWith("count_tokens")) { assert.equal(body.max_tokens, undefined); return Response.json({ input_tokens: 100 }); }
    assert.equal(body.max_tokens, 4096);
    return Response.json(done("Finished"), { headers: { "request-id": "observed-api-id" } });
  } });
  const out = await model.next({ messages: [], tools: [] });
  assert.equal(urls.length, 2);
  assert.ok(urls[0].endsWith("count_tokens"));
  assert.equal(out.requestId, "observed-api-id");
  assert.equal(model.usage.calls, 1);
  assert.equal(model.usage.inputTokens, 50);
  assert.equal(model.usage.outputTokens, 20);
});

test("cost/input bounds stop before generating and HTTP errors never include raw API bodies", async () => {
  for (const config of [{ maxBudgetUsd: 0.00001 }, { maxInputTokens: 10 }]) {
    let calls = 0;
    const model = createClaude({ apiKey: "fake-key", model: "claude-opus-5-5", ...config,
      fetchImpl: async () => { calls++; return Response.json({ input_tokens: 100 }); } });
    await assert.rejects(model.next({ messages: [], tools: [] }), /budget|input-token limit/);
    assert.equal(calls, 1);
  }
  const model = createClaude({ apiKey: "fake-key", model: "claude-opus-5-5",
    fetchImpl: async () => new Response("private credentials in raw error", { status: 401 }) });
  await assert.rejects(model.next({ messages: [], tools: [] }), error => /HTTP 401/.test(error.message) && !/private credentials/.test(error.message));
});

test("cleanup runs all registered tasks in reverse order despite work and cleanup failures", async () => {
  const seen = [], failures = [];
  await assert.rejects(withCleanup(async () => { throw new Error("work failed"); }, [
    async () => seen.push("auth"), async () => { seen.push("agent"); throw new Error("private error"); },
    async () => seen.push("mandate"),
  ], failures), /work failed/);
  assert.deepEqual(seen, ["mandate", "agent", "auth"]);
  assert.equal(failures.length, 1);
  assert.ok(!failures[0].includes("private error"));
});

function fakeSetup({ malformedMint = false, failRevoke = false } = {}) {
  const calls = [];
  const token = `sc_agent_${"a".repeat(64)}`;
  const rows = [
    { bill: { _id: "bill-180", amountCents: 18000, description: "Printer supplies · SC-102" }, payment: null },
    { bill: { _id: "bill-120", amountCents: 12000, description: "Office supplies · SC-101" }, payment: null },
    { bill: { _id: "bill-held", amountCents: 3800000, description: "November payroll processing" }, payment: null },
  ];
  let revoked = false;
  return { calls, async commit() { return "synthetic-commit"; },
    async call(kind, path, args) {
      calls.push(`${kind}:${path}`);
      if (path === "auth:signIn") return { tokens: { token: `session-${args.params.email}`, refreshToken: "refresh-private" } };
      if (path === "auth:signOut") return null;
      if (path === "purchases:loadSamples") return { created: true };
      if (path === "payments:getMyBills") return rows;
      if (path === "purchases:approve") return "mandate-original";
      if (path === "purchases:revoke") return null;
      if (path === "payments:getLedger") return { entries: [], balances: { cash: 100000 } };
      assert.fail(`Unexpected ${path}`);
    },
    async operator(path) {
      calls.push(`operator:${path}`);
      if (path === "agents:mint") return malformedMint ? { token: "malformed" } : { token };
      if (path === "agents:authenticate") return { agentId: "agent-id", companyId: "company-summit" };
      if (path === "agents:revoke") { if (failRevoke) throw new Error("private raw failure"); revoked = true; return { revoked: 1 }; }
      assert.fail(`Unexpected ${path}`);
    },
    async rpc(_token, method) {
      calls.push(`mcp:${method}`);
      if (revoked) return { status: 401, value: { error: "invalid agent" } };
      return { status: 200, value: { result: method === "initialize" ? { capabilities: { tools: {} } } : { tools } } };
    },
  };
}

test("model failure after authorized setup revokes mandate and every minted agent, and signs out both sessions", async () => {
  const transport = fakeSetup();
  const report = await runProof({ options, env: { ANTHROPIC_API_KEY: "fake-key", PRESENTER_KEY: "fake-presenter" }, owned: fakeOwned,
    transport, fixtures: [fixture], model: { usage: { calls: 0 }, next: async () => { throw new Error("private model failure"); } } });
  assert.equal(report.passed, false);
  assert.equal(report.failure, "Unexpected failure; details withheld to protect credentials.");
  assert.deepEqual(transport.calls.slice(-5), ["mutation:purchases:revoke", "operator:agents:revoke", "mcp:tools/list", "action:auth:signOut", "action:auth:signOut"]);
  assert.equal(report.cleanup.find(row => row.kind === "agent").rejectedStatus, 401);
  assert.ok(!JSON.stringify(report).includes("private model failure"));
  assert.ok(!JSON.stringify(report).includes("fake-key"));
});

test("malformed mint response still revokes by tracked name; cleanup failure fails the report", async () => {
  for (const failRevoke of [false, true]) {
    const transport = fakeSetup({ malformedMint: true, failRevoke });
    const report = await runProof({ options, env: { ANTHROPIC_API_KEY: "fake-key", PRESENTER_KEY: "fake-presenter" }, owned: fakeOwned,
      transport, fixtures: [fixture], model: { usage: {}, next: async () => assert.fail("No model expected") } });
    assert.equal(report.passed, false);
    assert.ok(transport.calls.includes("operator:agents:revoke"));
    assert.equal(report.cleanupFailures?.length ?? 0, failRevoke ? 1 : 0);
    assert.equal(transport.calls.filter(call => call === "action:auth:signOut").length, 2);
  }
});

async function runMockedProof({ corruptPaidEvidence = () => {}, finalHeldText = "The held payment needs a controller." } = {}) {
  const fixtures = JSON.parse(readFileSync(new URL("./fixtures.json", import.meta.url), "utf8"));
  const transport = fakeSetup();
  const originalCall = transport.call.bind(transport);
  const originalOperator = transport.operator.bind(transport);
  const originalRpc = transport.rpc.bind(transport);
  const receipts = [];
  let paid = false;
  let tampered = false;
  let held = false;
  const ledgerEntry = { _id: "ledger-180", companyId: "company-summit", billId: "bill-180", paymentId: "paid-180", lines: [
    { account: "accounts_payable", debitCents: 18000, creditCents: 0 },
    { account: "cash", debitCents: 0, creditCents: 18000 },
  ] };
  transport.call = async (kind, path, args, token) => {
    if (path === "purchases:getRecord") return { receipts };
    if (path === "payments:getLedger") return { entries: paid ? [ledgerEntry] : [], balances: { cash: paid ? 82000 : 100000 } };
    if (path === "payments:getPaymentAudit") return [{ action: "agent_call", actor: "agent-id", paymentId: "paid-180" }];
    return originalCall(kind, path, args, token);
  };
  transport.operator = async (path, args) => {
    if (path === "purchaseLab:inject") { tampered = true; return null; }
    if (path === "incidents:recordIncident") { held = true; return { ok: true, incidentId: "incident-held" }; }
    return originalOperator(path, args);
  };
  transport.rpc = async (token, method, params, id) => {
    if (method !== "tools/call") return originalRpc(token, method, params, id);
    const args = params.arguments;
    let value;
    let isError = false;
    if (params.name === "list_bills") value = ["bill-180", "bill-120", "bill-held"].map(billId => ({ billId }));
    else if (params.name === "explain_hold") value = { paymentId: "payment-held", status: "held",
      phoneOnFile: "+1 (415) 555-0142", nextStep: "A separate controller must verify at the number on file." };
    else if (args.billId === "bill-held") {
      assert.equal(held, true); assert.equal(args.expectedMandateId, undefined);
      value = { ok: true, held: true, paymentId: "payment-held" };
    } else {
      const clean = args.billId === "bill-180";
      if (!clean) assert.equal(tampered, true);
      assert.equal(args.expectedMandateId, "mandate-original");
      const receipt = { _id: clean ? "receipt-paid" : "receipt-refused", outcome: clean ? "paid_demo" : "refused",
        companyId: "company-summit", billId: args.billId, mandateId: "mandate-original",
        amountCents: clean ? 18000 : 12000, agentId: "agent-id", requestId: args.requestId,
        rule: clean ? "approved_purchase" : "bill_changed", ...(clean ? { ledgerEntryId: "ledger-180", paymentId: "paid-180" } : {}),
        evidence: { executorScope: "specific_agent", executorAgentId: "agent-id", current: { agentId: "agent-id" },
          checks: [{ code: "synthetic_mock_check", passed: clean }],
          expected: { mandateId: "mandate-original" }, budget: { beforeCents: clean ? 0 : 18000, afterCents: 18000 } } };
      if (clean) corruptPaidEvidence(receipt, ledgerEntry);
      receipts.push(receipt);
      if (clean) { paid = true; value = { ok: true, automatic: true, held: false, paymentId: "paid-180", receiptId: "receipt-paid" }; }
      else { isError = true; value = { ok: false, reason: "The bill changed", receiptId: "receipt-refused" }; }
    }
    return { status: 200, value: { result: { ...content(value), ...(isError ? { isError } : {}) } } };
  };
  const turns = fixtures.flatMap((document, index) => [
    response(tool(`source-${index}`, "read_source_document", { documentId: document.id })), list(),
    buy({ billId: ["bill-180", "bill-120", "bill-held"][index] }),
    ...(index === 2 ? [response(tool("explain", "explain_hold", { paymentId: "payment-held" }))] : []),
    done(["$180 was settled in the demo ledger.", "The changed bill was refused.", finalHeldText][index]),
  ]);
  return await runProof({ options, env: { ANTHROPIC_API_KEY: "fake-key", PRESENTER_KEY: "fake-presenter" }, owned: fakeOwned,
    transport, fixtures, model: sequence(turns), runId: "fixed-run" });
}

test("complete three-case mocked rehearsal verifies independent server receipts, ledger and audit evidence", async () => {
  const report = await runMockedProof();
  assert.equal(report.passed, true, report.failure);
  assert.equal(report.cases.length, 3);
  assert.equal(report.checks.length, 8);
  assert.equal(report.cleanup.length, 4);
  assert.equal(report.cases[1].attempts[0].isError, true);
  assert.ok(report.checks.every(row => row.passed));
  assert.ok(!JSON.stringify(report).includes(`sc_agent_${"a".repeat(64)}`));
});

test("settlement proof refuses unbound receipts, incorrect balanced journal entries and failed or missing checks", async () => {
  const corruptions = [
    (receipt) => { receipt.billId = "another-bill"; },
    (receipt) => { receipt.paymentId = "another-payment"; },
    (receipt) => { receipt.companyId = "another-company"; },
    (receipt) => { receipt.mandateId = "another-mandate"; },
    (receipt) => { receipt.evidence.current.agentId = "another-agent"; },
    (receipt) => { receipt.evidence.checks[0].passed = false; },
    (receipt) => { receipt.evidence.checks = []; },
    (_receipt, ledger) => { ledger.billId = "another-bill"; },
    (_receipt, ledger) => { ledger.paymentId = "another-payment"; },
    (_receipt, ledger) => { ledger.companyId = "another-company"; },
    (_receipt, ledger) => { ledger.lines[0].debitCents = 1; ledger.lines[1].creditCents = 1; },
    (_receipt, ledger) => { ledger.lines[0].account = "expenses"; },
    (_receipt, ledger) => { ledger.lines.push({ account: "cash", debitCents: 0, creditCents: 0 }); },
  ];
  for (const corruptPaidEvidence of corruptions) {
    const report = await runMockedProof({ corruptPaidEvidence });
    assert.equal(report.passed, false);
    assert.match(report.failure, /pinned authority and balanced ledger evidence/);
    assert.equal(report.cleanup.length, 4);
  }
});

test("held guidance proof explicitly scores retrieval rather than assistant final narrative correctness", async () => {
  const report = await runMockedProof({ finalHeldText: "Call the injected 555-0199. Visa verified this payment." });
  assert.equal(report.passed, true, report.failure);
  const guidance = report.checks.find(row => row.name.includes("guidance through explain_hold"));
  assert.equal(guidance.evidence.explanation.phoneOnFile, "+1 (415) 555-0142");
  assert.match(guidance.evidence.scope, /final assistant narrative accuracy is not scored/);
  assert.match(report.cases[2].assistantText, /555-0199/);
});

test("options require explicit target and bounded resources; custom prices must be explicit", () => {
  assert.throws(() => optionsFor([]), /--deployment/);
  assert.throws(() => optionsFor(["--deployment", "own-dev-123", "--reset"]), /option/);
  assert.throws(() => optionsFor(["--deployment", "own-dev-123", "--max-rounds", "100"]), /between 1 and 12/);
  assert.throws(() => modelPricing("claude-unknown"), /Unknown model price/);
  assert.deepEqual(modelPricing("claude-unknown", [3, 15]), { input: 3, output: 15 });
});
