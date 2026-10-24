// Run from the repo root: node --test prompts/writing.test.mjs
// (node:test, not vitest: vitest.config.ts only runs convex/**, and the typed eslint config knows
// no tsconfig for prompts/, so a .ts test would break `npm run lint`. Node strips the types in
// ./writing.ts itself, as prompts/generate.mjs already relies on.)
import test from "node:test";
import assert from "node:assert/strict";
import cache from "../data/ai_cache.json" with { type: "json" };
import {
  SYSTEM_PROMPT,
  checkCopy,
  companyAlertFacts,
  companyAlertPrompt,
  factsKey,
  holdNoticeFacts,
  holdNoticePrompt,
  vendorLetterFacts,
  vendorLetterPrompt,
} from "./writing.ts";

const PHONE = "+1 (415) 555-0178";
const READER = "Cedar Ridge Manufacturing";
const OTHERS = ["Granite Peak Software", "Harborline Foods", "Pinecrest Staffing"];
// scoring.ts sisterPath / whatToCheck output for Cedar Ridge in the demo-armadin-004 scenario.
const PATH =
  "A validated attack path at another portfolio company ends at Ironclad Managed IT (Ironclad shared admin account). " +
  "Your company shares that login with Ironclad Managed IT, so the path is reachable at your company (not tested at your company).";
const CHECK =
  "What to check: sign-ins to Ironclad shared admin account in the last 30 days, especially after Oct 24, 08:12 UTC. " +
  "Rotate that login today, even if nothing looks wrong.";
// The scenarios whose texts were cached before findings existed: their facts carry no path keys.
const PRE_FINDING = new Set(["demo-brightline-001", "demo-ironclad-cred-002", "demo-ironclad-msp-003"]);

// The Ironclad credential incident as the writers see it, without a finding.
function plain() {
  return {
    externalId: "demo-ironclad-cred-002",
    summary: null,
    technique: null,
    asset: {
      name: "Ironclad shared admin account",
      vendorName: "Ironclad Managed IT",
      kind: "msp",
      phoneOnFile: PHONE,
    },
    companyAlerts: [
      {
        companyName: READER,
        urgency: "urgent",
        reasons: ["Your company shares a login credential with Ironclad Managed IT (Ironclad shared admin account)."],
        confidence: 0.9,
        pathSummary: null,
        whatToCheck: null,
      },
    ],
    heldPayments: [],
  };
}

// The same incident reported as a red-team finding (demo-armadin-004). The summary names the
// reporter on purpose: no prompt may use it.
function withFinding() {
  const ctx = plain();
  return {
    ...ctx,
    externalId: "demo-armadin-004",
    summary: "An autonomous red-team test validated a path from a Pinecrest workstation to Ironclad's shared admin account.",
    technique: { id: "T1078", name: "Valid Accounts" },
    companyAlerts: ctx.companyAlerts.map((a) => ({ ...a, pathSummary: PATH, whatToCheck: CHECK })),
  };
}

// --- facts keys stay compatible with data/ai_cache.json ------------------------------------

test("facts: without a finding the key lists are exactly the pre-finding ones", () => {
  const ctx = plain();
  assert.deepEqual(Object.keys(companyAlertFacts(ctx, ctx.companyAlerts[0])), [
    "vendorName",
    "assetName",
    "assetKind",
    "companyName",
    "urgency",
    "reasons",
    "candidateLink",
  ]);
  assert.deepEqual(Object.keys(vendorLetterFacts(ctx)), [
    "vendorName",
    "assetName",
    "assetKind",
    "phoneOnFile",
    "portfolioCompaniesExposed",
    "urgentCompanies",
    "paymentsHeld",
    "paymentsToRecentlyChangedBankDetails",
  ]);
  const held = { companyName: "Summit Home Health", amountCents: 48000000, accountLast4: "7731", bankChangeFlag: true, holdReasons: [] };
  assert.deepEqual(Object.keys(holdNoticeFacts(ctx, held)), [
    "vendorName",
    "phoneOnFile",
    "companyName",
    "amount",
    "accountLast4",
    "bankDetailsChangedRecently",
  ]);
});

