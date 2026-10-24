#!/usr/bin/env node
// Live adversarial checks against your OWN DEV. Does not reset data or print credentials.
// Run after the normal rehearsal has reset your dev; leaves synthetic evidence for UI review.
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const deployment = process.env.CONVEX_DEPLOYMENT ?? "";
const cloud = process.env.VITE_CONVEX_URL ?? "";
if (
  !deployment.startsWith("dev:") ||
  !/^https:\/\/[a-z0-9-]+\.convex\.cloud$/.test(cloud) ||
  /judicious-tiger-712|reminiscent-caribou-128/.test(cloud) ||
  process.env.CONVEX_DEPLOY_KEY?.startsWith("prod:")
)
  throw new Error(
    "Use your own DEV; production and Adrian's demo backend are refused.",
  );
const run = (path, args) => {
  const raw = execFileSync(
    "npx",
    ["--no-install", "convex", "run", path, JSON.stringify(args)],
    { encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
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
    throw new Error(`${path}: ${body.errorMessage ?? "failed"}`);
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
for (const controller of [rosa, elena]) {
  const created = await mutation("purchases:loadSamples", {}, controller);
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
const buy = (i, token = jamie, rows = bills) =>
  mutation("payments:requestPayment", { billId: rows[i].bill._id }, token);
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
const results = await Promise.all([buy(1), buy(2)]); // $180 + $210 cannot both fit $300.
const winner = results.findIndex((r) => r.ok && r.automatic) + 1;
check(
  "Concurrent split-budget attack",
  results.filter((r) => r.ok && r.automatic).length === 1 &&
    results.filter((r) => !r.ok).length === 1,
  "$180 and $210 raced against $300; exactly one settled",
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
run("purchaseLab:inject", { billId: bills[0].bill._id, attack: "bill_change" });
check(
  "Invoice instruction tampering",
  !(await buy(0)).ok && (await overview()).receipts[0].rule === "bill_changed",
  "Changed description refused; invoice text cannot alter approval",
);
const nextGrant = await approval([bills[0].bill._id]);
run("purchaseLab:inject", {
  billId: bills[0].bill._id,
  attack: "payee_change",
});
check(
  "Payee substitution with the same suffix",
  !(await buy(0)).ok && (await overview()).receipts[0].rule === "payee_changed",
  "New bank record refused even though both end in 4242",
);
await mutation("purchases:revoke", { mandateId: nextGrant }, rosa);
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
  run("agents:revoke", { name: agentName });
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
  !human.ok && human.reason.includes("expired or been revoked"),
  "Human reached the purchase policy; agent throttle did not lock out its owner",
);
const report = {
  generatedAt: new Date().toISOString(),
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
