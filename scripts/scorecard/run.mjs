#!/usr/bin/env node
// Role 4: the scorecard. Reseeds a DEV deployment, fires the four demo scenarios (convex.mjs
// SCENARIOS), compares scoring:exportOutcomes with data/answer_key.json for every scenario the
// key lists (fired scenarios without a key entry are ignored), and writes data/scorecard.json.
//
//   node scripts/scorecard/run.mjs            # push code, reseed, fire, score
//   node scripts/scorecard/run.mjs --no-push  # skip `npx convex dev --once`
//
// If any planted ref has no outcome row (renamed seedRef, scenario not fired), nothing is
// written: the error is printed and the script exits 1, so a stale key can't pass by default.
// Nothing in convex/ reads the answer key; only this script does.
import { readFileSync, writeFileSync } from "node:fs";
import { push, refuseProd, run, seedAndFireAll } from "./convex.mjs";
import { buildScorecard } from "./score.mjs";

const root = new URL("../../", import.meta.url);
refuseProd();
if (!process.argv.includes("--no-push")) push();

const answerKey = JSON.parse(
  readFileSync(new URL("data/answer_key.json", root), "utf8"),
);
const keyed = new Set(answerKey.scenarios.map((s) => s.externalId));
const fired = seedAndFireAll();
for (const f of fired.filter((f) => !keyed.has(f.externalId)))
  console.error(`${f.externalId}: not in the answer key, not scored`);
const outcomes = Object.fromEntries(
  fired
    .filter((f) => keyed.has(f.externalId))
    .map((f) => [
      f.externalId,
      run("scoring:exportOutcomes", { externalId: f.externalId }),
    ]),
);

let scorecard;
try {
  scorecard = buildScorecard(answerKey, outcomes);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error("data/scorecard.json not written.");
  process.exit(1);
}
writeFileSync(
  new URL("data/scorecard.json", root),
  JSON.stringify(scorecard, null, 2) + "\n",
);

for (const s of scorecard.scenarios) {
  console.log(
    `${s.externalId}: caught ${s.caught} · missed ${s.missed} · false holds ${s.falseHolds} · correctly left alone ${s.correctNoAction}`,
  );
  for (const c of s.cases.filter(
    (c) => c.result === "missed" || c.result === "false_hold",
  )) {
    console.log(`  ${c.result}: ${c.ref} (${c.why})`);
  }
}
console.log("Wrote data/scorecard.json");
