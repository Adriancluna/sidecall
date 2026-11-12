// Role 4: breach fix rules, copy rules and cache behaviour (prompts/breachFix.ts).
//   node --test prompts/breachFix.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  NO_PROGRESS,
  breachFixBrief,
  breachFixFactsKey,
  breachFixKey,
  breachFixPrompt,
  cannedBreachFixSummary,
  checkBreachFixCopy,
  parseBreachFixReply,
  planBreachFix,
} from "./breachFix.ts";

const BRIGHTLINE = { name: "Brightline Payroll", vendorName: "Brightline Payroll Inc.", kind: "payroll", phoneOnFile: "+1 (415) 555-0142" };
const IRONCLAD = { name: "Ironclad shared admin account", vendorName: "Ironclad Managed IT", kind: "msp", phoneOnFile: "+1 (415) 555-0178" };
const CHECK =
  "What to check: sign-ins to Ironclad shared admin account in the last 30 days, especially after Oct 24, 08:12 UTC. Rotate that login today, even if nothing looks wrong.";

// The contexts convex/ai.ts builds for the seeded demo (shapes from internal.ai.breachFixContexts).
const CEDAR = {
  externalId: "demo-brightline-001",
  companyName: "Cedar Ridge Manufacturing",
  urgency: "urgent",
  asset: BRIGHTLINE,
  shareType: "shared_credential",
  candidateLink: false,
  finding: false,
  whatToCheck: null,
  heldPayments: [{ amountCents: 9_200_000, accountLast4: "2208", bankChangeFlag: false }],
  plannedSteps: [
    { action: "pause_shared_login", mode: "prepare" },
    { action: "revoke_vendor_tokens", mode: "prepare" },
  ],
};
const SUMMIT = {
  ...CEDAR,
  companyName: "Summit Home Health",
  shareType: "same_vendor_only",
  heldPayments: [{ amountCents: 48_000_000, accountLast4: "7731", bankChangeFlag: true }],
  plannedSteps: [],
};
const BAYVIEW = {
  ...SUMMIT,
  companyName: "Bayview Veterinary Partners",
  urgency: "advisory",
  candidateLink: true,
  heldPayments: [
    { amountCents: 2_800_000, accountLast4: "2208", bankChangeFlag: false },
    { amountCents: 1_200_000, accountLast4: "4419", bankChangeFlag: true },
  ],
};
const GRANITE_FINDING = {
  externalId: "demo-armadin-004",
  companyName: "Granite Peak Software",
  urgency: "urgent",
  asset: IRONCLAD,
  shareType: "shared_credential",
  candidateLink: false,
  finding: true,
  whatToCheck: CHECK,
  heldPayments: [],
  plannedSteps: [{ action: "pause_shared_login", mode: "prepare" }],
};
const HARBOR_FINDING = { ...GRANITE_FINDING, companyName: "Harborline Foods", shareType: "shared_admin_access", plannedSteps: [] };
const ALL = [CEDAR, SUMMIT, BAYVIEW, GRANITE_FINDING, HARBOR_FINDING];
const PORTFOLIO = [
  "Alder Freight Systems",
  "Cedar Ridge Manufacturing",
  "Summit Home Health",
  "Bayview Veterinary Partners",
  "Granite Peak Software",
  "Harborline Foods",
  "Meridian Dental Group",
  "Pinecrest Staffing",
];
const optsFor = (ctx) => ({
  phoneOnFile: ctx.asset.phoneOnFile,
  otherCompanies: PORTFOLIO.filter((n) => n !== ctx.companyName),
  urgency: ctx.urgency,
  finding: ctx.finding,
});
const ids = (ctx, live) => planBreachFix(ctx, live).map((r) => r.id);

test("rules: shared login gets pause, rotate and restore; a customer with its own login does not", () => {
  assert.deepEqual(
    ids(CEDAR).filter((id) => ["pause_login", "rotate_login", "restore_access", "revoke_tokens"].includes(id)),
    ["pause_login", "rotate_login", "revoke_tokens", "restore_access"],
  );
  for (const id of ["pause_login", "rotate_login", "restore_access"]) assert.ok(!ids(SUMMIT).includes(id), id);
  assert.ok(ids(SUMMIT).includes("confirm_separate_login"));
});

