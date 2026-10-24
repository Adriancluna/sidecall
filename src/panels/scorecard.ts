// Role 4's data/scorecard.json (CONTRACT.md "Scorecard"), read as text at build time and
// shape-checked here: a malformed file shows an "unreadable" state instead of breaking the PE view.
import raw from "../../data/scorecard.json?raw";

export type ScorecardCase = {
  ref: string;
  type: string;
  expected: string;
  actual: string;
  result: string; // "caught" | "missed" | "false_hold" | "correct_no_action"
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

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null;
const all = (o: Obj, keys: string[], type: "string" | "number") =>
  keys.every((k) => typeof o[k] === type);

const isScenario = (s: unknown) =>
  isObj(s) &&
  all(s, ["externalId"], "string") &&
  all(s, ["caught", "missed", "falseHolds", "correctNoAction"], "number") &&
  Array.isArray(s.cases) &&
  s.cases.every(
    (c) =>
      isObj(c) &&
      all(c, ["ref", "type", "expected", "actual", "result", "why"], "string"),
  );

export function parseScorecard(text: string): Scorecard | null {
  try {
    const data: unknown = JSON.parse(text);
    const ok =
      isObj(data) &&
      (data.generatedAt === null || typeof data.generatedAt === "string") &&
      Array.isArray(data.scenarios) &&
      data.scenarios.every(isScenario);
    return ok ? (data as Scorecard) : null;
  } catch {
    return null;
  }
}

export const scorecard = parseScorecard(raw);
