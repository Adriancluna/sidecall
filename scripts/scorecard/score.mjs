// Role 4: compare what the system did (scoring:exportOutcomes) with the planted answer key.
// Pure functions, no I/O. Output follows CONTRACT.md → "Scorecard".

// What the system did to one payment or bank change, in answer-key terms.
// `outcome` is this incident's exportOutcomes row for the ref, or undefined when the ref lives
// on another asset (scoreScenario has already checked that some fired scenario knows the ref).
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

// exportOutcomes rows by seedRef, per case type.
// Payments created in the app (requestPayment) have seedRef null: not planted, skip.
function indexOutcomes(outcomes) {
  const byRef = { payment: new Map(), bankChange: new Map() };
  for (const p of outcomes?.payments ?? [])
    if (p.seedRef) byRef.payment.set(p.seedRef, p);
  for (const c of outcomes?.bankChanges ?? [])
    if (c.seedRef) byRef.bankChange.set(c.seedRef, c);
  return byRef;
}

// Every seedRef any fired scenario exported, by case type. exportOutcomes only returns the
// payments and bank changes on the incident's own asset, so a planted ref can legitimately have
// no row for one incident (demo-ironclad-cred-002 is on the shared admin account; its planted
// payments are on Ironclad IT Services and only appear in the MSP scenario's export). A ref
// that appears in NO scenario's export is another matter: the answer key and convex/seed.ts
// disagree (e.g. a renamed seedRef), and scoring it as "left alone" would be a pass by default.
export function knownRefs(outcomesByExternalId) {
  const known = { payment: new Set(), bankChange: new Set() };
  for (const o of Object.values(outcomesByExternalId ?? {})) {
    for (const p of o?.payments ?? []) if (p.seedRef) known.payment.add(p.seedRef);
    for (const c of o?.bankChanges ?? []) if (c.seedRef) known.bankChange.add(c.seedRef);
  }
  return known;
}

// Planted refs this scenario cannot be scored on: every ref when `outcomes` is null/absent
// (the scenario was never fired, or exportOutcomes found no incident), otherwise the refs no
// fired scenario knows (`known`, defaulting to this scenario's own export). Callers refuse to
// score instead of counting these as "left alone".
export function missingRefs(keyScenario, outcomes, known) {
  if (outcomes == null) return keyScenario.cases.map((c) => c.ref);
  const pool = known ?? knownRefs({ own: outcomes });
  return keyScenario.cases
    .filter((c) => !pool[c.type]?.has(c.ref))
    .map((c) => c.ref);
}

function missingMessage(externalId, missing, outcomes) {
  const cause =
    outcomes == null
      ? "no outcomes (scenario not fired, or exportOutcomes found no incident)"
      : "no fired scenario exported this ref (seedRef renamed or missing in convex/seed.ts or data/answer_key.json?)";
  return `${externalId}: ${cause} for ${missing.length} planted ref(s): ${missing.join(", ")}`;
}

export function scoreScenario(keyScenario, outcomes, known) {
  const missing = missingRefs(keyScenario, outcomes, known);
  if (missing.length > 0) {
    throw new Error(
      `Scorecard refused: ${missingMessage(keyScenario.externalId, missing, outcomes)}`,
    );
  }
  const byRef = indexOutcomes(outcomes);

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

// Throws (instead of writing a scorecard) when any planted ref has no outcome row, naming
// every affected scenario and ref in one message so a single run shows every mismatch.
export function buildScorecard(
  answerKey,
  outcomesByExternalId,
  generatedAt = new Date().toISOString(),
) {
  const known = knownRefs(outcomesByExternalId);
  const problems = answerKey.scenarios.flatMap((s) => {
    const outcomes = outcomesByExternalId?.[s.externalId];
    const missing = missingRefs(s, outcomes, known);
    return missing.length > 0
      ? [missingMessage(s.externalId, missing, outcomes)]
      : [];
  });
  if (problems.length > 0) {
    throw new Error(
      `Scorecard refused: planted refs without an outcome.\n  ${problems.join("\n  ")}`,
    );
  }
  return {
    generatedAt,
    scenarios: answerKey.scenarios.map((s) =>
      scoreScenario(s, outcomesByExternalId[s.externalId], known),
    ),
  };
}
