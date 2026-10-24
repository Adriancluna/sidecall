// Role 4: stop-loss recommendations, the controls a portfolio company sets up before a breach so
// one shared vendor's incident costs less. Shared by convex/ai.ts (getStopLossAdvice) and
// prompts/generateStopLoss.mjs (pre-generates data/ai_stop_loss.json off stage).
// Explicit .ts imports keep this runnable in Node and in the Convex bundler.
//
// Fixed rules pick every recommendation from backend rows (links, playbook modes, hold rule,
// pending payments, bank-detail changes). The AI writes only the summary at the top of each list.

import type { AdviceBrief, PlaybookMode, Recommendation } from "./advice.ts";
import { checkAdvice } from "./advice.ts";

// Same order as advice.ts PRIORITY_RANK.
const PRIORITY_RANK: Record<Recommendation["priority"], number> = {
  now: 0,
  soon: 1,
  later: 2,
};

// One linked asset as the rules see it, for one company.
export type StopLossLink = {
  assetName: string;
  vendorName: string;
  assetKind: string; // msp | idp | payroll | email | other
  phoneOnFile: string;
  shareType: "shared_credential" | "shared_admin_access" | "same_vendor_only";
  source: "self_reported" | "dns_inferred";
  otherCompaniesOnAsset: number; // sister companies linked to the same asset in any way (count only)
  otherCompaniesSharingLogin: number; // of those, the ones sharing the login or admin access too
  pendingCents: number; // this company's pending payments to the asset
  // Accounts (last 4) the asset's bank details were changed to by an email request in the last
  // 90 days, newest first. Empty when there is none.
  emailChangedAccounts: string[];
  pendingToChangedAccountsCents: number; // this company's pending payments to one of those accounts
  pendingChangedAccounts: string[]; // which of those accounts those payments go to
  // Resolved by the same responseFor function that plans incident actions; never chosen by AI.
  responseCaps?: { action: "pause_shared_login" | "revoke_vendor_tokens"; cap: PlaybookMode; capNote?: string }[];
};

export type StopLossCompany<CompanyId = string> = {
  companyId: CompanyId;
  companyName: string;
  holdRuleEnabled: boolean;
  hasItLead: boolean;
  playbook: { pause_shared_login: PlaybookMode; revoke_vendor_tokens: PlaybookMode };
  links: StopLossLink[];
  evidenceComplete?: boolean;
  // Internal validation context only; never included in facts, readiness, or a company response.
  companyNamesForValidation?: string[];
};

export type StopLossCacheEntry = { facts: string; body: string };
export type StopLossCache = {
  generatedAt: string | null;
  model: string | null;
  entries: Record<string, StopLossCacheEntry>;
};

// Stop-loss advice is read before any breach, so the window for "recent" bank changes is wider
// than the 30-day hold flag.
export const BANK_CHANGE_WINDOW_DAYS = 90;

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;
const shared = (n: number) =>
  n === 1 ? "1 other portfolio company" : `${n} other portfolio companies`;
const names = (list: string[]) =>
  list.length <= 2
    ? list.join(" and ")
    : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
const isShared = (l: StopLossLink) => l.source === "self_reported" && l.shareType !== "same_vendor_only";
const canPrepare = (l: StopLossLink, action: "pause_shared_login" | "revoke_vendor_tokens") =>
  isShared(l) && (l.responseCaps === undefined || l.responseCaps.some(r => r.action === action && r.cap !== "notify"));
// Connected-app (OAuth) grants worth a prepared revoke: identity, email and payroll vendors reach
// accounts and people data. An MSP works through admin access instead, and "other" (ERP, e-sign,
// device management) stays off the list so the advice doesn't flag every app a company uses.
const TOKEN_KINDS = new Set(["idp", "email", "payroll"]);

// Money waiting on vendors this company shares with a sister company: what a shared-vendor
// breach would put at risk first.
export const pendingSharedCents = (c: StopLossCompany<unknown>) =>
  c.links
    .filter((l) => l.otherCompaniesOnAsset > 0)
    .reduce((sum, l) => sum + l.pendingCents, 0);

const RULE_ORDER = [
  "verify_bank_change",
  "hold_payments",
  "separate_credentials",
  "pause_shared_login",
  "revoke_vendor_tokens",
  "name_it_contact",
  "confirm_candidate_link",
];

