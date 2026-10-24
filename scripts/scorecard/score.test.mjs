// Run from the repo root: node --test scripts/scorecard/score.test.mjs
// (not `node --test "scripts/scorecard/**"`: that glob also executes run.mjs, which reseeds a deployment)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  actualFor,
  buildScorecard,
  knownRefs,
  missingRefs,
  resultFor,
  scoreScenario,
} from "./score.mjs";

// --- actualFor: exportOutcomes row → answer-key term -------------------------------------

test("actualFor: a held, flagged payment is hold_and_flag", () => {
  assert.equal(
    actualFor("payment", { held: true, bankChangeFlag: true }),
    "hold_and_flag",
  );
});

test("actualFor: a held payment to unchanged bank details is hold_no_flag", () => {
  assert.equal(
    actualFor("payment", { held: true, bankChangeFlag: false }),
    "hold_no_flag",
  );
});

test("actualFor: a payment this incident did not hold is no_action, even if flagged elsewhere", () => {
  assert.equal(
    actualFor("payment", { held: false, bankChangeFlag: true }),
    "no_action",
  );
});

test("actualFor: bank changes are flagged or left alone, never hold_no_flag", () => {
  assert.equal(actualFor("bankChange", { flagged: true }), "hold_and_flag");
  assert.equal(actualFor("bankChange", { flagged: false }), "no_action");
});

// --- resultFor: expected vs actual → the four contract results ----------------------------

test("resultFor: caught when the system did exactly what was planted", () => {
  assert.equal(resultFor("hold_and_flag", "hold_and_flag"), "caught");
  assert.equal(resultFor("hold_no_flag", "hold_no_flag"), "caught");
});

test("resultFor: correct_no_action when a no_action case was left alone", () => {
  assert.equal(resultFor("no_action", "no_action"), "correct_no_action");
});

test("resultFor: false_hold when a no_action case was held, or a hold got a flag it should not have", () => {
  assert.equal(resultFor("no_action", "hold_no_flag"), "false_hold");
  assert.equal(resultFor("no_action", "hold_and_flag"), "false_hold");
  assert.equal(resultFor("hold_no_flag", "hold_and_flag"), "false_hold");
});

test("resultFor: missed when a planted hold or flag did not happen", () => {
  assert.equal(resultFor("hold_and_flag", "no_action"), "missed");
  assert.equal(resultFor("hold_no_flag", "no_action"), "missed");
  assert.equal(resultFor("hold_and_flag", "hold_no_flag"), "missed");
});

// --- scoreScenario -------------------------------------------------------------------------

const KEY = {
  externalId: "demo-test-001",
  cases: [
    { ref: "pay_flagged", type: "payment", expected: "hold_and_flag", why: "Email change 2 days before" },
    { ref: "pay_plain", type: "payment", expected: "hold_no_flag", why: "Verified account." },
    { ref: "pay_opted_out", type: "payment", expected: "no_action", why: "No hold rule" },
    { ref: "bc_email", type: "bankChange", expected: "hold_and_flag", why: "Email change" },
    { ref: "bc_honest", type: "bankChange", expected: "no_action", why: "Verified by phone" },
  ],
};

const PERFECT = {
  incidentId: "inc1",
  payments: [
    { seedRef: "pay_flagged", status: "held", held: true, bankChangeFlag: true },
    { seedRef: "pay_plain", status: "held", held: true, bankChangeFlag: false },
    { seedRef: "pay_opted_out", status: "pending", held: false, bankChangeFlag: false },
  ],
  bankChanges: [
    { seedRef: "bc_email", flagged: true },
    { seedRef: "bc_honest", flagged: false },
  ],
};

test("scoreScenario: happy path scores every case and keeps the key's why", () => {
  const s = scoreScenario(KEY, PERFECT);
  assert.equal(s.externalId, "demo-test-001");
  assert.deepEqual(
    { caught: s.caught, missed: s.missed, falseHolds: s.falseHolds, correctNoAction: s.correctNoAction },
    { caught: 3, missed: 0, falseHolds: 0, correctNoAction: 2 },
  );
  assert.deepEqual(
    s.cases.map((c) => c.ref),
    KEY.cases.map((c) => c.ref),
    "cases keep the answer key's order",
  );
  assert.deepEqual(s.cases[0], {
    ref: "pay_flagged",
    type: "payment",
    expected: "hold_and_flag",
    actual: "hold_and_flag",
    result: "caught",
    why: "Email change 2 days before",
  });
  assert.deepEqual(Object.keys(s), ["externalId", "caught", "missed", "falseHolds", "correctNoAction", "cases"]);
});

