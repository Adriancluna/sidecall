#!/usr/bin/env node
// Role 4: pre-generate the stop-loss summaries into data/ai_stop_loss.json, off stage.
// Reseeds a DEV deployment (stop-losses are read before any breach, so no incident is fired),
// reads every company's rule inputs (ai:stopLossContexts), and for each summary either reuses
// the cached one (same key, same facts, still passes checkAdvice) or asks the model, retrying up
// to 3 times if the text breaks the copy rules. convex/ai.ts getStopLossAdvice reads the file
// first and falls back to canned text, so the demo never needs the network.
//
//   ANTHROPIC_API_KEY=… node prompts/generateStopLoss.mjs               # push code, reseed, reuse + generate
//   ANTHROPIC_API_KEY=… node prompts/generateStopLoss.mjs --no-push     # skip `npx convex dev --once`
//   ANTHROPIC_API_KEY=… node prompts/generateStopLoss.mjs --regenerate  # rewrite every summary
//
// After it runs: commit data/ai_stop_loss.json; the next deploy ships it.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { push, refuseProd, run } from "../scripts/scorecard/convex.mjs";
import { MODEL, callClaude } from "./writing.ts";
import { checkAdvice } from "./advice.ts";
import {
  PORTFOLIO_KEY,
  companyFacts,
  companyKey,
  companySummaryPrompt,
  factsKey,
  portfolioFacts,
  portfolioSummaryPrompt,
  stopLossRecommendations,
  summaryProblems,
} from "./stopLoss.ts";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("Set ANTHROPIC_API_KEY.");
  process.exit(1);
}
refuseProd();
if (!process.argv.includes("--no-push")) push();
const regenerate = process.argv.includes("--regenerate");

const cachePath = new URL("../data/ai_stop_loss.json", import.meta.url);
const existing = existsSync(cachePath)
  ? JSON.parse(readFileSync(cachePath, "utf8"))
  : { generatedAt: null, model: null, entries: {} };

run("seed:run");
console.error("Seeded (no incident fired).");
const companies = run("ai:stopLossContexts", { asOf: Date.now() });
const allNames = companies.map((c) => c.companyName);

const jobs = [
  // A company with nothing to set up keeps the canned "in place" line; no model call.
  ...companies.filter((c) => stopLossRecommendations(c).length > 0).map((c) => ({
    key: companyKey(c.companyName),
    facts: companyFacts(c),
    prompt: companySummaryPrompt(c),
    check: (t) =>
      checkAdvice(t, {
        otherCompanies: allNames.filter((n) => n !== c.companyName),
      }),
  })),
  {
    key: PORTFOLIO_KEY,
    facts: portfolioFacts(companies),
    prompt: portfolioSummaryPrompt(companies),
    // The firm view may name every company.
    check: (t) => checkAdvice(t, { otherCompanies: [], maxChars: 1400 }),
  },
];

for (const job of jobs) {
  const base = job.check;
  job.check = (t) => [...base(t), ...summaryProblems(t)];
}

async function generate(job) {
  let last = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const text = await callClaude(apiKey, job.prompt);
    last = job.check(text);
    if (last.length === 0) return text;
    console.error(`  retry ${job.key}: ${last.join("; ")}`);
  }
  throw new Error(`${job.key} failed the copy rules 3 times: ${last.join("; ")}`);
}

let reused = 0;
const texts = await Promise.all(
  jobs.map((job) => {
    const entry = existing.entries?.[job.key];
    if (!regenerate && entry && entry.facts === factsKey(job.facts)) {
      const problems = job.check(entry.body);
      if (problems.length === 0) {
        reused++;
        return entry.body;
      }
      console.error(`  regenerating ${job.key}: ${problems.join("; ")}`);
    }
    return generate(job);
  }),
);

const entries = Object.fromEntries(
  jobs
    .map((job, i) => [job.key, { facts: factsKey(job.facts), body: texts[i] }])
    .sort(([a], [b]) => a.localeCompare(b)),
);
const generated = jobs.length - reused;
writeFileSync(
  cachePath,
  JSON.stringify(
    {
      generatedAt:
        generated > 0 || !existing.generatedAt
          ? new Date().toISOString()
          : existing.generatedAt,
      model: MODEL,
      entries,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Wrote ${jobs.length} summaries to data/ai_stop_loss.json (${reused} reused, ${generated} generated)`,
);