// The rules. Each recommendation is about one company and, where it says so, one asset.
export function stopLossRecommendations(
  c: StopLossCompany<unknown>,
): Recommendation[] {
  const recs: (Recommendation & { cents: number })[] = [];
  const itOwner = c.hasItLead ? "it" : "controller";
  const sharedPending = pendingSharedCents(c);

  if (!c.holdRuleEnabled && c.links.length > 0) {
    recs.push({
      id: "hold_payments",
      title: "Turn on payment holds",
      why:
        sharedPending > 0
          ? `Payment holds are off, and ${usd(sharedPending)} is pending to vendors you share with other portfolio companies.`
          : "Payment holds are off, so a payment to a breached vendor would go out before anyone checks it.",
      steps: [
        "In your Response playbook, set Hold payments to Pre-approved.",
        "When a shared vendor reports an incident, every pending payment to it waits until a controller who didn't request it verifies by phone.",
        "Nothing is cancelled: a person releases or rejects each held payment, and every decision is logged.",
      ],
      priority: sharedPending > 0 ? "now" : "soon",
      owner: "controller",
      playbookAction: "hold_payments",
      recommendedMode: "act",
      phase: "secure",
      status: "todo",
      cents: sharedPending,
    });
  }

  for (const l of c.links) {
    if (l.emailChangedAccounts.length === 0 || l.pendingCents === 0) continue;
    const toChanged = l.pendingToChangedAccountsCents;
    const accounts = `${l.pendingChangedAccounts.length === 1 ? "account" : "accounts"} ending ${names(l.pendingChangedAccounts)}`;
    recs.push({
      id: `verify_bank_change:${l.assetName}`,
      title: `Verify ${l.vendorName}'s new bank details by phone`,
      why:
        toChanged > 0
          ? `${l.vendorName}'s bank details were changed by an email request, and ${usd(toChanged)} of your pending payments go to the ${accounts}.`
          : `${l.vendorName}'s bank details were changed by an email request recently, and you have ${usd(l.pendingCents)} pending to them.`,
      steps: [
        `Call ${l.vendorName} at the number on file, ${l.phoneOnFile}, not a number from the email that asked for the change.`,
        toChanged > 0
          ? `Have someone other than the requester confirm the ${accounts} before the next payment.`
          : `Before the next payment, confirm on that call which account is current: an email asked to move payments to the account ending ${l.emailChangedAccounts[0]}.`,
        "Write down who you spoke to in the payment's verification note.",
      ],
      priority: toChanged > 0 ? "now" : "soon",
      owner: "controller",
      playbookAction: null,
      recommendedMode: null,
      phase: "verify",
      status: "todo",
      cents: toChanged || l.pendingCents,
    });
  }

  const sharedLogins = c.links.filter((l) => canPrepare(l, "pause_shared_login"));
  if (sharedLogins.length > 0 && c.playbook.pause_shared_login === "notify") {
    const urgent = sharedLogins.some(
      (l) =>
        l.shareType === "shared_admin_access" ||
        l.assetKind === "msp" ||
        l.assetKind === "idp",
    );
    recs.push({
      id: "pause_shared_login",
      title: "Prepare a one-click pause for shared logins",
      why: `You share a login or admin access through ${names(sharedLogins.map((l) => l.assetName))}, and pausing it today would wait for someone to find the right console.`,
      steps: [
        "In your Response playbook, set Pause the shared login to One click.",
        "When a vendor you share a login with reports an incident, your IT lead gets the pause ready to run in one click, with Undo.",
        "Sidecall would suspend the login in your own tenant (simulated in this demo); nothing is deleted.",
      ],
      priority: urgent ? "now" : "soon",
      owner: itOwner,
      playbookAction: "pause_shared_login",
      recommendedMode: "prepare",
      phase: "secure",
      status: "todo",
      cents: 0,
    });
  }

  const tokenLinks = c.links.filter(
    (l) => canPrepare(l, "revoke_vendor_tokens") && TOKEN_KINDS.has(l.assetKind),
  );
  if (tokenLinks.length > 0 && c.playbook.revoke_vendor_tokens === "notify") {
    recs.push({
      id: "revoke_vendor_tokens",
      title: "Prepare to revoke vendor app tokens",
      why: `${names(tokenLinks.map((l) => l.vendorName))} can hold connected-app access to your systems, which a stolen token can reuse.`,
      steps: [
        "In your Response playbook, set Revoke the vendor's app tokens to One click.",
        "When one of these vendors reports an incident, the revoke is ready to run in one click; the vendor re-authorises afterwards.",
      ],
      priority: "soon",
      owner: itOwner,
      playbookAction: "revoke_vendor_tokens",
      recommendedMode: "prepare",
      phase: "secure",
      status: "todo",
      cents: 0,
    });
  }

  for (const l of sharedLogins) {
    if (l.otherCompaniesSharingLogin === 0) continue;
    const admin = l.shareType === "shared_admin_access";
    recs.push({
      id: `separate_credentials:${l.assetName}`,
      title: admin
        ? `Get a separate admin account on ${l.assetName}`
        : `Replace the shared login on ${l.assetName}`,
      why: `${l.assetName} uses ${admin ? "admin access" : "a login"} shared with ${shared(l.otherCompaniesSharingLogin)}, so one stolen password reaches all of you.`,
      steps: [
        admin
          ? `Ask ${l.vendorName} for an admin account used only for your company, with MFA, and a log of every admin session.`
          : `Ask ${l.vendorName} for a named account for each person at your company, with MFA.`,
        "Retire the shared login once the new accounts work.",
        "Tell the portfolio team, so Sidecall records the credential as separate and stops alerting you for the shared one.",
      ],
      priority: "now",
      owner: itOwner,
      playbookAction: null,
      recommendedMode: null,
      phase: "secure",
      status: "todo",
      cents: l.pendingCents,
    });
  }

  if (!c.hasItLead && sharedLogins.length > 0) {
    recs.push({
      id: "name_it_contact",
      title: "Name an IT contact for shared-login alerts",
      why: "No IT lead is on file, so pausing a shared login would fall to the controller.",
      steps: [
        "Add the person who manages your vendor logins as your IT lead.",
        "Until then, the controller receives login steps as well as payment steps.",
      ],
      priority: "soon",
      owner: "controller",
      playbookAction: null,
      recommendedMode: null,
      phase: "notify",
      status: "todo",
      cents: 0,
    });
  }

  for (const l of c.links) {
    if (l.source !== "dns_inferred") continue;
    recs.push({
      id: `confirm_candidate_link:${l.assetName}`,
      title: `Confirm how you use ${l.assetName}`,
      why: `Public DNS records suggest a candidate link to ${l.assetName}; nobody at your company has confirmed it or said how the login is shared.`,
      steps: [
        `Check with your team whether you still use ${l.assetName}, and whether the login is shared with anyone outside your company.`,
        "Tell the portfolio team how the login is shared, so alerts reach you only when they apply.",
      ],
      priority: "later",
      owner: itOwner,
      playbookAction: null,
      recommendedMode: null,
      phase: "verify",
      status: "todo",
      cents: 0,
    });
  }

  // Ties on priority and money go to the rule nearest the money: a payment already headed to an
  // email-changed account beats turning holds on.
  const rule = (id: string) => RULE_ORDER.indexOf(id.split(":")[0]);
  return recs
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        b.cents - a.cents ||
        rule(a.id) - rule(b.id) ||
        a.id.localeCompare(b.id),
    )
    .map(({ cents: _cents, ...rec }) => rec);
}

