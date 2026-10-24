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
  // From a red-team finding on the incident: the ATT&CK id and the name from our own table
  // (null for an id we don't know). Null when the incident carries no finding.
  technique: { id: string; name: string | null } | null;
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
    // Sister-safe sentence about the proven path (scoring.ts sisterPath): "A validated attack
    // path at another portfolio company ends at … (not tested at your company)". Null without a
    // finding.
    pathSummary: string | null;
    // "What to check: …" for the IT lead, with the account name and time stamp. Null without a
    // finding.
    whatToCheck: string | null;
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

// "T1078 Valid Accounts", or just the id when our table has no name for it.
export const techniqueLabel = (technique: { id: string; name: string | null }) =>
  technique.name ? `${technique.id} ${technique.name}` : technique.id;

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
// Finding fields (pathSummary, whatToCheck, technique) are added only when present and only
// after the original keys, so the texts cached before findings existed still match byte for byte.
export function companyAlertFacts(ctx: WritingContext, item: CompanyAlertItem) {
  return {
    vendorName: ctx.asset.vendorName,
    assetName: ctx.asset.name,
    assetKind: ctx.asset.kind,
    companyName: item.companyName,
    urgency: item.urgency,
    reasons: item.reasons,
    candidateLink: item.confidence < 0.75,
    ...(item.pathSummary ? { pathSummary: item.pathSummary } : {}),
    ...(item.whatToCheck ? { whatToCheck: item.whatToCheck } : {}),
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
    ...(ctx.technique
      ? { technique: { id: ctx.technique.id, name: ctx.technique.name } }
      : {}),
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
- A validated finding means an authorized red-team test at another portfolio company proved an attack path that ends at the shared asset. At the reader's company that path is reachable but was not tested. Whenever you write "validated", write "not tested" in the same or the next sentence. Never say the reader's company was tested, validated or breached, and never name the company that was tested or the red-team tool.
- Plain text only: no markdown, no headings, no bullet symbols, no emoji, no sign-off placeholders like [Name].
- Write plainly and calmly, in short sentences, like a careful colleague. No hype.`;

export function companyAlertPrompt(
  ctx: WritingContext,
  item: CompanyAlertItem,
): string {
  const opener = item.urgency === "urgent" ? "Urgent:" : "Advisory:";
  const facts = companyAlertFacts(ctx, item);
  const hasPath = Boolean(item.pathSummary);
  // With a finding, the model gets the sister-safe path sentence and the concrete check, and
  // the rule that "validated" always travels with "not tested".
  const pathNotes = hasPath
    ? `

"pathSummary" means an authorized red-team test at another portfolio company validated an attack path that ends at ${ctx.asset.name}. At ${item.companyName} that path is reachable through the link in "reasons", but it was not tested there: nothing at ${item.companyName} was probed, accessed or confirmed. Every time you write "validated", write "not tested" in the same or the next sentence. Never say ${item.companyName} was tested, validated or breached, and never name or hint at the company that was tested.${
        item.whatToCheck
          ? ` "whatToCheck" is the first step for their IT lead: keep its instruction, with the account name "${ctx.asset.name}" and the time stamp exactly as written, before any other step.`
          : ""
      }`
    : "";
  const steps = hasPath
    ? `the validated path and that it is reachable at the reader's company but not tested there, then the check from whatToCheck as the first step, then one or two further concrete steps for this kind of vendor (${ctx.asset.kind}), such as rotating credentials shared with the vendor, reviewing recent admin or payroll changes, and checking any pending payments to the vendor.`
    : `two or three concrete steps for this kind of vendor (${ctx.asset.kind}), such as rotating credentials shared with the vendor, reviewing recent admin or payroll changes, and checking any pending payments to the vendor.`;
  return `Write the alert one portfolio company sees in its own Sidecall view.

Facts (JSON):
${JSON.stringify(facts, null, 2)}

"reasons" are the backend's reasons this company is exposed; keep their meaning. Say a payment is held only if the reasons say so; otherwise ask them to check pending payments before paying them, without saying any are held. If candidateLink is true, the link is a candidate from public DNS records, so say the team should first confirm whether they still use this vendor.${pathNotes}

Write ${hasPath ? "80 to 140" : "60 to 110"} words. Start with exactly "${opener}" and then say what happened in one sentence. Then the reason in plain words, then ${steps} ${item.urgency === "urgent" ? "Ask them to act today." : "Ask them to review this week."} Address the reader's team directly ("your team"). Return only the alert text.`;
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
  const facts = vendorLetterFacts(ctx);
  // With a finding, the letter carries the spec's ask (docs/specs/armadin-one-step-ahead.md A4):
  // the technique and asset, then tenant-wide rotation, isolation and logs.
  const finding = ctx.technique
    ? ` Then state that an authorized test validated use of ${techniqueLabel(ctx.technique)} against ${ctx.asset.name} held by a Northpass portfolio company (never say which one, and never name the test or the tool), and ask them to rotate every admin credential issued to Northpass portfolio tenants, confirm tenant isolation, and send 30 days of admin-console access logs.`
    : "";
  return `Write one letter from Northpass Capital's portfolio security team to the vendor, sent on behalf of every affected portfolio company at once.

Facts (JSON):
${JSON.stringify(facts, null, 2)}

Write ${ctx.technique ? "160 to 260" : "140 to 230"} words, starting "To the security team at ${ctx.asset.vendorName}," and ending "Portfolio security, Northpass Capital". Do not name any portfolio company. Ask them to: confirm the scope and timeline of the incident affecting ${ctx.asset.name}; say whether accounts or credentials used by our companies were accessed; rotate every shared and admin credential across all of our accounts in one coordinated step; and confirm their remittance bank details by phone.${finding}${facts.paymentsToRecentlyChangedBankDetails > 0 ? " Mention that bank-detail changes recently requested by email are being treated as unverified." : ""} ${facts.paymentsHeld > 0 ? `Say pending payments to them are held until verified, and that we will call the number on file (${ctx.asset.phoneOnFile}) rather than any number in an email.` : `No payments to them are held for this incident, so do not say any are. Say that before paying them, our companies will confirm remittance details by calling the number on file (${ctx.asset.phoneOnFile}) rather than any number in an email.`} Ask for one named contact for the portfolio. Return only the letter text.`;
}

// Copy rules as code. Returns the problems found; empty means the text may be shown.
// `otherCompanies` are portfolio names the text must not mention (everyone but the reader).
// `finding` says the incident carries a red-team finding, which is the only time a vendor
// letter may say "validated".
export function checkCopy(
  kind: Kind,
  text: string,
  opts: {
    phoneOnFile: string;
    otherCompanies: string[];
    urgency?: "urgent" | "advisory";
    finding?: boolean; // the incident carries a red-team finding (technique known)
    readerName?: string; // the company reading a company alert
  },
): string[] {
  const problems: string[] = [];
  const lower = text.toLowerCase();
  const banned: [RegExp, string][] = [
    [/fraud/i, `says "fraud"`],
    [/\bscam/i, `says "scam"`],
    [/armadin/i, `says "Armadin"`],
    [/\bblock(ed|s|ing)?\b/i, `says "block"`],
    [/\bcancel(l?ed|s|l?ing)?\b/i, `says "cancel"`],
    [/[#*`[\]]/, "contains markdown or a placeholder"],
  ];
  for (const [re, why] of banned) if (re.test(text)) problems.push(why);

  // "Validated" belongs to the red-team test, never to the reader. A hold notice never says it.
  // A company alert may, only when the incident carries a finding and only next to "not
  // tested": the path was proven at another company, not here. A vendor letter may, only when
  // the incident carries a finding. Without a finding nothing was validated, so the word is
  // an invention (an inferred link is never "validated").
  if (/\bvalidated\b/i.test(text)) {
    if (kind === "hold_notice") problems.push(`says "validated"`);
    if (kind === "company_alert") {
      if (!opts.finding) problems.push(`says "validated" without a finding`);
      else if (!lower.includes("not tested"))
        problems.push(`says "validated" without "not tested"`);
    }
    if (kind === "vendor_letter" && !opts.finding)
      problems.push(`says "validated" without a finding`);
  }
  if (kind === "company_alert") {
    // Drop the negated forms ("not tested at your company", "wasn't validated here"); any
    // "tested at your …", "validated at <reader>" or "validated here" left over claims the
    // reader's company was tested.
    const claims = text.replace(
      /(?:\bnot|\bnever|n't)\s+(?:\w+\s+){0,2}?(?:tested|validated)\b/gi,
      "",
    );
    const escapedReader = opts.readerName
      ? opts.readerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      : null;
    const subjects = escapedReader ? `your|${escapedReader}` : "your";
    const atReader = new RegExp(
      `\\b(?:tested|validated)\\s+(?:at|in|on|for|inside|within|against|across)\\s+(?:${subjects})\\b`,
      "i",
    );
    if (atReader.test(claims) || /\b(?:tested|validated)\s+here\b/i.test(claims))
      problems.push("claims the reader's company was tested");
  }

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
