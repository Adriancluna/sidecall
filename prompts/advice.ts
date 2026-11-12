// Role 4: the shared shape of AI-written advice, used by both advice features:
//   - stop-loss recommendations, set up before a breach (prompts/stopLoss.ts)
//   - breach fix recommendations, after one (prompts/breachFix.ts)
// No imports, so Node can run it as-is (prompts/*.mjs scripts and node:test).
//
// Rules pick every recommendation from backend rows; the AI only writes the wording (the brief's
// summary). CLAUDE.md: the AI never decides exposure, urgency or holds.

export type PlaybookAction =
  | "hold_payments"
  | "pause_shared_login"
  | "revoke_vendor_tokens";
export type PlaybookMode = "notify" | "prepare" | "act";

export type Recommendation = {
  id: string; // stable catalog id plus the asset it is about, e.g. "separate_credentials:Keystone SSO"
  title: string;
  why: string; // the backend fact behind it, in one sentence
  steps: string[];
  priority: "now" | "soon" | "later";
  owner: "firm" | "controller" | "it" | "ap_clerk";
  // The existing playbook step (convex/responses.ts) this maps to, so the UI can offer a
  // one-click adopt through api.responses.setPlaybookMode. Null for advice Sidecall can't run.
  playbookAction: PlaybookAction | null;
  recommendedMode: PlaybookMode | null;
  phase?: "secure" | "verify" | "recover" | "notify";
  status?: "done" | "ready" | "todo";
};

export type AdviceBrief<CompanyId = string> = {
  scope: "company" | "portfolio";
  companyId: CompanyId | null; // null for the portfolio rollup (firm view only)
  companyName: string | null;
  summary: string; // AI-written (from the cache) or canned
  source: "cache" | "canned";
  recommendations: Recommendation[];
};

export const PRIORITY_RANK: Record<Recommendation["priority"], number> = {
  now: 0,
  soon: 1,
  later: 2,
};

// Copy rules for advice text, on top of the house rules in prompts/writing.ts. Returns the
// problems found; empty means the text may be shown. `otherCompanies` are portfolio names the
// text must not mention. With `phoneOnFile`, it is the only phone number allowed; without it, no
// phone number is.
export function checkAdvice(
  text: string,
  opts: { otherCompanies: string[]; phoneOnFile?: string; maxChars?: number },
): string[] {
  const problems: string[] = [];
  const lower = text.toLowerCase();
  const banned: [RegExp, string][] = [
    [/fraud/i, `says "fraud"`],
    [/\bscam/i, `says "scam"`],
    [/armadin/i, `says "Armadin"`],
    [/\bblock(ed|s|ing)?\b/i, `says "block"`],
    [/\bcancel(l?ed|s|l?ing)?\b/i, `says "cancel"`],
    [/\bcontain(s|ed|ing)? (the |an |this |any )?(breach|attack|incident)|\bcontainment\b/i, `says "contain the breach"`],
    [/auto-?mitigat/i, `says "auto-mitigate"`],
    [/autonomous response/i, `says "autonomous response"`],
    [/\bstops? (the|an|any) (attack|breach)/i, `says "stop the attack"`],
    [/\bprevents? (the|an|any|every) (attack|breach)/i, `promises to prevent a breach`],
    [/covers everything|guarantee/i, "overclaims"],
    [/[#*`[\]]/, "contains markdown or a placeholder"],
  ];
  for (const [re, why] of banned) if (re.test(text)) problems.push(why);
  if (/\bvalidated\b/i.test(text) && !lower.includes("not tested"))
    problems.push(`says "validated" without "not tested"`);

  for (const name of opts.otherCompanies) {
    if (name && lower.includes(name.toLowerCase()))
      problems.push(`names another company (${name})`);
  }

  const digits = (s: string) => s.replace(/\D/g, "");
  const onFile = opts.phoneOnFile ? digits(opts.phoneOnFile) : null;
  for (const match of text.match(/\+?\(?\d[\d\s().-]{8,}\d/g) ?? []) {
    if (digits(match) !== onFile)
      problems.push(`phone number not on file (${match.trim()})`);
  }

  const limit = opts.maxChars ?? 1100;
  if (text.length > limit) problems.push(`too long (${text.length} chars)`);
  if (text.trim().length < 40) problems.push("too short");
  return problems;
}