// ---- the portfolio rollup (PE firm view only, so it may name companies) ----

const baseId = (id: string) => id.split(":")[0];
const assetOf = (id: string) => id.split(":").slice(1).join(":") || null;
const companiesWord = (n: number) => (n === 1 ? "1 company" : `${n} companies`);

// Portfolio-level wording per rule: the title, the gap in one clause after the company names, and
// what the firm asks for. The firm asks; each company adopts and runs its own steps.
const ROLLUP: Record<
  string,
  { title: (n: number, asset: string | null) => string; gap: string; ask: string }
> = {
  hold_payments: {
    title: (n) => `Ask ${companiesWord(n)} to turn on payment holds`,
    gap: "payment holds are off, so a payment to a breached vendor would go out before anyone checks it",
    ask: "Ask each controller to set Hold payments to Pre-approved in their Response playbook. The firm sees holds but never releases them.",
  },
  verify_bank_change: {
    title: (_, asset) => `Bank details changed by email on ${asset}`,
    gap: "pending payments to this vendor after its bank details were changed by an email request",
    ask: "Ask each controller to call the vendor at the number on file before the next payment.",
  },
  pause_shared_login: {
    title: (n) => `${companiesWord(n)} can't pause a shared login in one click`,
    gap: "a vendor login or admin access is shared, with no prepared pause",
    ask: "Ask each IT lead to set Pause the shared login to One click.",
  },
  revoke_vendor_tokens: {
    title: (n) => `${companiesWord(n)} can't revoke vendor app tokens in one click`,
    gap: "vendors with connected-app access, with no prepared revoke",
    ask: "Ask each IT lead to set Revoke the vendor's app tokens to One click.",
  },
  separate_credentials: {
    title: (n, asset) => `${n} companies share one login on ${asset}`,
    gap: "one shared login or admin access, so one stolen password reaches all of them",
    ask: "Ask the vendor for a separate account per company, with MFA, and retire the shared login.",
  },
  name_it_contact: {
    title: (n) => `${companiesWord(n)} ${n === 1 ? "has" : "have"} no IT lead on file`,
    gap: "vendor logins are shared but no IT lead is on file",
    ask: "Ask each company to name the person who manages its vendor logins.",
  },
  confirm_candidate_link: {
    title: (_, asset) => `Confirm candidate links to ${asset}`,
    gap: "a candidate link from public DNS records that nobody has confirmed",
    ask: "Ask each company whether it still uses this vendor and how the login is shared.",
  },
};

