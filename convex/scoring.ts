// Exposure scoring. Deterministic rules only; the AI never decides exposure or urgency.
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { formatUsd, MAX_FANOUT } from "./shared";

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

export type ExposureScore = {
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