test("facts: with a finding the new fields come last, so the old prefix is unchanged", () => {
  const ctx = withFinding();
  const alert = companyAlertFacts(ctx, ctx.companyAlerts[0]);
  assert.deepEqual(Object.keys(alert).slice(-2), ["pathSummary", "whatToCheck"]);
  assert.equal(alert.pathSummary, PATH);
  assert.equal(alert.whatToCheck, CHECK);
  const letter = vendorLetterFacts(ctx);
  assert.equal(Object.keys(letter).at(-1), "technique");
  assert.deepEqual(letter.technique, { id: "T1078", name: "Valid Accounts" });
});

test("facts: the pre-finding scenarios' cached facts carry none of the new keys", () => {
  let checked = 0;
  for (const [key, entry] of Object.entries(cache.entries)) {
    if (!PRE_FINDING.has(key.split("|")[0])) continue;
    const facts = JSON.parse(entry.facts);
    assert.ok(!("pathSummary" in facts), `${key} carries pathSummary`);
    assert.ok(!("whatToCheck" in facts), `${key} carries whatToCheck`);
    assert.ok(!("technique" in facts), `${key} carries technique`);
    checked++;
  }
  assert.ok(checked >= 19, `expected the 19 original entries, saw ${checked}`);
});

test("facts: finding-scenario cache entries (when present) carry the path keys and no hold notices", () => {
  const keys = Object.keys(cache.entries).filter((k) => k.startsWith("demo-armadin-004|"));
  for (const key of keys) {
    const facts = JSON.parse(cache.entries[key].facts);
    const kind = key.split("|")[1];
    assert.notEqual(kind, "hold_notice", `${key}: the finding scenario holds no payments`);
    if (kind === "company_alert") {
      assert.deepEqual(Object.keys(facts).slice(-2), ["pathSummary", "whatToCheck"], key);
      assert.match(facts.pathSummary, /not tested/);
      assert.match(facts.whatToCheck, /^What to check:/);
    }
    if (kind === "vendor_letter") assert.deepEqual(facts.technique, { id: "T1078", name: "Valid Accounts" });
  }
});

test("facts: a cached Brightline alert is still matched byte for byte", () => {
  const key = "demo-brightline-001|company_alert|Cedar Ridge Manufacturing";
  const entry = cache.entries[key];
  assert.ok(entry, `${key} missing from the cache`);
  const f = JSON.parse(entry.facts);
  const ctx = {
    externalId: "demo-brightline-001",
    summary: null,
    technique: null,
    asset: { name: f.assetName, vendorName: f.vendorName, kind: f.assetKind, phoneOnFile: "+1 (415) 555-0142" },
    companyAlerts: [
      {
        companyName: f.companyName,
        urgency: f.urgency,
        reasons: f.reasons,
        confidence: f.candidateLink ? 0.5 : 0.9,
        pathSummary: null,
        whatToCheck: null,
      },
    ],
    heldPayments: [],
  };
  assert.equal(factsKey(companyAlertFacts(ctx, ctx.companyAlerts[0])), entry.facts);
});

test("facts: a cached vendor letter without holds is still matched byte for byte", () => {
  const key = "demo-ironclad-cred-002|vendor_letter|vendor";
  const entry = cache.entries[key];
  assert.ok(entry, `${key} missing from the cache`);
  const f = JSON.parse(entry.facts);
  assert.equal(f.paymentsHeld, 0);
  const ctx = {
    ...plain(),
    asset: { name: f.assetName, vendorName: f.vendorName, kind: f.assetKind, phoneOnFile: f.phoneOnFile },
    companyAlerts: Array.from({ length: f.portfolioCompaniesExposed }, (_, i) => ({
      ...plain().companyAlerts[0],
      companyName: `Company ${i}`,
      urgency: i < f.urgentCompanies ? "urgent" : "advisory",
    })),
  };
  assert.equal(factsKey(vendorLetterFacts(ctx)), entry.facts);
});