test("rules: only recently changed accounts are called unverified", () => {
  assert.ok(!ids(CEDAR).includes("bank_change"));
  const summit = planBreachFix(SUMMIT).find((r) => r.id === "bank_change");
  assert.match(summit.title, /ending 7731/);
  const bayview = planBreachFix(BAYVIEW).find((r) => r.id === "bank_change");
  assert.match(bayview.title, /ending 4419/);
  assert.doesNotMatch(bayview.title, /2208/);
});

test("rules: a candidate DNS link asks to confirm the vendor first", () => {
  assert.equal(ids(BAYVIEW)[1], "confirm_vendor");
  assert.ok(!ids(SUMMIT).includes("confirm_vendor"));
});

test("rules: with a finding, the backend's check is the first step, and MSP admin access asks the vendor", () => {
  const check = planBreachFix(GRANITE_FINDING).find((r) => r.id === "check_access");
  assert.equal(check.steps[0], CHECK);
  assert.match(check.why, /validated.*not tested/);
  assert.ok(ids(HARBOR_FINDING).includes("vendor_admin"));
  assert.ok(!ids(HARBOR_FINDING).includes("rotate_login"));
});

test("rules: no payments held → the AP clerk confirms remittance details instead", () => {
  const r = planBreachFix(GRANITE_FINDING).find((x) => x.id === "check_pending_payments");
  assert.equal(r.owner, "ap_clerk");
  assert.match(r.steps.join(" "), /\+1 \(415\) 555-0178/);
  assert.ok(!ids(GRANITE_FINDING).includes("verify_payments"));
});

test("rules: priorities are sorted now → soon → later; fix advice never recommends a mode", () => {
  const order = { now: 0, soon: 1, later: 2 };
  for (const ctx of ALL) {
    const recs = planBreachFix(ctx);
    for (let i = 1; i < recs.length; i++) assert.ok(order[recs[i - 1].priority] <= order[recs[i].priority], ctx.companyName);
    assert.ok(recs.every((r) => r.recommendedMode === null));
  }
});

test("live progress changes statuses and step wording, never the item list", () => {
  const live = {
    acknowledged: true,
    closedByFirm: true,
    steps: { pause_shared_login: "done", revoke_vendor_tokens: "awaiting_approval" },
    undecidedPayments: 0,
  };
  assert.deepEqual(ids(CEDAR, live), ids(CEDAR, NO_PROGRESS));
  const recs = Object.fromEntries(planBreachFix(CEDAR, live).map((r) => [r.id, r]));
  assert.equal(recs.acknowledge.status, "done");
  assert.equal(recs.pause_login.status, "done");
  assert.match(recs.pause_login.steps[0], /\(simulated\)/);
  assert.equal(recs.revoke_tokens.status, "ready");
  assert.equal(recs.restore_access.status, "ready");
  assert.equal(recs.verify_payments.status, "done");
  assert.equal(recs.close_out.status, "done");
  assert.equal(planBreachFix(CEDAR, { ...live, steps: { pause_shared_login: "undone" } }).find((r) => r.id === "restore_access").status, "done");
});

test("canned text passes the copy rules for every demo company", () => {
  for (const ctx of ALL) {
    assert.deepEqual(checkBreachFixCopy("summary", cannedBreachFixSummary(ctx), optsFor(ctx)), [], ctx.companyName);
    for (const r of planBreachFix(ctx)) assert.deepEqual(checkBreachFixCopy("why", r.why, optsFor(ctx)), [], `${ctx.companyName} ${r.id}`);
    const all = JSON.stringify(planBreachFix(ctx));
    for (const other of PORTFOLIO.filter((n) => n !== ctx.companyName)) assert.ok(!all.includes(other), `${ctx.companyName} names ${other}`);
  }
});

