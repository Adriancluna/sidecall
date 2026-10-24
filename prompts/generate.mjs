#!/usr/bin/env node
// Role 4: pre-generate every demo text into data/ai_cache.json, off stage.
// Reseeds a DEV deployment, fires the three demo scenarios, reads each writing context,
// asks the model for each text, checks it against the copy rules (retrying up to 3 times),
// and writes the cache that convex/ai.ts reads first.
//
//   ANTHROPIC_API_KEY=… node prompts/generate.mjs            # push code, reseed, generate
//   ANTHROPIC_API_KEY=… node prompts/generate.mjs --no-push
//
// After it runs: commit data/ai_cache.json; the next deploy ships it.
import { writeFileSync } from "node:fs";
import {
  push,
  refuseProd,
  run,
  seedAndFireAll,
} from "../scripts/scorecard/convex.mjs";
import {
  MODEL,
  alertKey,
  callClaude,
  checkCopy,
  companyAlertFacts,
  companyAlertPrompt,
  factsKey,
  holdKey,
  holdNoticeFacts,
  holdNoticePrompt,
  letterKey,
  vendorLetterFacts,
  vendorLetterPrompt,
} from "./writing.ts";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("Set ANTHROPIC_API_KEY.");
  process.exit(1);
}
refuseProd();
if (!process.argv.includes("--no-push")) push();

// Every portfolio name, the reporter included: a text may only name its own reader.
const allCompanies = run("blastRadius:listCompanies").map((c) => c.name);
const others = (own) => allCompanies.filter((name) => name !== own);

async function generate(key, prompt, check) {
  let last = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const text = await callClaude(apiKey, prompt);
    last = check(text);
    if (last.length === 0) return text;
    console.error(`  retry ${key}: ${last.join("; ")}`);
  }
  throw new Error(`${key} failed the copy rules 3 times: ${last.join("; ")}`);
}

const entries = {};
let total = 0;
for (const { externalId, incidentId } of seedAndFireAll()) {
  const ctx = run("alerts:getWritingContext", { incidentId });
  const phoneOnFile = ctx.asset.phoneOnFile;
  const jobs = [
    ...ctx.companyAlerts.map((item) => ({
      key: alertKey(externalId, item),
      facts: companyAlertFacts(ctx, item),
      prompt: companyAlertPrompt(ctx, item),
      check: (t) =>
        checkCopy("company_alert", t, {
          phoneOnFile,
          urgency: item.urgency,
          otherCompanies: others(item.companyName),
        }),
    })),
    ...ctx.heldPayments.map((item) => ({
      key: holdKey(externalId, item),
      facts: holdNoticeFacts(ctx, item),
      prompt: holdNoticePrompt(ctx, item),
      check: (t) =>
        checkCopy("hold_notice", t, {
          phoneOnFile,
          otherCompanies: others(item.companyName),
        }),
    })),
    {
      key: letterKey(externalId),
      facts: vendorLetterFacts(ctx),
      prompt: vendorLetterPrompt(ctx),
      check: (t) =>
        checkCopy("vendor_letter", t, {
          phoneOnFile,
          otherCompanies: allCompanies,
        }),
    },
  ];
  const texts = await Promise.all(
    jobs.map((j) => generate(j.key, j.prompt, j.check)),
  );
  jobs.forEach((j, i) => {
    entries[j.key] = { facts: factsKey(j.facts), body: texts[i] };
  });
  total += jobs.length;
  console.error(`${externalId}: ${jobs.length} texts`);
}

const sorted = Object.fromEntries(
  Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)),
);
const cache = {
  generatedAt: new Date().toISOString(),
  model: MODEL,
  entries: sorted,
};
writeFileSync(
  new URL("../data/ai_cache.json", import.meta.url),
  JSON.stringify(cache, null, 2) + "\n",
);
console.log(`Wrote ${total} texts to data/ai_cache.json`);
