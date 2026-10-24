// Exposure scoring. Deterministic rules only; the AI never decides exposure or urgency.
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

const BASE_SCORE: Record<Doc<"links">["shareType"], number> = {
  shared_credential: 90,
  shared_admin_access: 80,
  same_vendor_only: 40,
};

const SHARE_LABEL: Record<Doc<"links">["shareType"], string> = {
  shared_credential: "shares a login credential with",
  shared_admin_access: "gives admin access to the same",
  same_vendor_only: "is a customer of",
};

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
  const reasons = [
    `Your company ${SHARE_LABEL[link.shareType]} ${asset.vendorName} (${asset.name}), which is under an active incident.`,
  ];
  const evidence = [
    { kind: "link", detail: `${link.shareType} via ${asset.name}` },
    {
      kind: "source",
      detail:
        link.source === "self_reported"
          ? "Reported by your team during onboarding"
          : "Candidate link from public DNS records (reachability, not confirmed)",
    },
  ];

  if (held.count > 0) {
    evidence.push({
      kind: "payments_held",
      detail: `${held.count} pending payment(s) to ${asset.vendorName} held, $${(held.cents / 100).toLocaleString("en-US")}`,
    });
  }
  if (held.flagged > 0) {
    score += FLAGGED_HOLD_BUMP;
    reasons.push(
      `${held.flagged} held payment(s) go to bank details ${asset.vendorName} changed within 30 days of the incident.`,
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
      .take(500);
    const changes = await ctx.db
      .query("bankDetailChanges")
      .withIndex("by_assetId_and_changedAt", (q) =>
        q.eq("assetId", incident.assetId),
      )
      .take(500);
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
