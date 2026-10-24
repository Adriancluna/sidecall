// In-memory stand-in for Adrian's Convex functions, with the same argument and return shapes as CONTRACT.md.
// Panels import ONLY from this file. When a real query lands, replace its hook body with
// `useQuery(api.<module>.<fn>, args)` (or `useMutation`) and delete the mock below it.
// The refusal rules in the mutations mirror CONTRACT.md so the UI can be exercised; the real checks
// live in convex/payments.ts.
import { useMemo, useSyncExternalStore } from "react";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import type {
  BlastRadius,
  CompanyAlertRow,
  ExposureEvidence,
  HeldPaymentRow,
  IncidentResponse,
  MutationResult,
} from "./contract";
import {
  assets,
  bankDetailChanges,
  companies,
  links,
  openingLedger,
  pendingPayments,
  users,
} from "./mockData";
import * as fired from "./mockIncident";

type State = {
  incidents: Doc<"incidents">[];
  exposures: Doc<"exposures">[];
  alerts: Doc<"alerts">[];
  payments: Doc<"payments">[];
  auditLog: Doc<"auditLog">[];
  ledger: Doc<"ledgerEntries">[];
};

const initialState = (): State => ({
  incidents: [],
  exposures: [],
  alerts: [],
  payments: pendingPayments,
  auditLog: [],
  ledger: openingLedger,
});

let state = initialState();
const listeners = new Set<() => void>();