test("facts: every cached body still passes today's copy rules", () => {
  // The generator reuses a cached body only when it passes checkCopy; this pins that the
  // committed cache and the committed rules agree.
  for (const [key, entry] of Object.entries(cache.entries)) {
    const [externalId, kind, company] = key.split("|");
    const facts = JSON.parse(entry.facts);
    const phoneOnFile = facts.phoneOnFile ?? (externalId.startsWith("demo-brightline") ? "+1 (415) 555-0142" : PHONE);
    const finding = externalId === "demo-armadin-004";
    const problems = checkCopy(kind, entry.body, {
      phoneOnFile,
      otherCompanies: [],
      urgency: facts.urgency,
      finding,
      readerName: kind === "company_alert" ? company : undefined,
    });
    assert.deepEqual(problems, [], `${key}: ${problems.join("; ")}`);
  }
});

// --- checkCopy ------------------------------------------------------------------------------

const alertOpts = { phoneOnFile: PHONE, otherCompanies: OTHERS, urgency: "urgent", readerName: READER };
const withFindingOpts = { ...alertOpts, finding: true };
const alert = (middle) =>
  `Urgent: act today. Ironclad Managed IT (Ironclad shared admin account) is under an active security incident. ${middle} Rotate that login today and review recent sign-ins.`;

test("checkCopy: a company alert says validated only with a finding and only next to not tested", () => {
  const validatedOnly = alert("A validated attack path at another portfolio company ends at that account.");
  assert.ok(checkCopy("company_alert", validatedOnly, alertOpts).includes('says "validated" without a finding'));
  assert.ok(checkCopy("company_alert", alert(PATH), alertOpts).includes('says "validated" without a finding'));
  assert.ok(checkCopy("company_alert", validatedOnly, withFindingOpts).includes('says "validated" without "not tested"'));
  assert.deepEqual(checkCopy("company_alert", alert(PATH), withFindingOpts), []);
  assert.deepEqual(checkCopy("company_alert", alert(`${PATH} ${CHECK}`), withFindingOpts), []);
});

test("checkCopy: a company alert never claims the reader's company was tested", () => {
  for (const claim of [
    "The path was validated at your company.",
    "This was tested at your company (not tested elsewhere).",
    "The attack path was validated here, not tested.",
    "An authorized test tested here; not tested at the vendor.",
    `The path was validated at ${READER} and is reachable, not tested elsewhere.`,
    `It was tested in ${READER}'s tenant, not tested at the vendor.`,
  ]) {
    assert.ok(
      checkCopy("company_alert", alert(claim), withFindingOpts).includes("claims the reader's company was tested"),
      claim,
    );
  }
  for (const safe of [
    "The path is reachable at your company (not tested at your company).",
    "A validated path reaches you, not tested at your company.",
    "The path reaches you; it has not yet been tested at your company.",
    "It wasn't validated here and is not tested here.",
    `${READER} has not been tested; the path was validated at another portfolio company and is not tested here.`,
  ]) {
    assert.deepEqual(checkCopy("company_alert", alert(safe), withFindingOpts), [], safe);
  }
});

test("checkCopy: Armadin is never named, in any kind", () => {
  assert.ok(checkCopy("company_alert", alert(`Armadin found this. ${PATH}`), withFindingOpts).includes('says "Armadin"'));
  const letter = `To the security team at Ironclad Managed IT, Armadin ran a test. Please rotate every admin credential and confirm your bank details by calling ${PHONE}. Portfolio security, Northpass Capital`;
  assert.ok(checkCopy("vendor_letter", letter, { phoneOnFile: PHONE, otherCompanies: OTHERS, finding: true }).includes('says "Armadin"'));
});

test("checkCopy: a hold notice never says validated", () => {
  const notice = (extra) =>
    `Your $92,000 payment to Ironclad Managed IT is held until verified.${extra} Call Ironclad Managed IT at the number on file, ${PHONE}, not a number from a recent email. A controller other than the requester can then release or reject it.`;
  const opts = { phoneOnFile: PHONE, otherCompanies: OTHERS };
  assert.deepEqual(checkCopy("hold_notice", notice(""), opts), []);
  assert.ok(checkCopy("hold_notice", notice(" A validated finding, not tested here, prompted the hold."), { ...opts, finding: true }).includes('says "validated"'));
});

