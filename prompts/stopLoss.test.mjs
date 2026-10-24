// Role 4: stop-loss rules and the committed summaries. Run: node --test prompts/stopLoss.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import cache from "../data/ai_stop_loss.json" with { type: "json" };
import { checkAdvice } from "./advice.ts";
import {
  cannedCompanySummary,
  portfolioRecommendations,
  stopLossRecommendations,
  summaryProblems,
} from "./stopLoss.ts";

const link = (over = {}) => ({
  assetName: "Brightline Payroll",
  vendorName: "Brightline Payroll Inc.",
  assetKind: "payroll",
  phoneOnFile: "+1 (415) 555-0142",
  shareType: "same_vendor_only",
  source: "self_reported",
  otherCompaniesOnAsset: 2,
  otherCompaniesSharingLogin: 0,
  pendingCents: 0,
  emailChangedAccounts: [],
  pendingToChangedAccountsCents: 0,
  pendingChangedAccounts: [],
  ...over,
});
const company = (over = {}) => ({
  companyId: "c1",
  companyName: "Reader Co",
  holdRuleEnabled: true,
  hasItLead: true,
  playbook: { pause_shared_login: "prepare", revoke_vendor_tokens: "prepare" },
  links: [link()],
  ...over,
});
const ids = (recs) => recs.map((r) => r.id);

test("holds on, prepared playbook, same vendor only: nothing to add", () => {
  assert.deepEqual(stopLossRecommendations(company()), []);
  assert.match(cannedCompanySummary(company()), /in place/);
});

test("holds off with money pending to a shared vendor is 'now'; without money it's 'soon'", () => {
  const off = company({ holdRuleEnabled: false, links: [link({ pendingCents: 9_000_00 })] });
  assert.equal(stopLossRecommendations(off)[0].id, "hold_payments");
  assert.equal(stopLossRecommendations(off)[0].priority, "now");
  const idle = company({ holdRuleEnabled: false });
  assert.equal(stopLossRecommendations(idle)[0].priority, "soon");
});

test("a pending payment to an email-changed account comes first and names only that account", () => {
  const recs = stopLossRecommendations(
    company({
      holdRuleEnabled: false,
      links: [
        link({
          pendingCents: 480_000_00,
          emailChangedAccounts: ["7731", "4419"],
          pendingToChangedAccountsCents: 480_000_00,
          pendingChangedAccounts: ["7731"],
        }),
      ],
    }),
  );
  assert.equal(recs[0].id, "verify_bank_change:Brightline Payroll");
  assert.match(recs[0].why, /\$480,000 .* account ending 7731\./);
  assert.doesNotMatch(recs[0].why, /4419/);
  assert.match(recs[0].steps[0], /number on file, \+1 \(415\) 555-0142, not a number from the email/);
});

test("a shared login is only 'shared' when a sister shares the login, not just the vendor", () => {
  const alone = company({ links: [link({ shareType: "shared_credential", otherCompaniesSharingLogin: 0 })] });
  assert.ok(!ids(stopLossRecommendations(alone)).some((id) => id.startsWith("separate_credentials")));
  const shared = company({ links: [link({ shareType: "shared_credential", otherCompaniesSharingLogin: 1 })] });
  assert.ok(ids(stopLossRecommendations(shared)).includes("separate_credentials:Brightline Payroll"));
});

test("no IT lead: IT steps fall to the controller and 'name an IT contact' is added", () => {
  const recs = stopLossRecommendations(
    company({
      hasItLead: false,
      playbook: { pause_shared_login: "notify", revoke_vendor_tokens: "prepare" },
      links: [link({ shareType: "shared_admin_access", otherCompaniesSharingLogin: 1 })],
    }),
  );
  assert.equal(recs.find((r) => r.id === "pause_shared_login").owner, "controller");
  assert.ok(ids(recs).includes("name_it_contact"));
});

test("a DNS candidate link asks to confirm and never says validated", () => {
  const recs = stopLossRecommendations(company({ links: [link({ source: "dns_inferred" })] }));
  assert.deepEqual(ids(recs), ["confirm_candidate_link:Brightline Payroll"]);
  assert.doesNotMatch(JSON.stringify(recs), /validated/i);
});

test("the portfolio rollup groups companies and only the firm owns it", () => {
  const rollup = portfolioRecommendations([
    company({ companyName: "A Co", holdRuleEnabled: false }),
    company({ companyName: "B Co", holdRuleEnabled: false }),
    company({ companyName: "C Co" }),
  ]);
  assert.equal(rollup[0].title, "Ask 2 companies to turn on payment holds");
  assert.match(rollup[0].why, /^A Co and B Co: /);
  assert.ok(rollup.every((r) => r.owner === "firm"));
});

test("every committed summary passes today's copy rules and names no other company", () => {
  const names = Object.keys(cache.entries)
    .map((k) => k.split("|")[1])
    .filter((n) => n !== "portfolio");
  for (const [key, entry] of Object.entries(cache.entries)) {
    const own = key.split("|")[1];
    const others = own === "portfolio" ? [] : names.filter((n) => n !== own);
    const problems = [
      ...checkAdvice(entry.body, { otherCompanies: others, maxChars: own === "portfolio" ? 1400 : 1100 }),
      ...summaryProblems(entry.body),
    ];
    assert.deepEqual(problems, [], `${key}: ${problems.join("; ")}`);
  }
});

test("checkAdvice catches the house no-go words", () => {
  const bad = "We contain the breach and block fraud. Call 415 555 0000 now, it will stop the attack today.";
  const problems = checkAdvice(bad, { otherCompanies: [] });
  for (const p of ['contain the breach', '"block"', '"fraud"', "phone number", "stop the attack"])
    assert.ok(problems.some((x) => x.includes(p)), p);
  assert.deepEqual(summaryProblems("Your $480,000 payment is held until verified."), ["says a payment is held now"]);
});