function setState(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

function useStore(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

// Fake latency so loading states and the two-browser race are visible.
const tick = () => new Promise((r) => setTimeout(r, 250));

// ---------- reference data (no query in CONTRACT.md yet; asked Adrian) ----------

export function useUsers(): Doc<"users">[] | undefined {
  return users;
}

export function useCompanies(): Doc<"companies">[] | undefined {
  return companies;
}

// ---------- queries ----------

export function useListIncidents(): Doc<"incidents">[] | undefined {
  return useStore().incidents;
}

export function useBlastRadius(
  incidentId: Id<"incidents"> | undefined,
): BlastRadius | undefined {
  const s = useStore();
  return useMemo(() => {
    const incident = s.incidents.find((i) => i._id === incidentId);
    const asset = incident && assets.find((a) => a._id === incident.assetId);
    if (!incident || !asset) return undefined;
    const heldCentsFor = (companyId: Id<"companies">) =>
      s.payments
        .filter(
          (p) =>
            p.companyId === companyId &&
            p.heldByIncidentId === incident._id &&
            p.status === "held",
        )
        .reduce((sum, p) => sum + p.amountCents, 0);
    const nodes = companies.map((c) => {
      const ex = s.exposures.find(
        (e) => e.incidentId === incident._id && e.companyId === c._id,
      );
      return {
        companyId: c._id,
        exposureId: ex?._id,
        name: c.name,
        headcount: c.headcount,
        exposed: !!ex,
        urgency: ex?.urgency,
        score: ex?.score ?? 0,
        status: ex?.status,
        heldCents: heldCentsFor(c._id),
      };
    });
    const exposed = nodes.filter((n) => n.exposed);
    const held = s.payments.filter(
      (p) => p.heldByIncidentId === incident._id && p.status === "held",
    );
    return {
      incident,
      asset,
      nodes,
      edges: links
        .filter((l) => l.assetId === asset._id)
        .map(({ companyId, assetId, shareType, source }) => ({
          companyId,
          assetId,
          shareType,
          source,
        })),
      totals: {
        companiesExposed: exposed.length,
        peopleExposed: exposed.reduce((sum, n) => sum + n.headcount, 0),
        heldCents: held.reduce((sum, p) => sum + p.amountCents, 0),
        paymentsHeld: held.length,
      },
    };
  }, [s, incidentId]);
}

export function useExposureEvidence(
  exposureId: Id<"exposures"> | undefined,
): ExposureEvidence | undefined {
  const ex = useStore().exposures.find((e) => e._id === exposureId);
  return (
    ex && {
      reasons: ex.reasons,
      confidence: ex.confidence,
      evidence: ex.evidence,
    }
  );
}

// Mock returns every payment this incident held, whatever its status now, so a released one stays visible.
// Asked Adrian whether the real query does the same.
export function useHeldPayments(args: {
  incidentId?: Id<"incidents">;
  companyId?: Id<"companies">;
}): HeldPaymentRow[] | undefined {
  const s = useStore();
  return useMemo(
    () =>
      s.payments
        .filter((p) => p.heldByIncidentId !== undefined)
        .filter(
          (p) => !args.incidentId || p.heldByIncidentId === args.incidentId,
        )
        .filter((p) => !args.companyId || p.companyId === args.companyId)
        .map((payment) => {
          const asset = assets.find((a) => a._id === payment.assetId)!;
          const incident = s.incidents.find(
            (i) => i._id === payment.heldByIncidentId,
          );
          const change = bankDetailChanges.find(
            (b) => b._id === payment.flaggedBankChangeId,
          );
          return {
            payment,
            companyName:
              companies.find((c) => c._id === payment.companyId)?.name ?? "",
            vendorName: asset.vendorName,
            phoneOnFile: asset.phoneOnFile,
            bankChange:
              change && incident
                ? {
                    changedAt: change.changedAt,
                    accountLast4: change.accountLast4,
                    requestChannel: change.requestChannel,
                    daysBeforeIncident: Math.round(
                      (incident.createdAt - change.changedAt) / 86_400_000,
                    ),
                  }
                : undefined,
            holdReasons: payment.holdReasons ?? [],
            notice: s.alerts.find(
              (a) => a.kind === "hold_notice" && a.paymentId === payment._id,
            )?.body,
          };
        }),
    [s, args.incidentId, args.companyId],
  );
}

export function usePaymentAudit(
  paymentId: Id<"payments"> | undefined,
): Doc<"auditLog">[] | undefined {
  const log = useStore().auditLog;
  return useMemo(
    () => log.filter((r) => r.paymentId === paymentId),
    [log, paymentId],
  );
}

export function useLedger(
  companyId: Id<"companies"> | undefined,
): Doc<"ledgerEntries">[] | undefined {
  const ledger = useStore().ledger;
  return useMemo(
    () => ledger.filter((e) => e.companyId === companyId),
    [ledger, companyId],
  );
}

// Not in CONTRACT.md yet: a company's own exposures + alerts. Asked Adrian.
export function useCompanyAlerts(
  companyId: Id<"companies"> | undefined,
): CompanyAlertRow[] | undefined {
  const s = useStore();
  return useMemo(
    () =>
      s.exposures
        .filter((e) => e.companyId === companyId)
        .map((exposure) => ({
          exposure,
          alert: s.alerts.find(
            (a) => a.kind === "company_alert" && a.exposureId === exposure._id,
          ),
        })),
    [s, companyId],
  );
}

// Not in CONTRACT.md yet: the vendor letter for the PE firm view. Asked Adrian.
export function useVendorLetter(
  incidentId: Id<"incidents"> | undefined,
): Doc<"alerts"> | undefined {
  return useStore().alerts.find(
    (a) => a.kind === "vendor_letter" && a.incidentId === incidentId,
  );
}

// ---------- mutations ----------

function audit(
  row: Omit<Doc<"auditLog">, "_id" | "_creationTime" | "at">,
): Doc<"auditLog"> {
  const at = Date.now();
  return {
    _id: `al_${at}_${Math.random()}` as Id<"auditLog">,
    _creationTime: at,
    at,
    ...row,
  };
}

function decide(
  paymentId: Id<"payments">,
  actingUserId: Id<"users">,
  action: "release" | "reject",
  verificationNote?: string,
): MutationResult {
  const payment = state.payments.find((p) => p._id === paymentId);
  if (!payment) return { ok: false, reason: "Payment not found." };
  const actor = users.find((u) => u._id === actingUserId);
  const base = {
    actor: actingUserId,
    companyId: payment.companyId,
    paymentId,
    incidentId: payment.heldByIncidentId,
  };
  const refusal =
    payment.status !== "held"
      ? {
          rule: "status_must_be_held",
          reason: `Payment is ${payment.status}, not held.`,
        }
      : payment.requestedBy === actingUserId
        ? {
            rule: "segregation_of_duties",
            reason:
              "The person who requested a payment cannot release or reject it.",
          }
        : actor?.role !== "controller" || actor.companyId !== payment.companyId
          ? {
              rule: "controller_only",
              reason:
                "Only a controller at this company can decide a held payment.",
            }
          : undefined;
  if (refusal) {
    setState({
      ...state,
      auditLog: [
        ...state.auditLog,
        audit({ ...base, action: "refused", ...refusal }),
      ],
    });
    return { ok: false, reason: refusal.reason };
  }
  const now = Date.now();
  const updated: Doc<"payments"> = {
    ...payment,
    status: action === "release" ? "paid" : "rejected",
    approvedBy: actingUserId,
    verificationNote,
    decidedAt: now,
  };
  const ledgerEntry: Doc<"ledgerEntries"> = {
    _id: `le_${now}` as Id<"ledgerEntries">,
    _creationTime: now,
    companyId: payment.companyId,
    date: now,
    memo: `Payment released to ${assets.find((a) => a._id === payment.assetId)?.vendorName}`,
    paymentId,
    lines: [
      {
        account: "accounts_payable",
        debitCents: payment.amountCents,
        creditCents: 0,
      },
      { account: "cash", debitCents: 0, creditCents: payment.amountCents },
    ],
  };
  setState({
    ...state,
    payments: state.payments.map((p) => (p._id === paymentId ? updated : p)),
    ledger:
      action === "release" ? [...state.ledger, ledgerEntry] : state.ledger,
    auditLog: [
      ...state.auditLog,
      audit({
        ...base,
        action,
        rule: action === "release" ? "verified_release" : "verified_reject",
        reason:
          verificationNote || (action === "release" ? "Released" : "Rejected"),
      }),
    ],
  });
  return { ok: true };
}

export function useReleasePayment() {
  return async (args: {
    paymentId: Id<"payments">;
    actingUserId: Id<"users">;
    verificationNote: string;
  }): Promise<MutationResult> => {
    await tick();
    return decide(
      args.paymentId,
      args.actingUserId,
      "release",
      args.verificationNote,
    );
  };
}

export function useRejectPayment() {
  return async (args: {
    paymentId: Id<"payments">;
    actingUserId: Id<"users">;
  }): Promise<MutationResult> => {
    await tick();
    return decide(args.paymentId, args.actingUserId, "reject");
  };
}

function setExposureStatus(
  exposureId: Id<"exposures">,
  status: "acknowledged" | "closed",
): MutationResult {
  const ex = state.exposures.find((e) => e._id === exposureId);
  if (!ex) return { ok: false, reason: "not_found" };
  if (ex.status === "closed") return { ok: false, reason: "closed" };
  if (status === "acknowledged" && ex.status === "acknowledged")
    return { ok: false, reason: "already_acknowledged" };
  setState({
    ...state,
    exposures: state.exposures.map((e) =>
      e._id === exposureId ? { ...e, status } : e,
    ),
  });
  return { ok: true };
}

export function useAcknowledgeExposure() {
  return async (args: {
    exposureId: Id<"exposures">;
  }): Promise<MutationResult> => {
    await tick();
    return setExposureStatus(args.exposureId, "acknowledged");
  };
}

export function useCloseExposure() {
  return async (args: {
    exposureId: Id<"exposures">;
  }): Promise<MutationResult> => {
    await tick();
    return setExposureStatus(args.exposureId, "closed");
  };
}

// ---------- demo-only: stands in for POST /incident ----------

export async function postIncident(
  externalId: string,
): Promise<IncidentResponse> {
  await tick();
  const existing = state.incidents.find((i) => i.externalId === externalId);
  if (existing) return { incidentId: existing._id, duplicate: true };
  setState({
    ...state,
    incidents: [fired.incident],
    exposures: fired.exposures,
    alerts: fired.alerts,
    payments: fired.heldPayments,
    auditLog: [...state.auditLog, ...fired.holdAudit],
  });
  return { incidentId: fired.incident._id, duplicate: false };
}

export function resetDemo() {
  setState(initialState());
}
