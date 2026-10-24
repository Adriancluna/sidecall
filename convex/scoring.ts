// Exposure scoring. Deterministic rules only; the AI never decides exposure or urgency.
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Infer } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { formatUsd, MAX_FANOUT } from "./shared";
import { ATTACK_TECHNIQUES, techniqueLabel, type Finding } from "./findings";
import type { exposurePath, responseAction, responseMode } from "./schema";

const BASE_SCORE: Record<Doc<"links">["shareType"], number> = {
  shared_credential: 90,
  shared_admin_access: 80,
  same_vendor_only: 40,
};

// One sentence per link type. Shown in the exposed company's own view, so it never mentions
// the reporting company.
const SHARE_SENTENCE: Record<Doc<"links">["shareType"], (vendor: string) => string> = {
  shared_credential: (vendor) => sentence(`Your company shares a login credential with ${vendor}`),
  shared_admin_access: (vendor) => `Your company gives ${vendor} admin access through a shared account.`,
  same_vendor_only: (vendor) => sentence(`Your company is a customer of ${vendor}`),
};

// Avoid "Inc.." when a vendor name already ends in a period.
function sentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}

// "Brightline Payroll Inc." rather than "Brightline Payroll Inc. (Brightline Payroll)";
// keep the asset name only when it adds something (e.g. a specific shared account).
function vendorLabel(asset: Doc<"assets">): string {
  return asset.vendorName.toLowerCase().startsWith(asset.name.toLowerCase())
    ? asset.vendorName
    : `${asset.vendorName} (${asset.name})`;
}

// dns_inferred links are candidates, not confirmed: they score lower and carry less confidence.
const SOURCE_WEIGHT: Record<Doc<"links">["source"], number> = {
  self_reported: 1,
  dns_inferred: 0.75,
};
const SOURCE_CONFIDENCE: Record<Doc<"links">["source"], number> = {
  self_reported: 0.9,
  dns_inferred: 0.5,
};

const URGENT_AT = 70;
const FLAGGED_HOLD_BUMP = 30;

export type HeldSummary = { count: number; cents: number; flagged: number };

type ExposureScore = {
  score: number;
  confidence: number;
  urgency: "urgent" | "advisory";
  reasons: string[];
  evidence: { kind: string; detail: string }[];
};

// Never mentions the reporting company: this text is shown in the exposed company's own view.
export function scoreExposure(
  link: Doc<"links">,
  asset: Doc<"assets">,
  held: HeldSummary,
): ExposureScore {
  let score = BASE_SCORE[link.shareType] * SOURCE_WEIGHT[link.source];
  const reasons = [SHARE_SENTENCE[link.shareType](vendorLabel(asset))];
  const evidence = [
    { kind: "link", detail: `${link.shareType} via ${asset.name}` },
    {
      kind: "source",
      detail:
        link.source === "self_reported"
          ? "Reported by your team during onboarding"
          : `Candidate link from public DNS records (reachability, not confirmed)${link.detail ? `: ${link.detail}` : ""}`,
    },
  ];

  if (held.count > 0) {
    evidence.push({
      kind: "payments_held",
      detail: `${held.count} pending payment(s) to ${asset.vendorName} held, ${formatUsd(held.cents)}`,
    });
  }
  if (held.flagged > 0) {
    score += FLAGGED_HOLD_BUMP;
    reasons.push(
      held.flagged === 1
        ? `1 held payment goes to bank details ${asset.vendorName} changed within 30 days of the incident.`
        : `${held.flagged} held payments go to bank details ${asset.vendorName} changed within 30 days of the incident.`,
    );
  }

  score = Math.min(100, Math.round(score));
  return {
    score,
    confidence: SOURCE_CONFIDENCE[link.source],
    urgency: score >= URGENT_AT ? "urgent" : "advisory",
    reasons,
    evidence,
  };
}

// One step ahead of a red-team finding: what a sister company learns about the proven path.
// Built only from Sidecall's own asset and link rows (never the finding's hop labels, evidence
// or ids), so it can't reveal the reporter. "Validated" only ever appears next to "not tested at
// your company". Score, urgency and confidence stay exactly what scoreExposure says: a proof
// inside another company says nothing about whether this company really has the link.
const HERE_SENTENCE: Record<Doc<"links">["shareType"], (vendor: string) => string> = {
  shared_credential: (vendor) =>
    `Your company shares that login with ${vendor}, so the path is reachable at your company (not tested at your company).`,
  shared_admin_access: (vendor) =>
    `Your company gives ${vendor} admin access through that account, so the path is reachable at your company (not tested at your company).`,
  same_vendor_only: (vendor) =>
    `You use your own login, so it reaches your company only if an attacker can cross between ${vendor} customers (not tested at your company).`,
};

// What the IT lead at a sister company should look at, from the technique, our own asset row and
// the time the path was proven. Never the finding's hop labels, so nothing names who was hit.
const CHECK_BY_TECHNIQUE: Record<string, (account: string, vendor: string) => string> = {
  T1078: (account) => `sign-ins to ${account}`,
  T1021: (account) => `remote logins that used ${account}`,
  T1110: (account) => `failed sign-ins to ${account}`,
  T1133: (_, vendor) => `remote-access sessions through ${vendor}`,
  T1199: (_, vendor) => `actions ${vendor} staff took in your systems`,
  T1552: (account) => `where the ${account} password is stored (scripts, shared drives, password managers)`,
};

