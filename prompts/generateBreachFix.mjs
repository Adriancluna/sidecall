#!/usr/bin/env node
// Role 4: pre-generate the breach fix advice text into data/ai_breach_fix.json, off stage.
// Reseeds a DEV deployment, fires the four demo scenarios, reads every exposed company's fix
// context (internal ai:breachFixContexts) and, per company, either reuses the cached entry (same
// key, same facts, still passes today's copy rules) or asks the model for the summary and one
// "why" per recommendation, retrying up to 3 times when the copy rules fail. The rules in
// prompts/breachFix.ts pick the recommendations; the model only explains them.
//
//   ANTHROPIC_API_KEY=… node prompts/generateBreachFix.mjs               # push, reseed, reuse + generate
//   ANTHROPIC_API_KEY=… node prompts/generateBreachFix.mjs --no-push     # skip `npx convex dev --once`
//   ANTHROPIC_API_KEY=… node prompts/generateBreachFix.mjs --regenerate  # rewrite every entry
//
// After it runs: commit data/ai_breach_fix.json; the next deploy ships it.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { push, refuseProd, run, seedAndFireAll } from "../scripts/scorecard/convex.mjs";
import { MODEL, callClaude } from "./writing.ts";
import {
  breachFixFactsKey,
  breachFixKey,
  breachFixPrompt,
  checkBreachFixCopy,
  parseBreachFixReply,
  planBreachFix,
} from "./breachFix.ts";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("Set ANTHROPIC_API_KEY.");
  process.exit(1);
}
refuseProd();
if (!process.argv.includes("--no-push")) push();
const regenerate = process.argv.includes("--regenerate");

const cachePath = new URL("../data/ai_breach_fix.json", import.meta.url);
const existing = existsSync(cachePath)
  ? JSON.parse(readFileSync(cachePath, "utf8"))
  : { generatedAt: null, model: null, entries: {} };

// Every portfolio name, the reporter included: a text may only name its own reader.
const allCompanies = run("blastRadius:listCompanies").map((c) => c.name);

function problemsOf(ctx, reply) {
  const opts = {
    phoneOnFile: ctx.asset.phoneOnFile,
    otherCompanies: allCompanies.filter((n) => n !== ctx.companyName),
    urgency: ctx.urgency,
    finding: ctx.finding,
  };
  return [
    ...checkBreachFixCopy("summary", reply.summary, opts).map((p) => `summary ${p}`),
    ...Object.entries(reply.why).flatMap(([id, text]) =>
      checkBreachFixCopy("why", text, opts).map((p) => `${id} ${p}`),
    ),
  ];
}

async function generate(ctx, ids) {
  let last = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const reply = parseBreachFixReply(await callClaude(apiKey, breachFixPrompt(ctx)), ids);
      last = problemsOf(ctx, reply);
      if (last.length === 0) return reply;
    } catch (error) {
      last = [String(error.message ?? error)];
    }
    console.error(`  retry ${breachFixKey(ctx)}: ${last.join("; ")}`);
  }
  throw new Error(`${breachFixKey(ctx)} failed 3 times: ${last.join("; ")}`);
}

const entries = {};
let reused = 0;
let generated = 0;
for (const { externalId, incidentId } of seedAndFireAll()) {
  const contexts = run("ai:breachFixContexts", { incidentId });
  await Promise.all(
    contexts.map(async (ctx) => {
      const key = breachFixKey(ctx);
      const facts = breachFixFactsKey(ctx);
      const ids = planBreachFix(ctx).map((r) => r.id);
      const cached = existing.entries?.[key];
      if (!regenerate && cached && cached.facts === facts) {
        const problems = problemsOf(ctx, cached);
        if (problems.length === 0) {
          entries[key] = cached;
          reused++;
          return;
        }
        console.error(`  regenerating ${key}: cached text fails current rules (${problems.join("; ")})`);
      }
      const reply = await generate(ctx, ids);
      entries[key] = { facts, summary: reply.summary, why: reply.why };
      generated++;
    }),
  );
  console.error(`${externalId}: ${contexts.length} companies`);
}

const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(
  cachePath,
  JSON.stringify(
    {
      generatedAt: generated > 0 || !existing.generatedAt ? new Date().toISOString() : existing.generatedAt,
      model: MODEL,
      entries: sorted,
    },
    null,
    2,
  ) + "\n",
);
console.log(`Wrote ${reused + generated} fix plans to data/ai_breach_fix.json (${reused} reused, ${generated} generated)`);
