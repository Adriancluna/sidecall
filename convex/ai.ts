// Role 4: the AI writers. Each action runs once per incident, loops over its items, and
// writes them in one internal.alerts.saveAlerts call. Text comes from, in order:
//   1. data/ai_cache.json, pre-generated off stage (prompts/generate.mjs), used only when the
//      facts it was written from still match, so nothing on stage needs the network;
//   2. a live model call, only when AI_LIVE=true and ANTHROPIC_API_KEY are set and the text
//      passes the copy rules;
//   3. the canned text below.
// Rules for every text live in prompts/writing.ts: never name the reporting company; hold
// notices say "held until verified", never "fraud", and point to the number on file. With a
// red-team finding, a sister company's alert carries the sister-safe path sentence and the
// concrete check ("validated" only ever next to "not tested"), and the vendor letter names the
// technique; the facts behind the three older scenarios are unchanged, so their cache still hits.
import { v } from "convex/values";
import { env, internalAction, internalQuery, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { canSeeCompany, getViewer } from "./access";
import { MAX_FANOUT } from "./shared";
import cacheFile from "../data/ai_cache.json";
import breachFixCacheFile from "../data/ai_breach_fix.json";
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
  techniqueLabel,
  vendorLetterFacts,
  vendorLetterPrompt,
  type AiCache,
  type Kind,
} from "../prompts/writing";
import {
  breachFixBrief,
  type BreachFixCache,
  type FixContext,
  type FixLive,
} from "../prompts/breachFix";

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
    const finding = context.technique !== null;
    const alerts = await mapLimited(context.companyAlerts, 5, async (item) => {
      const opener =
        item.urgency === "urgent"
          ? `Urgent: act today.`
          : `Advisory: review this week.`;
      // With a finding: the sister-safe path sentence, then the concrete check, which replaces
      // the generic "rotate and review" line because it already says what to do.
      const path = item.pathSummary ? ` ${item.pathSummary}` : "";
      const nextStep = item.whatToCheck
        ? ` ${item.whatToCheck}`
        : ` Rotate any credentials you share with ${context.asset.vendorName} and review recent access.`;
      const body = await write({
        kind: "company_alert",
        key: alertKey(context.externalId, item),
        facts: companyAlertFacts(context, item),
        prompt: () => companyAlertPrompt(context, item),
        check: (text) =>
          checkCopy("company_alert", text, {
            phoneOnFile: context.asset.phoneOnFile,
            urgency: item.urgency,
            finding,
            readerName: item.companyName,
            otherCompanies: context.companyAlerts
              .map((a) => a.companyName)
              .filter((name) => name !== item.companyName),
          }),
        canned: `${opener} ${context.asset.vendorName} (${context.asset.name}) is under an active security incident. ${item.reasons.join(" ")}${path}${nextStep}`,
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
    const { asset, technique } = context;
    // Spec A4: with a finding, name the technique and ask for tenant-wide rotation, isolation
    // and logs; without one, the plain coordinated-rotation ask.
    const tested = technique
      ? ` An authorized test validated use of ${techniqueLabel(technique)} against ${asset.name} held by a Northpass portfolio company.`
      : "";
    const asks = technique
      ? "rotate every admin credential issued to Northpass portfolio tenants, confirm tenant isolation, send 30 days of admin-console access logs"
      : "rotate every shared and admin credential across all of our accounts at once";
    // Say payments are held only when some are: the credential scenarios hold nothing.
    const flagged = context.heldPayments.some((p) => p.bankChangeFlag);
    const money =
      context.heldPayments.length > 0
        ? ` Pending payments to you are held until verified${flagged ? ", and any bank-detail change requested by email in the last 30 days is treated as unverified" : ""}. We will call the number on file, ${asset.phoneOnFile}, not a number from a recent email.`
        : ` Before paying you, our companies will confirm remittance details by calling the number on file, ${asset.phoneOnFile}, not a number from a recent email.`;
    const body = await write({
      kind: "vendor_letter",
      key: letterKey(context.externalId),
      facts: vendorLetterFacts(context),
      prompt: () => vendorLetterPrompt(context),
      check: (text) =>
        checkCopy("vendor_letter", text, {
          phoneOnFile: asset.phoneOnFile,
          finding: technique !== null,
          otherCompanies: context.companyAlerts.map((a) => a.companyName),
        }),
      canned: `To ${asset.vendorName}: several companies in our portfolio rely on ${asset.name}.${tested} Please confirm the scope of the incident, ${asks}, and confirm your bank details by phone.${money}`,
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

// ---- Breach fix advice (prompts/breachFix.ts): what one exposed company should do now ----
// Read-only and UI-ready, not mounted yet (src/ai/fixPlan/README.md). Rules pick the steps; the
// text comes from data/ai_breach_fix.json (pre-generated by prompts/generateBreachFix.mjs), else
// canned. Queries never call the model. Nothing here reads who reported the incident.

const breachFixCache = breachFixCacheFile as BreachFixCache;

const RESPONSE_ACTIONS = ["pause_shared_login", "revoke_vendor_tokens"] as const;

// Strongest link first, the same order the response playbook uses.
function linkRank(link: Doc<"links">): number {
  const share = { shared_credential: 3, shared_admin_access: 2, same_vendor_only: 1 }[link.shareType];
  return share * 2 + (link.source === "self_reported" ? 1 : 0);
}

async function loadBreachFix(
  ctx: QueryCtx,
  exposure: Doc<"exposures">,
): Promise<{ context: FixContext; live: FixLive } | null> {
  const incident = await ctx.db.get("incidents", exposure.incidentId);
  if (!incident) return null;
  const [asset, company] = await Promise.all([
    ctx.db.get("assets", incident.assetId),
    ctx.db.get("companies", exposure.companyId),
  ]);
  if (!asset || !company) return null;
  const [links, held, steps] = await Promise.all([
    ctx.db.query("links").withIndex("by_assetId", (q) => q.eq("assetId", asset._id)).take(MAX_FANOUT),
    ctx.db
      .query("payments")
      .withIndex("by_heldByIncidentId", (q) => q.eq("heldByIncidentId", incident._id))
      .take(MAX_FANOUT),
    Promise.all(
      RESPONSE_ACTIONS.map((action) =>
        ctx.db
          .query("responseSteps")
          .withIndex("by_incidentId_and_companyId_and_action", (q) =>
            q.eq("incidentId", incident._id).eq("companyId", exposure.companyId).eq("action", action),
          )
          .unique(),
      ),
    ),
  ]);
  const link = links.filter((l) => l.companyId === exposure.companyId).sort((a, b) => linkRank(b) - linkRank(a))[0];
  const payments = held.filter((p) => p.companyId === exposure.companyId);
  const planned = steps.filter((s): s is Doc<"responseSteps"> => s !== null);
  return {
    context: {
      externalId: incident.externalId,
      companyName: company.name,
      urgency: exposure.urgency,
      asset: { name: asset.name, vendorName: asset.vendorName, kind: asset.kind, phoneOnFile: asset.phoneOnFile },
      shareType: link?.shareType ?? null,
      // Same threshold as the company alert's "candidate link".
      candidateLink: link?.source === "dns_inferred" || exposure.confidence < 0.75,
      finding: incident.finding !== undefined,
      whatToCheck: exposure.path?.whatToCheck ?? null,
      heldPayments: payments.map((p) => ({
        amountCents: p.amountCents,
        accountLast4: p.accountLast4,
        bankChangeFlag: p.bankChangeFlag ?? false,
      })),
      plannedSteps: planned.map((s) => ({ action: s.action, mode: s.mode })),
    },
    live: {
      acknowledged: exposure.status !== "open",
      closedByFirm: incident.containedAt !== undefined,
      steps: Object.fromEntries(planned.map((s) => [s.action, s.status])),
      undecidedPayments: payments.filter((p) => p.status === "held").length,
    },
  };
}

// One exposed company's fix plan. A company sees only its own; the firm sees any.
export const getBreachFixAdvice = query({
  args: { exposureId: v.id("exposures") },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const exposure = await ctx.db.get("exposures", args.exposureId);
    if (!exposure || !canSeeCompany(viewer, exposure.companyId)) return null;
    const loaded = await loadBreachFix(ctx, exposure);
    if (!loaded) return null;
    return breachFixBrief(loaded.context, loaded.live, exposure.companyId, breachFixCache);
  },
});

// Every exposed company's fix context for one incident: prompts/generateBreachFix.mjs reads it.
export const breachFixContexts = internalQuery({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, args) => {
    const exposures = await ctx.db
      .query("exposures")
      .withIndex("by_incidentId_and_companyId", (q) => q.eq("incidentId", args.incidentId))
      .take(MAX_FANOUT);
    const loaded = await Promise.all(exposures.map((e) => loadBreachFix(ctx, e)));
    return loaded.flatMap((l) => (l ? [l.context] : []));
  },
});
