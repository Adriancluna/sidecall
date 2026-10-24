// A portfolio company's dashboard. The hero is the one thing this person must do now (finance:
// the held payment; IT and everyone else: the incident steps). Everything else is a tab.
// The backend never sends which company reported the incident.
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Tabs, type TabDef } from "../layout/Tabs";
import { useTabs } from "../layout/useTabs";
import { AcknowledgedBy } from "./AcknowledgedBy";
import { BillsPanel } from "./BillsPanel";
import { ControlsLogPanel } from "./ControlsLogPanel";
import { ExposureHero } from "./ExposureHero";
import { readableEvidence } from "./exposureCopy";
import { dateTime, money, shortDate } from "./format";
import { HeldPaymentsPanel } from "./HeldPaymentsPanel";
import { EXPOSURE_STATUS, paymentLook } from "./labels";
import { LedgerPanel } from "./LedgerPanel";
import { NotificationsPanel } from "./NotificationsPanel";
import { PaymentHero } from "./PaymentHero";
import { PlaybookPanel } from "./ResponsePlaybook";
import { TimelinePanel } from "./TimelinePanel";
import type { HeldPaymentRow } from "./types";
import { Card, Chip, Empty, Eyebrow, HeroSkeleton, LookChip, UrgencyChip } from "./ui";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "./styles";
import { useExposureAction } from "./useExposureAction";

type Props = {
  companyId: Id<"companies">;
  meId: Id<"users">;
  role: Doc<"users">["role"];
};

type IncidentRow = NonNullable<ReturnType<typeof useIncidents>>[number];
const useIncidents = () => useQuery(api.blastRadius.listIncidents, {});

