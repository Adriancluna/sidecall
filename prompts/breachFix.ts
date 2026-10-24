// Role 4: breach fix advice. After an incident lands, what one exposed company should do now:
// secure the shared access, verify payments and sign-ins, recover, and tell the right people.
// Shared by convex/ai.ts (the getBreachFixAdvice query) and prompts/generateBreachFix.mjs
// (pre-generates data/ai_breach_fix.json off stage). No runtime imports, so Node runs it as-is.
//
// Fixed rules below pick every recommendation, its owner, priority and status from backend rows.
// The AI only writes the summary paragraph and the one-line "why" of each recommendation, from
// the same facts, pre-generated. Nothing here decides exposure, urgency or holds, and nothing on
// stage calls the model: a query reads the cache, else the canned text.

// ---- Shared shapes (agreed with the stop-loss thread; prompts/advice.ts will hold the same) ----

export type PlaybookAction = "hold_payments" | "pause_shared_login" | "revoke_vendor_tokens";
export type PlaybookMode = "notify" | "prepare" | "act";

export type Recommendation = {
  id: string; // stable catalog id, e.g. "rotate_login"
  title: string;
  why: string; // one sentence: the fact behind it (AI-written when cached)
  steps: string[]; // concrete actions, in order (always from the rules below)
  priority: "now" | "soon" | "later";
  owner: "firm" | "controller" | "it" | "ap_clerk";
  playbookAction: PlaybookAction | null; // the matching pre-approved step, when there is one
  recommendedMode: PlaybookMode | null; // stop-loss only; fix advice leaves it null
  phase?: "secure" | "verify" | "recover" | "notify";
  status?: "done" | "ready" | "todo"; // live: done = already happened, ready = one click away
};

export type AdviceBrief<CompanyId = string> = {
  scope: "company" | "portfolio";
  companyId: CompanyId | null;
  companyName: string | null;
  summary: string;
  source: "cache" | "canned";
  recommendations: Recommendation[];
};

// ---- Inputs ----

type ShareType = "shared_credential" | "shared_admin_access" | "same_vendor_only";
type ResponseAction = "pause_shared_login" | "revoke_vendor_tokens";
type StepStatus = "awaiting_approval" | "queued" | "done" | "undone" | "expired" | "failed";

// Facts that don't change after the incident lands. The AI text is written from these, and the
// cache is used only while they still match.
export type FixContext = {
  externalId: string;
  companyName: string;
  urgency: "urgent" | "advisory";
  asset: { name: string; vendorName: string; kind: string; phoneOnFile: string };
  shareType: ShareType | null; // the company's strongest link to the asset
  candidateLink: boolean; // the link is a guess from public DNS, not confirmed by the company
  finding: boolean; // the incident carries a red-team finding (validated elsewhere, not tested here)
  whatToCheck: string | null; // the backend's concrete check for the IT lead (with a finding)
  heldPayments: { amountCents: number; accountLast4: string; bankChangeFlag: boolean }[];
  plannedSteps: { action: ResponseAction; mode: "prepare" | "act" }[]; // from the playbook
};

// What changes while people work. Only statuses read it, never the AI text or the item list.
export type FixLive = {
  acknowledged: boolean;
  closedByFirm: boolean; // the firm recorded the vendor's fix (incident containedAt)
  steps: Partial<Record<ResponseAction, StepStatus>>;
  undecidedPayments: number; // still held, waiting for a controller
};

export const NO_PROGRESS: FixLive = {
  acknowledged: false,
  closedByFirm: false,
  steps: {},
  undecidedPayments: 0,
};

export type BreachFixCacheEntry = { facts: string; summary: string; why: Record<string, string> };
export type BreachFixCache = {
  generatedAt: string | null;
  model: string | null;
  entries: Record<string, BreachFixCacheEntry>;
};

const dollars = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;

