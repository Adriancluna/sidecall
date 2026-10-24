#!/usr/bin/env node
// Role 4: the scorecard. Reseeds a DEV deployment, fires the three demo scenarios, compares
// scoring:exportOutcomes with data/answer_key.json, and writes data/scorecard.json.
//
//   node scripts/scorecard/run.mjs            # push code, reseed, fire, score
//   node scripts/scorecard/run.mjs --no-push  # skip `npx convex dev --once`
//
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
const fired = seedAndFireAll();
const outcomes = Object.fromEntries(
  fired.map((f) => [
    f.externalId,
    run("scoring:exportOutcomes", { externalId: f.externalId }),
  ]),
);

const scorecard = buildScorecard(answerKey, outcomes);
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
