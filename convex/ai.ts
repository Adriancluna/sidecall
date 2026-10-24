// Role 4: the AI writers. Each action runs once per incident, loops over its items, and
// writes them in one internal.alerts.saveAlerts call. Text comes from, in order:
//   1. data/ai_cache.json, pre-generated off stage (prompts/generate.mjs), used only when the
//      facts it was written from still match, so nothing on stage needs the network;
//   2. a live model call, only when AI_LIVE=true and ANTHROPIC_API_KEY are set and the text
//      passes the copy rules;
//   3. the canned text below.
// Rules for every text live in prompts/writing.ts: never name the reporting company; hold
// notices say "held until verified", never "fraud", and point to the number on file.
import { v } from "convex/values";
import { env, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import cacheFile from "../data/ai_cache.json";
import {
  alertKey,
  callClaude,
  checkCopy,
  companyAlertFacts,
  companyAlertPrompt,
  dollars,
  factsKey,
  holdKey,
  holdNoticeFacts,
  holdNoticePrompt,
  letterKey,
  vendorLetterFacts,
  vendorLetterPrompt,
  type AiCache,
  type Kind,
} from "../prompts/writing";

const cache = cacheFile as AiCache;

async function write(args: {
  kind: Kind;
  key: string;
  facts: object;
  prompt: () => string;
  check: (text: string) => string[];
  canned: string;
}): Promise<string> {
  const cached = cache.entries[args.key];
  if (cached && cached.facts === factsKey(args.facts)) return cached.body;

  const apiKey = env.ANTHROPIC_API_KEY;
  if (env.AI_LIVE === "true" && apiKey) {
    try {
      const text = await callClaude(apiKey, args.prompt());
      const problems = args.check(text);
      if (problems.length === 0) return text;
      console.warn(
        `ai: ${args.key} failed copy rules (${problems.join("; ")}); using canned text`,
      );
    } catch (error) {
      console.warn(
        `ai: ${args.key} live call failed; using canned text`,
        error,
      );
    }
  }
  return args.canned;
}

// Live calls run a few at a time; cached and canned text return immediately.
async function mapLimited<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return out;
}

export const generateAlert = internalAction({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.alerts.getWritingContext, args);
    if (!context) return null;
    const alerts = await mapLimited(context.companyAlerts, 5, async (item) => {
      const opener =
        item.urgency === "urgent"
          ? `Urgent: act today.`
          : `Advisory: review this week.`;
      const body = await write({
        kind: "company_alert",
        key: alertKey(context.externalId, item),
        facts: companyAlertFacts(context, item),
        prompt: () => companyAlertPrompt(context, item),
        check: (text) =>
          checkCopy("company_alert", text, {
            phoneOnFile: context.asset.phoneOnFile,
            urgency: item.urgency,
            otherCompanies: context.companyAlerts
              .map((a) => a.companyName)
              .filter((name) => name !== item.companyName),
          }),
        canned: `${opener} ${context.asset.vendorName} (${context.asset.name}) is under an active security incident. ${item.reasons.join(" ")} Rotate any credentials you share with ${context.asset.vendorName} and review recent access.`,
      });
      return {
        incidentId: args.incidentId,
        exposureId: item.exposureId,
        companyId: item.companyId,
        kind: "company_alert" as const,
        body,
      };
    });
    // One transaction for every company, so all alerts land at once.
    await ctx.runMutation(internal.alerts.saveAlerts, { alerts });
    return null;
  },
});

export const generateVendorLetter = internalAction({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.alerts.getWritingContext, args);
    if (!context) return null;
    const body = await write({
      kind: "vendor_letter",
      key: letterKey(context.externalId),
      facts: vendorLetterFacts(context),
      prompt: () => vendorLetterPrompt(context),
      check: (text) =>
        checkCopy("vendor_letter", text, {
          phoneOnFile: context.asset.phoneOnFile,
          otherCompanies: context.companyAlerts.map((a) => a.companyName),
        }),
      canned: `To ${context.asset.vendorName}: several companies in our portfolio rely on ${context.asset.name}. Please confirm the scope of the incident, rotate every shared and admin credential across all of our accounts at once, and confirm your bank details by phone. Any bank-detail change requested by email in the last 30 days is on hold until verified.`,
    });
    await ctx.runMutation(internal.alerts.saveAlert, {
      incidentId: args.incidentId,
      kind: "vendor_letter",
      body,
    });
    return null;
  },
});

export const generateHoldNotice = internalAction({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.alerts.getWritingContext, args);
    if (!context) return null;
    const notices = await mapLimited(context.heldPayments, 5, async (p) => {
      const flag = p.bankChangeFlag
        ? ` The account ending ${p.accountLast4} was added recently.`
        : "";
      const body = await write({
        kind: "hold_notice",
        key: holdKey(context.externalId, p),
        facts: holdNoticeFacts(context, p),
        prompt: () => holdNoticePrompt(context, p),
        check: (text) =>
          checkCopy("hold_notice", text, {
            phoneOnFile: context.asset.phoneOnFile,
            otherCompanies: [...context.companyAlerts, ...context.heldPayments]
              .map((x) => x.companyName)
              .filter((name) => name !== p.companyName),
          }),
        canned: `Your ${dollars(p.amountCents)} payment to ${context.asset.vendorName} is held until verified.${flag} Call ${context.asset.vendorName} at the number on file, ${context.asset.phoneOnFile}, not a number from a recent email. A controller other than the requester can then release or reject it.`,
      });
      return {
        incidentId: args.incidentId,
        companyId: p.companyId,
        paymentId: p.paymentId,
        kind: "hold_notice" as const,
        body,
      };
    });
    await ctx.runMutation(internal.alerts.saveAlerts, { alerts: notices });
    return null;
  },
});