test("scoreScenario: a miss or false hold appends expected vs actual to why, without a double period", () => {
  const outcomes = structuredClone(PERFECT);
  outcomes.payments[1].bankChangeFlag = true; // pay_plain flagged when it should not be
  outcomes.bankChanges[0].flagged = false; // bc_email not flagged
  const s = scoreScenario(KEY, outcomes);
  assert.equal(s.caught, 1);
  assert.equal(s.missed, 1);
  assert.equal(s.falseHolds, 1);
  assert.equal(s.correctNoAction, 2);
  const plain = s.cases.find((c) => c.ref === "pay_plain");
  assert.equal(plain.result, "false_hold");
  assert.equal(plain.why, "Verified account. Expected held, not flagged, system held and flagged.");
  const email = s.cases.find((c) => c.ref === "bc_email");
  assert.equal(email.result, "missed");
  assert.equal(email.why, "Email change. Expected held and flagged, system left alone.");
});

test("scoreScenario: payments with seedRef null (made in-app) are skipped, not scored", () => {
  const outcomes = structuredClone(PERFECT);
  // An in-app requestPayment that was held and flagged: not planted, so it must not count anywhere.
  outcomes.payments.push({ seedRef: null, status: "held", held: true, bankChangeFlag: true });
  outcomes.bankChanges.push({ seedRef: null, flagged: true });
  const s = scoreScenario(KEY, outcomes);
  assert.equal(s.cases.length, KEY.cases.length);
  assert.deepEqual(
    { caught: s.caught, missed: s.missed, falseHolds: s.falseHolds, correctNoAction: s.correctNoAction },
    { caught: 3, missed: 0, falseHolds: 0, correctNoAction: 2 },
  );
});

test("scoreScenario: a null-seedRef row never satisfies a planted ref", () => {
  const outcomes = structuredClone(PERFECT);
  outcomes.payments = outcomes.payments.map((p) =>
    p.seedRef === "pay_opted_out" ? { ...p, seedRef: null } : p,
  );
  assert.deepEqual(missingRefs(KEY, outcomes), ["pay_opted_out"]);
  assert.throws(() => scoreScenario(KEY, outcomes), /pay_opted_out/);
});

// --- missing refs: the scorecard must refuse, never pass by default ------------------------

test("missingRefs: empty when every planted ref has a row", () => {
  assert.deepEqual(missingRefs(KEY, PERFECT), []);
});

test("missingRefs: every ref when outcomes are null or absent", () => {
  const all = KEY.cases.map((c) => c.ref);
  assert.deepEqual(missingRefs(KEY, null), all);
  assert.deepEqual(missingRefs(KEY, undefined), all);
});

test("missingRefs: a ref is only found under its own type", () => {
  const outcomes = structuredClone(PERFECT);
  // The bank-change ref shows up as a payment row (wrong table): still missing.
  outcomes.bankChanges = outcomes.bankChanges.filter((c) => c.seedRef !== "bc_email");
  outcomes.payments.push({ seedRef: "bc_email", status: "held", held: true, bankChangeFlag: true });
  assert.deepEqual(missingRefs(KEY, outcomes), ["bc_email"]);
});

test("buildScorecard: throws naming the scenario and the missing ref instead of scoring it as left alone", () => {
  // A renamed seedRef (e.g. *_fraud → *_email_change) used to fall through to "no_action"
  // and count as correct_no_action: a pass by default. Now the run refuses.
  const outcomes = structuredClone(PERFECT);
  outcomes.bankChanges = outcomes.bankChanges.map((c) =>
    c.seedRef === "bc_email" ? { ...c, seedRef: "bc_email_renamed" } : c,
  );
  assert.throws(
    () => buildScorecard({ scenarios: [KEY] }, { "demo-test-001": outcomes }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /demo-test-001/);
      assert.match(error.message, /\bbc_email\b/);
      assert.doesNotMatch(error.message, /pay_flagged/, "present refs are not listed");
      return true;
    },
  );
});

// --- refs on another asset: known to some fired scenario, absent from this incident ---------
// exportOutcomes only returns rows on the incident's own asset. demo-ironclad-cred-002 (shared
// admin account) plants its no_action cases on Ironclad IT Services, which only the MSP
// scenario exports. Known elsewhere → "no_action" here; known nowhere → refuse.

const KEY_OTHER_ASSET = {
  externalId: "demo-test-002",
  cases: [
    { ref: "pay_plain", type: "payment", expected: "no_action", why: "Separate login, payments untouched" },
    { ref: "bc_honest", type: "bankChange", expected: "no_action", why: "Verified by phone" },
  ],
};
const EMPTY_EXPORT = { incidentId: "inc2", payments: [], bankChanges: [] };

test("knownRefs: pools every seedRef across the fired scenarios, skipping null", () => {
  const known = knownRefs({ a: PERFECT, b: { payments: [{ seedRef: null, held: true }], bankChanges: [] }, c: null });
  assert.deepEqual([...known.payment].sort(), ["pay_flagged", "pay_opted_out", "pay_plain"]);
  assert.deepEqual([...known.bankChange].sort(), ["bc_email", "bc_honest"]);
});