// What to look for, by kind of asset.
const LOOK_FOR: Record<string, string> = {
  payroll: "Look for new payees, direct-deposit changes, new admin users and tax-form downloads.",
  idp: "Look for new MFA devices, new app grants and admin role changes.",
  email: "Look for new forwarding rules, mailbox delegations and app passwords.",
  msp: "Look for new admin accounts, remote-access tools and scheduled scripts pushed by the vendor's tools.",
};

const stepState = (status: StepStatus | undefined): "done" | "ready" | "todo" =>
  status === "done" ? "done" : status === "awaiting_approval" || status === "queued" ? "ready" : "todo";

const PRIORITY_ORDER = { now: 0, soon: 1, later: 2 } as const;

// The rules. Which items appear depends only on the context, so the cached "why" text always
// matches; FixLive changes statuses and the wording of steps that report progress.
export function planBreachFix(ctx: FixContext, live: FixLive = NO_PROGRESS): Recommendation[] {
  const { asset } = ctx;
  const vendor = asset.vendorName;
  const phone = asset.phoneOnFile;
  const urgentNow = ctx.urgency === "urgent" ? "now" : "soon";
  const sharesAccess = ctx.shareType === "shared_credential" || ctx.shareType === "shared_admin_access";
  const planned = (action: ResponseAction) => ctx.plannedSteps.find((s) => s.action === action);
  const recs: (Recommendation & { order: number })[] = [];
  const add = (order: number, r: Omit<Recommendation, "recommendedMode">) =>
    recs.push({ ...r, recommendedMode: null, order });

  add(0, {
    id: "acknowledge",
    title: "Acknowledge the alert",
    why: "Until someone acknowledges, the firm can't tell whether your team has seen it.",
    steps: ["Press Acknowledge so the firm and your colleagues know who owns the response."],
    priority: "now",
    owner: "it",
    playbookAction: null,
    phase: "secure",
    status: live.acknowledged ? "done" : "todo",
  });

  if (ctx.candidateLink) {
    add(1, {
      id: "confirm_vendor",
      title: `Confirm whether you still use ${vendor}`,
      why: "This link is a candidate from public DNS records; your team hasn't confirmed it.",
      steps: [
        `Ask IT and finance whether anyone at your company has an account with ${vendor} or uses ${asset.name}.`,
        "If nobody does, tell the firm so the link can be removed, and skip the access steps below.",
      ],
      priority: "now",
      owner: "it",
      playbookAction: null,
      phase: "verify",
    });
  }

  const pause = planned("pause_shared_login");
  if (ctx.shareType === "shared_credential" || pause) {
    const state = stepState(live.steps.pause_shared_login);
    const payrollCaution =
      asset.kind === "payroll" ? " Check with payroll first: pausing a payroll login can stop a pay run." : "";
    add(2, {
      id: "pause_login",
      title: `Pause ${asset.name} until it is rotated`,
      why: "Signing every session out closes the shared login while you rotate it, and nothing is deleted.",
      steps:
        state === "done"
          ? [`Your pre-approved step paused ${asset.name} in your own tenant (simulated). Keep it paused until the login is rotated.`]
          : state === "ready"
            ? [`Run "Pause the shared login" in your pre-approved steps. Every session is signed out; nothing is deleted.${payrollCaution}`]
            : [`Suspend ${asset.name} in your identity provider, or sign out every session, until it is rotated.${payrollCaution}`],
      priority: urgentNow,
      owner: "it",
      playbookAction: "pause_shared_login",
      phase: "secure",
      status: state,
    });
  }

  if (ctx.shareType === "shared_credential") {
    add(3, {
      id: "rotate_login",
      title: `Rotate ${asset.name} today`,
      why: "A login several companies share is only as safe as the weakest place it is stored.",
      steps: [
        `Change the password or key for ${asset.name} today, even if nothing looks wrong.`,
        "Turn on MFA for it if it isn't on, and keep the new secret only in your own vault.",
        "Share the new secret only through that vault, never by email or chat.",
      ],
      priority: urgentNow,
      owner: "it",
      playbookAction: null,
      phase: "secure",
      status: "todo",
    });
  }

  if (ctx.shareType === "shared_admin_access") {
    add(3, {
      id: "vendor_admin",
      title: `Have ${vendor} rotate the admin account it uses for you`,
      why: `${vendor} holds admin access into your systems, so its credentials are your credentials.`,
      steps: [
        `Ask ${vendor} to rotate the admin account it uses for your company and to confirm when it is done.`,
        `Confirm by calling ${vendor} at the number on file, ${phone}, not a number or link from a recent email.`,
        "Until they confirm, allow their remote access only for sessions your team starts and watches.",
      ],
      priority: urgentNow,
      owner: "it",
      playbookAction: null,
      phase: "secure",
      status: "todo",
    });
  }

  if (planned("revoke_vendor_tokens")) {
    const state = stepState(live.steps.revoke_vendor_tokens);
    add(4, {
      id: "revoke_tokens",
      title: `Revoke ${vendor}'s connected-app tokens`,
      why: "Stolen app tokens keep working after a password change, so they need revoking separately.",
      steps:
        state === "done"
          ? [`Your pre-approved step revoked ${vendor}'s app grants in your tenant (simulated). ${vendor} re-authorises once it confirms its fix.`]
          : state === "ready"
            ? [`Run "Revoke the vendor's app tokens" in your pre-approved steps.`]
            : [`Remove ${vendor}'s connected-app (OAuth) grants in your tenant's admin console.`],
      priority: "soon",
      owner: "it",
      playbookAction: "revoke_vendor_tokens",
      phase: "secure",
      status: state,
    });
  }

  if (sharesAccess || ctx.whatToCheck) {
    const lookFor = LOOK_FOR[asset.kind];
    add(5, {
      id: "check_access",
      title: `Check recent activity through ${asset.name}`,
      why: ctx.finding
        ? "An attack path validated at another portfolio company ends at this asset; at your company it is reachable but was not tested."
        : "Shared access means anyone who took it could already have used it at your company.",
      steps: [
        ctx.whatToCheck ?? `Review sign-ins and admin changes made through ${asset.name} since the incident was reported.`,
        ...(lookFor ? [lookFor] : []),
        "If you find anything you can't explain, keep the access paused and tell the firm.",
      ],
      priority: ctx.whatToCheck ? "now" : urgentNow,
      owner: "it",
      playbookAction: null,
      phase: "verify",
      status: "todo",
    });
  }

  if (ctx.shareType === "same_vendor_only") {
    add(5, {
      id: "confirm_separate_login",
      title: `Confirm your ${vendor} account has its own login`,
      why: `You use ${vendor} but share no login with other companies, so the incident on ${asset.name} itself is what matters.`,
      steps: [
        `Check that your ${vendor} account uses a login and MFA nobody outside your company holds.`,
        `Review sign-ins to ${asset.name} since the incident was reported.`,
      ],
      priority: "soon",
      owner: "it",
      playbookAction: null,
      phase: "verify",
      status: "todo",
    });
  }

  if (ctx.heldPayments.length > 0) {
    const total = ctx.heldPayments.reduce((sum, p) => sum + p.amountCents, 0);
    const count = ctx.heldPayments.length;
    add(6, {
      id: "verify_payments",
      title: `Verify the ${count === 1 ? "held payment" : `${count} held payments`} to ${vendor}`,
      why: "Paying a vendor during an open incident is when changed bank details do the most harm.",
      steps: [
        count === 1
          ? `One payment to ${vendor}, ${dollars(total)}, is held until verified.`
          : `${count} payments to ${vendor}, ${dollars(total)} in all, are held until verified.`,
        `Call ${vendor} at the number on file, ${phone}. Never use a number, link or contact from a recent email.`,
        "Then a controller other than the person who requested each payment releases or rejects it.",
      ],
      priority: "now",
      owner: "controller",
      playbookAction: "hold_payments",
      phase: "verify",
      status: live.undecidedPayments > 0 ? "todo" : "done",
    });
  } else {
    add(6, {
      id: "check_pending_payments",
      title: `Confirm remittance details before paying ${vendor}`,
      why: "Nothing is held for this incident, but a vendor under attack is a common cover for bank-detail changes.",
      steps: [
        `Before the next payment to ${vendor}, confirm its bank details by calling the number on file, ${phone}.`,
        "Treat any bank-detail change requested by email as unverified until that call.",
      ],
      priority: "soon",
      owner: "ap_clerk",
      playbookAction: null,
      phase: "verify",
      status: "todo",
    });
  }

  const flagged = [...new Set(ctx.heldPayments.filter((p) => p.bankChangeFlag).map((p) => p.accountLast4))];
  if (flagged.length > 0) {
    const accounts = flagged.map((a) => `ending ${a}`).join(" and ");
    add(7, {
      id: "bank_change",
      title: `Treat the account ${accounts} as unverified`,
      why: "Bank details that changed shortly before a vendor incident are the classic payment-redirection pattern.",
      steps: [
        `The account ${accounts} was added recently. Reject the payment unless ${vendor} confirms that account on the number on file.`,
        "If an earlier payment already went to that account, ask your bank to recall it today and report it to the FBI's IC3.",
      ],
      priority: "now",
      owner: "controller",
      playbookAction: null,
      phase: "verify",
      status: live.undecidedPayments > 0 ? "todo" : "done",
    });
  }

  if (ctx.shareType === "shared_credential" || pause) {
    const state = live.steps.pause_shared_login;
    add(8, {
      id: "restore_access",
      title: "Restore access once the login is rotated",
      why: "A pause is meant to be short; restoring it is part of the fix, not an afterthought.",
      steps: [
        `When ${asset.name} is rotated and ${vendor} confirms its fix, restore access (Undo on the pause, or unsuspend it).`,
        "Watch sign-ins closely for a week after restoring.",
      ],
      priority: "later",
      owner: "it",
      playbookAction: "pause_shared_login",
      phase: "recover",
      status: state === "undone" ? "done" : state === "done" ? "ready" : "todo",
    });
  }

  add(9, {
    id: "tell_people",
    title: "Tell your insurer, counsel and leadership",
    why: "Insurers and counsel can only help with what they hear about early, and the record is already kept for you.",
    steps: [
      "Tell your cyber insurer and outside counsel about the alert today; your policy may set a deadline.",
      "Keep the alert and this plan. Sidecall's timeline already records who did what, and when.",
      "Brief your CEO. The firm already sees this incident.",
    ],
    priority: "soon",
    owner: "controller",
    playbookAction: null,
    phase: "notify",
    status: "todo",
  });

  add(10, {
    id: "close_out",
    title: `Close out once ${vendor} confirms its fix`,
    why: "The firm closes the incident for every company at once when the vendor confirms its fix.",
    steps: [
      `The firm writes to ${vendor} for all portfolio companies and records when the fix is confirmed.`,
      "After that, new payments to the vendor are no longer held. Payments already held still need a controller's decision.",
    ],
    priority: "later",
    owner: "firm",
    playbookAction: null,
    phase: "recover",
    status: live.closedByFirm ? "done" : "todo",
  });

  return recs
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.order - b.order)
    .map(({ order: _order, ...r }) => r);
}