test("copy rules catch what the prompt forbids", () => {
  const opts = optsFor(GRANITE_FINDING);
  const bad = (text) => checkBreachFixCopy("why", text, opts);
  assert.ok(bad("Sidecall contained the breach at your company today.").length > 0);
  assert.ok(bad("Your systems were compromised by the vendor's incident.").length > 0);
  assert.ok(bad("This was validated against the shared admin account.").some((p) => p.includes("not tested")));
  assert.deepEqual(bad("The path was validated elsewhere and is not tested at your company."), []);
  assert.ok(bad("Pinecrest Staffing reported this incident first.").some((p) => p.includes("names another company")));
  assert.ok(bad("Call them back on +1 (415) 555-9999 to confirm.").some((p) => p.includes("not on file")));
  assert.ok(bad("Sidecall paused the login in Okta for you.").length > 0);
  assert.ok(checkBreachFixCopy("summary", "Advisory: " + "x".repeat(200), opts).some((p) => p.includes("Urgent:")));
});

test("parseBreachFixReply needs a why for every item", () => {
  const ids = ["a", "b"];
  assert.deepEqual(parseBreachFixReply('{"summary":" S ","why":{"a":"A.","b":"B."}}', ids), { summary: "S", why: { a: "A.", b: "B." } });
  assert.deepEqual(parseBreachFixReply('```json\n{"summary":"S","why":{"a":"A","b":"B"}}\n```', ids).why, { a: "A", b: "B" });
  assert.throws(() => parseBreachFixReply('{"summary":"S","why":{"a":"A"}}', ids), /no why for b/);
  assert.throws(() => parseBreachFixReply("not json", ids));
});

test("brief uses cached text only while the facts match", () => {
  const cache = {
    generatedAt: null,
    model: null,
    entries: {
      [breachFixKey(CEDAR)]: { facts: breachFixFactsKey(CEDAR), summary: "Urgent: cached summary.", why: { rotate_login: "Cached why." } },
    },
  };
  const hit = breachFixBrief(CEDAR, NO_PROGRESS, "c1", cache);
  assert.equal(hit.source, "cache");
  assert.equal(hit.summary, "Urgent: cached summary.");
  assert.equal(hit.recommendations.find((r) => r.id === "rotate_login").why, "Cached why.");
  // A missing why falls back to the rule's own sentence.
  assert.ok(hit.recommendations.find((r) => r.id === "acknowledge").why.length > 0);

  const changed = { ...CEDAR, urgency: "advisory" };
  const miss = breachFixBrief(changed, NO_PROGRESS, "c1", cache);
  assert.equal(miss.source, "canned");
  assert.ok(miss.summary.startsWith("Advisory:"));
});

test("the prompt carries the facts and items but never the reporter", () => {
  for (const ctx of ALL) {
    const prompt = breachFixPrompt(ctx);
    assert.ok(prompt.includes(ctx.companyName));
    assert.ok(!prompt.includes("Pinecrest"));
    for (const r of planBreachFix(ctx)) assert.ok(prompt.includes(`"id": "${r.id}"`), r.id);
  }
});

test("every committed cached text passes today's copy rules", () => {
  const cache = JSON.parse(readFileSync(new URL("../data/ai_breach_fix.json", import.meta.url), "utf8"));
  for (const [key, entry] of Object.entries(cache.entries)) {
    const facts = JSON.parse(entry.facts);
    const opts = {
      phoneOnFile: facts.phoneOnFile,
      otherCompanies: PORTFOLIO.filter((n) => n !== facts.companyName),
      urgency: facts.urgency,
      finding: facts.finding,
    };
    assert.deepEqual(checkBreachFixCopy("summary", entry.summary, opts), [], key);
    assert.deepEqual(Object.keys(entry.why).sort(), [...facts.items].sort(), key);
    for (const [id, why] of Object.entries(entry.why)) assert.deepEqual(checkBreachFixCopy("why", why, opts), [], `${key} ${id}`);
  }
});