const ACT_BY_SHARE: Record<Doc<"links">["shareType"], (vendor: string) => string> = {
  shared_credential: () => "Rotate that login today, even if nothing looks wrong.",
  shared_admin_access: (vendor) =>
    `Ask ${vendor} to rotate the admin account it uses for you, and confirm by calling the number on file.`,
  same_vendor_only: (vendor) => `Ask ${vendor} to confirm your account is kept separate from other customers'.`,
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// e.g. "Oct 24, 08:12 UTC"
function utcMinute(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

export function whatToCheck(finding: Finding, link: Doc<"links">, asset: Doc<"assets">): string {
  const check = CHECK_BY_TECHNIQUE[finding.technique.id.split(".")[0]] ?? ((account: string) => `access through ${account}`);
  return (
    `What to check: ${check(asset.name, asset.vendorName)} in the last 30 days, especially after ` +
    `${utcMinute(finding.validatedAt)}. ${ACT_BY_SHARE[link.shareType](asset.vendorName)}`
  );
}

export function sisterPath(
  finding: Finding,
  link: Doc<"links">,
  asset: Doc<"assets">,
): { path: Infer<typeof exposurePath>; evidence: { kind: string; detail: string }[] } {
  const sharedHop = vendorLabel(asset);
  const vendor = asset.vendorName;
  const check = whatToCheck(finding, link, asset);
  const summary = [
    `A validated attack path at another portfolio company ends at ${sharedHop}.`,
    HERE_SENTENCE[link.shareType](vendor),
    link.source === "dns_inferred" ? `Candidate link only: public DNS suggests you use ${vendor}; the link is not confirmed.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    path: {
      techniqueId: finding.technique.id,
      techniqueName: ATTACK_TECHNIQUES[finding.technique.id] ?? null,
      sharedHop,
      linkType: link.shareType,
      here: "reachable_not_tested",
      whatToCheck: check,
    },
    evidence: [
      { kind: "technique", detail: techniqueLabel(finding.technique.id) },
      { kind: "path", detail: summary },
      { kind: "what_to_check", detail: check },
    ],
  };
}

// ---- Response playbook rules (docs/specs/response-playbook.md) ----
// Which pre-approvable steps apply to a link, and the highest mode each may run at. The company's
// own setting is lowered to this cap; nothing here is ever raised by an incident.

export type ResponseAction = Infer<typeof responseAction>;
export type ResponseMode = Infer<typeof responseMode>;
const MODE_RANK: Record<ResponseMode, number> = { notify: 0, prepare: 1, act: 2 };
export const lowerMode = (a: ResponseMode, b: ResponseMode): ResponseMode => (MODE_RANK[a] <= MODE_RANK[b] ? a : b);
export const raisesMode = (from: ResponseMode, to: ResponseMode) => MODE_RANK[to] > MODE_RANK[from];

export function responseFor(
  link: Doc<"links">,
  asset: Doc<"assets">,
): { action: ResponseAction; cap: ResponseMode; capNote?: string }[] {
  // Only confirmed shared access gets steps: being a customer of the same vendor shares nothing to
  // pause, and a DNS guess never moves anything (precision; "validated" stays sacred).
  if (link.shareType === "same_vendor_only") return [];
  if (link.source === "dns_inferred") {
    const capNote = "Notify only: this link is a guess from public DNS, not confirmed by your team.";
    return [
      { action: "pause_shared_login", cap: "notify", capNote },
      { action: "revoke_vendor_tokens", cap: "notify", capNote },
    ];
  }
  const pause: { action: ResponseAction; cap: ResponseMode; capNote?: string } =
    asset.kind === "payroll"
      ? { action: "pause_shared_login", cap: "prepare", capNote: "One click at most: pausing a payroll login can stop payroll." }
      : link.shareType === "shared_admin_access"
        ? { action: "pause_shared_login", cap: "prepare", capNote: "One click at most: the vendor's admin account may be running your recovery." }
        : { action: "pause_shared_login", cap: "act" };
  return [pause, { action: "revoke_vendor_tokens", cap: "act" }];
}

// For scripts/scorecard (Role 4): `npx convex run scoring:exportOutcomes '{"externalId":"..."}'`.
// Reports what the system did, keyed by seedRef. The answer key is compared outside convex/.
export const exportOutcomes = internalQuery({
  args: { externalId: v.string() },
  handler: async (ctx, args) => {
    const incident = await ctx.db
      .query("incidents")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId))
      .unique();
    if (!incident) return null;

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_assetId_and_status", (q) =>
        q.eq("assetId", incident.assetId),
      )
      .take(MAX_FANOUT);
    const changes = await ctx.db
      .query("bankDetailChanges")
      .withIndex("by_assetId_and_changedAt", (q) =>
        q.eq("assetId", incident.assetId),
      )
      .take(MAX_FANOUT);
    const flaggedChangeIds = new Set(
      payments.flatMap((p) =>
        p.heldByIncidentId === incident._id && p.flaggedBankChangeId
          ? [p.flaggedBankChangeId]
          : [],
      ),
    );

    return {
      incidentId: incident._id,
      payments: payments.map((p) => ({
        seedRef: p.seedRef ?? null,
        status: p.status,
        held: p.heldByIncidentId === incident._id,
        bankChangeFlag: p.bankChangeFlag ?? false,
      })),
      bankChanges: changes.map((c) => ({
        seedRef: c.seedRef ?? null,
        flagged: flaggedChangeIds.has(c._id),
      })),
    };
  },
});
