// Return shapes of the queries and mutations in CONTRACT.md.
// Hand-written until Adrian's functions land; then these come from `api` via useQuery's inference
// and this file can be deleted.
import type { Doc, Id } from "../../convex/_generated/dataModel";

export type BlastNode = {
  companyId: Id<"companies">;
  // Not in CONTRACT.md yet: needed to open evidence / acknowledge from the map. Asked Adrian.
  exposureId?: Id<"exposures">;
  name: string;
  headcount: number;
  exposed: boolean;
  urgency?: Doc<"exposures">["urgency"];
  score: number;
  status?: Doc<"exposures">["status"];
  heldCents: number;
};

export type BlastEdge = Pick<
  Doc<"links">,
  "companyId" | "assetId" | "shareType" | "source"
>;

export type BlastRadius = {
  incident: Doc<"incidents">;
  asset: Doc<"assets">;
  nodes: BlastNode[];
  edges: BlastEdge[];
  totals: {
    companiesExposed: number;
    peopleExposed: number;
    heldCents: number;
    paymentsHeld: number;
  };
};

export type ExposureEvidence = Pick<
  Doc<"exposures">,
  "reasons" | "confidence" | "evidence"
>;

export type HeldPaymentRow = {
  payment: Doc<"payments">;
  companyName: string;
  vendorName: string;
  phoneOnFile: string;
  bankChange?: {
    changedAt: number;
    accountLast4: string;
    requestChannel: Doc<"bankDetailChanges">["requestChannel"];
    daysBeforeIncident: number;
  };
  holdReasons: string[];
  notice?: string;
};

// Not in CONTRACT.md yet: what a company sees about itself. Never carries reportedByCompanyId.
export type CompanyAlertRow = {
  exposure: Doc<"exposures">;
  alert?: Doc<"alerts">;
};

export type MutationResult = { ok: true } | { ok: false; reason: string };

export type IncidentResponse = {
  incidentId: Id<"incidents">;
  duplicate: boolean;
};