// ---- Cache key, facts, prompt ----

export const breachFixKey = (ctx: FixContext) => `${ctx.externalId}|breach_fix|${ctx.companyName}`;

// The facts the AI text was written from, plus the item ids it wrote a "why" for. Day counts and
// statuses are left out: they change during the demo.
export function breachFixFacts(ctx: FixContext) {
  return {
    vendorName: ctx.asset.vendorName,
    assetName: ctx.asset.name,
    assetKind: ctx.asset.kind,
    phoneOnFile: ctx.asset.phoneOnFile,
    companyName: ctx.companyName,
    urgency: ctx.urgency,
    shareType: ctx.shareType,
    candidateLink: ctx.candidateLink,
    finding: ctx.finding,
    whatToCheck: ctx.whatToCheck,
    heldPayments: ctx.heldPayments.map((p) => ({
      amount: dollars(p.amountCents),
      accountLast4: p.accountLast4,
      bankDetailsChangedRecently: p.bankChangeFlag,
    })),
    // Actions only: the mode depends on what fired earlier on the same seed (a repeat target is
    // lowered to one click), and the text never states it.
    plannedSteps: ctx.plannedSteps.map((s) => s.action),
    items: planBreachFix(ctx).map((r) => r.id),
  };
}

export const breachFixFactsKey = (ctx: FixContext) => JSON.stringify(breachFixFacts(ctx));