export function CompanyView({ companyId, meId, role }: Props) {
  const isController = role === "controller";
  // Clerks and controllers act on payments, so the held payment leads; IT acts on the incident.
  const handlesPayments = role === "ap_clerk" || isController;
  const company = useQuery(api.blastRadius.listCompanies, {})?.find((c) => c._id === companyId);
  const exposures = useQuery(api.blastRadius.getMyExposures, {});
  const alerts = useQuery(api.alerts.getMyAlerts, {});
  const held = useQuery(api.payments.getHeldPayments, {});
  const incidents = useIncidents();
  const assets = useQuery(api.blastRadius.listAssets, {});
  const bills = useQuery(api.payments.getMyBills, {});

  const incidentById = new Map((incidents ?? []).map((i) => [i._id, i]));
  const phoneFor = (incident?: IncidentRow) => assets?.find((a) => a._id === incident?.assetId)?.phoneOnFile;
  const escalations = new Map(
    (alerts ?? []).flatMap((a) => (a.kind === "escalation" && a.paymentId ? [[a.paymentId, a.body] as const] : [])),
  );
  const alertByExposure = new Map(
    (alerts ?? []).flatMap((a) => (a.kind === "company_alert" && a.exposureId ? [[a.exposureId, a] as const] : [])),
  );
  const stillHeld = (held ?? []).filter((r) => r.payment.status === "held");
  const openExposures = (exposures ?? []).filter((e) => e.status !== "closed");
  // Urgent first, then newest (the query returns newest first).
  const leadExposure = [...openExposures].sort(
    (a, b) => Number(b.urgency === "urgent") - Number(a.urgency === "urgent"),
  )[0];
  const latestIncident = incidents?.[0];
  const unpaidBills = (bills ?? []).filter((b) => b.payment === null).length;

  const viewer = { id: meId, isController };
  const heroPayment = handlesPayments ? pickHeroPayment(stillHeld, escalations) : undefined;
  // The exposure the IT hero already shows in full; its tab entry skips the repeated steps and buttons.
  const heroExposureId = !heroPayment ? leadExposure?._id : undefined;
  // In flight before any incident (the $480K): the All clear screen names it, so the hold lands on a known payment.
  const nextOut = handlesPayments
    ? (bills ?? [])
        .filter((b) => b.payment?.status === "pending")
        .sort((a, b) => b.bill.amountCents - a.bill.amountCents)[0]
    : undefined;

  const tabIds = ["alerts", "payments", "bills", "playbook", "timeline", "controls", "ledger", "notifications"] as const;
  const fallback = isController ? "payments" : role === "ap_clerk" ? "bills" : "alerts";
  const { active, select } = useTabs(tabIds, fallback);

  const tabs: TabDef[] = [
    {
      id: "alerts",
      label: "Incident & evidence",
      count: openExposures.length,
      content: () => (
        <AlertsTab
          exposures={exposures}
          alertByExposure={alertByExposure}
          incidentById={incidentById}
          held={held ?? []}
          heroExposureId={heroExposureId}
        />
      ),
    },
    {
      id: "payments",
      label: "Held payments",
      count: stillHeld.length,
      content: () => (
        <HeldPaymentsPanel
          title="Payments held until verified"
          rows={held}
          intro="Held payments are never cancelled. A controller who didn't request the payment calls the vendor at the number on file, then releases or rejects it."
          escalations={handlesPayments ? escalations : undefined}
          viewer={viewer}
        />
      ),
    },
    { id: "bills", label: "Bills to pay", count: unpaidBills, content: () => <BillsPanel /> },
    { id: "playbook", label: "Response playbook", content: () => <PlaybookPanel /> },
    {
      id: "timeline",
      label: "Timeline",
      content: () =>
        latestIncident ? <TimelinePanel incidentId={latestIncident._id} /> : <Card><Empty>No incident yet.</Empty></Card>,
    },
    {
      id: "controls",
      label: "Controls log",
      content: () =>
        latestIncident ? (
          <ControlsLogPanel
            incidentId={latestIncident._id}
            fileLabel={`${company?.domain ?? "company"}-${latestIncident.externalId}`}
          />
        ) : (
          <Card><Empty>Nothing logged yet.</Empty></Card>
        ),
    },
    { id: "ledger", label: "Ledger", content: () => <LedgerPanel /> },
    {
      id: "notifications",
      label: "Slack & alerts out",
      content: () => <NotificationsPanel scope="company" canManage={isController} />,
    },
  ];

  let hero;
  if (exposures === undefined || held === undefined) {
    hero = <HeroSkeleton />;
  } else if (heroPayment) {
    hero = (
      <PaymentHero
        row={heroPayment}
        escalation={escalations.get(heroPayment.payment._id)}
        viewer={viewer}
        others={stillHeld.length - 1}
        onOpenTab={(t) => select(t, true)}
      />
    );
  } else if (leadExposure) {
    const incident = incidentById.get(leadExposure.incidentId);
    const heldHere = stillHeld.filter((r) => r.payment.heldByIncidentId === leadExposure.incidentId);
    hero = (
      <ExposureHero
        key={leadExposure._id}
        exposure={leadExposure}
        incident={incident}
        phone={phoneFor(incident)}
        heldForIncident={{ count: heldHere.length, cents: heldHere.reduce((s, r) => s + r.payment.amountCents, 0) }}
        onOpenTab={(t) => select(t, true)}
      />
    );
  } else {
    hero = (
      <AllClear
        companyName={company?.name}
        resolved={(exposures ?? []).length > 0}
        nextOut={nextOut && { cents: nextOut.bill.amountCents, vendor: nextOut.vendorName, due: nextOut.bill.dueDate }}
      />
    );
  }

  return (
    <div className="space-y-14">
      {hero}
      <Tabs tabs={tabs} active={active} onSelect={(t) => select(t)} label={`${company?.name ?? "Company"} details`} />
    </div>
  );
}

// The payment a finance person should decide first: escalated (due soon), then a changed bank
// account, then the largest.
function pickHeroPayment(rows: HeldPaymentRow[], escalations: Map<Id<"payments">, string>) {
  return [...rows].sort(
    (a, b) =>
      Number(escalations.has(b.payment._id)) - Number(escalations.has(a.payment._id)) ||
      Number(b.bankChange !== null) - Number(a.bankChange !== null) ||
      b.payment.amountCents - a.payment.amountCents,
  )[0];
}

function AllClear({
  companyName,
  resolved,
  nextOut,
}: {
  companyName?: string;
  resolved: boolean;
  nextOut?: { cents: number; vendor: string; due: number };
}) {
  return (
    <section aria-labelledby="hero-title" className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] xl:gap-16">
      <div className="min-w-0">
        <Eyebrow>
          <Chip tone="ok">{resolved ? "Resolved" : "All clear"}</Chip>
          {companyName && <span>{companyName}</span>}
        </Eyebrow>
        <h1 id="hero-title" className="mt-6 max-w-3xl text-headline font-semibold text-balance">
          {resolved ? "Every incident affecting you is resolved" : "Nothing needs your attention"}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ash">
          {resolved
            ? `${companyName ?? "Your company"} has closed every alert. The history stays in the tabs below.`
            : `No active incident touches anything ${companyName ?? "your company"} shares. Sidecall only alerts you when you genuinely share what was compromised, not just the same vendor.`}
        </p>
      </div>
      {nextOut && (
        // Pre-incident foreshadow: the payment the demo is about, already in flight.
        <aside aria-label="Next payment out" className="self-start rounded-tile border border-line bg-panel p-5 md:p-6">
          <p className="text-sm text-ash">Next payment out</p>
          <p className="mt-2 text-5xl font-semibold tracking-tight tabular-nums">{money(nextOut.cents)}</p>
          <p className="mt-2 text-ash">
            to <span className="text-paper">{nextOut.vendor}</span> · due {shortDate(nextOut.due)}
          </p>
        </aside>
      )}
    </section>
  );
}