test("checkCopy: a vendor letter may say validated only when the incident carries a finding", () => {
  const letter =
    `To the security team at Ironclad Managed IT, an authorized test validated use of T1078 Valid Accounts against Ironclad shared admin account held by a Northpass portfolio company. ` +
    `Please rotate every admin credential issued to Northpass portfolio tenants, confirm tenant isolation, and send 30 days of admin-console access logs. ` +
    `Before paying you, our companies will call the number on file, ${PHONE}. Portfolio security, Northpass Capital`;
  const opts = { phoneOnFile: PHONE, otherCompanies: OTHERS };
  assert.ok(checkCopy("vendor_letter", letter, opts).includes('says "validated" without a finding'));
  assert.ok(checkCopy("vendor_letter", letter, { ...opts, finding: false }).includes('says "validated" without a finding'));
  assert.deepEqual(checkCopy("vendor_letter", letter, { ...opts, finding: true }), []);
});

test("checkCopy: the older rules still hold", () => {
  const fraud = checkCopy("company_alert", alert("This is fraud and the payment is blocked."), alertOpts);
  assert.ok(fraud.includes('says "fraud"') && fraud.includes('says "block"'));
  assert.ok(checkCopy("company_alert", alert("Granite Peak Software was hit too."), alertOpts).includes("names another company (Granite Peak Software)"));
  assert.ok(checkCopy("company_alert", alert("Call +1 (415) 555-9999 now."), alertOpts).includes("phone number not on file (+1 (415) 555-9999)"));
  assert.ok(checkCopy("company_alert", `Advisory: ${alert("x").slice(8)}`, alertOpts).includes('must start with "Urgent:"'));
});

// --- prompts --------------------------------------------------------------------------------

test("prompts: the alert prompt explains the path and the check only when there is a finding", () => {
  const finding = withFinding();
  const prompt = companyAlertPrompt(finding, finding.companyAlerts[0]);
  assert.ok(prompt.includes(PATH));
  assert.ok(prompt.includes(CHECK));
  assert.ok(prompt.includes("not tested"));
  assert.ok(prompt.includes("80 to 140 words"));
  assert.ok(!prompt.includes("Pinecrest"));
  assert.doesNotMatch(prompt, /armadin/i);

  const none = plain();
  const bare = companyAlertPrompt(none, none.companyAlerts[0]);
  assert.ok(!bare.includes("pathSummary"));
  assert.ok(!bare.includes("red-team"));
  assert.ok(bare.includes("60 to 110 words"));
});

test("prompts: the vendor letter prompt asks for the technique only when there is a finding", () => {
  const prompt = vendorLetterPrompt(withFinding());
  assert.ok(prompt.includes("T1078 Valid Accounts"));
  assert.ok(prompt.includes("Ironclad shared admin account held by a Northpass portfolio company"));
  assert.ok(prompt.includes("tenant isolation"));
  assert.ok(prompt.includes("30 days of admin-console access logs"));
  assert.ok(prompt.includes("160 to 260 words"));
  assert.ok(!prompt.includes("Pinecrest"));

  const bare = vendorLetterPrompt(plain());
  assert.ok(!bare.includes("T1078"));
  assert.ok(!bare.includes("tenant isolation"));
  assert.ok(bare.includes("140 to 230 words"));
  assert.ok(bare.includes("No payments to them are held"));
});

test("prompts: the hold notice prompt and the system prompt carry the finding rule without the tool's name", () => {
  const ctx = withFinding();
  const held = { companyName: READER, amountCents: 9200000, accountLast4: "2208", bankChangeFlag: false, holdReasons: [] };
  assert.doesNotMatch(holdNoticePrompt(ctx, held), /validated|T1078|Pinecrest/);
  assert.match(SYSTEM_PROMPT, /"validated", write "not tested"/);
  assert.doesNotMatch(SYSTEM_PROMPT, /armadin/i);
});
