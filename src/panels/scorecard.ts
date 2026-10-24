// Role 4's data/scorecard.json (CONTRACT.md "Scorecard"), read as text at build time and
// checked here: a malformed file shows an "unreadable" state instead of breaking the PE view.
import raw from "../../data/scorecard.json?raw";

const OUTCOMES = ["hold_and_flag", "hold_no_flag", "no_action"] as const;
const RESULTS = [
  "caught",
  "missed",
  "false_hold",
  "correct_no_action",
] as const;

export type ScorecardCase = {
  ref: string;
  type: "payment" | "bankChange";
  expected: (typeof OUTCOMES)[number];
  actual: (typeof OUTCOMES)[number];
  result: (typeof RESULTS)[number];
  why: string;
};

export type ScorecardScenario = {
  externalId: string;
  caught: number;
  missed: number;
  falseHolds: number;
  correctNoAction: number;
  cases: ScorecardCase[];
};

export type Scorecard = {
  generatedAt: string | null;
  scenarios: ScorecardScenario[];
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;
const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown) => typeof v === "string";
const oneOf = (list: readonly string[], v: unknown) =>
  isStr(v) && list.includes(v);

function isCase(v: unknown): v is ScorecardCase {
  return (
    isObj(v) &&
    isStr(v.ref) &&
    (v.type === "payment" || v.type === "bankChange") &&
    oneOf(OUTCOMES, v.expected) &&
    oneOf(OUTCOMES, v.actual) &&
    oneOf(RESULTS, v.result) &&
    isStr(v.why)
  );
}

function isScenario(v: unknown): v is ScorecardScenario {
  return (
    isObj(v) &&
    isStr(v.externalId) &&
    isNum(v.caught) &&
    isNum(v.missed) &&
    isNum(v.falseHolds) &&
    isNum(v.correctNoAction) &&
    Array.isArray(v.cases) &&
    v.cases.every(isCase)
  );
}

export function parseScorecard(text: string): Scorecard | null {
  try {
    const data: unknown = JSON.parse(text);
    if (
      isObj(data) &&
      (data.generatedAt === null || isStr(data.generatedAt)) &&
      Array.isArray(data.scenarios) &&
      data.scenarios.every(isScenario)
    ) {
      return data as Scorecard;
    }
  } catch {
    // fall through: unreadable
  }
  return null;
}

export const scorecard = parseScorecard(raw);
