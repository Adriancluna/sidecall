// Role 4: compare what the system did (scoring:exportOutcomes) with the planted answer key.
// Pure functions, no I/O. Output follows CONTRACT.md → "Scorecard".

// What the system did to one payment or bank change, in answer-key terms.
export function actualFor(type, outcome) {
  if (!outcome) return "no_action"; // not touched by this incident's vendor at all
  if (type === "bankChange")
    return outcome.flagged ? "hold_and_flag" : "no_action";
  if (!outcome.held) return "no_action";
  return outcome.bankChangeFlag ? "hold_and_flag" : "hold_no_flag";
}

// expected vs actual → one of the four contract results.
export function resultFor(expected, actual) {
  if (expected === "no_action")
    return actual === "no_action" ? "correct_no_action" : "false_hold";
  if (actual === expected) return "caught";
  // Held but flagged when it shouldn't be counts against us as a false hold;
  // held without the flag it needed (or not held at all) is a miss.
  if (expected === "hold_no_flag" && actual === "hold_and_flag")
    return "false_hold";
  return "missed";
}

const LABEL = {
  hold_and_flag: "held and flagged",
  hold_no_flag: "held, not flagged",
  no_action: "left alone",
};

export function scoreScenario(keyScenario, outcomes) {
  const byRef = {
    payment: new Map(),
    bankChange: new Map(),
  };
  // Payments created in the app (requestPayment) have seedRef null: not planted, skip.
  for (const p of outcomes?.payments ?? [])
    if (p.seedRef) byRef.payment.set(p.seedRef, p);
  for (const c of outcomes?.bankChanges ?? [])
    if (c.seedRef) byRef.bankChange.set(c.seedRef, c);

  const cases = keyScenario.cases.map((c) => {
    const outcome = byRef[c.type].get(c.ref);
    const actual = actualFor(c.type, outcome);
    const result = resultFor(c.expected, actual);
    const why =
      result === "caught" || result === "correct_no_action"
        ? c.why
        : `${c.why.replace(/\.$/, "")}. Expected ${LABEL[c.expected]}, system ${LABEL[actual]}.`;
    return {
      ref: c.ref,
      type: c.type,
      expected: c.expected,
      actual,
      result,
      why,
    };
  });

  const count = (r) => cases.filter((c) => c.result === r).length;
  return {
    externalId: keyScenario.externalId,
    caught: count("caught"),
    missed: count("missed"),
    falseHolds: count("false_hold"),
    correctNoAction: count("correct_no_action"),
    cases,
  };
}

export function buildScorecard(
  answerKey,
  outcomesByExternalId,
  generatedAt = new Date().toISOString(),
) {
  return {
    generatedAt,
    scenarios: answerKey.scenarios.map((s) =>
      scoreScenario(s, outcomesByExternalId[s.externalId]),
    ),
  };
}