export function breachFixPrompt(ctx: FixContext): string {
  // Steps as written before anything has run; the text must not depend on progress.
  const items = planBreachFix(ctx).map((r) => ({
    id: r.id,
    title: r.title,
    owner: r.owner,
    priority: r.priority,
    steps: r.steps,
  }));
  return `Write the short explanation on a "what to do now" plan that one portfolio company sees after a shared vendor's security incident. The backend already chose every recommendation and its order; you only explain them.

Facts (JSON):
${JSON.stringify(breachFixFacts(ctx), null, 2)}

Recommendations, in order (JSON):
${JSON.stringify(items, null, 2)}

Rules for this text:
- Do not add, drop, reorder or change any recommendation, owner, priority or step.
- Never say the company was breached, hacked or compromised: it shares something with a vendor that has an incident. Never say anything was contained, stopped, blocked or protected by Sidecall.
- A pre-approved step that ran is a simulated identity-provider call: never say Sidecall paused or revoked something in a named product.${ctx.finding ? '\n- An attack path was validated at another portfolio company and is not tested at this one: whenever you write "validated", write "not tested" in the same sentence.' : ""}${ctx.candidateLink ? "\n- The link is a candidate from public DNS records: call it a candidate, never confirmed or validated." : ""}
- Mention the phone number only as the number on file, ${ctx.asset.phoneOnFile}, if at all.

Return only JSON, no code fence: {"summary": string, "why": {"<id>": string}}.
"summary": 50 to 100 words to the reader's team ("your team"), starting with ${ctx.urgency === "urgent" ? '"Urgent:" and asking them to start today' : '"Advisory:" and asking them to work through it this week'}. Say what happened in one sentence, then the first two or three things to do and who does them, in the order given.
"why": for every id above, one sentence of at most 25 words on why that recommendation matters here, using only the facts.`;
}

