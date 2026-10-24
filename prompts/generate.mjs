#!/usr/bin/env node
// Role 4: pre-generate every demo text into data/ai_cache.json, off stage.
// Reseeds a DEV deployment, fires the four demo scenarios (scripts/scorecard/convex.mjs
// SCENARIOS), reads each writing context, and for each text either reuses the entry already
// in data/ai_cache.json (same key, same facts string, and it still passes today's copy rules,
// so existing texts stay byte-for-byte stable) or asks the model, checks the text against the copy rules (retrying up to 3 times),
// and writes the cache that convex/ai.ts reads first. Entries no scenario produces any more
// are dropped.
//
//   ANTHROPIC_API_KEY=… node prompts/generate.mjs               # push code, reseed, reuse + generate
//   ANTHROPIC_API_KEY=… node prompts/generate.mjs --no-push     # skip `npx convex dev --once`
//   ANTHROPIC_API_KEY=… node prompts/generate.mjs --regenerate  # ignore the cache, rewrite every text
//
// After it runs: commit data/ai_cache.json; the next deploy ships it.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
const regenerate = process.argv.includes("--regenerate");

function loadCache(path) {
  if (!existsSync(path)) return { generatedAt: null, model: null, entries: {} };
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return {
    generatedAt: parsed.generatedAt ?? null,
    model: parsed.model ?? null,
    entries: parsed.entries ?? {},
  };
}

// The cache as committed: reused when key and facts still match (unless --regenerate).
const cachePath = new URL("../data/ai_cache.json", import.meta.url);
const existing = loadCache(cachePath);
console.error(
  regenerate
    ? `Regenerating every text (${Object.keys(existing.entries).length} cached entries ignored).`
    : `Loaded ${Object.keys(existing.entries).length} cached entries; reusing those whose facts still match.`,
);

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

// Cached body for this job, or null when there is none, the facts changed, or --regenerate.
function reusable(job) {
  if (regenerate) return null;
  const entry = existing.entries[job.key];
  return entry && entry.facts === factsKey(job.facts) ? entry.body : null;
}

const entries = {};
let totalReused = 0;
let totalGenerated = 0;
for (const { externalId, incidentId } of seedAndFireAll()) {
  const ctx = run("alerts:getWritingContext", { incidentId });
  const phoneOnFile = ctx.asset.phoneOnFile;
  // Old contexts have no `technique`; a red-team finding sets it (vendor letter may say "validated").
  const finding = ctx.technique != null;
  const jobs = [
    ...ctx.companyAlerts.map((item) => ({
      key: alertKey(externalId, item),
      facts: companyAlertFacts(ctx, item),
      prompt: companyAlertPrompt(ctx, item),
      check: (t) =>
        checkCopy("company_alert", t, {
          phoneOnFile,
          urgency: item.urgency,
          finding,
          readerName: item.companyName,
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
          finding,
        }),
    },
  ];
  let reused = 0;
  const texts = await Promise.all(
    jobs.map((j) => {
      // A reused text must still pass today's copy rules; the rules can change between runs.
      const cached = reusable(j);
      if (cached !== null) {
        const problems = j.check(cached);
        if (problems.length === 0) {
          reused++;
          return cached;
        }
        console.error(
          `  regenerating ${j.key}: cached text fails current rules (${problems.join("; ")})`,
        );
      }
      return generate(j.key, j.prompt, j.check);
    }),
  );
  jobs.forEach((j, i) => {
    entries[j.key] = { facts: factsKey(j.facts), body: texts[i] };
  });
  totalReused += reused;
  totalGenerated += jobs.length - reused;
  console.error(
    `${externalId}: ${jobs.length} texts (${reused} reused, ${jobs.length - reused} generated)`,
  );
}

const sorted = Object.fromEntries(
  Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)),
);
const cache = {
  // The time texts were last written by the model; unchanged when every text was reused.
  generatedAt:
    totalGenerated > 0 || !existing.generatedAt
      ? new Date().toISOString()
      : existing.generatedAt,
  model: MODEL,
  entries: sorted,
};
writeFileSync(cachePath, JSON.stringify(cache, null, 2) + "\n");
console.log(
  `Wrote ${totalReused + totalGenerated} texts to data/ai_cache.json (${totalReused} reused, ${totalGenerated} generated)`,
);