function AlertsTab({
  exposures,
  alertByExposure,
  incidentById,
  held,
  heroExposureId,
}: {
  exposures: Doc<"exposures">[] | undefined;
  alertByExposure: Map<Id<"exposures">, Doc<"alerts">>;
  incidentById: Map<Id<"incidents">, IncidentRow>;
  held: HeldPaymentRow[];
  heroExposureId?: Id<"exposures">;
}) {
  if (exposures === undefined) return <Empty>Loading…</Empty>;
  if (exposures.length === 0) {
    return (
      <Card>
        <Empty>No alerts. Nothing you share is affected.</Empty>
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      {exposures.map((e) => (
        <AlertItem
          key={e._id}
          exposure={e}
          alert={alertByExposure.get(e._id)}
          incident={incidentById.get(e.incidentId)}
          payments={held.filter((r) => r.payment.heldByIncidentId === e.incidentId)}
          inHero={e._id === heroExposureId}
        />
      ))}
    </div>
  );
}

function AlertItem({
  exposure,
  alert,
  incident,
  payments,
  inHero,
}: {
  exposure: Doc<"exposures">;
  alert?: Doc<"alerts">;
  incident?: IncidentRow;
  payments: HeldPaymentRow[];
  inHero: boolean;
}) {
  const { run, busy, message } = useExposureAction(exposure._id);
  return (
    <article className="grid gap-6 rounded-tile border border-line bg-panel p-5 md:p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-10">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <UrgencyChip urgency={exposure.urgency} resolved={exposure.status === "closed"} />
          {exposure.status !== "closed" && <Chip tone="muted">{EXPOSURE_STATUS[exposure.status]}</Chip>}
          <AcknowledgedBy userId={exposure.acknowledgedBy} />
        </div>
        {incident && (
          <h3 className="text-xl font-semibold tracking-tight">
            {incident.vendorName} · {incident.assetName}
            <span className="mt-1 block text-sm font-normal text-ash">{dateTime(incident.createdAt)}</span>
          </h3>
        )}
        <p className="mt-3 max-w-prose leading-relaxed">
          {alert?.status === "ready" ? alert.body : "Writing your alert…"}
        </p>
        {/* The alert text is written once; payments show their state now. */}
        {payments.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm">
            {payments.map((r) => (
              <li key={r.payment._id} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold tabular-nums">{money(r.payment.amountCents)}</span>
                <LookChip look={paymentLook(r.payment)} />
                {r.decision && (
                  <span className="text-ash">
                    {r.decision.status === "paid" ? "since released" : "rejected"} by {r.decision.byName ?? "a controller"}
                    {r.decision.at !== null && ` · ${dateTime(r.decision.at)}`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {inHero ? (
          <p className="mt-4 text-sm text-ash">Acknowledge and resolve it from the steps at the top of the page.</p>
        ) : exposure.status !== "closed" && (
          <div className="mt-5 flex flex-wrap gap-2">
            {exposure.status === "open" && (
              <button type="button" disabled={busy} onClick={() => void run("acknowledge")} className={BUTTON_PRIMARY}>
                Acknowledge
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => void run("close")} className={BUTTON_SECONDARY}>
              Mark resolved
            </button>
          </div>
        )}
        {message && (
          <p role="status" className="mt-3 text-sm text-paper motion-safe:animate-arrive">
            {message}
          </p>
        )}
      </div>
      <dl className="space-y-4 border-t border-line pt-5 text-sm lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
        {readableEvidence(exposure.evidence)
          .filter((e) => !(inHero && e.kind === "what_to_check"))
          .map((e) => (
          <div key={`${e.label}-${e.text}`}>
            <dt className="text-xs font-medium text-ash">{e.label}</dt>
            <dd className="mt-1 leading-relaxed">{e.text}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
