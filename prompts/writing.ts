// Role 4: prompts, cache keys and copy rules for the three AI-written texts.
// Shared by convex/ai.ts (cache lookup + optional live call) and prompts/generate.mjs
// (pre-generates data/ai_cache.json off stage). No imports, so Node can run it as-is.
//
// The AI only writes. Exposure, urgency and holds are decided by the backend and arrive
// here as facts; the prompts forbid inventing any of them.

export type Kind = "company_alert" | "vendor_letter" | "hold_notice";

// The parts of internal.alerts.getWritingContext the writers use.
export type WritingContext = {
  externalId: string;
  summary: string | null;
  asset: {
    name: string;
    vendorName: string;
    kind: string;
    phoneOnFile: string;
  };
  companyAlerts: {
    companyName: string;
    urgency: "urgent" | "advisory";
    reasons: string[];
    confidence: number;
  }[];
  heldPayments: {
    companyName: string;
    amountCents: number;
    accountLast4: string;
    bankChangeFlag: boolean;
    holdReasons: string[];
  }[];
};
export type CompanyAlertItem = WritingContext["companyAlerts"][number];
export type HeldPaymentItem = WritingContext["heldPayments"][number];

export type CacheEntry = { facts: string; body: string };
export type AiCache = {
  generatedAt: string | null;
  model: string | null;
  entries: Record<string, CacheEntry>;
};

export const MODEL = "claude-opus-5-5";

export const dollars = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US")}`;

// Keys are "<externalId>|<kind>|<company or 'vendor'>". Hold notices add the amount in
// cents, because one company can have several held payments (Bayview has two).
export const alertKey = (externalId: string, item: CompanyAlertItem) =>
  `${externalId}|company_alert|${item.companyName}`;
export const holdKey = (externalId: string, item: HeldPaymentItem) =>
  `${externalId}|hold_notice|${item.companyName}|${item.amountCents}`;
export const letterKey = (externalId: string) =>
  `${externalId}|vendor_letter|vendor`;

// The facts a text was written from. ai.ts uses a cached text only when these still match,
// so a re-seeded demo with different numbers never shows stale amounts or urgency.
// Day counts are left out on purpose: they shift if the demo is fired a day after seeding,
// so the prompts tell the model not to state them (the payment card shows the exact days).
export function companyAlertFacts(ctx: WritingContext, item: CompanyAlertItem) {
  return {
    vendorName: ctx.asset.vendorName,
    assetName: ctx.asset.name,
    assetKind: ctx.asset.kind,
    companyName: item.companyName,
    urgency: item.urgency,
    reasons: item.reasons,
    candidateLink: item.confidence < 0.75,
  };
}

export function holdNoticeFacts(ctx: WritingContext, item: HeldPaymentItem) {
  return {
    vendorName: ctx.asset.vendorName,
    phoneOnFile: ctx.asset.phoneOnFile,
    companyName: item.companyName,
    amount: dollars(item.amountCents),
    accountLast4: item.accountLast4,
    bankDetailsChangedRecently: item.bankChangeFlag,
  };
}

export function vendorLetterFacts(ctx: WritingContext) {
  return {
    vendorName: ctx.asset.vendorName,
    assetName: ctx.asset.name,
    assetKind: ctx.asset.kind,
    phoneOnFile: ctx.asset.phoneOnFile,
    portfolioCompaniesExposed: ctx.companyAlerts.length,
    urgentCompanies: ctx.companyAlerts.filter((a) => a.urgency === "urgent")
      .length,
    paymentsHeld: ctx.heldPayments.length,
    paymentsToRecentlyChangedBankDetails: ctx.heldPayments.filter(
      (p) => p.bankChangeFlag,
    ).length,
  };
}

export const factsKey = (facts: object) => JSON.stringify(facts);

export const SYSTEM_PROMPT = `You write short operational notices for Sidecall, a tool a private equity firm (Northpass Capital) uses when a vendor shared by several of its portfolio companies has a security incident.

Rules you must follow in every text:
- Use only the facts you are given. Never invent dates, day counts, amounts, account numbers, names, phone numbers, URLs, or technical details of the incident.
- Never say which company reported or was first hit by the incident, and never name any portfolio company other than the reader's own.
- Urgency is decided by the backend and given to you. Do not change it, soften it or escalate it.
- A held payment is "held until verified". Never call anything fraud, fraudulent, a scam or an attack on the reader, and never say a payment is blocked, stopped or cancelled.
- Tell readers to verify by calling the vendor at the number on file, which you are given. Never tell them to use a number, link or contact from a recent email.
- A link marked as a candidate came from public DNS records: call it a candidate link or reachability. Never call it validated, confirmed or verified.
- Plain text only: no markdown, no headings, no bullet symbols, no emoji, no sign-off placeholders like [Name].
- Write plainly and calmly, in short sentences, like a careful colleague. No hype.`;

export function companyAlertPrompt(
  ctx: WritingContext,
  item: CompanyAlertItem,
): string {
  const opener = item.urgency === "urgent" ? "Urgent:" : "Advisory:";
  return `Write the alert one portfolio company sees in its own Sidecall view.

Facts (JSON):
${JSON.stringify(companyAlertFacts(ctx, item), null, 2)}

"reasons" are the backend's reasons this company is exposed; keep their meaning. If candidateLink is true, the link is a candidate from public DNS records, so say the team should first confirm whether they still use this vendor.

Write 60 to 110 words. Start with exactly "${opener}" and then say what happened in one sentence. Then the reason in plain words, then two or three concrete steps for this kind of vendor (${ctx.asset.kind}), such as rotating credentials shared with the vendor, reviewing recent admin or payroll changes, and checking any pending payments to the vendor. ${item.urgency === "urgent" ? "Ask them to act today." : "Ask them to review this week."} Address the reader's team directly ("your team"). Return only the alert text.`;
}