// Parses the model's JSON reply. Throws on anything malformed so the generator retries.
export function parseBreachFixReply(text: string, ids: string[]): { summary: string; why: Record<string, string> } {
  const json = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const parsed = JSON.parse(json) as { summary?: unknown; why?: Record<string, unknown> };
  if (typeof parsed.summary !== "string") throw new Error("reply has no summary");
  const why: Record<string, string> = {};
  for (const id of ids) {
    const line = parsed.why?.[id];
    if (typeof line !== "string" || line.trim() === "") throw new Error(`reply has no why for ${id}`);
    why[id] = line.trim();
  }
  return { summary: parsed.summary.trim(), why };
}

// Copy rules as code, for the summary and every "why". Returns the problems; empty means show it.
export function checkBreachFixCopy(
  part: "summary" | "why",
  text: string,
  opts: { phoneOnFile: string; otherCompanies: string[]; urgency: "urgent" | "advisory"; finding: boolean },
): string[] {
  const problems: string[] = [];
  const banned: [RegExp, string][] = [
    [/fraud/i, `says "fraud"`],
    [/\bscam/i, `says "scam"`],
    [/armadin/i, `says "Armadin"`],
    [/\bblock(ed|s|ing)?\b/i, `says "block"`],
    [/\bcancel(l?ed|s|l?ing)?\b/i, `says "cancel"`],
    [/\bcontain(ed|s|ing|ment)?\b/i, `says "contain"`],
    [/auto-?mitigat/i, `says "auto-mitigate"`],
    [/stop(s|ped)? the attack/i, `says "stop the attack"`],
    [/\b(protect|defend)(s|ed|ing)?\b/i, `says "protect"/"defend"`],
    [/\b(you|your (company|team|systems?|network))\b[^.]{0,20}\b(were|was|have been|has been|are)\s+(breached|hacked|compromised)/i, "says the reader was breached"],
    [/\b(okta|entra|google workspace|azure ad)\b/i, "names an identity provider"],
    [/[#*`[\]]/, "contains markdown or a placeholder"],
  ];
  for (const [re, why] of banned) if (re.test(text)) problems.push(why);

  if (/\bvalidated\b/i.test(text)) {
    if (!opts.finding) problems.push(`says "validated" without a finding`);
    else if (!/not tested/i.test(text)) problems.push(`says "validated" without "not tested"`);
  }
  const lower = text.toLowerCase();
  for (const name of opts.otherCompanies) {
    if (name && lower.includes(name.toLowerCase())) problems.push(`names another company (${name})`);
  }
  const digits = (s: string) => s.replace(/\D/g, "");
  const onFile = digits(opts.phoneOnFile);
  for (const match of text.match(/\+?\(?\d[\d\s().-]{8,}\d/g) ?? []) {
    if (digits(match) !== onFile) problems.push(`phone number not on file (${match.trim()})`);
  }

  if (part === "summary") {
    const opener = opts.urgency === "urgent" ? "Urgent:" : "Advisory:";
    if (!text.startsWith(opener)) problems.push(`must start with "${opener}"`);
    if (text.length > 900) problems.push(`too long (${text.length} chars)`);
    if (text.length < 120) problems.push("too short");
  } else {
    if (text.length > 220) problems.push(`too long (${text.length} chars)`);
    if (text.length < 20) problems.push("too short");
  }
  return problems;
}

// ---- The brief one company sees ----

export function cannedBreachFixSummary(ctx: FixContext): string {
  const first = planBreachFix(ctx)
    .filter((r) => r.priority === "now" && r.id !== "acknowledge")
    .slice(0, 3)
    .map((r) => r.title.charAt(0).toLowerCase() + r.title.slice(1));
  const opener = ctx.urgency === "urgent" ? "Urgent: start today." : "Advisory: work through this plan this week.";
  const start = first.length > 0 ? ` Start here: ${first.join("; then ")}.` : "";
  return `${opener} ${ctx.asset.vendorName} (${ctx.asset.name}) is under an active security incident, and your company shares it.${start} Each step below names who does it.`;
}

// Cached text when its facts still match, else canned. Statuses always come from `live`.
export function breachFixBrief<CompanyId>(
  ctx: FixContext,
  live: FixLive,
  companyId: CompanyId,
  cache: BreachFixCache,
): AdviceBrief<CompanyId> {
  const entry = cache.entries[breachFixKey(ctx)];
  const hit = entry !== undefined && entry.facts === breachFixFactsKey(ctx);
  const recommendations = planBreachFix(ctx, live).map((r) => ({ ...r, why: hit ? (entry.why[r.id] ?? r.why) : r.why }));
  return {
    scope: "company",
    companyId,
    companyName: ctx.companyName,
    summary: hit ? entry.summary : cannedBreachFixSummary(ctx),
    source: hit ? "cache" : "canned",
    recommendations,
  };
}
