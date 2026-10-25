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
import { ConvexError, v } from "convex/values";
import { env, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import cacheFile from "../data/ai_cache.json";
// Stop-loss advice (section at the bottom).
import { internalQuery, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getViewer } from "./access";
import { DAY_MS, MAX_FANOUT } from "./shared";
import { responseFor } from "./scoring";
import stopLossCacheFile from "../data/ai_stop_loss.json";
import {
  BANK_CHANGE_WINDOW_DAYS,
  companyBrief,
  companyReadiness,
  portfolioBrief,
  type StopLossCache,
  type StopLossCompany,
  type StopLossLink,
} from "../prompts/stopLoss";
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

// ---- Stop-loss advice: the controls each company sets up before a breach ----
// Rules in prompts/stopLoss.ts pick the recommendations from the rows below; the summary on top
// comes from data/ai_stop_loss.json (pre-generated by prompts/generateStopLoss.mjs) when its
// facts still match, else canned text. A query never calls a model.

const stopLossCache = stopLossCacheFile as StopLossCache;

type CompanyId = Id<"companies">;

// Match the incident fan-out: the strongest relationship wins, with confirmed evidence
// breaking ties. Insertion order must not hide a later shared-login relationship.
function stopLossLinkRank(link: Doc<"links">): number {
  const share = { shared_credential: 3, shared_admin_access: 2, same_vendor_only: 1 }[link.shareType];
  return share * 2 + (link.source === "self_reported" ? 1 : 0);
}

function validateAdviceTime(asOf: number): void {
  if (!Number.isSafeInteger(asOf) || asOf < 0)
    throw new ConvexError("asOf must be a nonnegative safe integer timestamp.");
}

// What the rules read, for every company or only one. links has no company index, so links are
// read per asset, which also gives how many sister companies sit on each asset.
async function stopLossInputs(
  ctx: QueryCtx,
  asOf: number,
  onlyCompanyId: CompanyId | null,
): Promise<{ companies: StopLossCompany<CompanyId>[]; nextReviewAt: number | null }> {
  validateAdviceTime(asOf);
  // Names are internal validation context for generated copy; they are never returned in
  // another company's brief. The sentinel also prevents partial rollups claiming completeness.
  const companyRows = await ctx.db.query("companies").take(MAX_FANOUT + 1);
  const companyNamesForValidation = companyRows.slice(0, MAX_FANOUT).map(c => c.name);
  const companies = onlyCompanyId
    ? [await ctx.db.get("companies", onlyCompanyId)].filter((c) => c !== null)
    : companyRows.slice(0, MAX_FANOUT);
  const wanted = new Set(companies.map((c) => c._id));
  const linksOf = new Map<CompanyId, StopLossLink[]>();
  const incomplete = new Set<CompanyId>();
  let globallyComplete = companyRows.length <= MAX_FANOUT;
  let nextReviewAt: number | null = null;
  const assetRows = await ctx.db.query("assets").take(MAX_FANOUT + 1);
  if (assetRows.length > MAX_FANOUT) globallyComplete = false;

  for (const asset of assetRows.slice(0, MAX_FANOUT)) {
    const linkRows = await ctx.db
      .query("links")
      .withIndex("by_assetId", (q) => q.eq("assetId", asset._id))
      .take(MAX_FANOUT + 1);
    // An omitted link might belong to any selected company, including one absent from this page.
    if (linkRows.length > MAX_FANOUT) globallyComplete = false;
    const strongest = new Map<CompanyId, Doc<"links">>();
    for (const link of linkRows.slice(0, MAX_FANOUT)) {
      const prior = strongest.get(link.companyId);
      if (!prior || stopLossLinkRank(link) > stopLossLinkRank(prior)) strongest.set(link.companyId, link);
    }
    const links = [...strongest.values()];
    if (!links.some((l) => wanted.has(l.companyId))) continue;
    const markAssetIncomplete = () => {
      for (const link of links) if (wanted.has(link.companyId)) incomplete.add(link.companyId);
    };
    const onAsset = new Set(links.map((l) => l.companyId));
    // Unpaid = pending or held: a hold doesn't change what the stop-losses should be, so the
    // advice (and its cached summary) stays the same after an incident fires.
    const pending: Doc<"payments">[] = [];
    for (const status of ["pending", "held"] as const) {
      const rows = await ctx.db.query("payments")
        .withIndex("by_assetId_and_status", (q) => q.eq("assetId", asset._id).eq("status", status))
        .take(MAX_FANOUT + 1);
      if (rows.length > MAX_FANOUT) markAssetIncomplete();
      pending.push(...rows.slice(0, MAX_FANOUT));
    }
    const changeRows = await ctx.db
      .query("bankDetailChanges")
      .withIndex("by_assetId_and_changedAt", (q) =>
        q
          .eq("assetId", asset._id)
          .gte("changedAt", asOf - BANK_CHANGE_WINDOW_DAYS * DAY_MS),
      )
      .order("desc")
      .take(MAX_FANOUT + 1);
    if (changeRows.length > MAX_FANOUT) markAssetIncomplete();
    const changes = changeRows.slice(0, MAX_FANOUT);
    // asOf anchors the aging cutoff, not a frozen upper bound on live rows. New changes
    // therefore appear on subscription updates; the client refreshes at the first expiry.
    for (const change of changes) {
      const expiresAt = change.changedAt + BANK_CHANGE_WINDOW_DAYS * DAY_MS + 1;
      if (Number.isSafeInteger(expiresAt) && expiresAt > asOf)
        nextReviewAt = nextReviewAt === null ? expiresAt : Math.min(nextReviewAt, expiresAt);
    }
    const emailChanged = [
      ...new Set(
        changes
          .filter((c) => c.requestChannel === "email")
          .map((c) => c.accountLast4),
      ),
    ];
    const sharing = new Set(
      links
        .filter((l) => l.source === "self_reported" && l.shareType !== "same_vendor_only")
        .map((l) => l.companyId),
    );

    for (const link of links) {
      if (!wanted.has(link.companyId)) continue;
      const own = pending.filter((p) => p.companyId === link.companyId);
      const toChanged = own.filter((p) => emailChanged.includes(p.accountLast4));
      const sum = (rows: typeof own) =>
        rows.reduce((total, p) => total + p.amountCents, 0);
      const list = linksOf.get(link.companyId) ?? [];
      list.push({
        assetName: asset.name,
        vendorName: asset.vendorName,
        assetKind: asset.kind,
        phoneOnFile: asset.phoneOnFile,
        shareType: link.shareType,
        source: link.source,
        responseCaps: responseFor(link, asset),
        otherCompaniesOnAsset: onAsset.size - 1,
        otherCompaniesSharingLogin:
          link.source !== "self_reported" || link.shareType === "same_vendor_only"
            ? 0
            : sharing.size - (sharing.has(link.companyId) ? 1 : 0),
        pendingCents: sum(own),
        emailChangedAccounts: emailChanged,
        pendingToChangedAccountsCents: sum(toChanged),
        pendingChangedAccounts: [...new Set(toChanged.map((p) => p.accountLast4))],
      });
      linksOf.set(link.companyId, list);
    }
  }

  const out: StopLossCompany<CompanyId>[] = [];
  for (const company of companies) {
    const users = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
      .take(MAX_FANOUT + 1);
    if (users.length > MAX_FANOUT) incomplete.add(company._id);
    const mode = async (action: "pause_shared_login" | "revoke_vendor_tokens") =>
      (
        await ctx.db
          .query("responsePolicies")
          .withIndex("by_companyId_and_action", (q) =>
            q.eq("companyId", company._id).eq("action", action),
          )
          .unique()
      )?.mode ?? "notify";
    out.push({
      companyId: company._id,
      companyName: company.name,
      holdRuleEnabled: company.holdRuleEnabled,
      hasItLead: users.slice(0, MAX_FANOUT).some((u) => u.role === "it"),
      evidenceComplete: globallyComplete && !incomplete.has(company._id),
      companyNamesForValidation,
      playbook: {
        pause_shared_login: await mode("pause_shared_login"),
        revoke_vendor_tokens: await mode("revoke_vendor_tokens"),
      },
      links: (linksOf.get(company._id) ?? []).sort((a, b) =>
        a.assetName.localeCompare(b.assetName),
      ),
    });
  }
  return { companies: out.sort((a, b) => a.companyName.localeCompare(b.companyName)), nextReviewAt };
}

// The viewer's stop-loss advice. A company sees only its own brief; the PE firm sees the
// portfolio rollup plus every company's. `asOf` is the aging cutoff anchor; nextReviewAt
// tells the client when to advance it. New database writes remain visible between expiries.
export const getStopLossAdvice = query({
  args: { asOf: v.number() },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const { companies: inputs, nextReviewAt } = await stopLossInputs(
      ctx,
      args.asOf,
      viewer.firm ? null : viewer.companyId,
    );
    return {
      portfolio: viewer.firm ? portfolioBrief(inputs, stopLossCache) : null,
      companies: inputs.map((c) => companyBrief(c, stopLossCache)),
      readiness: inputs.map((c) => companyReadiness(c)),
      nextReviewAt,
    };
  },
});

// Every company's rule inputs, for prompts/generateStopLoss.mjs (npx convex run, dev only).
export const stopLossContexts = internalQuery({
  args: { asOf: v.number() },
  handler: async (ctx, args) => (await stopLossInputs(ctx, args.asOf, null)).companies,
});
