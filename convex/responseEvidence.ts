// A read-only case record for firm reviewers. No tokens, bank details or inferred proof.
import { v } from "convex/values";
import { query } from "./_generated/server";
import { getViewer } from "./access";
import { MAX_FANOUT } from "./shared";

export const getRecord = query({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, { incidentId }) => {
    const viewer = await getViewer(ctx);
    if (!viewer.firm) return null;
    const incident = await ctx.db.get("incidents", incidentId);
    if (!incident) return null;
    const [asset, reports, exposures, steps, payments, audit] =
      await Promise.all([
        ctx.db.get("assets", incident.assetId),
        ctx.db
          .query("incidentReports")
          .withIndex("by_incidentId", (q) => q.eq("incidentId", incidentId))
          .order("desc")
          .take(MAX_FANOUT + 1),
        ctx.db
          .query("exposures")
          .withIndex("by_incidentId_and_companyId", (q) =>
            q.eq("incidentId", incidentId),
          )
          .take(MAX_FANOUT + 1),
        ctx.db
          .query("responseSteps")
          .withIndex("by_incidentId_and_status", (q) =>
            q.eq("incidentId", incidentId),
          )
          .take(MAX_FANOUT + 1),
        ctx.db
          .query("payments")
          .withIndex("by_heldByIncidentId", (q) =>
            q.eq("heldByIncidentId", incidentId),
          )
          .take(MAX_FANOUT + 1),
        ctx.db
          .query("auditLog")
          .withIndex("by_incidentId", (q) => q.eq("incidentId", incidentId))
          .order("desc")
          .take(MAX_FANOUT + 1),
      ]);
    return {
      format: "sidecall-response-record-v1",
      scope: "firm",
      limits: {
        maximumRowsPerSection: MAX_FANOUT,
        truncated: {
          reports: reports.length > MAX_FANOUT,
          exposures: exposures.length > MAX_FANOUT,
          steps: steps.length > MAX_FANOUT,
          payments: payments.length > MAX_FANOUT,
          audit: audit.length > MAX_FANOUT,
        },
      },
      evidenceBoundary:
        "Reported findings are source claims. Sister-company reachability is inferred, not tested. Sandbox verification reads owned resource authorization state; simulated actions are not external-provider execution. This record is not cryptographically attested.",
      incident: {
        id: incident._id,
        externalId: incident.externalId,
        authenticatedSource: incident.sourceId ? { id: incident.sourceId, name: incident.sourceName ?? "Detector" } : null,
        assetName: asset?.name ?? "Unknown",
        responseClass: incident.responseClass ?? "vendor",
        createdAt: incident.createdAt,
        lastReportedAt: incident.lastReportedAt ?? incident.createdAt,
        containedAt: incident.containedAt ?? null,
        reviewDueAt: incident.reviewDueAt ?? null,
        correlatedReports: incident.correlatedReports ?? 0,
        finding: incident.finding ?? null,
        evidenceRefs: incident.evidenceRefs ?? [],
      },
      reports: reports
        .slice(0, MAX_FANOUT)
        .map((r) => ({
          externalId: r.externalId,
          authenticatedSource: r.sourceId ? { id: r.sourceId, name: r.sourceName ?? "Detector" } : null,
          requestedAssessment: r.requestedAssessment ?? null,
          effectiveAssessment: r.effectiveAssessment ?? null,
          receivedAt: r.receivedAt,
          evidenceRefs: r.evidenceRefs,
          summary: r.summary ?? null,
          finding: r.finding ?? null,
        })),
      companies: await Promise.all(
        exposures.slice(0, MAX_FANOUT).map(async (e) => ({
          companyId: e.companyId,
          name: (await ctx.db.get("companies", e.companyId))?.name ?? "Unknown",
          assessment: e.observation
            ? "unconfirmed_notify_only"
            : "confirmed_incident_relationship",
          status: e.status,
          confidenceInRelationship: e.confidence,
          reasons: e.reasons,
          evidence: e.evidence,
          path: e.path ?? null,
        })),
      ),
      steps: steps
        .slice(0, MAX_FANOUT)
        .map((s) => ({
          id: s._id,
          companyId: s.companyId,
          action: s.action,
          target: s.target,
          policyRule: s.policyRule,
          capNote: s.capNote ?? null,
          mode: s.mode,
          status: s.status,
          plannedAt: s.plannedAt,
          approvedAt: s.approvedAt ?? null,
          approvedBy: s.approvedBy ?? null,
          executedAt: s.executedAt ?? null,
          executionMode: s.executionMode ?? null,
          verification: s.verification ?? null,
          undoneAt: s.undoneAt ?? null,
          undoneBy: s.undoneBy ?? null,
        })),
      payments: payments
        .slice(0, MAX_FANOUT)
        .map((p) => ({
          id: p._id,
          companyId: p.companyId,
          amountCents: p.amountCents,
          status: p.status,
        })),
      audit: audit
        .slice(0, MAX_FANOUT)
        .map((a) => ({
          at: a.at,
          actor: a.actor,
          action: a.action,
          companyId: a.companyId ?? null,
          paymentId: a.paymentId ?? null,
          rule: a.rule,
          reason: a.reason,
        })),
    };
  },
});