export function holdNoticePrompt(
  ctx: WritingContext,
  item: HeldPaymentItem,
): string {
  return `Write the hold notice shown on one held payment card, read by the company's AP clerk and controller.

Facts (JSON):
${JSON.stringify(holdNoticeFacts(ctx, item), null, 2)}

Write 45 to 90 words. Say the ${dollars(item.amountCents)} payment to ${ctx.asset.vendorName} is held until verified because the vendor is under an active security incident. ${item.bankChangeFlag ? `Say it is going to an account ending ${item.accountLast4} whose bank details changed recently, which is exactly why it must be checked before money moves. Do not state how many days ago.` : `Say the bank details on file have not changed recently; the hold is a precaution while the incident is open.`} Tell them to call ${ctx.asset.vendorName} at the number on file, ${ctx.asset.phoneOnFile}, and never a number from a recent email. End by saying a controller other than the person who requested it can then release or reject it. Include the exact phrase "held until verified". Return only the notice text.`;
}

export function vendorLetterPrompt(ctx: WritingContext): string {
  return `Write one letter from Northpass Capital's portfolio security team to the vendor, sent on behalf of every affected portfolio company at once.

Facts (JSON):
${JSON.stringify(vendorLetterFacts(ctx), null, 2)}

Write 140 to 230 words, starting "To the security team at ${ctx.asset.vendorName}," and ending "Portfolio security, Northpass Capital". Do not name any portfolio company. Ask them to: confirm the scope and timeline of the incident affecting ${ctx.asset.name}; say whether accounts or credentials used by our companies were accessed; rotate every shared and admin credential across all of our accounts in one coordinated step; and confirm their remittance bank details by phone.${vendorLetterFacts(ctx).paymentsToRecentlyChangedBankDetails > 0 ? " Mention that bank-detail changes recently requested by email are being treated as unverified." : ""} Say pending payments to them are held until verified, and that we will call the number on file (${ctx.asset.phoneOnFile}) rather than any number in an email. Ask for one named contact for the portfolio. Return only the letter text.`;
}

// Copy rules as code. Returns the problems found; empty means the text may be shown.
// `otherCompanies` are portfolio names the text must not mention (everyone but the reader).
export function checkCopy(
  kind: Kind,
  text: string,
  opts: {
    phoneOnFile: string;
    otherCompanies: string[];
    urgency?: "urgent" | "advisory";
  },
): string[] {
  const problems: string[] = [];
  const lower = text.toLowerCase();
  const banned: [RegExp, string][] = [
    [/fraud/i, `says "fraud"`],
    [/\bscam/i, `says "scam"`],
    [/\bvalidated\b/i, `says "validated"`],
    [/\bblock(ed|s|ing)?\b/i, `says "block"`],
    [/\bcancel(l?ed|s|l?ing)?\b/i, `says "cancel"`],
    [/[#*`[\]]/, "contains markdown or a placeholder"],
  ];
  for (const [re, why] of banned) if (re.test(text)) problems.push(why);

  for (const name of opts.otherCompanies) {
    if (name && lower.includes(name.toLowerCase()))
      problems.push(`names another company (${name})`);
  }

  const digits = (s: string) => s.replace(/\D/g, "");
  const onFile = digits(opts.phoneOnFile);
  for (const match of text.match(/\+?\(?\d[\d\s().-]{8,}\d/g) ?? []) {
    if (digits(match) !== onFile)
      problems.push(`phone number not on file (${match.trim()})`);
  }

  if (kind === "hold_notice") {
    if (!lower.includes("held until verified"))
      problems.push(`missing "held until verified"`);
    if (!digits(text).includes(onFile))
      problems.push("missing the number on file");
  }
  if (kind === "company_alert" && opts.urgency) {
    const opener = opts.urgency === "urgent" ? "Urgent:" : "Advisory:";
    if (!text.startsWith(opener)) problems.push(`must start with "${opener}"`);
  }
  if (kind === "vendor_letter" && !digits(text).includes(onFile))
    problems.push("missing the number on file");

  const limit = kind === "vendor_letter" ? 2400 : 1100;
  if (text.length > limit) problems.push(`too long (${text.length} chars)`);
  if (text.trim().length < 80) problems.push("too short");
  return problems;
}

// One Messages API call with plain fetch (no SDK, so no new npm package). Returns the text,
// or throws. Opus 5.5 always thinks; effort is the only dial. No temperature: the current
// API version rejects sampling params. Server-side fallback re-runs a declined request.
export async function callClaude(
  apiKey: string,
  user: string,
  model = MODEL,
): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2026-10-21",
      "anthropic-beta": "server-side-fallback-2026-07-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 16000,
      output_config: { effort: "medium" },
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Anthropic API ${response.status}: ${(await response.text()).slice(0, 300)}`,
    );
  }
  const data = (await response.json()) as {
    stop_reason: string;
    content: { type: string; text?: string }[];
  };
  if (data.stop_reason === "refusal")
    throw new Error("Model declined the request");
  if (data.stop_reason === "max_tokens")
    throw new Error("Model hit max_tokens");
  const text = data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("Empty response");
  return text;
}
