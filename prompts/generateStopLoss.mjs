#!/usr/bin/env node
// Pre-generate stop-loss summaries from EXISTING records on your own matching cloud DEV.
// Default behavior never deploys or resets. Valid cached summaries need no model/API key.
// ANTHROPIC_API_KEY is needed only for summaries that must actually be generated.
//
//   node prompts/generateStopLoss.mjs --deployment brainy-cassowary-804
//   node prompts/generateStopLoss.mjs --deployment tangible-koala-842 --regenerate
//   node prompts/generateStopLoss.mjs --deployment <your-dev-name> --push  # explicit code deployment
//   node prompts/generateStopLoss.mjs --deployment <your-dev-name> --seed  # explicit destructive reseed
//
// Both opt-ins may be combined. They require the named DEV to match .env.local's
// CONVEX_DEPLOYMENT and VITE_CONVEX_URL exactly; all deploy keys/tokens are refused.
// Legacy --no-push is accepted and now also leaves data intact unless --seed is explicit.
// Commit data/ai_stop_loss.json afterwards; a later reviewed deploy ships it.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedDev } from "../scripts/scorecard/ownedDev.mjs";
import { MODEL, callClaude } from "./writing.ts";
import {
  PORTFOLIO_KEY,
  companyFacts,
  companyKey,
  companySummaryPrompt,
  factsKey,
  portfolioFacts,
  portfolioSummaryPrompt,
  stopLossRecommendations,
  summaryForFactsProblems,
} from "./stopLoss.ts";

// Exported for deterministic tests with a mocked CLI and model; imports do not run generation.
export async function generateStopLoss({
  argv = process.argv.slice(2), cwd = process.cwd(), env = process.env, spawn,
  callModel = callClaude, now = Date.now, log = console,
  cachePath = new URL("../data/ai_stop_loss.json", import.meta.url),
} = {}) {
  const dev = createOwnedDev({ argv, cwd, env, spawn });
  const existing = existsSync(cachePath)
    ? JSON.parse(readFileSync(cachePath, "utf8"))
    : { generatedAt: null, model: null, entries: {} };

  // Guards run before either explicit mutation and again before every CLI invocation.
  dev.prepare();
  const companies = dev.contexts(now());
  if (!Array.isArray(companies)) throw new Error("Stop-loss contexts did not return a company list.");
  log.error(`Read existing records from DEV ${dev.deployment}${dev.options.seed ? " after the explicitly requested reseed" : ""}.`);
  const allNames = companies.map((c) => c.companyName);
  const complete = (c) => c.evidenceComplete !== false && c.links.length > 0;
  const jobs = companies
    .filter((c) => complete(c) && stopLossRecommendations(c).length > 0)
    .map((c) => ({
      key: companyKey(c.companyName), facts: companyFacts(c), prompt: companySummaryPrompt(c),
      otherCompanies: allNames.filter((name) => name !== c.companyName), maxChars: 1100,
    }));
  // Partial or missing evidence uses the runtime's explicit canned explanation, not an AI claim.
  if (companies.length > 0 && companies.every(complete)) {
    jobs.push({ key: PORTFOLIO_KEY, facts: portfolioFacts(companies),
      prompt: portfolioSummaryPrompt(companies), otherCompanies: [], maxChars: 1400 });
  }
  const problems = (job, text) => summaryForFactsProblems(text, job.facts, job.otherCompanies, job.maxChars);

  async function generate(job) {
    if (!env.ANTHROPIC_API_KEY)
      throw new Error("Set ANTHROPIC_API_KEY to generate missing or stale summaries; cache reuse needs no key.");
    for (let attempt = 1; attempt <= 3; attempt++) {
      let text;
      try { text = await callModel(env.ANTHROPIC_API_KEY, job.prompt); }
      catch { throw new Error("Model request failed; provider output withheld to protect credentials."); }
      if (typeof text !== "string") throw new Error("Model did not return summary text.");
      const issues = problems(job, text);
      if (issues.length === 0) return text;
      log.error(`Retrying ${job.key}: ${issues.length} summary validation problem(s).`);
    }
    throw new Error("A summary failed the copy and recorded-fact checks three times; cache was not overwritten.");
  }

  let reused = 0;
  const texts = await Promise.all(jobs.map((job) => {
    const entry = existing.entries?.[job.key];
    if (!dev.options.regenerate && entry?.facts === factsKey(job.facts) &&
        typeof entry.body === "string" && problems(job, entry.body).length === 0) {
      reused++;
      return entry.body;
    }
    return generate(job);
  }));
  const entries = Object.fromEntries(jobs
    .map((job, index) => [job.key, { facts: factsKey(job.facts), body: texts[index] }])
    .sort(([a], [b]) => a.localeCompare(b)));
  const generated = jobs.length - reused;
  writeFileSync(cachePath, `${JSON.stringify({
    generatedAt: generated > 0 || !existing.generatedAt ? new Date(now()).toISOString() : existing.generatedAt,
    model: MODEL, entries,
  }, null, 2)}\n`);
  log.log(`Wrote ${jobs.length} stop-loss summaries (${reused} reused, ${generated} generated).`);
  return { deployment: dev.deployment, summaries: jobs.length, reused, generated };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await generateStopLoss(); }
  catch (error) { console.error(error instanceof Error ? error.message : "Stop-loss generation failed."); process.exitCode = 1; }
}