export function portfolioRecommendations(
  companies: StopLossCompany<unknown>[],
): Recommendation[] {
  const groups = new Map<
    string,
    { recs: Recommendation[]; who: string[]; cents: number }
  >();
  for (const c of companies) {
    for (const r of stopLossRecommendations(c)) {
      const g = groups.get(r.id) ?? { recs: [], who: [], cents: 0 };
      g.recs.push(r);
      g.who.push(c.companyName);
      if (r.id === "hold_payments") g.cents += pendingSharedCents(c);
      groups.set(r.id, g);
    }
  }
  const out: Recommendation[] = [];
  for (const [id, g] of groups) {
    const base = baseId(id);
    // A login is "shared" across the portfolio only when two or more companies hold it.
    if (base === "separate_credentials" && g.who.length < 2) continue;
    const rule = ROLLUP[base];
    const top = g.recs.reduce((a, b) =>
      PRIORITY_RANK[b.priority] < PRIORITY_RANK[a.priority] ? b : a,
    );
    const money = g.cents > 0 ? `, with ${usd(g.cents)} pending to shared vendors` : "";
    out.push({
      id: `portfolio:${id}`,
      title: rule.title(g.who.length, assetOf(id)),
      why: `${names([...g.who].sort())}: ${rule.gap}${money}.`,
      steps: [rule.ask],
      priority: top.priority,
      owner: "firm",
      playbookAction: top.playbookAction,
      recommendedMode: top.recommendedMode,
      phase: top.phase,
      status: "todo",
    });
  }
  return out.sort(
    (a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      a.id.localeCompare(b.id),
  );
}

// ---- the AI-written summary: cache keys, facts, prompts, canned text ----

export const companyKey = (companyName: string) => `stop_loss|${companyName}`;
export const PORTFOLIO_KEY = "stop_loss|portfolio";

// The facts a summary was written from. A cached summary is used only when these still match.
export function companyFacts(c: StopLossCompany<unknown>) {
  return {
    companyName: c.companyName,
    paymentHoldsOn: c.holdRuleEnabled,
    pendingToSharedVendors: usd(pendingSharedCents(c)),
    recommendations: stopLossRecommendations(c).map((r) => ({
      title: r.title,
      why: r.why,
      priority: r.priority,
    })),
  };
}

export function portfolioFacts(companies: StopLossCompany<unknown>[]) {
  return {
    companies: companies.length,
    paymentHoldsOff: companies.filter((c) => !c.holdRuleEnabled).length,
    recommendations: portfolioRecommendations(companies).map((r) => ({
      title: r.title,
      why: r.why,
      priority: r.priority,
    })),
  };
}

export const factsKey = (facts: object) => JSON.stringify(facts);

const SHARED_RULES = `This is preparation before any breach, so no payment is held right now: never say a payment is held, released or waiting. Say instead what a step would do when a vendor reports an incident. Never promise the steps prevent or stop a breach, and don't add disclaimers about it either: say they limit how far one shared vendor's breach can reach and how much money can leave before a person checks. Don't say that no incident is open. Use only the facts given: never invent amounts, dates, day counts, names or phone numbers, and write no phone number at all. Never say fraud, scam, block or cancel. Plain text in one paragraph: no markdown, no lists, no headings, no line breaks. Write calmly, in short sentences.`;

export function companySummaryPrompt(c: StopLossCompany<unknown>): string {
  return `Write the short summary shown above one portfolio company's list of stop-loss recommendations in its own Sidecall view, read by its controller and IT lead.

Facts (JSON):
${JSON.stringify(companyFacts(c), null, 2)}

${SHARED_RULES} Never name any other portfolio company. Write 40 to 90 words addressed to "your team": say how many steps there are, which one to do first and why in one sentence, and what the rest protect. Return only the summary text.`;
}

export function portfolioSummaryPrompt(
  companies: StopLossCompany<unknown>[],
): string {
  return `Write the short summary shown above the PE firm's portfolio-wide list of stop-loss recommendations, read by the firm's operating partner. The firm can ask companies to adopt these steps but each company decides and runs them itself.

Facts (JSON):
${JSON.stringify(portfolioFacts(companies), null, 2)}

${SHARED_RULES} You may name portfolio companies that appear in the facts. Write 50 to 110 words: the biggest gap first, then the next two, then one sentence on what the firm should ask for this week. Return only the summary text.`;
}

// On top of advice.ts checkAdvice: stop-losses are read before any breach, so a summary that
// says a payment is held (or released) invents a hold; and a summary is one paragraph.
export function summaryProblems(text: string): string[] {
  const problems: string[] = [];
  if (
    /\b(is|are|stays?|remains?|being|been)\s+(held|released)\b|held until verified/i.test(
      text,
    )
  )
    problems.push("says a payment is held now");
  if (/\n/.test(text)) problems.push("more than one paragraph");
  return problems;
}

// Matching input facts do not make cached model output trustworthy. Recheck delivery too.
export function summaryForFactsProblems(text: string, facts: object, otherCompanies: string[] = [], maxChars = 1100): string[] {
  const problems = [...checkAdvice(text, { otherCompanies, maxChars }), ...summaryProblems(text)];
  const known = JSON.stringify(facts);
  const amountsIn = (value: string) => {
    const amounts: number[] = [];
    // Consume full numeric amounts and scale words, rather than accepting a known prefix
    // of "$480,000 million". Support the ordinary dollar/ USD forms a model may write.
    const patterns = [
      /(?:\$|\bUSD\s*)\s*(\d[\d,]*(?:\.\d+)?)(?:\s*(thousand|million|billion|[kmb])\b)?/gi,
      /\b(\d[\d,]*(?:\.\d+)?)(?:\s*(thousand|million|billion|[kmb])\b)?\s*(?:US\s+)?(?:dollars?|USD)\b/gi,
    ];
    const scale: Record<string, number> = { k: 1000, thousand: 1000, m: 1_000_000, million: 1_000_000, b: 1_000_000_000, billion: 1_000_000_000 };
    for (const pattern of patterns) for (const match of value.matchAll(pattern))
      amounts.push(Number(match[1].replace(/,/g, "")) * (scale[match[2]?.toLowerCase()] ?? 1));
    return amounts;
  };
  const amounts = new Set(amountsIn(known));
  for (const amount of amountsIn(text))
    if (!Number.isFinite(amount) || !amounts.has(amount)) problems.push("amount is not in the recorded facts");
  const accounts = new Set([...known.matchAll(/ending\s+(\d{4})\b/gi)].map(m => m[1]));
  for (const match of text.matchAll(/(?:ending(?:\s+in)?|account(?:\s+number)?|••)\s*(\d{4,})\b/gi))
    if (!accounts.has(match[1])) problems.push("account reference is not in the recorded facts");
  return problems;
}

export function cannedCompanySummary(c: StopLossCompany<unknown>): string {
  if (c.evidenceComplete === false)
    return "This assessment is partial because some records exceeded the read limit. Review the listed gaps; the absence of another recommendation does not establish readiness.";
  if (c.links.length === 0)
    return `No vendor relationships are recorded for this company, so readiness cannot be assessed yet. Payment holds are ${c.holdRuleEnabled ? "enabled" : "disabled"}; record the company's vendor and access relationships before relying on this assessment.`;
  const recs = stopLossRecommendations(c);
  if (recs.length === 0)
    return "No additional stop-loss setup is identified for the recorded relationships. Review the eligibility preview for each asset; this does not verify external accounts or establish that every relationship is recorded.";
  const now = recs.filter((r) => r.priority === "now").length;
  const pending = pendingSharedCents(c);
  return `${recs.length === 1 ? "One stop-loss" : `${recs.length} stop-losses`} to set up before a shared vendor has an incident${now > 0 ? `, ${now} of them now` : ""}. Start with "${recs[0].title}".${pending > 0 ? ` ${usd(pending)} is pending to vendors you share with other portfolio companies.` : ""}`;
}

export function cannedPortfolioSummary(
  companies: StopLossCompany<unknown>[],
): string {
  if (companies.some(c => c.evidenceComplete === false))
    return "This portfolio assessment is partial because some records exceeded the read limit. Review the visible gaps; the listed companies and amounts may be incomplete.";
  if (companies.length === 0 || companies.some(c => c.links.length === 0))
    return "Vendor relationship evidence is missing for some or all companies. Review the listed gaps and complete their relationship records before assessing portfolio readiness.";
  const recs = portfolioRecommendations(companies);
  if (recs.length === 0)
    return "No additional setup is identified for the recorded portfolio relationships. This assessment does not verify external accounts or establish that every relationship is recorded.";
  return `${recs.length} portfolio-wide gaps across ${companies.length} companies. The biggest: "${recs[0].title}". Each company adopts its own steps; the firm asks.`;
}

// Picks the cached summary when its facts still match, else the canned one. Never calls a model:
// this runs inside a Convex query.
export function companyBrief<CompanyId>(
  c: StopLossCompany<CompanyId>,
  cache: StopLossCache,
): AdviceBrief<CompanyId> {
  // Cached copy is usable only for complete, matching facts and a valid summary.
  const hit = cache.entries[companyKey(c.companyName)];
  const facts = companyFacts(c);
  const otherCompanies = c.companyNamesForValidation?.filter(name => name !== c.companyName) ?? [];
  const fresh = hit && c.evidenceComplete !== false && c.links.length > 0 && hit.facts === factsKey(facts) &&
    summaryForFactsProblems(hit.body, facts, otherCompanies).length === 0;
  return {
    scope: "company",
    companyId: c.companyId,
    companyName: c.companyName,
    summary: fresh ? hit.body : cannedCompanySummary(c),
    source: fresh ? "cache" : "canned",
    recommendations: stopLossRecommendations(c),
  };
}

export function portfolioBrief<CompanyId>(
  companies: StopLossCompany<CompanyId>[],
  cache: StopLossCache,
): AdviceBrief<CompanyId> {
  const hit = cache.entries[PORTFOLIO_KEY];
  const facts = portfolioFacts(companies);
  const fresh = hit && companies.length > 0 && companies.every(c => c.evidenceComplete !== false && c.links.length > 0) &&
    hit.facts === factsKey(facts) && summaryForFactsProblems(hit.body, facts, [], 1400).length === 0;
  return {
    scope: "portfolio",
    companyId: null,
    companyName: null,
    summary: fresh ? hit.body : cannedPortfolioSummary(companies),
    source: fresh ? "cache" : "canned",
    recommendations: portfolioRecommendations(companies),
  };
}

// Read-only eligibility preview. It explains the current policy and existing relationship cap;
// it never plans a response, changes a policy, or claims that an external account was tested.
export function companyReadiness<CompanyId>(c: StopLossCompany<CompanyId>) {
  const rank: Record<PlaybookMode, number> = { notify: 0, prepare: 1, act: 2 };
  const status = c.evidenceComplete === false ? "partial" as const : c.links.length === 0 ? "needs_evidence" as const : "assessed" as const;
  return {
    companyId: c.companyId,
    companyName: c.companyName,
    status,
    paymentHoldsEnabled: c.holdRuleEnabled,
    limits: "Eligibility for a confirmed report only. Observations do not run actions; episode rules, portfolio action limits and execution-time authority checks can lower this mode. External provider actions are simulated unless an owned sandbox resource is explicitly provisioned.",
    assets: c.links.map(link => ({
      assetName: link.assetName,
      relationship: link.shareType,
      source: link.source,
      unpaidCents: link.pendingCents,
      actions: (["pause_shared_login", "revoke_vendor_tokens"] as const).map(action => {
        const configuredMode = c.playbook[action];
        const rule = link.responseCaps?.find(rule => rule.action === action);
        const eligibleMode = rule ? (rank[configuredMode] <= rank[rule.cap] ? configuredMode : rule.cap) : null;
        const reason = !rule
          ? link.shareType === "same_vendor_only" ? "Using the same vendor does not establish shared access; no access step applies." : "Access-step eligibility has not been established for this relationship."
          : rule.capNote ?? (configuredMode === "notify" ? "Your company currently permits notification only." : "Within this relationship's limit; current company policy applies.");
        return { action, configuredMode, eligibleMode, reason };
      }),
    })),
  };
}