test("buildScorecard: a ref exported by another scenario but absent here scores as left alone", () => {
  const card = buildScorecard(
    { scenarios: [KEY, KEY_OTHER_ASSET] },
    { "demo-test-001": PERFECT, "demo-test-002": EMPTY_EXPORT },
  );
  const second = card.scenarios[1];
  assert.deepEqual(
    { caught: second.caught, missed: second.missed, falseHolds: second.falseHolds, correctNoAction: second.correctNoAction },
    { caught: 0, missed: 0, falseHolds: 0, correctNoAction: 2 },
  );
  assert.ok(second.cases.every((c) => c.actual === "no_action" && c.result === "correct_no_action"));
});

test("buildScorecard: a ref no fired scenario exported is refused, even with an empty export", () => {
  const key = { ...KEY_OTHER_ASSET, cases: [...KEY_OTHER_ASSET.cases, { ref: "pay_renamed", type: "payment", expected: "no_action", why: "x" }] };
  assert.throws(
    () => buildScorecard({ scenarios: [KEY, key] }, { "demo-test-001": PERFECT, "demo-test-002": EMPTY_EXPORT }),
    (error) => {
      assert.match(error.message, /demo-test-002/);
      assert.match(error.message, /\bpay_renamed\b/);
      assert.doesNotMatch(error.message, /\bpay_plain\b/);
      return true;
    },
  );
});

test("scoreScenario: without a pool, only this scenario's own export counts as known", () => {
  assert.throws(() => scoreScenario(KEY_OTHER_ASSET, EMPTY_EXPORT), /pay_plain/);
  const s = scoreScenario(KEY_OTHER_ASSET, EMPTY_EXPORT, knownRefs({ a: PERFECT }));
  assert.equal(s.correctNoAction, 2);
});

test("buildScorecard: throws on a null outcomes object (scenario not fired) listing every ref", () => {
  assert.throws(
    () => buildScorecard({ scenarios: [KEY] }, { "demo-test-001": null }),
    (error) => {
      assert.match(error.message, /demo-test-001/);
      assert.match(error.message, /no outcomes/);
      for (const c of KEY.cases) assert.match(error.message, new RegExp(`\\b${c.ref}\\b`));
      return true;
    },
  );
  // Absent entirely (never fired) behaves the same.
  assert.throws(() => buildScorecard({ scenarios: [KEY] }, {}), /demo-test-001/);
});

test("buildScorecard: one error names every affected scenario, so one run shows every mismatch", () => {
  const second = { ...KEY, externalId: "demo-test-002" };
  const outcomes = structuredClone(PERFECT);
  outcomes.payments = outcomes.payments.filter((p) => p.seedRef !== "pay_plain");
  assert.throws(
    () =>
      buildScorecard(
        { scenarios: [KEY, second] },
        { "demo-test-001": outcomes, "demo-test-002": null },
      ),
    (error) => {
      assert.match(error.message, /demo-test-001.*\bpay_plain\b/);
      assert.match(error.message, /demo-test-002.*no outcomes/);
      return true;
    },
  );
});

test("buildScorecard: happy path returns the CONTRACT shape with the given generatedAt", () => {
  const card = buildScorecard({ scenarios: [KEY] }, { "demo-test-001": PERFECT }, "2026-10-24T00:00:00.000Z");
  assert.deepEqual(Object.keys(card), ["generatedAt", "scenarios"]);
  assert.equal(card.generatedAt, "2026-10-24T00:00:00.000Z");
  assert.equal(card.scenarios.length, 1);
  assert.equal(card.scenarios[0].caught, 3);
});

// --- the committed answer key, with outcomes synthesized from its own expectations ------------

test("data/answer_key.json: a perfect run scores every case caught or correctly left alone", () => {
  const answerKey = JSON.parse(
    readFileSync(new URL("../../data/answer_key.json", import.meta.url), "utf8"),
  );
  const outcomes = Object.fromEntries(
    answerKey.scenarios.map((s) => [
      s.externalId,
      {
        incidentId: "inc",
        payments: s.cases
          .filter((c) => c.type === "payment")
          .map((c) => ({
            seedRef: c.ref,
            status: c.expected === "no_action" ? "pending" : "held",
            held: c.expected !== "no_action",
            bankChangeFlag: c.expected === "hold_and_flag",
          })),
        bankChanges: s.cases
          .filter((c) => c.type === "bankChange")
          .map((c) => ({ seedRef: c.ref, flagged: c.expected === "hold_and_flag" })),
      },
    ]),
  );
  const card = buildScorecard(answerKey, outcomes);
  assert.equal(card.scenarios.length, answerKey.scenarios.length);
  for (const [i, s] of card.scenarios.entries()) {
    assert.equal(s.externalId, answerKey.scenarios[i].externalId);
    assert.equal(s.missed, 0);
    assert.equal(s.falseHolds, 0);
    assert.equal(s.caught + s.correctNoAction, answerKey.scenarios[i].cases.length);
  }
});
