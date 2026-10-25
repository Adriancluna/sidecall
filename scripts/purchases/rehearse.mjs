#!/usr/bin/env node
// Live adversarial checks against your OWN DEV. Does not reset data or print credentials.
// Run after the normal rehearsal has reset your dev; leaves synthetic evidence for UI review.
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createOwnedDev } from "../scorecard/ownedDev.mjs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { deployment } = createOwnedDev();
if (!process.env.PRESENTER_KEY?.trim()) throw Error("A configured matching PRESENTER_KEY is required before sample setup; no sessions or fixtures created.");
const cloud = `https://${deployment}.convex.cloud`;
const run = (path, args) => {
  createOwnedDev({ argv: ["--deployment", deployment] });
  let raw;
  try {
    raw = execFileSync(
      "npx",
      [
        "--no-install",
        "convex",
        "run",
        path,
        JSON.stringify(args),
        "--deployment-name",
        deployment,
        "--env-file",
        resolve(".env.local"),
      ],
      { encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  } catch {
    throw new Error(
      `Own-DEV operator call ${path} failed; raw output withheld.`,
    );
  }
  return raw ? JSON.parse(raw) : null;
};
async function call(kind, path, args, token) {
  const response = await fetch(`${cloud}/api/${kind}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ path, args, format: "json" }),
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.json();
  if (body.status !== "success")
    throw new Error(`${path} was refused or failed.`);
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
      /* first use may need the alternate auth flow */
    }
  }
  throw new Error("Could not sign in to own demo.");
}
const [rosa, jamie, elena, tom, jordan] = await Promise.all(
  [
    "rosa.alvarez@summithomehealth.example",
    "jamie.chen@summithomehealth.example",
    "elena.ruiz@cedarridge.example",
    "tom.becker@cedarridge.example",
    "jordan.ames@northpasscapital.example",
  ].map(signIn),
);
const query = (path, args, token) => call("query", path, args, token);
const mutation = (path, args, token) => call("mutation", path, args, token);
const cases = [];
function check(name, passed, observed) {
  cases.push({ name, passed: !!passed, observed });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}: ${observed}`);
  if (!passed) throw new Error(`Failed: ${name}`);
}
try {
  for (const controller of [rosa, elena]) {
    const created = await mutation(
      "purchases:loadSamples",
      { presenterKey: process.env.PRESENTER_KEY },
      controller,
    );
    if (!created.created)
      throw new Error(
        "Samples already exist. Run the normal own-DEV rehearsal first; this script never resets data.",
      );
  }
  const bills = (await query("payments:getMyBills", {}, jamie)).filter((b) =>
    b.vendorName.startsWith("Northstar"),
  );
  const otherBills = (await query("payments:getMyBills", {}, tom)).filter((b) =>
    b.vendorName.startsWith("Northstar"),
  );
  const approval = (billIds, budgetCents = 30000, token = rosa) =>
    mutation(
      "purchases:approve",
      {
        billIds,
        perPurchaseCents: 25000,
        budgetCents,
        expiresAt: Date.now() + 3600000,
      },
      token,
    );
  const buy = (i, token = jamie, rows = bills, requestId) =>
    mutation(
      "payments:requestPayment",
      { billId: rows[i].bill._id, requestId },
      token,
    );
  const overview = () => query("purchases:overview", {}, rosa);
  await approval(bills.map((b) => b.bill._id));
  const otherMandate = await approval(
    otherBills.map((b) => b.bill._id),
    30000,
    elena,
  );
  void otherMandate;
  // Valid internal observation intake, with real commits. Not a test of transport authentication.
  const assetName = `Office supplies demo · ${bills[0].bill.companyId}`;
  for (let i = 0; i < 5; i++)
    run("incidents:recordIncident", {
      externalId: `purchase-noise-${i}-${Date.now()}`,
      assetName,
      assessment: "observation",
    });
  const raceIds = [
    `purchase-race-${Date.now()}-1`,
    `purchase-race-${Date.now()}-2`,
  ];
  const results = await Promise.all([
    buy(1, jamie, bills, raceIds[0]),
    buy(2, jamie, bills, raceIds[1]),
  ]);
  const winner = results.findIndex((r) => r.ok && r.automatic) + 1;
  check(
    "Concurrent split-budget attack",
    results.filter((r) => r.ok && r.automatic).length === 1 &&
      results.filter((r) => r.ok && !r.automatic && !r.held).length === 1,
    "$180 and $210 raced against $300; exactly one settled, the other remained pending for manual handling",
  );
  let state = await overview();
  check(
    "Unconfirmed-report flood preserves purchasing",
    state.mandates[0].spentCents > 0 && state.mandates[0].spentCents <= 30000,
    `${state.mandates[0].spentCents} cents settled after five unconfirmed reports`,
  );
  const before = state.mandates[0].spentCents;
  const replay = await buy(winner);
  state = await overview();
  check(
    "Duplicate payment replay",
    !replay.ok &&
      state.mandates[0].spentCents === before &&
      state.receipts.filter((r) => r.outcome === "paid_demo").length === 1,
    "No second settlement or budget consumption",
  );
  const original = results[winner - 1];
  const stableRetries = await Promise.all(
    Array.from({ length: 20 }, () =>
      buy(winner, jamie, bills, raceIds[winner - 1]),
    ),
  );
  check(
    "Twenty exact retries return the original receipt",
    stableRetries.every(
      (r) =>
        r.ok &&
        r.paymentId === original.paymentId &&
        r.receiptId === original.receiptId,
    ) && (await overview()).mandates[0].spentCents === before,
    "Same authenticated request ID returns its committed result without another debit or quota lockout",
  );
  const conflict = await buy(0, jamie, bills, raceIds[winner - 1]);
  check(
    "A request ID cannot be reused for a different bill",
    !conflict.ok,
    "A conflicting purchase cannot inherit the earlier result",
  );
  run("purchaseLab:inject", {
    billId: bills[0].bill._id,
    attack: "bill_change",
  });
  check(
    "Invoice instruction tampering",
    !(await buy(0)).ok &&
      (await overview()).receipts[0].rule === "bill_changed",
    "Changed description refused; invoice text cannot alter approval",
  );
  const receiptsBeforePreview = (await overview()).receipts.length;
  const preview = await query(
    "purchases:preview",
    { billId: bills[0].bill._id, asOf: Date.now() },
    jamie,
  );
  check(
    "Read-only preview explains changed approval facts",
    preview.decision === "refused" &&
      preview.evidence.checks.some(
        (c) => c.code === "bill_changed" && !c.passed,
      ) &&
      preview.evidence.expected.bill.description !==
        preview.evidence.current.bill.description &&
      (await overview()).receipts.length === receiptsBeforePreview,
    "The same decision evaluator exposes saved/current differences without writing a decision or payment",
  );
  const nextGrant = await approval([bills[0].bill._id]);
  run("purchaseLab:inject", {
    billId: bills[0].bill._id,
    attack: "payee_change",
  });
  check(
    "Payee substitution with the same suffix",
    !(await buy(0)).ok &&
      (await overview()).receipts[0].rule === "payee_changed",
    "New bank record refused even though both end in 4242",
  );
  await mutation("purchases:revoke", { mandateId: nextGrant }, rosa);
  const historical = await buy(winner, jamie, bills, raceIds[winner - 1]);
  check(
    "Historical receipt survives later revocation",
    historical.ok && historical.receiptId === original.receiptId,
    "Retry retrieves the earlier completed decision; it does not consume revoked authority again",
  );
  check(
    "Revoked approval replay",
    !(await buy(0)).ok &&
      (await overview()).receipts[0].rule === "approval_inactive",
    "No old approval reactivated",
  );
  let forbidden = false;
  try {
    await approval([bills[0].bill._id], 30000, jamie);
  } catch {
    forbidden = true;
  }
  check(
    "Requester cannot self-authorize",
    forbidden,
    "AP clerk cannot create purchasing authority",
  );
  check(
    "Company record privacy",
    (await query("purchases:overview", {}, jordan)) === null &&
      (await query("purchases:overview", {}, elena)).receipts.length === 0,
    "Firm and unrelated company cannot read Summit receipts",
  );
  const agentName = `Purchase rehearsal ${Date.now()}`;
  const minted = run("agents:mint", {
    name: agentName,
    onBehalfOfEmail: "jamie.chen@summithomehealth.example",
    tools: ["request_payment"],
  });
  const site = cloud.replace(/\.cloud$/, ".site");
  async function revokeAgent(agent) {
    run("agents:revoke", { name: agent.name });
    const response = await fetch(`${site}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${agent.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.status !== 401)
      throw Error("Issued agent credential remained usable after revocation.");
  }
  let throttled = false;
  try {
    for (let i = 0; i < 12; i++) {
      const response = await fetch(`${site}/mcp`, {
        method: "POST",
        headers: { Authorization: `Bearer ${minted.token}` },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: i,
          method: "tools/call",
          params: {
            name: "request_payment",
            arguments: { billId: bills[0].bill._id },
          },
        }),
        signal: AbortSignal.timeout(10000),
      });
      const body = await response.json();
      const result = JSON.parse(body.result.content[0].text);
      if (!result.ok && result.reason.includes("Too many")) throttled = true;
    }
  } finally {
    await revokeAgent({ ...minted, name: agentName });
  }
  check(
    "Compromised agent request flood",
    throttled,
    "Convex component refused excess requests under this agent's own key",
  );
  const healthy = await buy(0, tom, otherBills);
  check(
    "Unrelated business continues",
    healthy.ok && healthy.automatic,
    "Another company's $120 purchase settled automatically during the attack",
  );
  // Prove the clerk's quota is independent of its agent: even a refusal must be the policy refusal,
  // not the agent's exhausted allowance.
  const human = await buy(0);
  check(
    "Human caller isolated from agent flood",
    !human.ok && (await overview()).receipts[0].rule === "approval_inactive",
    "Human reached the purchase policy; agent throttle did not lock out its owner",
  );
  const boundAgents = [];
  async function agentRequest(agent, billId, requestId) {
    const response = await fetch(`${site}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${agent.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "request_payment",
          arguments: { billId, requestId },
        },
      }),
      signal: AbortSignal.timeout(10000),
    });
    const body = await response.json();
    if (!body.result?.content?.[0]?.text)
      throw Error("Scoped MCP request failed.");
    return JSON.parse(body.result.content[0].text);
  }
  try {
    for (const suffix of ["chosen", "other"]) {
      const name = `Purchase binding ${Date.now()} ${suffix}`;
      boundAgents.push({
        ...run("agents:mint", {
          name,
          onBehalfOfEmail: "tom.becker@cedarridge.example",
          tools: ["request_payment"],
        }),
        name,
      });
    }
    const eligibleAgents = (await query("purchases:overview", {}, elena)).eligibleAgents;
    for (const agent of boundAgents) {
      agent.agentId = eligibleAgents.find((row) => row.name === agent.name)?.id;
      if (!agent.agentId)
        throw Error("Minted agent was not eligible for purchase approval.");
    }
    const [chosen, other] = boundAgents;
    await mutation(
      "purchases:approve",
      {
        billIds: [otherBills[1].bill._id, otherBills[2].bill._id],
        perPurchaseCents: 21000,
        budgetCents: 39000,
        expiresAt: Date.now() + 3600000,
        executorAgentId: chosen.agentId,
      },
      elena,
    );
    const denied = await agentRequest(
      other,
      otherBills[1].bill._id,
      "wrong-executor",
    );
    check(
      "Only the controller-selected agent can consume its approval",
      denied.ok && !denied.automatic && !denied.held &&
        (await query("purchases:overview", {}, elena)).receipts[0].evidence.checks.some(
          (c) => c.code === "executor_scope" && !c.passed,
        ),
      "Another valid agent creates a pending request without consuming automatic purchase authority",
    );
    const paid = await agentRequest(
      chosen,
      otherBills[2].bill._id,
      "chosen-executor",
    );
    const record = await query("purchases:getRecord", {}, elena);
    const receipt = record.receipts.find((r) => r._id === paid.receiptId);
    check(
      "Decision record binds executor, facts, budget and ledger",
      paid.ok &&
        paid.automatic &&
        receipt?.agentId === chosen.agentId &&
        receipt.ledgerEntryId &&
        receipt.evidence.currency === "USD" &&
        receipt.evidence.checks.every((c) => c.passed) &&
        receipt.evidence.budget.afterCents === 21000,
      "The selected agent’s authorized $210 settlement retains its exact decision evidence and ledger reference",
    );
  } finally {
    const cleanup = await Promise.allSettled(boundAgents.map(revokeAgent));
    if (cleanup.some((result) => result.status === "rejected"))
      throw Error("Agent credential cleanup did not complete.");
  }
  const report = {
    generatedAt: new Date().toISOString(),
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    deployment: cloud,
    settlement: "demo_ledger",
    source:
      "live Convex API, real authenticated sessions, concurrent HTTP requests; fixture tampering through internal demo-only functions",
    cases,
  };
  writeFileSync(
    "docs/pegasus-purchase-rehearsal.json",
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(`Verified ${cases.length} cases. Evidence saved without tokens.`);
} finally {
  const cleanup = await Promise.allSettled(
    [rosa, jamie, elena, tom, jordan].map((token) =>
      call("action", "auth:signOut", {}, token),
    ),
  );
  if (cleanup.some((result) => result.status === "rejected"))
    throw Error("Demo session cleanup did not complete.");
}
