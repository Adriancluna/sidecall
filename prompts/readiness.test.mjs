import test from "node:test";
import assert from "node:assert/strict";
import { companyBrief, companyFacts, companyKey, companyReadiness, factsKey,
  portfolioBrief, portfolioFacts, PORTFOLIO_KEY, stopLossRecommendations, summaryForFactsProblems } from "./stopLoss.ts";

const company = (override = {}) => ({
  companyId: "company-a", companyName: "Reader Company", holdRuleEnabled: true,
  hasItLead: true, evidenceComplete: true, companyNamesForValidation: ["Reader Company", "Private Sister"],
  playbook: { pause_shared_login: "act", revoke_vendor_tokens: "notify" },
  links: [{ assetName: "Payroll", vendorName: "Payroll Vendor", assetKind: "payroll",
    phoneOnFile: "+1 (415) 555-0142", shareType: "shared_credential", source: "self_reported",
    otherCompaniesOnAsset: 2, otherCompaniesSharingLogin: 1, pendingCents: 48000000,
    emailChangedAccounts: ["7731"], pendingChangedAccounts: ["7731"], pendingToChangedAccountsCents: 48000000,
    responseCaps: [{ action: "pause_shared_login", cap: "prepare", capNote: "Payroll needs a company approval." },
      { action: "revoke_vendor_tokens", cap: "act" }],
  }], ...override,
});
const cache = (c, body) => ({ entries: { [companyKey(c.companyName)]: { facts: factsKey(companyFacts(c)), body } } });
const valid = "Your team has $480,000 pending to the account ending 7731. Verify the changed bank details using the number on file before the next payment.";

test("same-vendor customers are never promised an unavailable revoke", () => {
  const c = company();
  c.links[0].shareType = "same_vendor_only";
  c.links[0].responseCaps = [];
  assert.ok(!stopLossRecommendations(c).some(r => r.id === "revoke_vendor_tokens"));
  assert.ok(companyReadiness(c).assets[0].actions.every(a => a.eligibleMode === null));
});
test("a DNS guess cannot establish shared credentials or a prepared action", () => {
  const c = company({ playbook: { pause_shared_login: "notify", revoke_vendor_tokens: "notify" } });
  c.links[0].source = "dns_inferred";
  c.links[0].responseCaps = [{ action: "pause_shared_login", cap: "notify" }, { action: "revoke_vendor_tokens", cap: "notify" }];
  const ids = stopLossRecommendations(c).map(r => r.id);
  assert.ok(ids.includes("confirm_candidate_link:Payroll"));
  assert.ok(!ids.some(id => /separate_credentials|pause_shared_login|revoke_vendor_tokens/.test(id)));
});
test("a returned notify-only cap suppresses advice to prepare the action", () => {
  const c = company();
  c.links[0].responseCaps = [{ action: "revoke_vendor_tokens", cap: "notify" }];
  assert.ok(!stopLossRecommendations(c).some(r => r.id === "revoke_vendor_tokens"));
});
test("missing relationships do not produce a false all-clear or invent enabled holds", () => {
  const c = company({ links: [], holdRuleEnabled: false });
  const brief = companyBrief(c, cache(c, valid));
  assert.equal(brief.source, "canned");
  assert.match(brief.summary, /cannot be assessed/);
  assert.match(brief.summary, /disabled/);
  assert.equal(companyReadiness(c).status, "needs_evidence");
});
test("partial reads cannot reuse a confident cached company or portfolio summary", () => {
  const c = company({ evidenceComplete: false });
  assert.equal(companyReadiness(c).status, "partial");
  assert.match(companyBrief(c, cache(c, valid)).summary, /partial/);
  const p = portfolioBrief([c], { entries: { [PORTFOLIO_KEY]: { facts: factsKey(portfolioFacts([c])), body: valid } } });
  assert.equal(p.source, "canned");
  assert.match(p.summary, /partial/);
});
for (const [name, body] of [
  ["another company's name", `${valid} Private Sister has the same problem.`],
  ["an invented callback number", `${valid} Call 415 555 9900 to confirm.`],
  ["an invented current hold", "Your $480,000 payment is held until verified. Keep the hold in place and review the account ending 7731."],
  ["an invented amount", valid.replace("$480,000", "$999,000")],
  ["an invented amount written in dollars", valid.replace("$480,000", "999,000 dollars")],
  ["an invented USD amount", valid.replace("$480,000", "USD 999,000")],
  ["a known dollar prefix with an invented scale", valid.replace("$480,000", "$480,000 million")],
  ["an invented account", valid.replace("7731", "9900")],
  ["an invented account with ending-in wording", valid.replace("ending 7731", "ending in 9900")],
  ["an unsupported prevention promise", `${valid} These steps prevent every breach.`],
]) test(`matching cache facts cannot authorize ${name}`, () => {
  const c = company();
  assert.equal(companyBrief(c, cache(c, body)).source, "canned");
});
test("an unchanged safe summary is still reused", () => {
  const c = company();
  assert.deepEqual(summaryForFactsProblems(valid, companyFacts(c)), []);
  assert.deepEqual(summaryForFactsProblems(valid.replace("$480,000", "480,000 dollars").replace("ending 7731", "ending in 7731"), companyFacts(c)), []);
  assert.deepEqual(summaryForFactsProblems(valid.replace("$480,000", "$480K"), companyFacts(c)), []);
  assert.equal(companyBrief(c, cache(c, valid)).source, "cache");
});
test("readiness uses engine caps, reports current policy, and never exposes validation names", () => {
  const c = company();
  const before = JSON.stringify(c);
  const r = companyReadiness(c);
  assert.equal(r.status, "assessed");
  assert.deepEqual(r.assets[0].actions[0], { action: "pause_shared_login", configuredMode: "act", eligibleMode: "prepare", reason: "Payroll needs a company approval." });
  assert.equal(r.assets[0].actions[1].eligibleMode, "notify");
  assert.doesNotMatch(JSON.stringify(r), /Private Sister|companyNamesForValidation/);
  assert.doesNotMatch(JSON.stringify(companyFacts(c)), /Private Sister|companyNamesForValidation/);
  assert.equal(JSON.stringify(c), before);
});
